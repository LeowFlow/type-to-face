# Type to Face - Crisp Webcam Typography Renderer

Client-side webcam to typographic ASCII rendering with a modular pipeline and persisted `RendererConfig`.

## How to run
1. Open `/Users/leohennessy/type-to-face/index.html` in a modern browser for the homepage.
2. Open `/Users/leohennessy/type-to-face/render.html` for the renderer and click **Start camera**.
3. If camera permissions are blocked on `file://`, serve locally:

```bash
cd /Users/leohennessy/type-to-face
python3 -m http.server
```

4. Open `http://localhost:8000` for the homepage or `http://localhost:8000/render.html` for the renderer.

## Crisp rendering strategy
1. Dedicated low-resolution sampling buffer (`src/sampling.js`) extracts one pixel per character cell.
2. Dedicated output canvas (`src/renderCanvas.js`) uses device pixel ratio scaling:
   - `canvas.width/height = logicalSize * DPR`
   - `ctx.setTransform(DPR, 0, 0, DPR, 0, 0)`
3. Output canvas CSS size is set to the same logical size to avoid bitmap stretch.
4. Rendering snaps text positions to integer coordinates and keeps smoothing disabled.
5. The renderer always uses this crisp path.

## Pipeline modules
- `/Users/leohennessy/type-to-face/src/camera.js`: `getUserMedia` start/stop.
- `/Users/leohennessy/type-to-face/src/sampling.js`: downscale frame, mirror, optional detail boost.
- `/Users/leohennessy/type-to-face/src/mapping.js`: luma/gamma/contrast/brightness/exposure/threshold and glyph mapping.
- `/Users/leohennessy/type-to-face/src/renderCanvas.js`: DPR-aware crisp text rendering.
- `/Users/leohennessy/type-to-face/src/palettes.js`: palette presets and quantization.
- `/Users/leohennessy/type-to-face/src/ui.js`: control bindings and localStorage persistence.
- `/Users/leohennessy/type-to-face/src/main.js`: orchestration loop, FPS cap, adaptive resolution.

## RendererConfig reference
| Key | Type | Default | Notes |
|---|---|---|---|
| `scalePreset` | `"fine" \| "balanced" \| "chunky"` | `"balanced"` | Quick resolution style preset |
| `cellSize` | number | `14` | Character cell base size in px |
| `fontFamily` | string | IBM Plex Mono stack | Typography family |
| `fontWeight` | number | `600` | Text weight |
| `fontSizeMode` | `"auto" \| "manual"` | `"manual"` | Manual uses the font size control |
| `fontSize` | number | `17` | Manual font size |
| `lineHeight` | number | `1.0` | Tight/standard/loose line spacing |
| `tracking` | number | `0` | Letter spacing offset |
| `glyphRampPreset` | string | `"classic"` | Curated density ramps |
| `customRamp` | string | `""` | Custom ramp (dense to sparse) |
| `invert` | boolean | `false` | Invert glyph-density mapping |
| `brightness` | number | `0` | `-100` to `100` |
| `contrast` | number | `100` | Percent scale, `100` is neutral |
| `gamma` | number | `1.0` | Gamma correction |
| `exposure` | number | `0` | Stops |
| `threshold` | number | `0` | `0` disables threshold mode |
| `smoothing` | boolean | `false` | Sampling interpolation |
| `detailBoost` | number | `12` | Lightweight unsharp detail lift |
| `colourMode` | `"off" \| "average" \| "palette"` | `"average"` | Character color behavior |
| `palettePreset` | string | `"ansi16"` | Mono, ANSI16, Duotone, CMY-ish, Warm/Cold |
| `paletteStrength` | number | `100` | Blend into palette |
| `mirror` | boolean | `true` | Selfie view toggle |
| `fpsCap` | number | `30` | Render loop cap |
| `adaptiveResolution` | boolean | `true` | Downshift sampling if frame time is high |

## Controls in demo
- Start camera, pause/resume, snapshot PNG
- Upload a still image instead of using the camera
- Reset to defaults
- Full config panel to manipulate `RendererConfig`

## Persistence
- Renderer settings are saved to localStorage key `type-to-face-renderer-config-v3`.

## Image uploads
- Uploads are accepted from local image files under 18 MB.
- Oversized images are downscaled to a maximum 1600px edge and 2 megapixels before sampling.
- Still images render only when uploaded or when settings change; they do not run through the camera frame loop.
- Uploaded images render in a fixed stage viewport. Drag the output to pan, use the zoom buttons or mouse wheel to zoom, and snapshots save the current viewport.
