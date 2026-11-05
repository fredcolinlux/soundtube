// Fond animé « aurore + oscilloscope » : rideaux d'aurore boréale (rendus en basse résolution
// puis agrandis = flou gratuit) et trace d'oscilloscope qui suit le signal audio réel.
const BANDS = [
  { col: [94, 242, 201], y: 0.10, amp: 0.07, len: 0.34, sp: 0.55, k: 1.3, ph: 0 },   // menthe
  { col: [155, 140, 255], y: 0.20, amp: 0.09, len: 0.30, sp: 0.40, k: 2.1, ph: 2.1 }, // iris
  { col: [108, 198, 255], y: 0.05, amp: 0.05, len: 0.24, sp: 0.75, k: 3.0, ph: 4.2 }, // ciel
];

function strip([r, g, b]) {
  const c = document.createElement('canvas'); c.width = 1; c.height = 128;
  const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, `rgba(${r},${g},${b},0)`);
  gr.addColorStop(0.18, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.5, `rgba(${(r + 155) >> 1},${(g + 140) >> 1},${(b + 255) >> 1},.45)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 1, 128); return c;
}

export class AuroraField {
  constructor(canvas, opts = {}) {
    // v1.10.0 : teintes facultatives (pages de style) ; sans option = aurore d'origine du studio
    this.B = Array.isArray(opts.colors) ? BANDS.map((b, i) => ({ ...b, col: opts.colors[i] || b.col })) : BANDS;
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d');
    this.strips = this.B.map((b) => strip(b.col));
    this.energy = 0; this.bass = 0; this.bands = [0, 0, 0]; this.wave = null; this.t = 0; this.px = 0; this.tpx = 0;
    this.slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => { this.tpx = e.clientX / this.W - 0.5; }, { passive: true });
  }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2); this.W = innerWidth; this.H = innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.off.width = Math.ceil(this.W / 5); this.off.height = Math.ceil(this.H / 5);
  }
  setAudio(energy, bass) { this.energy += (energy - this.energy) * 0.2; this.bass += (bass - this.bass) * 0.3; }
  setBands(lo, mid, hi) { const b = this.bands; b[0] += (lo - b[0]) * 0.25; b[1] += (mid - b[1]) * 0.25; b[2] += (hi - b[2]) * 0.25; }
  setWave(arr) { this.wave = arr; }
  frame(dt) {
    const { ctx, W, H, octx: o, off } = this;
    this.t += dt * this.slow * (0.35 + this.energy * 1.3);
    this.px += (this.tpx - this.px) * 0.03;
    const t = this.t, w = off.width, h = off.height;

    // --- aurore (basse résolution)
    o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, w, h);
    o.globalCompositeOperation = 'lighter';
    this.B.forEach((B, bi) => {
      const lift = this.bands[bi];
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const top = (B.y + B.amp * (0.6 * Math.sin(u * B.k * 6.283 + t * B.sp + B.ph) + 0.4 * Math.sin(u * B.k * 15 - t * B.sp * 1.4 + B.ph))
          + this.px * 0.04 * (bi - 1)) * h;
        const len = B.len * h * (0.65 + 0.25 * Math.sin(u * 11 + t * 0.9 + B.ph) + 0.9 * lift);
        const stri = 0.5 + 0.5 * Math.sin(u * 46 + t * 1.6 + 2 * Math.sin(u * 7 - t * 0.7 + B.ph));
        const edge = Math.pow(Math.sin(Math.PI * u), 0.6);
        o.globalAlpha = Math.min(1, (0.08 + 0.2 * stri) * edge * (1 + this.energy * 1.6));
        o.drawImage(this.strips[bi], x, top, 1.5, len);
      }
    });
    o.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.6; ctx.drawImage(off, 0, 0, W, H); ctx.globalAlpha = 1;

    // --- oscilloscope
    const y0 = H * 0.72, N = Math.min(240, Math.floor(W / 6)), amp = H * 0.075 * (1 + this.bass * 1.2);
    const pts = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const u = i / N, env = Math.pow(Math.sin(Math.PI * u), 1.2);
      let v;
      if (this.wave) v = (this.wave[Math.floor(u * (this.wave.length - 1))] - 128) / 128 * 1.6;
      else v = 0.18 * Math.sin(u * 14 + t * 2.2) + 0.08 * Math.sin(u * 37 - t * 3.1) + 0.05 * Math.sin(u * 5 + t);
      pts[i] = y0 + v * amp * env;
    }
    ctx.lineJoin = 'round';
    for (const [col, lw, a, dy] of [['155,140,255', 6 + this.bass * 8, 0.10, 3], ['94,242,201', 1.4 + this.bass * 1.6, 0.4 + this.energy * 0.5, 0]]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const x = (i / N) * W, y = pts[i] + dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = `rgba(${col},${Math.min(1, a).toFixed(3)})`; ctx.lineWidth = lw; ctx.stroke();
    }
    // ligne d'horizon graduée
    ctx.fillStyle = 'rgba(160,175,255,.10)';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, y0 + amp * 1.9, 1, x % 120 === 0 ? 7 : 3);
  }
  start() {
    let last = performance.now();
    const loop = (now) => { const dt = Math.min((now - last) / 1000, 0.05); last = now; if (this.onTick) this.onTick(); this.frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
