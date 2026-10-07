#!/usr/bin/env python3
"""
DEV-006 ~ DEV-048 스마트폰 이미지를 검색해 public/devices/*.webp 로 저장합니다.

검색 우선순위:
1) 제조사/KT 공식 도메인 이미지
2) 공식 이미지가 검색되지 않으면 일반 검색 결과 중 모델명이 명확한 이미지

주의:
- 검색 엔진 HTML 구조/외부 사이트 정책에 따라 일부 모델은 자동 수집에 실패할 수 있습니다.
- 실패 모델은 image_sources.csv 에 FAILED 로 기록됩니다.
- 최종 사용 전에 각 이미지가 정확한 모델인지 눈으로 한 번 확인하는 것을 권장합니다.
"""

from __future__ import annotations
import argparse
import csv
import io
import json
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
MODELS_PATH = Path(__file__).with_name("models.json")
OUT_DIR = ROOT / "public" / "devices"
SOURCES_CSV = Path(__file__).with_name("image_sources.csv")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36"
)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": UA,
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
})

def clean_model_name(name: str) -> str:
    return re.sub(r"\s+(128GB|256GB|512GB|1TB)$", "", name, flags=re.I).strip()

def preferred_domains(manufacturer: str):
    if "Apple" in manufacturer:
        return ("apple.com",)
    if "KT" in manufacturer:
        return ("shop.kt.com", "kt.com", "samsung.com")
    return ("samsung.com",)

def make_queries(name: str, manufacturer: str):
    model = clean_model_name(name)
    if "Apple" in manufacturer:
        return [
            f'site:apple.com/kr "{model}"',
            f'"{model}" Apple official product',
            f'"{model}" official smartphone',
        ]
    if "KT" in manufacturer:
        return [
            f'site:shop.kt.com "{model}"',
            f'site:kt.com "{model}"',
            f'"{model}" KT Samsung',
        ]
    return [
        f'site:samsung.com/sec "{model}"',
        f'"{model}" Samsung official',
        f'"{model}" smartphone product',
    ]

def bing_image_candidates(query: str, max_results: int = 30):
    url = "https://www.bing.com/images/search?q=" + quote_plus(query) + "&form=HDRSC3"
    r = SESSION.get(url, timeout=25)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    out = []
    seen = set()

    # Bing image cards normally contain JSON in the m attribute.
    for a in soup.select("a.iusc"):
        raw = a.get("m")
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        img = data.get("murl")
        page = data.get("purl")
        if img and img not in seen:
            seen.add(img)
            out.append((img, page))
            if len(out) >= max_results:
                break
    return out

def domain_score(url: str, domains):
    host = urlparse(url).netloc.lower()
    for i, d in enumerate(domains):
        if host == d or host.endswith("." + d):
            return 100 - i
    return 0

def model_score(url: str, page: str | None, model: str):
    hay = ((url or "") + " " + (page or "")).lower()
    tokens = [
        t.lower()
        for t in re.findall(r"[A-Za-z0-9]+", model)
        if len(t) >= 2 and t.lower() not in {"gb", "lte", "5g"}
    ]
    return sum(2 for t in tokens if t in hay)

def ranked_candidates(name: str, manufacturer: str):
    domains = preferred_domains(manufacturer)
    model = clean_model_name(name)
    found = {}
    for q in make_queries(name, manufacturer):
        try:
            for img, page in bing_image_candidates(q):
                key = img
                if key not in found:
                    found[key] = {
                        "url": img,
                        "page": page,
                        "score": domain_score(img, domains) * 10
                                 + domain_score(page or "", domains) * 5
                                 + model_score(img, page, model),
                    }
        except Exception as e:
            print(f"  검색 실패: {q} -> {e}")
        time.sleep(0.8)

    return sorted(found.values(), key=lambda x: x["score"], reverse=True)

def download_image(url: str):
    headers = {
        "User-Agent": UA,
        "Referer": "https://www.google.com/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }
    r = SESSION.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    if len(r.content) < 5000:
        raise ValueError("image too small")
    return r.content

def convert_to_webp(data: bytes, out_path: Path):
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        # GIF/animated image이면 첫 프레임만.
        if getattr(im, "is_animated", False):
            im.seek(0)

        # 투명 이미지는 흰 배경에 합성.
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")

        # 지나치게 가로/세로로 긴 배너를 피하기 위한 간단한 필터
        w, h = im.size
        if w < 180 or h < 180:
            raise ValueError(f"resolution too small: {w}x{h}")
        ratio = max(w / h, h / w)
        if ratio > 3.5:
            raise ValueError(f"banner-like aspect ratio: {w}x{h}")

        if im.mode == "RGBA":
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.alpha_composite(im)
            im = bg.convert("RGB")
        else:
            im = im.convert("RGB")

        # 512x512 카드용 이미지. 원본 비율을 유지하며 흰색 여백 추가.
        contained = ImageOps.contain(im, (460, 460), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (512, 512), "white")
        x = (512 - contained.width) // 2
        y = (512 - contained.height) // 2
        canvas.paste(contained, (x, y))
        canvas.save(out_path, "WEBP", quality=90, method=6)

def process_device(dev_id: str, info: dict, overwrite: bool):
    out_path = OUT_DIR / f"{dev_id}.webp"
    if out_path.exists() and not overwrite:
        return {
            "device_id": dev_id,
            "device_name": info["name"],
            "status": "SKIPPED_EXISTS",
            "source_url": "",
            "source_page": "",
        }

    print(f"\n[{dev_id}] {info['name']}")
    candidates = ranked_candidates(info["name"], info["manufacturer"])
    if not candidates:
        return {
            "device_id": dev_id,
            "device_name": info["name"],
            "status": "FAILED_NO_SEARCH_RESULT",
            "source_url": "",
            "source_page": "",
        }

    for idx, c in enumerate(candidates[:20], 1):
        try:
            print(f"  후보 {idx}: {c['url'][:120]}")
            data = download_image(c["url"])
            convert_to_webp(data, out_path)
            return {
                "device_id": dev_id,
                "device_name": info["name"],
                "status": "OK",
                "source_url": c["url"],
                "source_page": c.get("page") or "",
            }
        except Exception as e:
            print(f"    -> 제외: {e}")

    return {
        "device_id": dev_id,
        "device_name": info["name"],
        "status": "FAILED_DOWNLOAD_OR_IMAGE",
        "source_url": "",
        "source_page": "",
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--overwrite", action="store_true", help="이미 존재하는 WebP도 다시 수집")
    ap.add_argument("--start", type=int, default=6)
    ap.add_argument("--end", type=int, default=48)
    args = ap.parse_args()

    models = json.loads(MODELS_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for dev_id, info in models.items():
        num = int(dev_id.split("-")[1])
        if not (args.start <= num <= args.end):
            continue
        results.append(process_device(dev_id, info, args.overwrite))
        time.sleep(1.0)

    with SOURCES_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        cols = ["device_id", "device_name", "status", "source_url", "source_page"]
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        writer.writerows(results)

    ok = sum(r["status"] == "OK" for r in results)
    failed = [r for r in results if r["status"].startswith("FAILED")]

    print("\n==============================================")
    print(f"완료: {ok} / {len(results)}")
    if failed:
        print("자동 수집 실패:")
        for r in failed:
            print(f" - {r['device_id']} {r['device_name']} ({r['status']})")
    print(f"이미지 폴더: {OUT_DIR}")
    print(f"출처 기록: {SOURCES_CSV}")

if __name__ == "__main__":
    main()
