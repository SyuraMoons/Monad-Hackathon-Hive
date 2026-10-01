# Hero video

Renders the landing hero's scroll-scrubbed graph animation (Figma `5:22`). As you scroll the landing page, `HeroScrub` seeks through this clip frame by frame, so every frame has to be a keyframe.

## The clip

| Spec | Value |
| --- | --- |
| Canvas | 1400 × 452 px (2× the 700 × 226 graph zone on the page) |
| Length | 10 s at 24 fps = 241 frames (0–240) |
| Background | exactly `#F4F2EC`, the page's paper colour |
| Encoding | all-intra H.264 MP4, plus a VP9 WebM for browsers without H.264 |
| Nodes | Claude and GPT as connected nodes, Therapy Bot as the isolated variant ("no edge, no read") |

## Storyboard

`t` runs 0..1 across the clip (frame = `t` × 240). It lines up with the three text panels in `components/hero/HeroScrub.tsx`.

| t | Frames | What the graph does |
| --- | --- | --- |
| 0.00–0.30 | 0–72 | At rest. The Claude → GPT arrow is dashed (unsigned). |
| 0.30–0.42 | 72–101 | The arrow draws solid from left to right, and the arrowhead turns solid. |
| 0.42–0.50 | 101–120 | The tag `work · 30d · signed ✓` scales in below the edge. |
| 0.50–0.72 | 120–173 | Hold. |
| 0.72–0.86 | 173–206 | A pulse travels Claude → GPT with an ease-out. |
| 0.84–0.90 | 202–216 | GPT's border flashes amber once, then settles back. |
| 0.90–1.00 | 216–240 | Hold the final state. |

Therapy Bot never changes in any frame. The stills come from frame 0 (poster and panel 1), frame 130 (panel 2) and frame 186 (panel 3, mid-pulse).

## Files

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
