// Frames are drawn on a 1080 x 1440 (3:4) canvas.
// Each frame has an `area` where the photo(s) go, a `bg` drawn underneath
// and an `overlay` drawn on top (borders, names, flowers...).
const Frames = (() => {
  const W = 1080, H = 1440;
  const SCRIPT = '"Great Vibes", cursive';
  const SERIF = '"Cormorant Garamond", Georgia, serif';
  const SANS = '"Poppins", system-ui, sans-serif';
  let T = { couple: '', dateText: '', eyebrow: '', hashtag: '' };

  // ---------- drawing helpers ----------
  function setFont(ctx, o, size) {
    ctx.font = `${o.style || 'normal'} ${o.weight || 400} ${size}px ${o.family}`;
  }

  function spacedWidth(ctx, chars, sp) {
    return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + sp * (chars.length - 1);
  }

  // Centered text that shrinks to fit, with optional letter spacing
  function text(ctx, str, x, y, o) {
    if (!str) return;
    const maxW = o.maxW || W - 180;
    const chars = [...str];
    let size = o.size, sp = o.spacing || 0;
    for (;;) {
      setFont(ctx, o, size);
      sp = (o.spacing || 0) * (size / o.size);
      const w = sp ? spacedWidth(ctx, chars, sp) : ctx.measureText(str).width;
      if (w <= maxW || size <= 14) break;
      size -= 2;
    }
    ctx.save();
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'alphabetic';
    if (!sp) {
      ctx.textAlign = 'center';
      ctx.fillText(str, x, y);
    } else {
      ctx.textAlign = 'left';
      let cx = x - spacedWidth(ctx, chars, sp) / 2;
      for (const ch of chars) {
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + sp;
      }
    }
    ctx.restore();
  }

  function fill(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
  }

  function diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  function dot(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function divider(ctx, cx, y, half, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - half, y); ctx.lineTo(cx - 20, y);
    ctx.moveTo(cx + 20, y); ctx.lineTo(cx + half, y);
    ctx.stroke();
    diamond(ctx, cx, y, 8);
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function flower(ctx, x, y, r, petal, center, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = petal;
    for (let k = 0; k < 5; k++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 0.36, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = center;
    dot(ctx, 0, 0, r * 0.2);
    ctx.restore();
  }

  function leaf(ctx, len, angle, color) {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(len / 2, 0, len / 2, len * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Floral cluster at a corner; local +x / +y run along the photo edges
  function floralCorner(ctx, x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    leaf(ctx, 180, 0.1, '#9db59a');
    leaf(ctx, 180, Math.PI / 2 - 0.1, '#9db59a');
    leaf(ctx, 140, 0.55, '#b9cdb4');
    leaf(ctx, 140, Math.PI / 2 - 0.55, '#b9cdb4');
    flower(ctx, 105, 2, 52, '#f8d0d8', '#e7b75f', 0.4);
    flower(ctx, 2, 105, 52, '#f8d0d8', '#e7b75f', 1.1);
    flower(ctx, 18, 18, 80, '#f2a7b8', '#e7b75f', 0.2);
    flower(ctx, 80, 80, 36, '#ffffff', '#f2c46d', 0.7);
    ctx.fillStyle = '#ffffff';
    [[170, -12], [192, 16], [-12, 170], [16, 192], [140, 50], [50, 140]].forEach(([a, b]) => dot(ctx, a, b, 7));
    ctx.restore();
  }

  function songketBorder(ctx, gold) {
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.strokeRect(58, 58, W - 116, H - 116);
    const mid = 39, step = 38;
    const row = (len, place) => {
      const n = Math.floor((len - 40) / step);
      const start = (len - (n - 1) * step) / 2;
      for (let i = 0; i < n; i++) place(start + i * step, i, n);
    };
    const mark = (x, y, i) => (i % 2 ? dot(ctx, x, y, 4) : diamond(ctx, x, y, 11));
    row(W, (x, i) => { mark(x, mid, i); mark(x, H - mid, i); });
    row(H, (y, i, n) => {
      if (i === 0 || i === n - 1) return;
      mark(mid, y, i); mark(W - mid, y, i);
    });
    ctx.restore();
  }

  // ---------- built-in frames ----------
  const BUILTIN = [
    {
      id: 'klasik', name: 'Emas Klasik',
      area: { x: 70, y: 70, w: 940, h: 1060 }, gap: 14,
      bg: (ctx) => fill(ctx, '#f8f3e9'),
      overlay(ctx) {
        const gold = '#b38b4d';
        ctx.save();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 24, W - 48, H - 48);
        ctx.lineWidth = 1;
        ctx.strokeRect(34, 34, W - 68, H - 68);
        ctx.fillStyle = gold;
        [[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]].forEach(([x, y]) => diamond(ctx, x, y, 9));
        ctx.restore();
        text(ctx, T.eyebrow.toUpperCase(), W / 2, 1190, { size: 28, family: SERIF, weight: 600, color: gold, spacing: 8 });
        text(ctx, T.couple, W / 2, 1292, { size: 100, family: SCRIPT, color: gold });
        divider(ctx, W / 2, 1334, 140, gold);
        text(ctx, T.dateText, W / 2, 1388, { size: 34, family: SERIF, weight: 500, color: '#6b5a45' });
      },
    },
    {
      id: 'bunga', name: 'Bunga',
      area: { x: 60, y: 60, w: 960, h: 1080 }, gap: 14, radius: 18,
      bg: (ctx) => fill(ctx, '#fff6f5'),
      overlay(ctx) {
        floralCorner(ctx, 60, 60, 0);
        floralCorner(ctx, W - 60, 1140, Math.PI);
        text(ctx, T.couple, W / 2, 1268, { size: 96, family: SCRIPT, color: '#c25b78' });
        text(ctx, T.dateText, W / 2, 1332, { size: 34, family: SERIF, weight: 500, color: '#7a5560' });
        text(ctx, T.hashtag, W / 2, 1385, { size: 24, family: SANS, color: '#b48a95' });
      },
    },
    {
      id: 'songket', name: 'Songket',
      area: { x: 80, y: 80, w: 920, h: 1040 }, gap: 12,
      bg: (ctx) => fill(ctx, '#5a1428'),
      overlay(ctx, area) {
        const gold = '#e2c47e';
        songketBorder(ctx, gold);
        ctx.save();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 3;
        ctx.strokeRect(area.x - 10, area.y - 10, area.w + 20, area.h + 20);
        ctx.restore();
        text(ctx, T.eyebrow.toUpperCase(), W / 2, 1186, { size: 28, family: SERIF, weight: 600, color: gold, spacing: 8 });
        text(ctx, T.couple, W / 2, 1280, { size: 96, family: SCRIPT, color: gold });
        text(ctx, T.dateText, W / 2, 1340, { size: 32, family: SERIF, weight: 500, color: '#f6ead0' });
      },
    },
    {
      id: 'polaroid', name: 'Polaroid',
      area: { x: 50, y: 50, w: 980, h: 1110 }, gap: 12,
      bg: (ctx) => fill(ctx, '#ffffff'),
      overlay(ctx) {
        text(ctx, T.couple, W / 2, 1292, { size: 100, family: SCRIPT, color: '#2b2b2b' });
        const line = [T.dateText, T.hashtag].filter(Boolean).join('   ·   ');
        text(ctx, line, W / 2, 1366, { size: 26, family: SANS, color: '#8a8a8a' });
      },
    },
    {
      id: 'moden', name: 'Moden',
      area: { x: 40, y: 40, w: 1000, h: 1190 }, gap: 10,
      bg: (ctx) => fill(ctx, '#141414'),
      overlay(ctx) {
        text(ctx, T.couple.toUpperCase(), W / 2, 1316, { size: 52, family: SERIF, weight: 500, color: '#ffffff', spacing: 10 });
        text(ctx, T.dateText.toUpperCase(), W / 2, 1374, { size: 22, family: SANS, color: '#9a9a9a', spacing: 6 });
      },
    },
    {
      id: 'tiada', name: 'Tanpa Bingkai',
      area: { x: 0, y: 0, w: W, h: H }, gap: 8,
      bg: (ctx) => fill(ctx, '#ffffff'),
      overlay(ctx) {
        const g = ctx.createLinearGradient(0, 1060, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 1060, W, H - 1060);
        text(ctx, T.couple, W / 2, 1348, { size: 80, family: SCRIPT, color: '#ffffff' });
        text(ctx, T.dateText, W / 2, 1398, { size: 30, family: SERIF, weight: 500, color: 'rgba(255,255,255,0.9)' });
      },
    },
  ];

  async function loadCustom(cf, i) {
    const img = new Image();
    img.src = cf.src;
    await img.decode();
    return {
      id: 'custom' + i,
      name: cf.name || 'Bingkai ' + (i + 1),
      area: cf.area || { x: 0, y: 0, w: W, h: H },
      gap: cf.gap ?? 12,
      bg: (ctx) => fill(ctx, cf.background || '#ffffff'),
      overlay: (ctx) => ctx.drawImage(img, 0, 0, W, H),
    };
  }

  async function init(cfg) {
    T = {
      couple: cfg.couple || '',
      dateText: cfg.dateText || '',
      eyebrow: cfg.eyebrow || 'Walimatul Urus',
      hashtag: cfg.hashtag || '',
    };
    const results = await Promise.allSettled((cfg.customFrames || []).map(loadCustom));
    results.forEach((r) => r.status === 'rejected' && console.warn('Custom frame failed to load', r.reason));
    const custom = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    return [...custom, ...BUILTIN];
  }

  // ---------- layout + composition ----------
  function cellsFor(frame, layout) {
    const a = frame.area, g = frame.gap ?? 14;
    if (layout === 1) return [{ ...a }];
    if (layout === 2) {
      const h = (a.h - g) / 2;
      return [{ x: a.x, y: a.y, w: a.w, h }, { x: a.x, y: a.y + h + g, w: a.w, h }];
    }
    const w = (a.w - g) / 2, h = (a.h - g) / 2;
    return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => ({ x: a.x + c * (w + g), y: a.y + r * (h + g), w, h }));
  }

  // Draw `src` to fill the rect, cropping the overflow (like object-fit: cover)
  function drawCover(ctx, src, x, y, w, h) {
    const sw = src.width, sh = src.height;
    const s = Math.max(w / sw, h / sh);
    const cw = w / s, ch = h / s;
    ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
  }

  function compose({ frame, layout, filter, shots, scale = 1 }) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    frame.bg(ctx);
    cellsFor(frame, layout).forEach((cell, i) => {
      const src = shots[i];
      if (!src) return;
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(cell.w * scale));
      tmp.height = Math.max(1, Math.round(cell.h * scale));
      drawCover(tmp.getContext('2d'), src, 0, 0, tmp.width, tmp.height);
      Filters.applyToCanvas(tmp, filter);
      ctx.save();
      if (frame.radius) {
        roundRectPath(ctx, cell.x, cell.y, cell.w, cell.h, frame.radius);
        ctx.clip();
      }
      ctx.drawImage(tmp, cell.x, cell.y, cell.w, cell.h);
      ctx.restore();
    });
    frame.overlay(ctx, frame.area);
    return canvas;
  }

  // Little "guest" silhouettes used for the frame thumbnails
  function placeholders() {
    const tones = [['#f6d7c3', '#d9a0a8'], ['#e9dcc4', '#b9a27a'], ['#d8e2dc', '#9fb5a8'], ['#f1e3e4', '#c9a2b4']];
    return tones.map(([a, b]) => {
      const c = document.createElement('canvas');
      c.width = 90; c.height = 120;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 90, 120);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      x.fillStyle = g;
      x.fillRect(0, 0, 90, 120);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      dot(x, 45, 52, 16);
      x.beginPath();
      x.ellipse(45, 112, 30, 36, 0, 0, Math.PI * 2);
      x.fill();
      return c;
    });
  }

  return { W, H, init, cellsFor, compose, placeholders };
})();
