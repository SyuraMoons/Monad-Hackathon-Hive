# Hero video

Renders the landing hero's scroll-scrubbed graph animation (Figma `5:22`). The storyboard, sizes and timing are in [`docs/hero-prompt.md`](../../../../docs/hero-prompt.md) §15.

| File | What |
| --- | --- |
| `render.html` | The scene. `window.render(t)` draws the graph for any `t` in 0..1. Open `render.html?t=0.8` to check one moment. |
| `render.mjs` | Screenshots 241 frames (10 s at 24 fps) at 2×, 1400 × 452, into `frames/` |
| `encode.sh` | Encodes `frames/` to all-intra `hero-scrub.mp4` + `hero-scrub.webm`, and exports the poster and stills to `apps/web/public/hero/` |
| `assets/` | Fraunces and JetBrains Mono (OFL), plus the Claude and GPT icons exported from Figma |

## Re-render

Needs Node 22, ffmpeg (with libx264, libvpx-vp9 and libwebp) and Playwright's Chromium.

```bash
cd apps/web/scripts/hero-video
npx -y playwright@1.56.0 install chromium   # first time only
npx -y -p playwright@1.56.0 node render.mjs
bash encode.sh                              # writes to apps/web/public/hero/
```

`frames/` is scratch output; don't commit it.

## Checks after a re-render

- Every frame is a keyframe: `ffprobe -v error -select_streams v:0 -show_entries frame=key_frame -of csv=p=0 ../../public/hero/hero-scrub.mp4 | sort | uniq -c` shows `241 1`.
- The decoded background is within one step of `#F4F2EC` (the CSS edge mask hides that).
- Therapy Bot looks identical in every frame.
