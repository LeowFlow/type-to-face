function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function adjustChannel(value, config) {
  let out = value / 255;

  out = out * Math.pow(2, config.exposure);
  out = (out - 0.5) * config.contrast + 0.5;
  out += config.brightness;
  out = clamp(out, 0, 1);
  out = Math.pow(out, 1 / Math.max(config.gamma, 0.01));

  return clamp(Math.round(out * 255), 0, 255);
}

export function getGlyphRamp(config) {
  if (config.customRamp.trim().length > 0) {
    return config.customRamp;
  }
  return config.glyphRamps[config.glyphRampPreset] || config.glyphRamps.classic;
}

export function perceptualLuma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mapPixelToCell(r, g, b, config, glyphRamp) {
  const ar = adjustChannel(r, config);
  const ag = adjustChannel(g, config);
  const ab = adjustChannel(b, config);

  const luma = perceptualLuma(ar, ag, ab);
  const normalized = clamp(luma / 255, 0, 1);
  const threshold = config.threshold > 0 ? config.threshold / 255 : 0;

  let tone = normalized;
  if (threshold > 0) {
    tone = normalized >= threshold ? 1 : 0;
  }

  const mapped = config.invert ? 1 - tone : tone;
  const idx = Math.round(mapped * (glyphRamp.length - 1));
  const glyph = glyphRamp[idx] || " ";

  return {
    glyph,
    r: ar,
    g: ag,
    b: ab,
    luma: tone,
  };
}
