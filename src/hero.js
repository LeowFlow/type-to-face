const HERO_TEXT = "Type-To-Face";
const THREE_MODULE_URL = "https://unpkg.com/three@0.160.0/build/three.module.js";
const FONT_STACK = '"IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const GLYPHS = ["T", "Y", "P", "E", "-", "O", "F", "A", "C", "@", "#", "%", "&", "M", "W", "N", "X", "K", "0", "1", "+", "=", "/", "\\", "|", ":", "."];
const UNIT = 0.78;
const IDLE_MOTION_RAMP = 2400;

const TEXT_LAYOUTS = {
  wide: {
    width: 920,
    height: 500,
    lines: ["Type-To", "Face"],
    fontSize: 190,
    step: 6,
  },
  stacked: {
    width: 560,
    height: 560,
    lines: ["Type", "To", "Face"],
    fontSize: 168,
    step: 6,
  },
};

function hash2(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function chooseGlyph(x, y, seed) {
  const source = HERO_TEXT.toUpperCase();
  const nameIndex = Math.floor(hash2(y, x) * source.length);
  const nameGlyph = source[nameIndex] || "T";

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
      const depth = (seed - 0.5) * 64 + Math.sin(x * 0.024) * 8 + Math.cos(y * 0.038) * 6;
      const letter = getLetterForPoint(letterMap, x, y);

      points.push({
        x: x - layout.width / 2,
        y: layout.height / 2 - y,
        z: depth,
        letterIndex: letter.index,
        letterCenterX: letter.centerX,
        letterCenterY: letter.centerY,
        totalLetters: letterMap.totalLetters,
        glyph: chooseGlyph(x, y, seed),
        scale: 0.82 + hash2(y, x) * 0.36,
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

function addFormationData(points) {
  return points.map((point) => ({
    ...point,
    finalRotationZ: (hash2(point.x, point.y) - 0.5) * 0.06,
  }));
}

function getFormationState(point) {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
    rotationZ: point.finalRotationZ,
    scale: point.scale,
    alpha: point.alpha,
    progress: 1,
  };
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
  const geometry = new THREE.PlaneGeometry(12.6, 16.2);
  const dummy = new THREE.Object3D();
  const textures = [];
  const materials = [];
  const meshGroups = [];
  const formationEnd = 0;
  let formationSettled = false;

  function setMeshMatrices(mesh, glyphPoints) {
    glyphPoints.forEach((point, index) => {
      const state = getFormationState(point);
      const scale = state.scale;

      dummy.position.set(state.x * UNIT, state.y * UNIT, state.z * UNIT);
      dummy.rotation.set(0, 0, state.rotationZ);
      dummy.scale.set(scale, scale, scale);
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
      alphaTest: 0.05,
      transparent: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, glyphPoints.length);

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    setMeshMatrices(mesh, glyphPoints);
    root.add(mesh);
    textures.push(texture);
    materials.push(material);
    meshGroups.push({ mesh, points: glyphPoints });
  });

  return {
    root,
    bounds,
    updateFormation(elapsedMs, shouldAnimate) {
      const elapsedSeconds = shouldAnimate ? elapsedMs / 1000 : formationEnd;

      if (formationSettled && elapsedSeconds >= formationEnd) {
        return;
      }

      meshGroups.forEach(({ mesh, points: glyphPoints }) => {
        setMeshMatrices(mesh, glyphPoints);
      });
      formationSettled = elapsedSeconds >= formationEnd;
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
  const widthFit = (visibleWidth * 0.9) / groupData.bounds.width;
  const heightFit = (visibleHeight * (mode === "stacked" ? 0.7 : 0.62)) / groupData.bounds.height;
  const maxScale = mode === "stacked" ? 1.08 : 1.35;
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
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let activeMode = "wide";
  let frameId = null;
  let observer = null;
  let startTime = null;

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

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    target.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    target.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  }

  function draw(now) {
    if (startTime === null) {
      startTime = now;
    }

    const active = wordmarks[activeMode].root;
    const elapsed = now - startTime;
    const shouldAnimateFormation = !reducedMotion.matches;
    const motionInfluence = shouldAnimateFormation ? easeOutCubic(clamp(elapsed / IDLE_MOTION_RAMP, 0, 1)) : 1;

    wordmarks.wide.updateFormation(elapsed, shouldAnimateFormation);
    wordmarks.stacked.updateFormation(elapsed, shouldAnimateFormation);

    pointer.x += (target.x - pointer.x) * 0.045;
    pointer.y += (target.y - pointer.y) * 0.045;

    if (reducedMotion.matches) {
      active.rotation.set(0.03, -0.08, 0);
    } else {
      active.rotation.x = (-pointer.y * 0.055 + Math.sin(now * 0.00033) * 0.025) * motionInfluence;
      active.rotation.y = (pointer.x * 0.16 + Math.sin(now * 0.00042) * 0.045) * motionInfluence;
      active.rotation.z = Math.sin(now * 0.00025) * 0.012 * motionInfluence;
    }

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(draw);
  }

  resize();
  canvas.addEventListener("pointermove", onPointerMove);

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
    canvas.removeEventListener("pointermove", onPointerMove);
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
