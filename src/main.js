import { startCamera, stopCamera } from "./camera.js";
import {
  createSamplingContext,
  configureSamplingBuffer,
  sampleFrame,
} from "./sampling.js";
import { getGlyphRamp, mapPixelToCell } from "./mapping.js";
import { RenderCanvas } from "./renderCanvas.js";
import { applyPalette } from "./palettes.js";
import { loadConfig, saveConfig, setupUI } from "./ui.js";

const GLYPH_RAMPS = {
  classic: { label: "Classic", chars: "@%#*+=-:. " },
  blocks: { label: "Blocks", chars: "█▓▒░ " },
  minimal: { label: "Minimal", chars: "#*:. " },
  typewriter: { label: "Typewriter", chars: "MWNXK0Ooc;:,. " },
};

const DEFAULT_CONFIG = {
  renderMode: "crisp",
  scalePreset: "balanced",
  cellSize: 10,
  fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  fontWeight: 600,
  fontSizeMode: "auto",
  fontSize: 11,
  lineHeight: 1,
  tracking: 0,
  glyphRampPreset: "classic",
  customRamp: "",
  invert: false,
  brightness: 0,
  contrast: 100,
  gamma: 1,
  exposure: 0,
  threshold: 0,
  smoothing: false,
  detailBoost: 12,
  colourMode: "off",
  palettePreset: "ansi16",
  paletteStrength: 100,
  mirror: true,
  fpsCap: 30,
  adaptiveResolution: true,
};

const SCALE_PRESETS = {
  fine: { cellSize: 7, multiplier: 0.9 },
  balanced: { cellSize: 10, multiplier: 1 },
  chunky: { cellSize: 14, multiplier: 1.2 },
};

const video = document.getElementById("video");
const outputCanvas = document.getElementById("output");
const outputFrame = outputCanvas.parentElement;

const RendererConfig = loadConfig(DEFAULT_CONFIG);
const sampling = createSamplingContext();
const renderer = new RenderCanvas(outputCanvas);

const state = {
  running: false,
  paused: false,
  frameId: null,
  adaptiveScale: 1,
  lastDrawAt: 0,
  avgFrameMs: 16,
  stream: null,
};

function getScaleMultiplier() {
  return SCALE_PRESETS[RendererConfig.scalePreset]?.multiplier || 1;
}

function computeLayout() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return null;
  }

  const baseCell = Math.max(
    4,
    Math.round(RendererConfig.cellSize * getScaleMultiplier()),
  );
  const frameWidth = Math.max(
    baseCell,
    Math.floor(outputFrame?.clientWidth || vw),
  );
  const frameHeight = Math.max(baseCell, Math.round(frameWidth * (vh / vw)));
  const baseCols = Math.max(1, Math.floor(frameWidth / baseCell));
  const baseRows = Math.max(1, Math.floor(frameHeight / baseCell));

  const sampleCols = Math.max(1, Math.floor(baseCols * state.adaptiveScale));
  const sampleRows = Math.max(1, Math.floor(baseRows * state.adaptiveScale));

  return {
    columns: sampleCols,
    rows: sampleRows,
    cellWidth: frameWidth / sampleCols,
    cellHeight: (frameHeight / sampleRows) * RendererConfig.lineHeight,
    baseCols,
    baseRows,
  };
}

function mappingConfig() {
  return {
    brightness: RendererConfig.brightness / 100,
    contrast: RendererConfig.contrast / 100,
    gamma: RendererConfig.gamma,
    exposure: RendererConfig.exposure,
    threshold: RendererConfig.threshold,
    invert: RendererConfig.invert,
    customRamp: RendererConfig.customRamp,
    glyphRampPreset: RendererConfig.glyphRampPreset,
    glyphRamps: Object.fromEntries(
      Object.entries(GLYPH_RAMPS).map(([k, v]) => [k, v.chars]),
    ),
  };
}

function getStyle(layout) {
  const derivedFontSize = Math.max(6, Math.floor(layout.cellHeight * 0.92));
  return {
    fontFamily: RendererConfig.fontFamily,
    fontWeight: RendererConfig.fontWeight,
    fontSize:
      RendererConfig.fontSizeMode === "manual"
        ? RendererConfig.fontSize
        : derivedFontSize,
    letterSpacing: RendererConfig.tracking,
  };
}

function applyColourMode(mapped) {
  if (RendererConfig.colourMode === "off") {
    const gray = Math.round(mapped.luma * 255);
    return { ...mapped, r: gray, g: gray, b: gray };
  }

  if (RendererConfig.colourMode === "palette") {
    const [r, g, b] = applyPalette(
      mapped.r,
      mapped.g,
      mapped.b,
      RendererConfig.palettePreset,
      RendererConfig.paletteStrength,
    );
    return { ...mapped, r, g, b };
  }

  return mapped;
}

function adaptResolution(frameMs) {
  if (!RendererConfig.adaptiveResolution) {
    state.adaptiveScale = 1;
    return;
  }

  const targetMs = 1000 / RendererConfig.fpsCap;
  if (frameMs > targetMs * 1.2) {
    state.adaptiveScale = Math.max(0.45, state.adaptiveScale - 0.05);
  } else if (frameMs < targetMs * 0.75) {
    state.adaptiveScale = Math.min(1, state.adaptiveScale + 0.03);
  }
}

function updateStats(layout, frameMs) {
  const dpr =
    RendererConfig.renderMode === "performance"
      ? 1
      : window.devicePixelRatio || 1;
  const fps = frameMs > 0 ? Math.round(1000 / frameMs) : 0;
  ui.setGridInfo(layout.baseCols, layout.baseRows);
  ui.setStats(
    `DPR ${dpr.toFixed(2)} | ${layout.columns}x${layout.rows} samples | base ${layout.baseCols}x${layout.baseRows} | ${fps} fps | adaptive ${state.adaptiveScale.toFixed(2)}`,
  );
}

function draw(now) {
  if (!state.running) {
    return;
  }

  state.frameId = requestAnimationFrame(draw);

  const capMs = 1000 / RendererConfig.fpsCap;
  if (now - state.lastDrawAt < capMs) {
    return;
  }
  state.lastDrawAt = now;

  if (state.paused) {
    return;
  }

  const frameStart = performance.now();

  const layout = computeLayout();
  if (!layout) {
    return;
  }

  renderer.resize(layout, { mode: RendererConfig.renderMode });

  configureSamplingBuffer(
    sampling,
    layout.columns,
    layout.rows,
    RendererConfig.smoothing && RendererConfig.renderMode !== "crisp",
  );

  const frame = sampleFrame(video, sampling, {
    mirror: RendererConfig.mirror,
    smoothing: RendererConfig.smoothing,
    detailBoost: RendererConfig.detailBoost,
  });

  const mapConfig = mappingConfig();
  const glyphRamp = getGlyphRamp(mapConfig);

  renderer.draw(
    frame,
    layout,
    getStyle(layout),
    (r, g, b) => applyColourMode(mapPixelToCell(r, g, b, mapConfig, glyphRamp)),
    RendererConfig.renderMode === "crisp",
  );

  const frameMs = performance.now() - frameStart;
  state.avgFrameMs = state.avgFrameMs * 0.85 + frameMs * 0.15;
  adaptResolution(state.avgFrameMs);
  updateStats(layout, state.avgFrameMs);
}

async function onStart() {
  if (state.running) {
    return;
  }

  try {
    state.stream = await startCamera(video);
    state.running = true;
    state.paused = false;
    ui.setRunningState(true, false);
    ui.setStatus("Camera active. Rendering.");
    draw(performance.now());
  } catch (error) {
    ui.setStatus(`Camera error: ${error.message}`);
  }
}

function onPause() {
  if (!state.running) {
    return;
  }

  state.paused = !state.paused;
  ui.setRunningState(true, state.paused);
  ui.setStatus(state.paused ? "Paused." : "Rendering.");
}

function onSnapshot() {
  if (!state.running) {
    return;
  }

  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `type-to-face-${stamp}.png`;
  link.href = outputCanvas.toDataURL("image/png");
  link.click();
}

function onReset() {
  Object.assign(RendererConfig, DEFAULT_CONFIG);
  state.adaptiveScale = 1;
  ui.syncControls();
  saveConfig(RendererConfig);
  ui.setStatus("RendererConfig reset to defaults.");
}

function onScalePreset(preset) {
  const entry = SCALE_PRESETS[preset];
  if (!entry) {
    return;
  }

  RendererConfig.scalePreset = preset;
  RendererConfig.cellSize = entry.cellSize;
  saveConfig(RendererConfig);
  ui.syncControls();
}

function onConfigChange() {
  saveConfig(RendererConfig);
}

const ui = setupUI(RendererConfig, {
  glyphRamps: GLYPH_RAMPS,
  onStart,
  onPause,
  onSnapshot,
  onReset,
  onScalePreset,
  onConfigChange,
});

ui.setRunningState(false, false);
ui.setStatus("Camera idle.");

window.RendererConfig = RendererConfig;
window.RendererConfigAPI = {
  get() {
    return { ...RendererConfig };
  },
  set(partial) {
    Object.assign(RendererConfig, partial || {});
    ui.syncControls();
    saveConfig(RendererConfig);
  },
  reset() {
    onReset();
  },
};

window.addEventListener("beforeunload", () => {
  if (state.frameId) {
    cancelAnimationFrame(state.frameId);
  }
  if (state.stream) {
    stopCamera(video);
  }
});
