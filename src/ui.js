import { listPaletteOptions } from "./palettes.js";

const STORAGE_KEY = "type-to-face-renderer-config-v2";

function mergeConfig(defaults, loaded) {
  return {
    ...defaults,
    ...(loaded || {}),
  };
}

function byId(id) {
  return document.getElementById(id);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(defaultConfig) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return { ...defaultConfig };
    }
    return mergeConfig(defaultConfig, JSON.parse(saved));
  } catch {
    return { ...defaultConfig };
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function setupUI(config, options) {
  const controls = {
    start: byId("start"),
    pause: byId("pause"),
    snapshot: byId("snapshot"),
    reset: byId("reset"),
    status: byId("status"),
    stats: byId("stats"),
    renderMode: byId("renderMode"),
    cellSize: byId("cellSize"),
    cellSizeOut: byId("cellSizeOut"),
    gridOut: byId("gridOut"),
    lineHeight: byId("lineHeight"),
    lineHeightOut: byId("lineHeightOut"),
    tracking: byId("tracking"),
    trackingOut: byId("trackingOut"),
    fontFamily: byId("fontFamily"),
    fontWeight: byId("fontWeight"),
    fontWeightOut: byId("fontWeightOut"),
    fontSizeMode: byId("fontSizeMode"),
    fontSize: byId("fontSize"),
    fontSizeOut: byId("fontSizeOut"),
    glyphRampPreset: byId("glyphRampPreset"),
    customRamp: byId("customRamp"),
    invert: byId("invert"),
    brightness: byId("brightness"),
    brightnessOut: byId("brightnessOut"),
    contrast: byId("contrast"),
    contrastOut: byId("contrastOut"),
    gamma: byId("gamma"),
    gammaOut: byId("gammaOut"),
    exposure: byId("exposure"),
    exposureOut: byId("exposureOut"),
    threshold: byId("threshold"),
    thresholdOut: byId("thresholdOut"),
    smoothing: byId("smoothing"),
    detailBoost: byId("detailBoost"),
    detailBoostOut: byId("detailBoostOut"),
    colourMode: byId("colourMode"),
    palettePreset: byId("palettePreset"),
    paletteStrength: byId("paletteStrength"),
    paletteStrengthOut: byId("paletteStrengthOut"),
    mirror: byId("mirror"),
    fpsCap: byId("fpsCap"),
    adaptiveResolution: byId("adaptiveResolution"),
  };

  for (const [key, label] of Object.entries(options.glyphRamps)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label.label;
    controls.glyphRampPreset.appendChild(opt);
  }

  for (const entry of listPaletteOptions()) {
    const opt = document.createElement("option");
    opt.value = entry.key;
    opt.textContent = entry.label;
    controls.palettePreset.appendChild(opt);
  }

  const updateOutputs = () => {
    controls.cellSizeOut.textContent = `${config.cellSize}px`;
    controls.lineHeightOut.textContent = config.lineHeight.toFixed(2);
    controls.trackingOut.textContent = config.tracking.toFixed(2);
    controls.fontWeightOut.textContent = String(config.fontWeight);
    controls.fontSizeOut.textContent = `${config.fontSize}px`;
    controls.brightnessOut.textContent = String(config.brightness);
    controls.contrastOut.textContent = `${config.contrast}%`;
    controls.gammaOut.textContent = config.gamma.toFixed(2);
    controls.exposureOut.textContent = config.exposure.toFixed(2);
    controls.thresholdOut.textContent = String(config.threshold);
    controls.detailBoostOut.textContent = `${config.detailBoost}%`;
    controls.paletteStrengthOut.textContent = `${config.paletteStrength}%`;
  };

  const syncControls = () => {
    controls.renderMode.value = config.renderMode;
    controls.cellSize.value = String(config.cellSize);
    controls.lineHeight.value = String(config.lineHeight);
    controls.tracking.value = String(config.tracking);
    controls.fontFamily.value = config.fontFamily;
    controls.fontWeight.value = String(config.fontWeight);
    controls.fontSizeMode.value = config.fontSizeMode;
    controls.fontSize.value = String(config.fontSize);
    controls.glyphRampPreset.value = config.glyphRampPreset;
    controls.customRamp.value = config.customRamp;
    controls.invert.checked = config.invert;
    controls.brightness.value = String(config.brightness);
    controls.contrast.value = String(config.contrast);
    controls.gamma.value = String(config.gamma);
    controls.exposure.value = String(config.exposure);
    controls.threshold.value = String(config.threshold);
    controls.smoothing.checked = config.smoothing;
    controls.detailBoost.value = String(config.detailBoost);
    controls.colourMode.value = config.colourMode;
    controls.palettePreset.value = config.palettePreset;
    controls.paletteStrength.value = String(config.paletteStrength);
    controls.mirror.checked = config.mirror;
    controls.fpsCap.value = String(config.fpsCap);
    controls.adaptiveResolution.checked = config.adaptiveResolution;

    controls.fontSize.disabled = config.fontSizeMode !== "manual";
    controls.palettePreset.disabled = config.colourMode !== "palette";
    controls.paletteStrength.disabled = config.colourMode !== "palette";

    updateOutputs();
  };

  const update = (key, value) => {
    config[key] = value;
    if (key === "fontSizeMode") {
      controls.fontSize.disabled = config.fontSizeMode !== "manual";
    }
    if (key === "colourMode") {
      controls.palettePreset.disabled = config.colourMode !== "palette";
      controls.paletteStrength.disabled = config.colourMode !== "palette";
    }
    updateOutputs();
    options.onConfigChange();
  };

  controls.start.addEventListener("click", options.onStart);
  controls.pause.addEventListener("click", options.onPause);
  controls.snapshot.addEventListener("click", options.onSnapshot);
  controls.reset.addEventListener("click", options.onReset);

  document.querySelectorAll(".preset").forEach((button) => {
    button.addEventListener("click", () => options.onScalePreset(button.dataset.preset));
  });

  controls.renderMode.addEventListener("change", (e) => update("renderMode", e.target.value));
  controls.cellSize.addEventListener("input", (e) => update("cellSize", toNumber(e.target.value, config.cellSize)));
  controls.lineHeight.addEventListener("input", (e) => update("lineHeight", toNumber(e.target.value, config.lineHeight)));
  controls.tracking.addEventListener("input", (e) => update("tracking", toNumber(e.target.value, config.tracking)));
  controls.fontFamily.addEventListener("input", (e) => update("fontFamily", e.target.value));
  controls.fontWeight.addEventListener("input", (e) => update("fontWeight", toNumber(e.target.value, config.fontWeight)));
  controls.fontSizeMode.addEventListener("change", (e) => update("fontSizeMode", e.target.value));
  controls.fontSize.addEventListener("input", (e) => update("fontSize", toNumber(e.target.value, config.fontSize)));
  controls.glyphRampPreset.addEventListener("change", (e) => update("glyphRampPreset", e.target.value));
  controls.customRamp.addEventListener("input", (e) => update("customRamp", e.target.value));
  controls.invert.addEventListener("change", (e) => update("invert", e.target.checked));
  controls.brightness.addEventListener("input", (e) => update("brightness", toNumber(e.target.value, config.brightness)));
  controls.contrast.addEventListener("input", (e) => update("contrast", toNumber(e.target.value, config.contrast)));
  controls.gamma.addEventListener("input", (e) => update("gamma", toNumber(e.target.value, config.gamma)));
  controls.exposure.addEventListener("input", (e) => update("exposure", toNumber(e.target.value, config.exposure)));
  controls.threshold.addEventListener("input", (e) => update("threshold", toNumber(e.target.value, config.threshold)));
  controls.smoothing.addEventListener("change", (e) => update("smoothing", e.target.checked));
  controls.detailBoost.addEventListener("input", (e) => update("detailBoost", toNumber(e.target.value, config.detailBoost)));
  controls.colourMode.addEventListener("change", (e) => update("colourMode", e.target.value));
  controls.palettePreset.addEventListener("change", (e) => update("palettePreset", e.target.value));
  controls.paletteStrength.addEventListener("input", (e) => update("paletteStrength", toNumber(e.target.value, config.paletteStrength)));
  controls.mirror.addEventListener("change", (e) => update("mirror", e.target.checked));
  controls.fpsCap.addEventListener("change", (e) => update("fpsCap", toNumber(e.target.value, config.fpsCap)));
  controls.adaptiveResolution.addEventListener("change", (e) => update("adaptiveResolution", e.target.checked));

  syncControls();

  return {
    controls,
    syncControls,
    setStatus(message) {
      controls.status.textContent = message;
    },
    setStats(message) {
      controls.stats.textContent = message;
    },
    setRunningState(running, paused) {
      controls.pause.disabled = !running;
      controls.snapshot.disabled = !running;
      controls.pause.textContent = paused ? "Resume" : "Pause";
    },
    setGridInfo(columns, rows) {
      controls.gridOut.textContent = `${columns} / ${rows}`;
    },
  };
}
