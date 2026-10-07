#!/usr/bin/env python3
"""
Retry ONLY the device IDs listed in retry_targets.csv.

Design goals:
- Do NOT perform general web/image search.
- Read only Samsung/Apple official pages fixed in retry_targets.csv.
- Never touch device IDs that are not in the CSV.
- Prefer product-render images whose alt/title/URL contains the exact model.
- Reject logos, banners, feature illustrations, Smart Switch/AI marketing assets, icons, etc.
- If no sufficiently confident candidate is found, leave the current DEV-xxx.webp untouched
  and write FAILED_REVIEW_REQUIRED to retry_report.csv.
"""

from __future__ import annotations

import csv
import io
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
TARGETS = Path(__file__).with_name("retry_targets.csv")
REPORT = Path(__file__).with_name("retry_report.csv")
OUT = ROOT / "public" / "devices"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36"
)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
})

OFFICIAL_PAGE_HOSTS = {
    "www.samsung.com", "samsung.com",
    "www.apple.com", "apple.com", "support.apple.com",
}

# Product image CDNs legitimately used by Samsung / Apple.
IMAGE_HOST_SUFFIXES = (
    "samsung.com",
    "images.samsung.com",
    "apple.com",
    "mzstatic.com",
    "apple.com.edgekey.net",
)

# Marketing/brand/common assets that must not become a phone card image.
BAD_TOKENS = (
    "logo", "samsung_logo", "apple_logo",
    "icon", "favicon", "sprite",
    "banner", "kv-", "kv_", "hero-pc", "hero-mo",
    "smart-switch", "smartswitch",
    "benefit", "feature", "features",
    "galaxy-ai", "galaxy_ai", "ai-feature",
    "review", "event", "promo", "promotion",
    "qr", "award", "badge", "share",
    "youtube", "netflix", "accessory",
)

GOOD_TOKENS = (
    "product", "device", "smartphone", "phone",
    "front", "back", "rear", "side",
    "colors", "colour", "design",
    "galaxy", "iphone",
)

def norm(value: str) -> str:
    value = (value or "").lower().replace("＋", "+")
    value = re.sub(r"\s+", " ", value)
    return value.strip()

def aliases(row) -> list[str]:
    return [norm(x) for x in row["expected_terms"].split("|") if x.strip()]

def host_matches(host: str, suffixes) -> bool:
    host = (host or "").lower().split(":")[0]
    return any(host == s or host.endswith("." + s) for s in suffixes)

def page_is_correct(html: str, row) -> bool:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    # Keep a generous body slice because some model names are rendered later in the page.
    body = soup.get_text(" ", strip=True)[:180000]
    haystack = norm(title + " " + body)
    return any(a in haystack for a in aliases(row))

def tag_descriptor(tag) -> str:
    classes = tag.get("class") or []
    if isinstance(classes, (list, tuple)):
        classes = " ".join(classes)
    return " ".join([
        tag.get("alt", ""),
        tag.get("title", ""),
        tag.get("aria-label", ""),
        str(classes),
        tag.get("id", ""),
    ])

def iter_urls(raw: str):
    if not raw:
        return
    # srcset may contain "url 1x, url2 2x"
    for part in str(raw).split(","):
        first = part.strip().split()[0] if part.strip() else ""
        if first:
            yield first

def candidate_score(desc: str, url: str, row) -> int:
    d = norm(desc + " " + url)
    score = 0

    # Strongest: exact model text / model number occurs in alt/title/URL.
    for alias in aliases(row):
        if alias and alias in d:
            score += 180

    # Samsung model number is especially reliable.
    for code in re.findall(r"sm-[a-z0-9]+", " ".join(aliases(row)), flags=re.I):
        if norm(code) in d:
            score += 120

    if any(tok in d for tok in GOOD_TOKENS):
        score += 15

    # Prefer PNG/WebP product renders over generic JPG marketing scenes.
    path = urlparse(url).path.lower()
    if path.endswith(".png"):
        score += 12
    elif path.endswith(".webp"):
        score += 10
    elif path.endswith((".jpg", ".jpeg")):
        score += 2

    # Hard rejection-like penalty for generic marketing assets.
    if any(tok in d for tok in BAD_TOKENS):
        score -= 220

    # Samsung CDN product files frequently contain SM- model codes or /goods/.
    if "images.samsung.com" in url and ("/goods/" in url.lower() or "sm-" in d):
        score += 45

    return score

def collect_candidates(html: str, page_url: str, row):
    soup = BeautifulSoup(html, "html.parser")
    candidates = []

    # We intentionally DO NOT use og:image/twitter:image.
    # That was the cause of the Samsung logo error in the previous pass.
    for tag in soup.find_all(["img", "source"]):
        desc = tag_descriptor(tag)
        for attr in ("src", "data-src", "data-original", "data-lazy-src", "srcset", "data-srcset"):
            raw = tag.get(attr)
            for candidate in iter_urls(raw):
                url = urljoin(page_url, candidate)
                if not url.startswith(("https://", "http://")):
                    continue
                host = urlparse(url).hostname or ""
                if not host_matches(host, IMAGE_HOST_SUFFIXES):
                    continue
                score = candidate_score(desc, url, row)
                candidates.append((score, url, desc))

    # Deduplicate by URL, keep best score.
    best = {}
    for score, url, desc in candidates:
        if url not in best or score > best[url][0]:
            best[url] = (score, url, desc)

    return sorted(best.values(), key=lambda x: x[0], reverse=True)

def download_image(url: str, referer: str) -> bytes:
    r = SESSION.get(
        url,
        timeout=40,
        headers={"User-Agent": UA, "Referer": referer},
    )
    r.raise_for_status()

    ctype = (r.headers.get("content-type") or "").lower()
    if "image" not in ctype and not re.search(r"\.(png|jpe?g|webp|avif)(?:\?|$)", url, flags=re.I):
        raise ValueError(f"not an image: {ctype}")

    if len(r.content) < 6_000:
        raise ValueError("image payload is suspiciously small")

    return r.content

def validate_and_save(data: bytes, output_path: Path):
    with Image.open(io.BytesIO(data)) as im:
        if getattr(im, "is_animated", False):
            im.seek(0)
        im.load()

        width, height = im.size
        if width < 180 or height < 180:
            raise ValueError(f"image too small: {width}x{height}")

        ratio = max(width / height, height / width)
        if ratio > 3.3:
            raise ValueError(f"banner-like aspect ratio: {width}x{height}")

        # Convert transparencies to white background and standardize card size.
        rgba = im.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        white.alpha_composite(rgba)
        rgb = white.convert("RGB")

        fitted = ImageOps.contain(rgb, (460, 460), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (512, 512), "white")
        x = (512 - fitted.width) // 2
        y = (512 - fitted.height) // 2
        canvas.paste(fitted, (x, y))

        # Write to a temp path first. Existing good/bad file is replaced only after success.
        tmp = output_path.with_suffix(".retry.tmp.webp")
        canvas.save(tmp, "WEBP", quality=90, method=6)
        tmp.replace(output_path)

def main():
    OUT.mkdir(parents=True, exist_ok=True)

    with TARGETS.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    report = []

    for row in rows:
        device_id = row["device_id"]
        device_name = row["device_name"]
        source_page = row["official_source_page"]
        output_path = OUT / f"{device_id}.webp"

        print(f"\n[{device_id}] {device_name}")

        try:
            host = urlparse(source_page).hostname or ""
            if host not in OFFICIAL_PAGE_HOSTS:
                raise ValueError(f"not an approved official page host: {host}")

            page = SESSION.get(source_page, timeout=40)
            page.raise_for_status()
            html = page.text

            if not page_is_correct(html, row):
                raise ValueError("official page does not contain the expected model name")

            candidates = collect_candidates(html, source_page, row)

            chosen = None
            errors = []

            # Threshold deliberately high:
            # generic Samsung logos / unrelated feature images should not pass.
            threshold = 175

            for score, url, desc in candidates:
                if score < threshold:
                    continue
                try:
                    data = download_image(url, source_page)
                    validate_and_save(data, output_path)
                    chosen = (score, url, desc)
                    break
                except Exception as exc:
                    errors.append(f"{url} => {exc}")

            if chosen is None:
                top = candidates[:5]
                debug = " | ".join(f"{s}:{u}" for s, u, _ in top)
                raise ValueError(
                    "no high-confidence product image found"
                    + (f"; top candidates: {debug}" if debug else "")
                )

            score, image_url, desc = chosen
            report.append({
                "device_id": device_id,
                "device_name": device_name,
                "status": "OK_REPLACED",
                "official_source_page": source_page,
                "image_url": image_url,
                "score": score,
                "reason": row["reason"],
                "note": desc[:220],
            })
            print("  REPLACED:", image_url)

        except Exception as exc:
            report.append({
                "device_id": device_id,
                "device_name": device_name,
                "status": "FAILED_REVIEW_REQUIRED",
                "official_source_page": source_page,
                "image_url": "",
                "score": "",
                "reason": row["reason"],
                "note": str(exc),
            })
            print("  FAILED:", exc)

    fields = [
        "device_id", "device_name", "status",
        "official_source_page", "image_url", "score",
        "reason", "note",
    ]
    with REPORT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report)

    ok = [r for r in report if r["status"] == "OK_REPLACED"]
    failed = [r for r in report if r["status"] != "OK_REPLACED"]

    print("\n================ RETRY SUMMARY ================")
    print(f"Targets : {len(report)}")
    print(f"Replaced: {len(ok)}")
    print(f"Failed  : {len(failed)}")
    print(f"Report  : {REPORT}")

    if failed:
        print("\nManual review still required:")
        for r in failed:
            print(f" - {r['device_id']} {r['device_name']}")

if __name__ == "__main__":
    main()
