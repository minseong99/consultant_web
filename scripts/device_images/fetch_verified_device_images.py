#!/usr/bin/env python3
"""
Verified official-source device image fetcher.

안전 원칙:
- verified_sources.csv 에 명시된 Samsung/Apple 공식 페이지에서만 이미지를 찾습니다.
- 일반 웹 이미지 검색은 사용하지 않습니다.
- 페이지 자체가 예상 모델과 일치하지 않으면 해당 기기는 실패 처리합니다.
- 신뢰 가능한 제품 이미지를 찾지 못하면 잘못된 이미지를 추측해서 저장하지 않습니다.
- 시작 시 DEV-006~DEV-048 기존 파일을 격리하여, 오탐 이미지가 남는 것을 막습니다.
"""

from __future__ import annotations
import csv
import io
import re
import shutil
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE_CSV = Path(__file__).with_name("verified_sources.csv")
REPORT_CSV = Path(__file__).with_name("verified_image_report.csv")
OUT_DIR = ROOT / "public" / "devices"
QUARANTINE = ROOT / ".device-image-quarantine"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36"
)
S = requests.Session()
S.headers.update({
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
})

ALLOWED_PAGE_HOSTS = (
    "samsung.com", "www.samsung.com", "shop.samsung.com",
    "apple.com", "www.apple.com", "support.apple.com",
)
# 실제 제품 이미지 CDN 후보. 페이지가 공식 페이지임을 먼저 검증한 뒤에만 허용.
ALLOWED_IMAGE_HOST_SUFFIXES = (
    "samsung.com", "images.samsung.com",
    "apple.com", "mzstatic.com", "apple.com.edgekey.net",
)

def norm(s: str) -> str:
    s = (s or "").lower()
    s = s.replace("＋", "+")
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def aliases(row):
    return [norm(x) for x in row["expected_terms"].split("|") if x.strip()]

def host_allowed(host: str, suffixes) -> bool:
    host = (host or "").lower().split(":")[0]
    return any(host == s or host.endswith("." + s) for s in suffixes)

def page_matches(text: str, row) -> bool:
    t = norm(text)
    return any(a in t for a in aliases(row))

def descriptor_score(desc: str, url: str, row, is_meta=False) -> int:
    d = norm(desc + " " + url)
    als = aliases(row)
    score = 0
    for a in als:
        if a in d:
            score += 140
    # 모델 번호(SM-...)는 특히 강한 신호
    for tok in re.findall(r"(?:sm-[a-z0-9]+|iphone\s+\d+(?:\s+(?:pro|max|plus|e))*)", " ".join(als)):
        if norm(tok) in d:
            score += 80
    if "product" in d or "smartphone" in d or "iphone" in d or "galaxy" in d:
        score += 10
    if is_meta:
        score += 4
    # 배너/아이콘/로고 성격은 감점
    bad = ("logo", "icon", "banner", "kv-", "feature", "benefit", "review", "galaxy-ai")
    if any(x in d for x in bad):
        score -= 30
    return score

def add_candidate(cands, raw_url, desc, base, row, is_meta=False):
    if not raw_url:
        return
    # srcset이면 마지막(대개 고해상도) URL 후보 사용
    parts = [p.strip().split()[0] for p in str(raw_url).split(",") if p.strip()]
    for part in parts[-2:]:
        url = urljoin(base, part)
        if not url.startswith(("http://", "https://")):
            continue
        host = urlparse(url).hostname or ""
        if not host_allowed(host, ALLOWED_IMAGE_HOST_SUFFIXES):
            continue
        score = descriptor_score(desc, url, row, is_meta)
        cands.append((score, url, desc))

def collect_candidates(html: str, base: str, row):
    soup = BeautifulSoup(html, "html.parser")
    cands = []

    # 1) 실제 img/source 요소. alt/aria-label 주변의 모델명이 가장 신뢰도가 높음.
    for tag in soup.find_all(["img", "source"]):
        desc = " ".join([
            tag.get("alt", ""), tag.get("title", ""),
            tag.get("aria-label", ""), tag.get("class") and " ".join(tag.get("class")) or ""
        ])
        for attr in ("src", "data-src", "data-original", "data-srcset", "srcset"):
            add_candidate(cands, tag.get(attr), desc, base, row)

    # 2) 공식 페이지의 social image. exact_product/model_page에서만 fallback으로 고려.
    if row["source_kind"] in ("exact_product", "exact_product_global", "model_page"):
        for meta in soup.find_all("meta"):
            key = (meta.get("property") or meta.get("name") or "").lower()
            if key in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
                add_candidate(cands, meta.get("content"), key, base, row, is_meta=True)

    # 점수 높은 순, URL 중복 제거
    cands.sort(key=lambda x: x[0], reverse=True)
    out, seen = [], set()
    for c in cands:
        if c[1] in seen:
            continue
        seen.add(c[1])
        out.append(c)
    return out

def get_image(url: str, page_url: str):
    r = S.get(url, headers={"Referer": page_url, "User-Agent": UA}, timeout=35)
    r.raise_for_status()
    if len(r.content) < 5000:
        raise ValueError("image payload too small")
    ctype = r.headers.get("content-type","").lower()
    if "image" not in ctype and not re.search(r"\.(png|jpe?g|webp|avif)(?:\?|$)", url, re.I):
        raise ValueError(f"not an image content-type: {ctype}")
    return r.content

def convert(data: bytes, out_path: Path):
    with Image.open(io.BytesIO(data)) as im:
        if getattr(im, "is_animated", False):
            im.seek(0)
        im.load()
        w, h = im.size
        if w < 180 or h < 180:
            raise ValueError(f"too small: {w}x{h}")
        if max(w/h, h/w) > 3.8:
            raise ValueError(f"banner-like aspect: {w}x{h}")
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255,255,255,255))
        bg.alpha_composite(im)
        im = bg.convert("RGB")
        fitted = ImageOps.contain(im, (460,460), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (512,512), "white")
        canvas.paste(fitted, ((512-fitted.width)//2, (512-fitted.height)//2))
        canvas.save(out_path, "WEBP", quality=90, method=6)

def quarantine_old():
    QUARANTINE.mkdir(parents=True, exist_ok=True)
    for n in range(6,49):
        p = OUT_DIR / f"DEV-{n:03d}.webp"
        if p.exists():
            q = QUARANTINE / p.name
            if q.exists():
                q.unlink()
            shutil.move(str(p), str(q))

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    quarantine_old()

    with SOURCE_CSV.open(encoding="utf-8-sig", newline="") as f:
        sources = list(csv.DictReader(f))

    report = []
    for row in sources:
        dev = row["device_id"]
        page = row["official_source_page"]
        print(f"\n[{dev}] {row['device_name']}")
        try:
            phost = urlparse(page).hostname or ""
            if not host_allowed(phost, ALLOWED_PAGE_HOSTS):
                raise ValueError(f"unapproved official page host: {phost}")

            resp = S.get(page, timeout=35)
            resp.raise_for_status()
            html = resp.text

            soup = BeautifulSoup(html, "html.parser")
            page_text = soup.get_text(" ", strip=True)
            title = soup.title.get_text(" ", strip=True) if soup.title else ""
            if not page_matches(title + " " + page_text[:120000], row):
                raise ValueError("official page did not contain expected model terms")

            cands = collect_candidates(html, page, row)

            # exact/support/family 페이지는 이미지 설명에 모델명이 있어야 한다.
            # exact product/model page의 social image만 제한적으로 낮은 점수로 허용.
            threshold = 100
            if row["source_kind"] in ("exact_product", "exact_product_global", "model_page"):
                threshold = 4

            chosen = None
            errors = []
            for score, url, desc in cands:
                if score < threshold:
                    continue
                try:
                    data = get_image(url, page)
                    tmp = OUT_DIR / f"{dev}.webp"
                    convert(data, tmp)
                    chosen = (score, url, desc)
                    break
                except Exception as e:
                    errors.append(f"{url}: {e}")

            if chosen is None:
                raise ValueError("no verified product image candidate found")

            report.append({
                "device_id": dev,
                "device_name": row["device_name"],
                "status": "OK",
                "official_source_page": page,
                "image_url": chosen[1],
                "score": chosen[0],
                "note": chosen[2][:180],
            })
            print("  OK:", chosen[1])

        except Exception as e:
            report.append({
                "device_id": dev,
                "device_name": row["device_name"],
                "status": "FAILED_REVIEW_REQUIRED",
                "official_source_page": page,
                "image_url": "",
                "score": "",
                "note": str(e),
            })
            print("  FAILED:", e)

    with REPORT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        cols = ["device_id","device_name","status","official_source_page","image_url","score","note"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(report)

    # 격리 폴더는 Git에 커밋하지 않음.
    shutil.rmtree(QUARANTINE, ignore_errors=True)

    ok = sum(r["status"] == "OK" for r in report)
    failed = [r for r in report if r["status"] != "OK"]
    print("\n====================================")
    print(f"verified images: {ok}/{len(report)}")
    if failed:
        print("manual review required:")
        for r in failed:
            print(" -", r["device_id"], r["device_name"], r["note"])
    print("report:", REPORT_CSV)

if __name__ == "__main__":
    main()
