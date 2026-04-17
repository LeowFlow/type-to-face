function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyUnsharpMask(imageData, amount) {
  if (amount <= 0) {
    return imageData;
  }

  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const strength = amount / 100;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const center = src[i + c];
        const left = src[i - 4 + c];
        const right = src[i + 4 + c];
        const up = src[i - width * 4 + c];
        const down = src[i + width * 4 + c];
        const blur = (left + right + up + down + center) / 5;
        const sharpened = center + (center - blur) * (1.4 * strength);
        out[i + c] = clamp(Math.round(sharpened), 0, 255);
      }
    }
  }

  return new ImageData(out, width, height);
}

export function createSamplingContext() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return { canvas, context };
}

export function configureSamplingBuffer(sampling, width, height, smoothing) {
  sampling.canvas.width = Math.max(1, width);
  sampling.canvas.height = Math.max(1, height);
  sampling.context.imageSmoothingEnabled = Boolean(smoothing);
}

export function sampleSource(source, sampling, options = {}) {
  const { context, canvas } = sampling;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (options.view) {
    const { x, y, width, height } = options.view;
    context.drawImage(source, x, y, width, height);
  } else if (options.mirror) {
    context.scale(-1, 1);
    context.drawImage(source, -canvas.width, 0, canvas.width, canvas.height);
  } else {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  context.restore();

  let frame = context.getImageData(0, 0, canvas.width, canvas.height);
  frame = applyUnsharpMask(frame, options.detailBoost);

  if (frame) {
    context.putImageData(frame, 0, 0);
  }

  return frame;
}

export function sampleFrame(video, sampling, options) {
  return sampleSource(video, sampling, options);
}
