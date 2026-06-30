#!/usr/bin/env python3
import json
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKGROUND_DIR = REPO_ROOT / "assets" / "background"
PREVIEW_DIR = BACKGROUND_DIR / "preview"
MANIFEST_PATH = BACKGROUND_DIR / "manifest.json"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
PREVIEW_WIDTH = 960
PREVIEW_HEIGHT = 540


def load_existing_manifest_order():
    if not MANIFEST_PATH.exists():
        return {}
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    images = manifest if isinstance(manifest, list) else manifest.get("images", [])
    if not isinstance(images, list):
        return {}

    ordered_keys = [
        str(image.get("id") or image.get("filename", "")).strip()
        for image in images
        if isinstance(image, dict) and str(image.get("id") or image.get("filename", "")).strip()
    ]
    return {key: index for index, key in enumerate(ordered_keys)}


def get_background_image_id(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    return f"bg_{digest}"


def iter_background_images():
    if not BACKGROUND_DIR.exists():
        return []
    existing_order = load_existing_manifest_order()
    images = [
        path
        for path in BACKGROUND_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    return sorted(
        images,
        key=lambda path: (
            existing_order.get(get_background_image_id(path), existing_order.get(path.name, len(existing_order))),
            path.name.casefold(),
        ),
    )


def build_preview_names(images):
    used = set()
    preview_names = {}

    for image in images:
        candidate = f"{image.stem}.jpg"
        if candidate in used:
            candidate = f"{image.stem}-{image.suffix.lower().lstrip('.')}.jpg"

        index = 2
        unique_candidate = candidate
        while unique_candidate in used:
            unique_candidate = f"{Path(candidate).stem}-{index}.jpg"
            index += 1

        used.add(unique_candidate)
        preview_names[image.name] = unique_candidate

    return preview_names


def ensure_preview(ffmpeg_path, image, preview_path):
    if preview_path.exists() and preview_path.stat().st_mtime >= image.stat().st_mtime:
        return False

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg_path,
            "-v",
            "error",
            "-y",
            "-i",
            str(image),
            "-vf",
            f"scale={PREVIEW_WIDTH}:{PREVIEW_HEIGHT}:force_original_aspect_ratio=increase,crop={PREVIEW_WIDTH}:{PREVIEW_HEIGHT}",
            "-frames:v",
            "1",
            "-q:v",
            "5",
            str(preview_path),
        ],
        check=True,
    )
    return True


def write_manifest(images, preview_names):
    manifest = {
        "generatedBy": "scripts/sync-background-assets.py",
        "preview": {
            "format": "jpg",
            "width": PREVIEW_WIDTH,
            "height": PREVIEW_HEIGHT,
        },
        "images": [
            {
                "id": get_background_image_id(image),
                "filename": image.name,
                "previewFilename": preview_names[image.name],
            }
            for image in images
        ],
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    images = iter_background_images()
    if not images:
        print(f"No supported background images found in {BACKGROUND_DIR.relative_to(REPO_ROOT)}")
        return 1

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        print("ffmpeg is required to generate background previews.", file=sys.stderr)
        return 1

    preview_names = build_preview_names(images)
    generated_count = 0

    for image in images:
        preview_path = PREVIEW_DIR / preview_names[image.name]
        if ensure_preview(ffmpeg_path, image, preview_path):
            generated_count += 1

    write_manifest(images, preview_names)
    print(
        f"Synced {len(images)} background images, generated {generated_count} previews, "
        f"wrote {MANIFEST_PATH.relative_to(REPO_ROOT)}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
