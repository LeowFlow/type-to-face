export const PALETTE_PRESETS = {
  mono: {
    name: "Mono",
    colors: [
      [12, 12, 12],
      [245, 245, 245],
    ],
  },
  ansi16: {
    name: "ANSI 16",
    colors: [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ],
  },
  duotone: {
    name: "Duotone",
    colors: [
      [18, 30, 64],
      [242, 180, 94],
    ],
  },
  cmyish: {
    name: "CMY-ish",
    colors: [
      [0, 185, 190],
      [210, 20, 125],
      [250, 220, 0],
      [245, 245, 245],
    ],
  },
  warmcold: {
    name: "Warm/Cold",
    colors: [
      [33, 61, 120],
      [103, 152, 224],
      [230, 176, 109],
      [164, 92, 60],
    ],
  },
};

export function listPaletteOptions() {
  return Object.entries(PALETTE_PRESETS).map(([key, value]) => ({
    key,
    label: value.name,
  }));
}

export function quantizeColor(r, g, b, palette) {
  let best = palette[0];
  let bestDistance = Infinity;

  for (const [pr, pg, pb] of palette) {
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [pr, pg, pb];
    }
  }

  return best;
}

export function applyPalette(r, g, b, paletteKey, strength) {
  const preset = PALETTE_PRESETS[paletteKey];
  if (!preset) {
    return [r, g, b];
  }

  const [qr, qg, qb] = quantizeColor(r, g, b, preset.colors);
  const mix = Math.max(0, Math.min(1, strength / 100));

  return [
    Math.round(r + (qr - r) * mix),
    Math.round(g + (qg - g) * mix),
    Math.round(b + (qb - b) * mix),
  ];
}
