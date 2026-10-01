# Hero video

Renders the clip that plays behind the landing hero on wide screens (`components/hero/Hero.tsx`). It plays straight through and loops by fading to the poster, which is its first frame. Every frame is a keyframe, a leftover from when the hero scrubbed the clip with the scroll; it also makes the restart instant.

## The clip

| Spec | Value |
| --- | --- |
| Canvas | rendered at 1920 × 1080, delivered at 1600 × 900 (fewer pixels to decode per scrubbed frame), shown with `object-fit: cover` |
| Length | 10 s at 24 fps = 241 frames (0–240) |
| Background | `#F4F2EC`, the page's paper colour, with the page's waves and a faint dot grid |
| Encoding | all-intra H.264 MP4 (about 2.8 MB), plus a VP9 WebM for browsers without H.264 |
| Nodes | Claude and GPT as connected nodes, Therapy Bot as the isolated variant ("no edge, no read") |

### Layout rule

The graph is centred on x = 960 and its **top edge sits on the clip's centre line** (y = 540). It is 750 px wide and 320 px tall. `Hero.module.css` relies on this: the text ends just above the stage's centre line and the button starts 318 clip pixels below it. If you move the graph, change those two numbers too. Keep the graph narrower than about 780 px so it survives the side crop on portrait tablets.

## Storyboard

`t` runs 0..1 across the clip (frame = `t` × 240). Played straight through, the whole story takes 10 seconds.

Running through the whole clip, so something moves on every scroll tick:

- the waves sway
- the dot grid drifts up and to the left
- the dashes of the unsigned edge march toward GPT (until the edge is signed)
- the camera pushes in on the graph (0.94 → 1.00 over 0.16–0.40, then to 1.03 over 0.60–1.00)

| t | Frames | What the graph does |
| --- | --- | --- |
| 0.00–0.30 | 0–72 | The Claude → GPT arrow is dashed (unsigned). |
| 0.30–0.42 | 72–101 | The arrow draws solid from left to right, and the arrowhead turns solid. |
| 0.42–0.52 | 101–125 | A ripple spreads from the edge and the tag `work · 30d · signed ✓` scales in below it. |
| 0.52–0.70 | 125–168 | Hold. |
| 0.70–0.82 | 168–197 | First pulse travels Claude → GPT with an ease-out. |
| 0.80–0.92 | 192–221 | Second pulse. |
| 0.80–0.86, 0.90–0.96 | 192–206, 216–230 | GPT's border flashes amber as each pulse lands. |
| 0.96–1.00 | 230–240 | Hold the final state. |

Therapy Bot never changes (only the camera moves it). The poster is frame 0. The static-mode stills are the graph alone, without waves or grid, at frame 0 (panel 1), frame 130 (panel 2) and frame 178 (panel 3, mid-pulse).

## Files

| File | What |
| --- | --- |
| `render.html` | The scene. `window.render(t)` draws it for any `t` in 0..1. Open `render.html?t=0.8` to check one moment; add `&bare=1` to hide the waves and grid. |
| `render.mjs` | Screenshots 241 frames at 1920 × 1080 and the three stills (880 × 370 at 2×) into `frames/` |
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

Without a system ffmpeg or Playwright install, point the scripts at other copies: `PLAYWRIGHT_MODULE` (a file URL to `playwright-core/index.mjs`) and `PLAYWRIGHT_CHANNEL=chrome` for `render.mjs`, and `FFMPEG=/path/to/ffmpeg` for `encode.sh` (the `ffmpeg-static` npm package works). `CRF` and `VP9_CRF` change the quality and file size.

`frames/` is scratch output; don't commit it.

## Checks after a re-render

- Every frame is a keyframe: `ffprobe -v error -select_streams v:0 -show_entries frame=key_frame -of csv=p=0 ../../public/hero/hero-scrub.mp4 | sort | uniq -c` shows `241 1`.
- The poster looks the same as the first frame of the video (no jump when the video takes over).
- On the landing page at a few window sizes, the lead text ends above the graph and the button sits below Therapy Bot.
- Therapy Bot looks identical in every frame.
