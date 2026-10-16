// Filters are defined as CSS filter functions. The live camera preview uses the
// CSS string directly; the captured photo uses the equivalent colour matrix
// (formulas from the CSS Filter Effects spec), so what you see is what you get —
// including on iOS Safari, which lacks CanvasRenderingContext2D.filter.
const Filters = (() => {
  const list = [
    { id: 'asal',    name: 'Asal',        ops: [] },
    { id: 'ceria',   name: 'Ceria',       ops: [['brightness', 1.05], ['contrast', 1.08], ['saturate', 1.3]] },
    { id: 'hangat',  name: 'Hangat',      ops: [['sepia', 0.2], ['saturate', 1.25], ['brightness', 1.04]] },
    { id: 'lembut',  name: 'Lembut',      ops: [['contrast', 0.88], ['brightness', 1.1], ['saturate', 0.9]] },
    { id: 'vintaj',  name: 'Vintaj',      ops: [['sepia', 0.4], ['contrast', 0.92], ['brightness', 1.06], ['saturate', 1.15]] },
    { id: 'hitam',   name: 'Hitam Putih', ops: [['grayscale', 1], ['contrast', 1.12]] },
    { id: 'sepia',   name: 'Sepia',       ops: [['sepia', 0.85], ['contrast', 1.05]] },
  ];

  // 3x4 matrices: [r, g, b, offset(0-255)] per output channel
  function matrixFor(fn, v) {
    switch (fn) {
      case 'grayscale': {
        const a = 1 - v;
        return [
          [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0],
          [0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0],
          [0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a, 0],
        ];
      }
      case 'sepia': {
        const a = 1 - v;
        return [
          [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0],
          [0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0],
          [0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0],
        ];
      }
      case 'saturate':
        return [
          [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0],
          [0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0],
          [0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0],
        ];
      case 'hue-rotate': {
        const r = (v * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
        return [
          [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0],
          [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0],
          [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0],
        ];
      }
      case 'brightness':
        return [[v, 0, 0, 0], [0, v, 0, 0], [0, 0, v, 0]];
      case 'contrast': {
        const o = (0.5 - 0.5 * v) * 255;
        return [[v, 0, 0, o], [0, v, 0, o], [0, 0, v, o]];
      }
    }
    throw new Error('Unknown filter ' + fn);
  }

  // Apply `next` after `cur`
  function multiply(next, cur) {
    return next.map((row) => [0, 1, 2, 3].map((j) =>
      row[0] * cur[0][j] + row[1] * cur[1][j] + row[2] * cur[2][j] + (j === 3 ? row[3] : 0)));
  }

  function matrix(filter) {
    return filter.ops.reduce((m, [fn, v]) => multiply(matrixFor(fn, v), m),
      [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
  }

  function css(filter) {
    if (!filter.ops.length) return 'none';
    return filter.ops.map(([fn, v]) => (fn === 'hue-rotate' ? `${fn}(${v}deg)` : `${fn}(${v})`)).join(' ');
  }

  function applyToCanvas(canvas, filter) {
    if (!filter || !filter.ops.length) return;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const [[a, b, c, o1], [e, f, g, o2], [h, i, j, o3]] = matrix(filter);
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p], gr = d[p + 1], bl = d[p + 2];
      d[p] = a * r + b * gr + c * bl + o1;
      d[p + 1] = e * r + f * gr + g * bl + o2;
      d[p + 2] = h * r + i * gr + j * bl + o3;
    }
    ctx.putImageData(img, 0, 0);
  }

  return { list, css, applyToCanvas };
})();
