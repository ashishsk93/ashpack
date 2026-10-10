#!/usr/bin/env bash
# Regenerates the three README loops from the mods' current code and writes them to docs/.
# Needs bun, python3, ffmpeg (with libwebp) and node. Run: videos/readme-loops/scripts/render.sh
set -euo pipefail
cd "$(dirname "$0")/.."
HF="npx -y hyperframes@0.8.145"

bun scripts/gen-assets.ts >/dev/null   # the mods' own cards, chips and palettes
python3 scripts/build_sheet.py         # storyboard.html, the layouts
python3 scripts/build_videos.py        # compositions/*.html and the index.html hub
$HF check

for pair in ashpack:ashpack status:ashpack-status skins:ashpack-skins; do
  src=${pair%%:*}
  out=${pair##*:}
  $HF render -c "compositions/$src.html" -o "renders/$src.mp4" --quality delivery --fps 30
  ffmpeg -loglevel error -y -i "renders/$src.mp4" -vf "fps=24,scale=880:-1:flags=lanczos" \
    -c:v libwebp_anim -lossless 0 -quality 88 -compression_level 6 -loop 0 -an "../../docs/$out.webp"
  echo "docs/$out.webp"
done
