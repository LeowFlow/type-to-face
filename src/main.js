import { startCamera, stopCamera } from "./camera.js";
import {
  createSamplingContext,
  configureSamplingBuffer,
  sampleSource,
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

const RENDER_MODE = "crisp";
const MAX_IMAGE_FILE_BYTES = 18 * 1024 * 1024;
const MAX_IMAGE_SOURCE_EDGE = 1600;
const MAX_IMAGE_SOURCE_PIXELS = 2_000_000;
const IMAGE_ZOOM_MAX = 6;

const DEFAULT_CONFIG = {
  scalePreset: "balanced",
  cellSize: 14,
  fontFamily: '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  fontWeight: 600,
  fontSizeMode: "manual",
  fontSize: 17,
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
  colourMode: "average",
  palettePreset: "ansi16",
  paletteStrength: 100,
  mirror: true,
  fpsCap: 30,
  adaptiveResolution: true,
};

const SCALE_PRESETS = {
  fine: { cellSize: 7, multiplier: 0.9 },
  balanced: { cellSize: 13, multiplier: 1 },
  chunky: { cellSize: 14, multiplier: 1.2 },
};

const MOBILE_PREVIEW_QUERY = "(max-width: 640px)";

function normalizeConfig(config) {
  delete config.renderMode;
  return config;
}

const video = document.getElementById("video");
const outputCanvas = document.getElementById("output");
const outputFrame = outputCanvas.parentElement;
const stage = outputFrame.closest(".stage");

const RendererConfig = normalizeConfig(loadConfig(DEFAULT_CONFIG));
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
  sourceType: "camera",
  imageSource: null,
  imageName: "",
  imageOriginalWidth: 0,
  imageOriginalHeight: 0,
  imageView: {
    zoom: 1,
    panX: 0,
    panY: 0,
    pointerId: null,
    lastPointerX: 0,
    lastPointerY: 0,
  },
  hasOutput: false,
};

function getScaleMultiplier() {
  return SCALE_PRESETS[RendererConfig.scalePreset]?.multiplier || 1;
}

function getSource() {
  return state.sourceType === "image" ? state.imageSource : video;
}

function getSourceDimensions(source = getSource()) {
  if (!source) {
    return null;
  }

  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;

  if (!width || !height) {
    return null;
  }

  return { width, height };
}

function setSourceMode(sourceType) {
  state.sourceType = sourceType;
  stage?.classList.toggle("imageMode", sourceType === "image");
}

function resetImageView() {
  state.imageView.zoom = 1;
  state.imageView.panX = 0;
  state.imageView.panY = 0;
  state.imageView.pointerId = null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeLayout() {
  const sourceSize = getSourceDimensions();
  if (!sourceSize) {
    return null;
  }

  const vw = sourceSize.width;
  const vh = sourceSize.height;
  const baseCell = Math.max(
    4,
    Math.round(RendererConfig.cellSize * getScaleMultiplier()),
  );
  const videoAspect = vh / vw;
  const isMobilePreview = window.matchMedia?.(MOBILE_PREVIEW_QUERY).matches;
  let frameWidth = Math.max(
    baseCell,
    Math.floor(outputFrame?.clientWidth || vw),
  );
  let frameHeight;

  if (state.sourceType === "image") {
    frameHeight = Math.max(
      baseCell,
      Math.floor(outputFrame?.clientHeight || frameWidth * (9 / 16)),
    );
  } else {
    frameHeight = Math.max(baseCell, Math.round(frameWidth * videoAspect));
  }

  if (state.sourceType !== "image" && isMobilePreview) {
    const maxFrameHeight = Math.floor(outputFrame?.clientHeight || frameHeight);
    if (maxFrameHeight > baseCell && frameHeight > maxFrameHeight) {
      frameHeight = Math.max(baseCell, maxFrameHeight);
      frameWidth = Math.max(baseCell, Math.round(frameHeight / videoAspect));
    }
  }

  const baseCols = Math.max(1, Math.floor(frameWidth / baseCell));
  const rowCellSize =
    state.sourceType === "image"
      ? baseCell * RendererConfig.lineHeight
      : baseCell;
  const baseRows = Math.max(1, Math.floor(frameHeight / rowCellSize));

  const sampleCols = Math.max(1, Math.floor(baseCols * state.adaptiveScale));
  const sampleRows = Math.max(1, Math.floor(baseRows * state.adaptiveScale));

  return {
    columns: sampleCols,
    rows: sampleRows,
    cellWidth: frameWidth / sampleCols,
    cellHeight:
      state.sourceType === "image"
        ? frameHeight / sampleRows
        : (frameHeight / sampleRows) * RendererConfig.lineHeight,
    baseCols,
    baseRows,
  };
}

function getLayoutSize(layout) {
  return {
    width: layout.columns * layout.cellWidth,
    height: layout.rows * layout.cellHeight,
  };
}

function getImageZoomBounds(layout) {
  const sourceSize = getSourceDimensions(state.imageSource);
  if (!sourceSize) {
    return { min: 1, max: IMAGE_ZOOM_MAX };
  }

  const viewport = getLayoutSize(layout);
  const coverScale = Math.max(
    viewport.width / sourceSize.width,
    viewport.height / sourceSize.height,
  );
  const containScale = Math.min(
    viewport.width / sourceSize.width,
    viewport.height / sourceSize.height,
  );

  return {
    min: Math.min(1, containScale / coverScale),
    max: IMAGE_ZOOM_MAX,
  };
}

function clampImageView(layout) {
  const sourceSize = getSourceDimensions(state.imageSource);
  if (!sourceSize) {
    return null;
  }

  const viewport = getLayoutSize(layout);
  const coverScale = Math.max(
    viewport.width / sourceSize.width,
    viewport.height / sourceSize.height,
  );
  const bounds = getImageZoomBounds(layout);

  state.imageView.zoom = clamp(state.imageView.zoom, bounds.min, bounds.max);

  const scale = coverScale * state.imageView.zoom;
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  const maxPanX = Math.max(0, (width - viewport.width) / 2);
  const maxPanY = Math.max(0, (height - viewport.height) / 2);

  state.imageView.panX = clamp(state.imageView.panX, -maxPanX, maxPanX);
  state.imageView.panY = clamp(state.imageView.panY, -maxPanY, maxPanY);

  return {
    x: (viewport.width - width) / 2 + state.imageView.panX,
    y: (viewport.height - height) / 2 + state.imageView.panY,
    width,
    height,
    viewport,
  };
}

function getSamplingView(layout, imageView) {
  return {
    x: (imageView.x / imageView.viewport.width) * layout.columns,
    y: (imageView.y / imageView.viewport.height) * layout.rows,
    width: (imageView.width / imageView.viewport.width) * layout.columns,
    height: (imageView.height / imageView.viewport.height) * layout.rows,
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
  const dpr = window.devicePixelRatio || 1;
  const sourceSize = getSourceDimensions();
  const sourceInfo =
    state.sourceType === "image" && sourceSize
      ? `image ${sourceSize.width}x${sourceSize.height}`
      : `${frameMs > 0 ? Math.round(1000 / frameMs) : 0} fps`;
  ui.setGridInfo(layout.baseCols, layout.baseRows);
  ui.setStats(
    `DPR ${dpr.toFixed(2)} | ${layout.columns}x${layout.rows} samples | base ${layout.baseCols}x${layout.baseRows} | ${sourceInfo} | adaptive ${state.adaptiveScale.toFixed(2)}`,
  );
}

function renderCurrentSource({ adaptive = false } = {}) {
  const source = getSource();
  if (!source) {
    return null;
  }

  const frameStart = performance.now();

  const layout = computeLayout();
  if (!layout) {
    return null;
  }

  renderer.resize(layout, { mode: RENDER_MODE });

  configureSamplingBuffer(
    sampling,
    layout.columns,
    layout.rows,
    false,
  );

  const imageView =
    state.sourceType === "image" ? clampImageView(layout) : null;
  const frame = sampleSource(source, sampling, {
    mirror: state.sourceType === "camera" && RendererConfig.mirror,
    view: imageView ? getSamplingView(layout, imageView) : null,
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
    true,
  );

  const frameMs = performance.now() - frameStart;
  if (adaptive) {
    state.avgFrameMs = state.avgFrameMs * 0.85 + frameMs * 0.15;
    adaptResolution(state.avgFrameMs);
  }
  state.hasOutput = true;
  updateStats(layout, adaptive ? state.avgFrameMs : frameMs);
  return { layout, frameMs };
}

function draw(now) {
  if (!state.running || state.sourceType !== "camera") {
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

  renderCurrentSource({ adaptive: true });
}

function stopCameraRender() {
  if (state.frameId) {
    cancelAnimationFrame(state.frameId);
    state.frameId = null;
  }
  if (state.stream) {
    stopCamera(video);
    state.stream = null;
  }
  state.running = false;
  state.paused = false;
}

function releaseImageSource() {
  if (state.imageSource?.close) {
    state.imageSource.close();
  }
  state.imageSource = null;
  state.imageName = "";
  state.imageOriginalWidth = 0;
  state.imageOriginalHeight = 0;
  resetImageView();
}

function getBoundedImageSize(width, height) {
  const edgeScale = MAX_IMAGE_SOURCE_EDGE / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_IMAGE_SOURCE_PIXELS / (width * height));
  const scale = Math.min(1, edgeScale, pixelScale);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    downscaled: scale < 1,
  };
}

function drawSourceToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);

  return canvas;
}

function decodeImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };

    image.src = url;
  });
}

async function decodeImageFile(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }

  return decodeImageElement(file);
}

async function loadImageSource(file) {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error("Choose an image under 18 MB.");
  }

  const decoded = await decodeImageFile(file);
  const sourceSize = getSourceDimensions(decoded);
  if (!sourceSize) {
    throw new Error("Could not read that image size.");
  }

  const targetSize = getBoundedImageSize(sourceSize.width, sourceSize.height);
  const source = targetSize.downscaled
    ? drawSourceToCanvas(decoded, targetSize.width, targetSize.height)
    : decoded;

  if (targetSize.downscaled && decoded.close) {
    decoded.close();
  }

  return {
    source,
    originalWidth: sourceSize.width,
    originalHeight: sourceSize.height,
    downscaled: targetSize.downscaled,
  };
}

function renderImageSource() {
  if (state.sourceType === "image" && state.imageSource) {
    return renderCurrentSource({ adaptive: false });
  }

  return null;
}

function zoomImageView(factor) {
  const layout = computeLayout();
  if (!layout || state.sourceType !== "image") {
    return;
  }

  const bounds = getImageZoomBounds(layout);
  state.imageView.zoom = clamp(
    state.imageView.zoom * factor,
    bounds.min,
    bounds.max,
  );
  renderImageSource();
}

function panImageView(deltaX, deltaY) {
  if (state.sourceType !== "image" || !state.imageSource) {
    return;
  }

  state.imageView.panX += deltaX;
  state.imageView.panY += deltaY;
  renderImageSource();
}

function onImageViewReset() {
  resetImageView();
  renderImageSource();
}

function getPointerPanScale() {
  const rect = outputFrame.getBoundingClientRect();
  return {
    x: rect.width > 0 ? (renderer.logicalWidth || rect.width) / rect.width : 1,
    y: rect.height > 0 ? (renderer.logicalHeight || rect.height) / rect.height : 1,
  };
}

function onImagePointerDown(event) {
  if (state.sourceType !== "image" || !state.imageSource) {
    return;
  }

  event.preventDefault();
  state.imageView.pointerId = event.pointerId;
  state.imageView.lastPointerX = event.clientX;
  state.imageView.lastPointerY = event.clientY;
  outputFrame.setPointerCapture?.(event.pointerId);
}

function onImagePointerMove(event) {
  if (
    state.sourceType !== "image" ||
    state.imageView.pointerId !== event.pointerId
  ) {
    return;
  }

  const scale = getPointerPanScale();
  const deltaX = (event.clientX - state.imageView.lastPointerX) * scale.x;
  const deltaY = (event.clientY - state.imageView.lastPointerY) * scale.y;

  state.imageView.lastPointerX = event.clientX;
  state.imageView.lastPointerY = event.clientY;
  panImageView(deltaX, deltaY);
}

function onImagePointerEnd(event) {
  if (state.imageView.pointerId !== event.pointerId) {
    return;
  }

  state.imageView.pointerId = null;
  outputFrame.releasePointerCapture?.(event.pointerId);
}

function onImageWheel(event) {
  if (state.sourceType !== "image" || !state.imageSource) {
    return;
  }

  event.preventDefault();
  zoomImageView(event.deltaY < 0 ? 1.12 : 1 / 1.12);
}

async function onStart() {
  if (state.running && state.sourceType === "camera") {
    return;
  }

  try {
    releaseImageSource();
    stopCameraRender();
    setSourceMode("camera");
    state.hasOutput = false;
    ui.setRunningState(false, false);
    state.stream = await startCamera(video);
    state.running = true;
    state.paused = false;
    ui.setRunningState(true, false);
    ui.setStatus("Camera active. Rendering.");
    draw(performance.now());
  } catch (error) {
    state.running = false;
    state.paused = false;
    ui.setRunningState(false, false);
    ui.setStatus(`Camera error: ${error.message}`);
  }
}

async function onImageUpload(file) {
  if (!file) {
    return;
  }

  ui.setImageState(false);
  ui.setStatus("Loading image.");

  try {
    stopCameraRender();
    const image = await loadImageSource(file);

    releaseImageSource();
    setSourceMode("image");
    state.imageSource = image.source;
    state.imageName = file.name;
    state.imageOriginalWidth = image.originalWidth;
    state.imageOriginalHeight = image.originalHeight;
    state.adaptiveScale = 1;
    state.hasOutput = false;
    resetImageView();

    const result = renderImageSource();
    if (!result) {
      ui.setStatus("Image loaded, but it could not be rendered.");
      return;
    }

    const sourceSize = getSourceDimensions();
    const resized =
      image.downscaled && sourceSize
        ? ` Downscaled from ${image.originalWidth}x${image.originalHeight} to ${sourceSize.width}x${sourceSize.height}.`
        : "";
    ui.setImageState(true);
    ui.setStatus(`Image loaded. Rendering still source.${resized}`);
  } catch (error) {
    ui.setImageState(state.hasOutput);
    ui.setStatus(`Image error: ${error.message}`);
  }
}

function onPause() {
  if (!state.running || state.sourceType !== "camera") {
    return;
  }

  state.paused = !state.paused;
  ui.setRunningState(true, state.paused);
  ui.setStatus(state.paused ? "Paused." : "Rendering.");
}

function onSnapshot() {
  if (!state.hasOutput) {
    return;
  }

  renderImageSource();

  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `type-to-face-${stamp}.png`;
  link.href = outputCanvas.toDataURL("image/png");
  link.click();
}

function onReset() {
  Object.assign(RendererConfig, DEFAULT_CONFIG);
  normalizeConfig(RendererConfig);
  state.adaptiveScale = 1;
  ui.syncControls();
  saveConfig(RendererConfig);
  renderImageSource();
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
  renderImageSource();
}

function onConfigChange() {
  normalizeConfig(RendererConfig);
  saveConfig(RendererConfig);
  renderImageSource();
}

const ui = setupUI(RendererConfig, {
  glyphRamps: GLYPH_RAMPS,
  onStart,
  onPause,
  onSnapshot,
  onImageUpload,
  onImageZoom: zoomImageView,
  onImageViewReset,
  onReset,
  onScalePreset,
  onConfigChange,
});

ui.setRunningState(false, false);
ui.setStatus("Camera idle.");

outputFrame.addEventListener("pointerdown", onImagePointerDown);
outputFrame.addEventListener("pointermove", onImagePointerMove);
outputFrame.addEventListener("pointerup", onImagePointerEnd);
outputFrame.addEventListener("pointercancel", onImagePointerEnd);
outputFrame.addEventListener("wheel", onImageWheel, { passive: false });
window.addEventListener("resize", () => {
  renderImageSource();
});

window.RendererConfig = RendererConfig;
window.RendererConfigAPI = {
  get() {
    return { ...RendererConfig };
  },
  set(partial) {
    const nextConfig = { ...(partial || {}) };
    delete nextConfig.renderMode;
    Object.assign(RendererConfig, nextConfig);
    normalizeConfig(RendererConfig);
    ui.syncControls();
    saveConfig(RendererConfig);
    renderImageSource();
  },
  reset() {
    onReset();
  },
};

window.addEventListener("beforeunload", () => {
  stopCameraRender();
  releaseImageSource();
});
