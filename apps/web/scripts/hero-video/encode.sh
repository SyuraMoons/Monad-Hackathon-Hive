#!/usr/bin/env bash
# Encode frames/ → apps/web/public/hero/. Every frame is a keyframe (all-intra),
# which is what lets the scroll scrub land on an exact frame instantly.
set -euo pipefail
OUT="${1:-../../public/hero}"
mkdir -p "$OUT"

# H.264 MP4 — Chrome, Safari, Edge
ffmpeg -loglevel error -y -framerate 24 -i frames/%04d.png \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -g 1 -keyint_min 1 -sc_threshold 0 -bf 0 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart -an "$OUT/hero-scrub.mp4"

# VP9 WebM — browsers without H.264 (some Linux Chromium / Firefox builds)
ffmpeg -loglevel error -y -framerate 24 -i frames/%04d.png \
  -c:v libvpx-vp9 -pix_fmt yuv420p -g 1 -keyint_min 1 -crf 30 -b:v 0 \
  -row-mt 1 -deadline good -cpu-used 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -an "$OUT/hero-scrub.webm"

# Stills: poster + one per panel (P3 is mid-pulse so it shows memory flowing)
for pair in 0000:poster-start 0000:still-p1 0130:still-p2 0186:still-p3; do
  ffmpeg -loglevel error -y -i "frames/${pair%%:*}.png" -c:v libwebp -quality 92 "$OUT/${pair##*:}.webp"
done
ls -la "$OUT"
