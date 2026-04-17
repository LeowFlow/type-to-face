const HERO_TEXT = "Face-To-Type";
const THREE_MODULE_URL = "https://unpkg.com/three@0.160.0/build/three.module.js";
const FONT_STACK = '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const GLYPHS = ["F", "A", "C", "E", "-", "T", "O", "Y", "P", "@", "#", "%", "&", "M", "W", "N", "X", "K", "0", "1", "+", "=", "/", "\\", "|", ":", "."];
const UNIT = 0.78;
const POINT_STEP = 3;
const GLYPH_PLANE_WIDTH = 7.9;
const GLYPH_PLANE_HEIGHT = 10.3;
const MIN_DENSITY_KEEP = 0.97;
const LOCAL_CLUSTER_RADIUS = 8.5;
const LOCAL_CLUSTER_STRENGTH = 0.16;
const MAX_POSITION_DRIFT = 5.4;
const EDGE_POSITION_DRIFT = 2.8;
const IDLE_MOTION_RAMP = 1800;
const POINTER_RADIUS = 118;
const POINTER_PUSH = 9;
const POINTER_DEPTH = 24;
const RIPPLE_DURATION = 1250;
const RIPPLE_SPEED = 275;
const RIPPLE_WIDTH = 38;
const RECONFIGURE_DELAY = 3400;
const RECONFIGURE_PERIOD = 7600;
const RECONFIGURE_DURATION = 1850;
const SECTION_COUNT = 7;

const TEXT_LAYOUTS = {
  wide: {
    width: 920,
    height: 500,
    lines: ["Type-To", "Face"],
    fontSize: 190,
    step: POINT_STEP,
  },
  stacked: {
    width: 560,
    height: 560,
    lines: ["Type", "To", "Face"],
    fontSize: 168,
    step: POINT_STEP,
  },
};

function hash2(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function chooseGlyph(x, y, seed, parentCharacter) {
  const source = HERO_TEXT.toUpperCase();
  const nameIndex = Math.floor(hash2(y, x) * source.length);
  const nameGlyph = source[nameIndex] || "T";
  const structuralGlyph = parentCharacter?.toUpperCase();

  if (structuralGlyph && seed > 0.34) {
    return structuralGlyph;
  }

  if (seed > 0.62 && nameGlyph !== " ") {
    return nameGlyph;
  }

  return GLYPHS[Math.floor(seed * GLYPHS.length) % GLYPHS.length];
}

function getTextFont(size) {
  return `900 ${size}px ${FONT_STACK}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value) {
  const inverse = 1 - value;
  return 1 - inverse * inverse * inverse;
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - amount * 2);
}

function getDensityForPoint(x, y, alpha, letter) {
  // Keep the mask almost fully sampled; small variation avoids a mechanical fill.
  const progress = letter.totalLetters > 1 ? letter.index / (letter.totalLetters - 1) : 0;
  const letterRhythm = 0.5 + Math.sin(progress * Math.PI * 5.6) * 0.5;
  const crossRhythm = 0.5 + Math.sin(x * 0.018 + y * 0.034) * 0.5;
  const edgeProtection = alpha < 190 ? 0.04 : 0;

  return clamp(MIN_DENSITY_KEEP + letterRhythm * 0.015 + crossRhythm * 0.008 + edgeProtection, MIN_DENSITY_KEEP, 1);
}

function getPixelAlpha(pixels, width, height, x, y) {
  const px = Math.round(clamp(x, 0, width - 1));
  const py = Math.round(clamp(y, 0, height - 1));

  return pixels[(py * width + px) * 4 + 3];
}

function getEdgeAmount(pixels, width, height, x, y) {
  const alpha = getPixelAlpha(pixels, width, height, x, y);
  const probe = POINT_STEP + 1;
  const minNeighbor = Math.min(
    getPixelAlpha(pixels, width, height, x - probe, y),
    getPixelAlpha(pixels, width, height, x + probe, y),
    getPixelAlpha(pixels, width, height, x, y - probe),
    getPixelAlpha(pixels, width, height, x, y + probe)
  );

  return smoothstep(20, 150, alpha - minNeighbor);
}

function shouldKeepPoint(x, y, alpha, letter, edgeAmount) {
  if (alpha < 116 || edgeAmount > 0.08) {
    return true;
  }

  return hash2(x * 0.47 + letter.index * 19.1, y * 0.53) < getDensityForPoint(x, y, alpha, letter);
}

function getDepthLayer(seed) {
  // Quantized z-bands make the title feel layered instead of one flat ASCII plane.
  if (seed < 0.22) {
    return { id: 0, bias: -22, parallax: 0.9, brightness: 0.74, scale: 0.97 };
  }

  if (seed > 0.76) {
    return { id: 2, bias: 28, parallax: 1.06, brightness: 1, scale: 1.02 };
  }

  return { id: 1, bias: 0, parallax: 1, brightness: 0.78, scale: 1 };
}

function createLetterMap(layout, ctx, fontSize, lineHeight) {
  const lineMaps = [];
  const totalHeight = lineHeight * (layout.lines.length - 1);
  const firstY = layout.height / 2 - totalHeight / 2;
  let assemblyIndex = 0;

  layout.lines.forEach((line, lineIndex) => {
    const lineWidth = ctx.measureText(line).width;
    const lineStart = layout.width / 2 - lineWidth / 2;
    const baselineY = firstY + lineIndex * lineHeight + fontSize * 0.03;
    const letters = [];

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const characterWidth = ctx.measureText(character).width;

      if (character.trim() === "") {
        continue;
      }

      const characterStart = lineStart + ctx.measureText(line.slice(0, index)).width;
      const characterEnd = characterStart + characterWidth;

      letters.push({
        index: assemblyIndex,
        character,
        start: characterStart,
        end: characterEnd,
        centerX: characterStart + characterWidth / 2 - layout.width / 2,
        centerY: layout.height / 2 - baselineY,
      });
      assemblyIndex += 1;
    }

    lineMaps.push({ baselineY, letters });
  });

  return {
    lines: lineMaps,
    totalLetters: Math.max(1, assemblyIndex),
  };
}

function getLetterForPoint(letterMap, x, y) {
  if (letterMap.lines.length === 0) {
    return {
      index: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  const lineMap = letterMap.lines.reduce((nearest, line) => {
    const distance = Math.abs(line.baselineY - y);
    return distance < nearest.distance ? { line, distance } : nearest;
  }, { line: letterMap.lines[0], distance: Infinity }).line;

  if (lineMap.letters.length === 0) {
    return {
      index: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  const paddedMatch = lineMap.letters.find((letter) => x >= letter.start - 4 && x <= letter.end + 4);

  if (paddedMatch) {
    return paddedMatch;
  }

  return lineMap.letters.reduce((nearest, letter) => {
    const center = (letter.start + letter.end) / 2;
    const distance = Math.abs(center - x);
    return distance < nearest.distance ? { letter, distance } : nearest;
  }, { letter: lineMap.letters[0], distance: Infinity }).letter;
}

function createTextPoints(layoutKey) {
  const layout = TEXT_LAYOUTS[layoutKey];
  const mask = document.createElement("canvas");
  const ctx = mask.getContext("2d", { willReadFrequently: true });
  const points = [];

  if (!ctx) {
    return { points, bounds: { width: 1, height: 1 } };
  }

  mask.width = layout.width;
  mask.height = layout.height;

  let fontSize = layout.fontSize;
  let lineHeight = fontSize * 0.9;
  let measuredWidth = 0;

  do {
    ctx.font = getTextFont(fontSize);
    measuredWidth = Math.max(...layout.lines.map((line) => ctx.measureText(line).width));
    lineHeight = fontSize * 0.9;
    fontSize -= 4;
  } while (
    fontSize > 48 &&
    (measuredWidth > layout.width * 0.9 || lineHeight * layout.lines.length > layout.height * 0.78)
  );

  fontSize += 4;
  lineHeight = fontSize * 0.9;

  ctx.clearRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = getTextFont(fontSize);

  const totalHeight = lineHeight * (layout.lines.length - 1);
  const firstY = layout.height / 2 - totalHeight / 2;
  const letterMap = createLetterMap(layout, ctx, fontSize, lineHeight);

  layout.lines.forEach((line, index) => {
    ctx.fillText(line, layout.width / 2, firstY + index * lineHeight + fontSize * 0.03);
  });

  const pixels = ctx.getImageData(0, 0, layout.width, layout.height).data;

  for (let y = 0; y < layout.height; y += layout.step) {
    for (let x = 0; x < layout.width; x += layout.step) {
      const alpha = pixels[(y * layout.width + x) * 4 + 3];

      if (alpha < 56) {
        continue;
      }

      const seed = hash2(x, y);
      const edgeAmount = getEdgeAmount(pixels, layout.width, layout.height, x, y);
      const letter = {
        ...getLetterForPoint(letterMap, x, y),
        totalLetters: letterMap.totalLetters,
      };

      if (!shouldKeepPoint(x, y, alpha, letter, edgeAmount)) {
        continue;
      }

      const layerSeed = hash2(letter.index * 31.7 + Math.floor(y / 30), Math.floor(x / 30) + seed * 13.1);
      const layer = getDepthLayer(layerSeed);
      const depth = (seed - 0.5) * 44 + Math.sin(x * 0.024) * 9 + Math.cos(y * 0.038) * 7 + layer.bias;

      points.push({
        x: x - layout.width / 2,
        y: layout.height / 2 - y,
        z: depth,
        layerId: layer.id,
        layerBrightness: layer.brightness,
        layerParallax: layer.parallax,
        edgeAmount,
        letterIndex: letter.index,
        letterCenterX: letter.centerX,
        letterCenterY: letter.centerY,
        totalLetters: letter.totalLetters,
        glyph: chooseGlyph(x, y, seed, letter.character),
        scale: (0.93 + hash2(y, x) * 0.12 + edgeAmount * 0.05) * layer.scale,
        alpha: Math.max(0.5, alpha / 255),
      });
    }
  }

  return centerPoints(points);
}

function centerPoints(points) {
  if (points.length === 0) {
    return { points, bounds: { width: 1, height: 1 } };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const centered = points.map((point) => ({
    ...point,
    x: point.x - centerX,
    y: point.y - centerY,
    letterCenterX: point.letterCenterX - centerX,
    letterCenterY: point.letterCenterY - centerY,
  }));

  const bounds = {
    width: Math.max(1, (maxX - minX) * UNIT),
    height: Math.max(1, (maxY - minY) * UNIT),
  };

  return {
    points: addFormationData(centered),
    bounds,
  };
}

function getClusterOffsets(points) {
  const bins = new Map();
  const cellSize = LOCAL_CLUSTER_RADIUS;

  function key(cellX, cellY) {
    return `${cellX}:${cellY}`;
  }

  points.forEach((point, index) => {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    const binKey = key(cellX, cellY);

    if (!bins.has(binKey)) {
      bins.set(binKey, []);
    }

    bins.get(binKey).push(index);
  });

  return points.map((point) => {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    let totalX = 0;
    let totalY = 0;
    let totalWeight = 0;

    for (let y = cellY - 1; y <= cellY + 1; y += 1) {
      for (let x = cellX - 1; x <= cellX + 1; x += 1) {
        const candidates = bins.get(key(x, y));

        if (!candidates) {
          continue;
        }

        candidates.forEach((candidateIndex) => {
          const candidate = points[candidateIndex];

          if (candidate === point || candidate.letterIndex !== point.letterIndex) {
            return;
          }

          const dx = candidate.x - point.x;
          const dy = candidate.y - point.y;
          const distance = Math.hypot(dx, dy);

          if (distance <= 0.001 || distance > LOCAL_CLUSTER_RADIUS) {
            return;
          }

          const weight = 1 - distance / LOCAL_CLUSTER_RADIUS;
          totalX += candidate.x * weight;
          totalY += candidate.y * weight;
          totalWeight += weight;
        });
      }
    }

    if (totalWeight <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((totalX / totalWeight) - point.x) * UNIT * LOCAL_CLUSTER_STRENGTH,
      y: ((totalY / totalWeight) - point.y) * UNIT * LOCAL_CLUSTER_STRENGTH,
    };
  });
}

function addFormationData(points) {
  const clusterOffsets = getClusterOffsets(points);

  return points.map((point, index) => {
    const outwardX = point.x - point.letterCenterX;
    const outwardY = point.y - point.letterCenterY;
    const outwardLength = Math.hypot(outwardX, outwardY) || 1;
    const phase = hash2(point.x * 0.19, point.y * 0.17) * Math.PI * 2;
    const sectionProgress = point.totalLetters > 1 ? point.letterIndex / (point.totalLetters - 1) : 0;
    const section = Math.min(SECTION_COUNT - 1, Math.floor(sectionProgress * SECTION_COUNT));
    const jitterAngle = phase + (hash2(point.y, point.x) - 0.5) * 1.2;
    const edgeLock = smoothstep(0.08, 0.75, point.edgeAmount || 0);
    const cluster = clusterOffsets[index];

    return {
      ...point,
      baseX: point.x * UNIT,
      baseY: point.y * UNIT,
      baseZ: point.z * UNIT,
      clusterX: cluster.x,
      clusterY: cluster.y,
      edgeLock,
      depthSign: point.z >= 0 ? 1 : -1,
      finalRotationZ: (hash2(point.x, point.y) - 0.5) * 0.024,
      finalRotationX: (hash2(point.y * 0.7, point.x * 0.3) - 0.5) * 0.02,
      finalRotationY: (hash2(point.x * 0.4, point.y * 0.9) - 0.5) * 0.026,
      idlePhase: phase,
      idleRate: 0.72 + hash2(point.letterIndex + 2.3, point.x * 0.1) * 0.44,
      section,
      loosenX: (outwardX / outwardLength + Math.cos(jitterAngle) * 0.14) * (1 - edgeLock * 0.58),
      loosenY: (outwardY / outwardLength + Math.sin(jitterAngle) * 0.14) * (1 - edgeLock * 0.58),
      loosenSpin: (hash2(point.letterIndex * 4.1, point.y) - 0.5) * 0.34,
      layerParallax: point.layerParallax || 1,
      layerBrightness: point.layerBrightness || 0.8,
    };
  });
}

function getFormationState(point) {
  return {
    x: point.x + (point.clusterX || 0) / UNIT,
    y: point.y + (point.clusterY || 0) / UNIT,
    z: point.z,
    rotationX: point.finalRotationX,
    rotationY: point.finalRotationY,
    rotationZ: point.finalRotationZ,
    scale: point.scale,
    alpha: point.alpha,
    progress: 1,
  };
}

function createMotionState(point) {
  return {
    x: point.baseX + point.clusterX,
    y: point.baseY + point.clusterY,
    z: point.baseZ,
    rotationX: point.finalRotationX,
    rotationY: point.finalRotationY,
    rotationZ: point.finalRotationZ,
    scale: point.scale,
    vx: 0,
    vy: 0,
    vz: 0,
    vrx: 0,
    vry: 0,
    vrz: 0,
    vs: 0,
  };
}

function springValue(current, velocity, target, stiffness, damping, dt) {
  const force = (target - current) * stiffness;
  const nextVelocity = (velocity + force * dt) * Math.exp(-damping * dt);

  return {
    value: current + nextVelocity * dt,
    velocity: nextVelocity,
  };
}

function applySpring(motion, target, dt) {
  // Springs make cursor, ripple, and reconfiguration states settle back instead of snapping.
  const positionStiffness = 96;
  const positionDamping = 16;
  const rotationStiffness = 70;
  const rotationDamping = 14;
  const scaleStiffness = 58;
  const scaleDamping = 12;
  const x = springValue(motion.x, motion.vx, target.x, positionStiffness, positionDamping, dt);
  const y = springValue(motion.y, motion.vy, target.y, positionStiffness, positionDamping, dt);
  const z = springValue(motion.z, motion.vz, target.z, positionStiffness, positionDamping, dt);
  const rotationX = springValue(motion.rotationX, motion.vrx, target.rotationX, rotationStiffness, rotationDamping, dt);
  const rotationY = springValue(motion.rotationY, motion.vry, target.rotationY, rotationStiffness, rotationDamping, dt);
  const rotationZ = springValue(motion.rotationZ, motion.vrz, target.rotationZ, rotationStiffness, rotationDamping, dt);
  const scale = springValue(motion.scale, motion.vs, target.scale, scaleStiffness, scaleDamping, dt);

  motion.x = x.value;
  motion.y = y.value;
  motion.z = z.value;
  motion.rotationX = rotationX.value;
  motion.rotationY = rotationY.value;
  motion.rotationZ = rotationZ.value;
  motion.scale = scale.value;
  motion.vx = x.velocity;
  motion.vy = y.velocity;
  motion.vz = z.velocity;
  motion.vrx = rotationX.velocity;
  motion.vry = rotationY.velocity;
  motion.vrz = rotationZ.velocity;
  motion.vs = scale.velocity;
}

function sectionDistance(a, b) {
  const direct = Math.abs(a - b);
  return Math.min(direct, SECTION_COUNT - direct);
}

function getReconfigurationAmount(point, elapsedMs) {
  if (elapsedMs < RECONFIGURE_DELAY) {
    return 0;
  }

  const shiftedElapsed = elapsedMs - RECONFIGURE_DELAY;
  const cycleTime = shiftedElapsed % RECONFIGURE_PERIOD;

  if (cycleTime > RECONFIGURE_DURATION) {
    return 0;
  }

  const activeSection = Math.floor(shiftedElapsed / RECONFIGURE_PERIOD) % SECTION_COUNT;
  const distance = sectionDistance(point.section, activeSection);
  const sectionFalloff = distance === 0 ? 1 : distance === 1 ? 0.34 : 0;
  const pulse = Math.sin((cycleTime / RECONFIGURE_DURATION) * Math.PI);

  return pulse * pulse * sectionFalloff;
}

function addIdleMotion(target, point, elapsedSeconds, amount) {
  const layer = point.layerParallax;
  const phase = point.idlePhase;
  const edgeFreedom = 1 - point.edgeLock * 0.55;
  const slow = elapsedSeconds * point.idleRate;
  const medium = elapsedSeconds * (0.46 + point.layerId * 0.07);

  // Constant low-amplitude breathing keeps the wordmark alive without hurting legibility.
  target.x += Math.sin(slow + phase) * amount * (0.28 + point.layerId * 0.12) * layer * edgeFreedom;
  target.y += Math.cos(slow * 0.84 + phase * 1.3) * amount * 0.18 * layer * edgeFreedom;
  target.z += Math.sin(medium + phase * 1.7) * amount * (2 + point.layerId * 1.6);
  target.rotationX += Math.sin(medium * 0.92 + phase) * 0.0045 * amount * edgeFreedom;
  target.rotationY += Math.cos(medium * 0.8 + phase) * 0.006 * amount * layer * edgeFreedom;
  target.rotationZ += Math.sin(slow * 0.5 + phase) * 0.0045 * amount * edgeFreedom;
  target.scale += Math.sin(slow * 0.7 + phase) * 0.005 * amount;
}

function addCursorResponse(target, point, interaction) {
  // Nearby letters push, tilt, and scale more; distant letters remain close to the mask.
  if (!interaction.hasPointer || interaction.activity <= 0.001) {
    return;
  }

  const dx = point.baseX - interaction.x;
  const dy = point.baseY - interaction.y;
  const distance = Math.hypot(dx, dy);
  const radius = POINTER_RADIUS * (0.88 + point.layerParallax * 0.16);
  const falloff = Math.pow(1 - smoothstep(0, radius, distance), 2) * interaction.activity;

  if (falloff <= 0.0001) {
    return;
  }

  const safeDistance = distance || 1;
  const nx = dx / safeDistance;
  const ny = dy / safeDistance;
  const layer = point.layerParallax;
  const edgeFreedom = 1 - point.edgeLock * 0.72;
  const push = POINTER_PUSH * falloff * layer * edgeFreedom;

  target.x += nx * push;
  target.y += ny * push * 0.78;
  target.z += POINTER_DEPTH * falloff * point.depthSign * layer;
  target.rotationX += -ny * falloff * 0.12 * edgeFreedom;
  target.rotationY += nx * falloff * 0.15 * edgeFreedom;
  target.rotationZ += ((nx - ny) * 0.05 + point.loosenSpin * 0.028) * falloff * edgeFreedom;
  target.scale += falloff * (0.045 + point.layerId * 0.02);
}

function addReconfiguration(target, point, elapsedMs) {
  const amount = getReconfigurationAmount(point, elapsedMs);

  if (amount <= 0.0001) {
    return;
  }

  // Sections loosen as typographic clusters, then the spring pulls them back into the mask.
  target.x += point.loosenX * amount * (1.8 + point.layerId * 0.9);
  target.y += point.loosenY * amount * (1.4 + point.layerId * 0.75);
  target.z += point.depthSign * amount * (5 + point.layerId * 3);
  target.rotationZ += point.loosenSpin * amount * 0.045;
  target.scale += (point.layerId === 2 ? 0.012 : -0.004) * amount;
}

function addRipples(target, point, interaction, elapsedMs) {
  // Pointer movement launches a restrained typographic wave through the depth field.
  interaction.ripples.forEach((ripple) => {
    const age = elapsedMs - ripple.start;

    if (age < 0 || age > RIPPLE_DURATION) {
      return;
    }

    const dx = point.baseX - ripple.x;
    const dy = point.baseY - ripple.y;
    const distance = Math.hypot(dx, dy);
    const wave = age * 0.001 * RIPPLE_SPEED;
    const ring = Math.exp(-Math.pow((distance - wave) / RIPPLE_WIDTH, 2));
    const decay = 1 - age / RIPPLE_DURATION;
    const amount = ring * decay * ripple.strength;

    if (amount <= 0.0001) {
      return;
    }

    const safeDistance = distance || 1;
    const nx = dx / safeDistance;
    const ny = dy / safeDistance;
    const edgeFreedom = 1 - point.edgeLock * 0.68;

    target.x += nx * amount * 2.8 * point.layerParallax * edgeFreedom;
    target.y += ny * amount * 2.1 * edgeFreedom;
    target.z += amount * (18 + point.layerId * 7) * point.depthSign;
    target.rotationX += -ny * amount * 0.05 * edgeFreedom;
    target.rotationY += nx * amount * 0.07 * edgeFreedom;
    target.rotationZ += point.loosenSpin * amount * 0.055 * edgeFreedom;
    target.scale += amount * 0.045;
  });
}

function constrainToShape(point, target) {
  const anchorX = point.baseX + point.clusterX;
  const anchorY = point.baseY + point.clusterY;
  const dx = target.x - anchorX;
  const dy = target.y - anchorY;
  const distance = Math.hypot(dx, dy);
  const maxDistance = EDGE_POSITION_DRIFT + (MAX_POSITION_DRIFT - EDGE_POSITION_DRIFT) * (1 - point.edgeLock);

  if (distance <= maxDistance || distance <= 0.001) {
    return target;
  }

  const limit = maxDistance / distance;

  return {
    ...target,
    x: anchorX + dx * limit,
    y: anchorY + dy * limit,
  };
}

function computePointTarget(point, elapsedMs, interaction, shouldAnimate, motionRamp) {
  const target = {
    x: point.baseX + point.clusterX,
    y: point.baseY + point.clusterY,
    z: point.baseZ,
    rotationX: point.finalRotationX,
    rotationY: point.finalRotationY,
    rotationZ: point.finalRotationZ,
    scale: point.scale,
  };

  if (!shouldAnimate) {
    return target;
  }

  const elapsedSeconds = elapsedMs / 1000;
  const idleAmount = motionRamp * (0.28 + interaction.activity * 0.42);

  addIdleMotion(target, point, elapsedSeconds, idleAmount);
  addCursorResponse(target, point, interaction);
  addReconfiguration(target, point, elapsedMs);
  addRipples(target, point, interaction, elapsedMs);

  return constrainToShape(point, target);
}

function groupByGlyph(points) {
  return points.reduce((groups, point) => {
    if (!groups.has(point.glyph)) {
      groups.set(point.glyph, []);
    }
    groups.get(point.glyph).push(point);
    return groups;
  }, new Map());
}

function createGlyphTexture(THREE, glyph) {
  const textureCanvas = document.createElement("canvas");
  const ctx = textureCanvas.getContext("2d");
  const size = 96;

  textureCanvas.width = size;
  textureCanvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = getTextFont(78);
  ctx.fillText(glyph, size / 2, size * 0.55);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createWordmarkGroup(THREE, layoutKey) {
  const { points, bounds } = createTextPoints(layoutKey);
  const root = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(GLYPH_PLANE_WIDTH, GLYPH_PLANE_HEIGHT);
  const vertexColors = new Float32Array(geometry.attributes.position.count * 3).fill(1);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const textures = [];
  const materials = [];
  const meshGroups = [];

  // White base vertex colors let instance colors control monochrome depth brightness.
  geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3));

  function setMeshColors(mesh, glyphPoints) {
    glyphPoints.forEach((point, index) => {
      const brightness = clamp(point.alpha * point.layerBrightness, 0.34, 1);
      color.setRGB(brightness, brightness, brightness);
      mesh.setColorAt(index, color);
    });

    mesh.instanceColor.needsUpdate = true;
  }

  function seedMeshMatrices(mesh, glyphPoints) {
    glyphPoints.forEach((point, index) => {
      point.motion = createMotionState(point);

      dummy.position.set(point.motion.x, point.motion.y, point.motion.z);
      dummy.rotation.set(point.motion.rotationX, point.motion.rotationY, point.motion.rotationZ);
      dummy.scale.set(point.motion.scale, point.motion.scale, point.motion.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }

  groupByGlyph(points).forEach((glyphPoints, glyph) => {
    const texture = createGlyphTexture(THREE, glyph);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      vertexColors: true,
      alphaTest: 0.05,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, glyphPoints.length);

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    seedMeshMatrices(mesh, glyphPoints);
    setMeshColors(mesh, glyphPoints);
    root.add(mesh);
    textures.push(texture);
    materials.push(material);
    meshGroups.push({ mesh, points: glyphPoints });
  });

  return {
    root,
    bounds,
    update(elapsedMs, dt, interaction, shouldAnimate, motionRamp) {
      meshGroups.forEach(({ mesh, points: glyphPoints }) => {
        glyphPoints.forEach((point, index) => {
          const target = computePointTarget(point, elapsedMs, interaction, shouldAnimate, motionRamp);

          if (shouldAnimate) {
            applySpring(point.motion, target, dt);
          } else {
            point.motion.x = target.x;
            point.motion.y = target.y;
            point.motion.z = target.z;
            point.motion.rotationX = target.rotationX;
            point.motion.rotationY = target.rotationY;
            point.motion.rotationZ = target.rotationZ;
            point.motion.scale = target.scale;
            point.motion.vx = 0;
            point.motion.vy = 0;
            point.motion.vz = 0;
            point.motion.vrx = 0;
            point.motion.vry = 0;
            point.motion.vrz = 0;
            point.motion.vs = 0;
          }

          dummy.position.set(point.motion.x, point.motion.y, point.motion.z);
          dummy.rotation.set(point.motion.rotationX, point.motion.rotationY, point.motion.rotationZ);
          dummy.scale.set(point.motion.scale, point.motion.scale, point.motion.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
      });
    },
    dispose() {
      meshGroups.forEach(({ mesh }) => root.remove(mesh));
      geometry.dispose();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

function getHeroMode(width, height) {
  return width / Math.max(1, height) < 0.78 ? "stacked" : "wide";
}

function fitGroup(camera, groupData, mode) {
  const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  const visibleWidth = visibleHeight * camera.aspect;
  const widthFit = (visibleWidth * 0.86) / groupData.bounds.width;
  const heightFit = (visibleHeight * (mode === "stacked" ? 0.68 : 0.58)) / groupData.bounds.height;
  const maxScale = mode === "stacked" ? 1.02 : 1.26;
  const scale = Math.min(widthFit, heightFit, maxScale);

  groupData.root.scale.setScalar(scale);
  groupData.root.position.set(0, mode === "stacked" ? 14 : 20, 0);
}

function startThreeHero(canvas, THREE) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wordmarks = {
    wide: createWordmarkGroup(THREE, "wide"),
    stacked: createWordmarkGroup(THREE, "stacked"),
  };
  const pointer = { x: 0, y: 0, activity: 0 };
  const target = { x: 0, y: 0, activity: 0, inside: false };
  const ripples = [];
  let activeMode = "wide";
  let frameId = null;
  let observer = null;
  let startTime = null;
  let lastFrameTime = null;
  let lastRippleAt = -Infinity;

  canvas.dataset.heroRenderer = "three";
  renderer.setClearColor(0x000000, 1);
  camera.position.set(0, 0, 760);

  scene.add(wordmarks.wide.root);
  scene.add(wordmarks.stacked.root);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    activeMode = getHeroMode(width, height);
    wordmarks.wide.root.visible = activeMode === "wide";
    wordmarks.stacked.root.visible = activeMode === "stacked";
    fitGroup(camera, wordmarks[activeMode], activeMode);
  }

  function addRipple(normalizedX, normalizedY, strength) {
    const elapsed = startTime === null ? 0 : performance.now() - startTime;

    ripples.push({
      x: normalizedX,
      y: normalizedY,
      start: elapsed,
      strength,
    });

    while (ripples.length > 4) {
      ripples.shift();
    }
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const nextY = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    const movement = Math.hypot(nextX - target.x, nextY - target.y);
    const now = performance.now();

    target.x = nextX;
    target.y = nextY;
    target.activity = 1;
    target.inside = true;

    if (movement > 0.035 && now - lastRippleAt > 420 && !reducedMotion.matches) {
      addRipple(nextX, nextY, clamp(movement * 4.2, 0.42, 1));
      lastRippleAt = now;
    }
  }

  function onPointerEnter(event) {
    onPointerMove(event);
    const now = performance.now();

    if (now - lastRippleAt > 80 && !reducedMotion.matches) {
      addRipple(target.x, target.y, 0.55);
      lastRippleAt = now;
    }
  }

  function onPointerLeave() {
    target.inside = false;
    target.activity = 0;
  }

  function localFromNormalized(group, normalizedX, normalizedY) {
    const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;

    return {
      x: (normalizedX * visibleWidth * 0.5 - group.position.x) / Math.max(0.0001, group.scale.x),
      y: (-normalizedY * visibleHeight * 0.5 - group.position.y) / Math.max(0.0001, group.scale.y),
    };
  }

  function getInteraction(group, elapsedMs) {
    const cursor = localFromNormalized(group, pointer.x, pointer.y);

    for (let index = ripples.length - 1; index >= 0; index -= 1) {
      if (elapsedMs - ripples[index].start > RIPPLE_DURATION) {
        ripples.splice(index, 1);
      }
    }

    return {
      x: cursor.x,
      y: cursor.y,
      hasPointer: target.inside || pointer.activity > 0.02,
      activity: pointer.activity,
      ripples: ripples.map((ripple) => ({
        ...localFromNormalized(group, ripple.x, ripple.y),
        start: ripple.start,
        strength: ripple.strength,
      })),
    };
  }

  function draw(now) {
    if (startTime === null) {
      startTime = now;
      lastFrameTime = now;
    }

    const active = wordmarks[activeMode].root;
    const elapsed = now - startTime;
    const dt = clamp((now - lastFrameTime) / 1000, 0.001, 0.05);
    lastFrameTime = now;
    const shouldAnimateFormation = !reducedMotion.matches;
    const motionInfluence = shouldAnimateFormation ? easeOutCubic(clamp(elapsed / IDLE_MOTION_RAMP, 0, 1)) : 1;

    target.activity *= Math.exp(-dt * (target.inside ? 2.8 : 3.6));
    if (target.inside) {
      target.activity = Math.max(target.activity, 0.28);
    }

    pointer.x += (target.x - pointer.x) * 0.08;
    pointer.y += (target.y - pointer.y) * 0.08;
    pointer.activity += (target.activity - pointer.activity) * 0.12;

    wordmarks[activeMode].update(
      elapsed,
      dt,
      getInteraction(active, elapsed),
      shouldAnimateFormation,
      motionInfluence
    );

    if (reducedMotion.matches) {
      active.rotation.set(0.03, -0.08, 0);
    } else {
      active.rotation.x = (-pointer.y * 0.048 + Math.sin(now * 0.00033) * 0.022) * motionInfluence;
      active.rotation.y = (pointer.x * 0.13 + Math.sin(now * 0.00042) * 0.04) * motionInfluence;
      active.rotation.z = Math.sin(now * 0.00025) * 0.01 * motionInfluence;
    }

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(draw);
  }

  resize();
  canvas.addEventListener("pointerenter", onPointerEnter);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  if ("ResizeObserver" in window) {
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  frameId = window.requestAnimationFrame(draw);

  return () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    canvas.removeEventListener("pointerenter", onPointerEnter);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    if (observer) {
      observer.disconnect();
    } else {
      window.removeEventListener("resize", resize);
    }
    wordmarks.wide.dispose();
    wordmarks.stacked.dispose();
    renderer.dispose();
  };
}

function rotatePoint(point, rotationX, rotationY) {
  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const x1 = point.x * cosY - point.z * sinY;
  const z1 = point.x * sinY + point.z * cosY;
  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);

  return {
    x: x1,
    y: point.y * cosX - z1 * sinX,
    z: point.y * sinX + z1 * cosX,
  };
}

function startCanvasFallback(canvas) {
  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 1;
  let height = 1;
  let dpr = 1;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let canvasDpr = 0;
  let mode = "";
  let pointData = createTextPoints("wide");
  let frameId = null;
  let startTime = null;

  if (!ctx) {
    return () => {};
  }

  canvas.dataset.heroRenderer = "canvas";

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (width !== canvasWidth || height !== canvasHeight || dpr !== canvasDpr) {
      canvasWidth = width;
      canvasHeight = height;
      canvasDpr = dpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const nextMode = getHeroMode(width, height);
    if (nextMode !== mode) {
      mode = nextMode;
      pointData = createTextPoints(mode);
    }
  }

  function draw(now) {
    if (startTime === null) {
      startTime = now;
    }

    resize();

    const elapsed = now - startTime;
    const shouldAnimateFormation = !reducedMotion.matches;
    const motionInfluence = shouldAnimateFormation ? easeOutCubic(clamp(elapsed / IDLE_MOTION_RAMP, 0, 1)) : 1;
    const rotationX = reducedMotion.matches ? 0.03 : Math.sin(now * 0.00033) * 0.025 * motionInfluence;
    const rotationY = reducedMotion.matches ? -0.08 : Math.sin(now * 0.00042) * 0.07 * motionInfluence;
    const widthFit = (width * 0.88) / pointData.bounds.width;
    const heightFit = (height * (mode === "stacked" ? 0.74 : 0.62)) / pointData.bounds.height;
    const maxScale = mode === "stacked" ? 1.04 : 1.22;
    const fit = Math.min(widthFit, heightFit, maxScale);
    const depth = 720;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";

    pointData.points.forEach((point) => {
      const state = getFormationState(point);
      const scaled = {
        x: state.x * UNIT * fit,
        y: state.y * UNIT * fit,
        z: state.z * UNIT * fit,
      };
      const rotated = rotatePoint(scaled, rotationX, rotationY);
      const perspective = depth / (depth - rotated.z);
      const minimumSize = shouldAnimateFormation && state.progress < 1 ? 1.5 : 6;
      const glyphSize = Math.max(minimumSize, 9.5 * state.scale * fit * perspective);

      ctx.globalAlpha = state.alpha;
      ctx.font = `900 ${glyphSize}px ${FONT_STACK}`;
      ctx.save();
      ctx.translate(width / 2 + rotated.x * perspective, height / 2 - rotated.y * perspective);
      ctx.rotate(state.rotationZ);
      ctx.fillText(point.glyph, 0, 0);
      ctx.restore();
    });

    ctx.globalAlpha = 1;
    frameId = window.requestAnimationFrame(draw);
  }

  frameId = window.requestAnimationFrame(draw);

  return () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
  };
}

export function initAsciiHero(canvas) {
  if (!canvas) {
    return () => {};
  }

  let disposed = false;
  let cleanup = () => {};

  import(THREE_MODULE_URL)
    .then((THREE) => {
      if (disposed) {
        return;
      }
      cleanup = startThreeHero(canvas, THREE);
    })
    .catch(() => {
      if (disposed) {
        return;
      }
      cleanup = startCanvasFallback(canvas);
    });

  return () => {
    disposed = true;
    cleanup();
  };
}
