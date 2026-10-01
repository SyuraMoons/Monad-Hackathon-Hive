#!/usr/bin/env bash
# Encode frames/ → apps/web/public/hero/. Every frame is a keyframe (all-intra),
# which is what lets the scroll scrub land on an exact frame instantly.
# FFMPEG=/path/to/ffmpeg overrides the binary.
set -euo pipefail
FF="${FFMPEG:-ffmpeg}"
OUT="${1:-../../public/hero}"
mkdir -p "$OUT"

# H.264 MP4 — Chrome, Safari, Edge
"$FF" -loglevel error -y -framerate 24 -i frames/%04d.png \
  -c:v libx264 -preset slow -crf "${CRF:-23}" -pix_fmt yuv420p \
  -g 1 -keyint_min 1 -sc_threshold 0 -bf 0 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart -an "$OUT/hero-scrub.mp4"

# VP9 WebM — browsers without H.264 (some Linux Chromium / Firefox builds)
"$FF" -loglevel error -y -framerate 24 -i frames/%04d.png \
  -c:v libvpx-vp9 -pix_fmt yuv420p -g 1 -keyint_min 1 -crf "${VP9_CRF:-36}" -b:v 0 \
  -row-mt 1 -deadline good -cpu-used 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -an "$OUT/hero-scrub.webm"

# Poster = frame 0 at full size. Stills = the graph alone, one per text panel (static mode),
# lossless so their paper colour matches the page exactly.
"$FF" -loglevel error -y -i frames/0000.png -c:v libwebp -quality 86 "$OUT/poster-start.webp"
for n in 1 2 3; do
  "$FF" -loglevel error -y -i "frames/still-p$n.png" -c:v libwebp -lossless 1 "$OUT/still-p$n.webp"
done
ls -la "$OUT"
