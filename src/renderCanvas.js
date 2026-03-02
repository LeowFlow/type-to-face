function rounded(value) {
  return Math.round(value);
}

export class RenderCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.logicalWidth = 0;
    this.logicalHeight = 0;
  }

  resize(layout, quality) {
    const dpr = quality.mode === "performance" ? 1 : window.devicePixelRatio || 1;
    const logicalWidth = rounded(layout.columns * layout.cellWidth);
    const logicalHeight = rounded(layout.rows * layout.cellHeight);

    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;

    this.canvas.width = Math.max(1, rounded(logicalWidth * dpr));
    this.canvas.height = Math.max(1, rounded(logicalHeight * dpr));
    this.canvas.style.width = `${logicalWidth}px`;
    this.canvas.style.height = `${logicalHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  draw(frame, layout, style, mapper, crispCoordinates) {
    const { data, width, height } = frame;
    const ctx = this.ctx;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const mapped = mapper(data[i], data[i + 1], data[i + 2]);

        if (mapped.glyph === " ") {
          continue;
        }

        const baseX = x * layout.cellWidth + x * style.letterSpacing;
        const baseY = y * layout.cellHeight;
        const drawX = crispCoordinates ? rounded(baseX) : baseX;
        const drawY = crispCoordinates ? rounded(baseY) : baseY;

        ctx.fillStyle = `rgb(${mapped.r}, ${mapped.g}, ${mapped.b})`;
        ctx.fillText(mapped.glyph, drawX, drawY);
      }
    }
  }
}
