"use client";

import { useEffect, useRef } from "react";
import "./pk-lab.css";

// ---------- shared stats helpers ----------
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}
function normalCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function twoTailedP(z: number) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}
function fmt(n: number, d = 2) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}
function comb(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function initPkLab(root: HTMLElement) {
  const cssVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;

  // ================= MICRO-PK (REG) =================
  const microCanvas = $<HTMLCanvasElement>("micro-canvas");
  const micro = {
    running: false,
    target: "high" as "high" | "low" | "baseline",
    rate: 20,
    n: 0,
    ones: 0,
    history: [] as { n: number; ones: number }[],
    stride: 1,
    strideCounter: 0,
    acc: 0,
    lastTime: 0,
    rafId: 0,
  };

  function microDirectional(n: number, ones: number) {
    const observed = micro.target === "low" ? n - ones : ones;
    const expected = n * 0.5;
    return { observed, expected, dev: observed - expected };
  }

  function updateMicroReadouts() {
    const { observed, expected, dev } = microDirectional(micro.n, micro.ones);
    const sd = Math.sqrt(micro.n * 0.25);
    const z = sd > 0 ? dev / sd : 0;
    const p = micro.n > 0 ? twoTailedP(z) : 1;

    $("micro-n").textContent = String(micro.n);
    $("micro-hits").textContent = String(observed);
    $("micro-exp").textContent = fmt(expected, 1);
    const devEl = $("micro-dev");
    devEl.textContent = (dev >= 0 ? "+" : "") + fmt(dev, 1);
    devEl.className = "value" + (dev > 0 ? " hit" : dev < 0 ? " miss" : "");
    $("micro-z").textContent = fmt(z, 2);
    $("micro-p").textContent = micro.n > 0 ? fmt(p, 3) : "1.000";

    const badge = $("micro-badge");
    if (micro.n < 20) {
      badge.textContent = "collecting baseline…";
      badge.className = "badge";
    } else if (micro.target === "baseline") {
      badge.textContent = "non-directional · |z| " + fmt(Math.abs(z), 2);
      badge.className = "badge";
    } else if (Math.abs(z) >= 1.96 && dev > 0) {
      badge.textContent = "p < .05 · in target direction";
      badge.className = "badge sig-for";
    } else if (Math.abs(z) >= 1.96 && dev < 0) {
      badge.textContent = "p < .05 · against target direction";
      badge.className = "badge sig-against";
    } else {
      badge.textContent = "within chance range";
      badge.className = "badge";
    }
  }

  function drawMicroChart() {
    if (microCanvas.clientWidth === 0) return;
    const { ctx, w, h } = setupCanvas(microCanvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 8, r: 8, t: 10, b: 10 };
    const plotW = w - pad.l - pad.r,
      plotH = h - pad.t - pad.b;
    const midY = pad.t + plotH / 2;

    if (micro.n === 0) {
      ctx.strokeStyle = cssVar("--grid");
      ctx.beginPath();
      ctx.moveTo(pad.l, midY);
      ctx.lineTo(w - pad.r, midY);
      ctx.stroke();
      return;
    }

    const nMax = micro.n;
    let devMax = 20;
    for (const pt of micro.history) {
      const d = Math.abs(microDirectional(pt.n, pt.ones).dev);
      if (d > devMax) devMax = d;
    }
    const boundAtEnd = 1.96 * Math.sqrt(nMax * 0.25);
    devMax = Math.max(devMax, boundAtEnd) * 1.2;

    const xOf = (n: number) => pad.l + (n / nMax) * plotW;
    const yOf = (dev: number) => midY - (dev / devMax) * (plotH / 2);

    ctx.strokeStyle = cssVar("--muted");
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (const mult of [1.96, -1.96]) {
      ctx.beginPath();
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const n = (nMax / steps) * i;
        const d = mult * Math.sqrt(n * 0.25);
        const x = xOf(n),
          y = yOf(d);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = cssVar("--grid");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, midY);
    ctx.lineTo(w - pad.r, midY);
    ctx.stroke();

    ctx.strokeStyle = cssVar("--accent");
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    micro.history.forEach((pt, i) => {
      const dev = microDirectional(pt.n, pt.ones).dev;
      const x = xOf(pt.n),
        y = yOf(dev);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = micro.history[micro.history.length - 1];
    if (last) {
      const dev = microDirectional(last.n, last.ones).dev;
      ctx.fillStyle = cssVar("--accent");
      ctx.beginPath();
      ctx.arc(xOf(last.n), yOf(dev), 2.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function microTick(now: number) {
    if (!micro.running) return;
    const dt = now - micro.lastTime;
    micro.lastTime = now;
    micro.acc += (dt * micro.rate) / 1000;
    let toRun = Math.floor(micro.acc);
    if (toRun > 0) {
      micro.acc -= toRun;
      toRun = Math.min(toRun, 5000);
      const bytes = new Uint8Array(toRun);
      crypto.getRandomValues(bytes);
      for (let i = 0; i < toRun; i++) {
        const bit = bytes[i] & 1;
        micro.n++;
        if (bit) micro.ones++;
        micro.strideCounter++;
        if (micro.strideCounter >= micro.stride) {
          micro.history.push({ n: micro.n, ones: micro.ones });
          micro.strideCounter = 0;
        }
      }
      if (micro.history.length > 4000) {
        micro.history = micro.history.filter((_, idx) => idx % 2 === 0);
        micro.stride *= 2;
      }
    }
    updateMicroReadouts();
    drawMicroChart();
    micro.rafId = requestAnimationFrame(microTick);
  }

  function microStart() {
    if (micro.running) return;
    micro.running = true;
    micro.lastTime = performance.now();
    micro.acc = 0;
    $("micro-toggle").innerHTML = '<span class="led on" id="micro-led"></span>Stop run';
    micro.rafId = requestAnimationFrame(microTick);
  }
  function microStop() {
    micro.running = false;
    if (micro.rafId) cancelAnimationFrame(micro.rafId);
    $("micro-toggle").innerHTML = '<span class="led" id="micro-led"></span>Start run';
  }
  function microReset() {
    microStop();
    micro.n = 0;
    micro.ones = 0;
    micro.history = [];
    micro.stride = 1;
    micro.strideCounter = 0;
    updateMicroReadouts();
    drawMicroChart();
  }

  const onMicroToggle = () => (micro.running ? microStop() : microStart());
  const onMicroReset = () => microReset();
  const onMicroRate = (e: Event) => {
    micro.rate = Number((e.target as HTMLInputElement).value);
    $("micro-rate-val").textContent = String(micro.rate);
  };
  $("micro-toggle").addEventListener("click", onMicroToggle);
  $("micro-reset").addEventListener("click", onMicroReset);
  $("micro-rate").addEventListener("input", onMicroRate);

  const microPills = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="micro"] [data-target-group] .pill')
  );
  const microPillHandlers = microPills.map((btn) => {
    const handler = () => {
      microPills.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      micro.target = btn.dataset.value as typeof micro.target;
      updateMicroReadouts();
      drawMicroChart();
    };
    btn.addEventListener("click", handler);
    return { btn, handler };
  });

  // ================= MACRO-PK (RMC) =================
  const macroCanvas = $<HTMLCanvasElement>("macro-canvas");
  const ROWS = 10,
    BINS = ROWS + 1;
  const macro = {
    running: false,
    target: "right" as "right" | "left" | "baseline",
    rate: 4,
    bins: new Array(BINS).fill(0) as number[],
    totalBalls: 0,
    totalRights: 0,
    acc: 0,
    lastTime: 0,
    rafId: 0,
    animBalls: [] as { offsets: number[]; bin: number; start: number; duration: number }[],
  };

  function macroDirectional() {
    const meanBin = macro.totalBalls > 0 ? macro.totalRights / macro.totalBalls : 0;
    const expected = ROWS / 2;
    const raw = meanBin - expected;
    const dev = macro.target === "left" ? -raw : raw;
    return { meanBin, expected, dev };
  }

  function updateMacroReadouts() {
    const { meanBin, expected, dev } = macroDirectional();
    const totalDecisions = macro.totalBalls * ROWS;
    const sd = Math.sqrt(totalDecisions * 0.25);
    let rightsDev = macro.totalRights - totalDecisions * 0.5;
    if (macro.target === "left") rightsDev = -rightsDev;
    const z = sd > 0 ? rightsDev / sd : 0;
    const p = macro.totalBalls > 0 ? twoTailedP(z) : 1;

    $("macro-n").textContent = String(macro.totalBalls);
    $("macro-mean").textContent = fmt(meanBin, 2);
    $("macro-exp").textContent = fmt(expected, 2);
    const devEl = $("macro-dev");
    devEl.textContent = (dev >= 0 ? "+" : "") + fmt(dev, 2);
    devEl.className = "value" + (dev > 0 ? " hit" : dev < 0 ? " miss" : "");
    $("macro-z").textContent = fmt(z, 2);
    $("macro-p").textContent = macro.totalBalls > 0 ? fmt(p, 3) : "1.000";

    const badge = $("macro-badge");
    if (macro.totalBalls < 20) {
      badge.textContent = "collecting baseline…";
      badge.className = "badge";
    } else if (macro.target === "baseline") {
      badge.textContent = "non-directional · |z| " + fmt(Math.abs(z), 2);
      badge.className = "badge";
    } else if (Math.abs(z) >= 1.96 && dev > 0) {
      badge.textContent = "p < .05 · in target direction";
      badge.className = "badge sig-for";
    } else if (Math.abs(z) >= 1.96 && dev < 0) {
      badge.textContent = "p < .05 · against target direction";
      badge.className = "badge sig-against";
    } else {
      badge.textContent = "within chance range";
      badge.className = "badge";
    }
  }

  function dropBall() {
    const bytes = new Uint8Array(ROWS);
    crypto.getRandomValues(bytes);
    let rights = 0;
    const offsets: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      if (bytes[r] & 1) rights++;
      offsets.push(rights - (r + 1) / 2);
    }
    macro.bins[rights]++;
    macro.totalBalls++;
    macro.totalRights += rights;
    if (macro.animBalls.length < 40) {
      macro.animBalls.push({ offsets, bin: rights, start: performance.now(), duration: 480 });
    }
  }

  function drawMacroScene() {
    if (macroCanvas.clientWidth === 0) return;
    const { ctx, w, h } = setupCanvas(macroCanvas);
    ctx.clearRect(0, 0, w, h);

    const pegAreaH = h * 0.52;
    const barAreaTop = pegAreaH + 14;
    const barAreaH = h - barAreaTop - 18;
    const centerX = w / 2;
    const colSpacing = Math.min(28, (w - 24) / (BINS + 1));
    const rowSpacing = pegAreaH / (ROWS + 1);
    const pegTopY = 6;

    ctx.fillStyle = cssVar("--border");
    for (let r = 0; r < ROWS; r++) {
      const count = r + 2;
      const y = pegTopY + (r + 1) * rowSpacing;
      for (let i = 0; i < count; i++) {
        const off = i - (count - 1) / 2;
        const x = centerX + off * colSpacing;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const maxCount = Math.max(1, ...macro.bins);
    const expectedPeak = (comb(ROWS, Math.floor(ROWS / 2)) / Math.pow(2, ROWS)) * Math.max(macro.totalBalls, 1);
    const scaleMax = Math.max(maxCount, expectedPeak) * 1.25;
    const barW = colSpacing * 0.72;

    ctx.strokeStyle = cssVar("--muted");
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let k = 0; k <= ROWS; k++) {
      const expected = (comb(ROWS, k) / Math.pow(2, ROWS)) * Math.max(macro.totalBalls, 1);
      const x = centerX + (k - ROWS / 2) * colSpacing;
      const y = barAreaTop + barAreaH - (expected / scaleMax) * barAreaH;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = cssVar("--accent-2");
    for (let k = 0; k <= ROWS; k++) {
      const x = centerX + (k - ROWS / 2) * colSpacing;
      const bh = (macro.bins[k] / scaleMax) * barAreaH;
      ctx.fillRect(x - barW / 2, barAreaTop + barAreaH - bh, barW, bh);
    }

    ctx.strokeStyle = cssVar("--grid");
    ctx.beginPath();
    ctx.moveTo(0, barAreaTop + barAreaH);
    ctx.lineTo(w, barAreaTop + barAreaH);
    ctx.stroke();

    const now = performance.now();
    macro.animBalls = macro.animBalls.filter((b) => now - b.start < b.duration);
    ctx.fillStyle = cssVar("--accent-2");
    for (const b of macro.animBalls) {
      const t = Math.min(1, (now - b.start) / b.duration);
      const rowF = t * ROWS;
      const r0 = Math.floor(rowF);
      const frac = rowF - r0;
      const off0 = r0 === 0 ? 0 : b.offsets[r0 - 1];
      const off1 = b.offsets[Math.min(r0, ROWS - 1)];
      const off = off0 + (off1 - off0) * frac;
      const x = centerX + off * colSpacing;
      const y = pegTopY + rowF * rowSpacing;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function macroTick(now: number) {
    if (!macro.running) return;
    const dt = now - macro.lastTime;
    macro.lastTime = now;
    macro.acc += (dt * macro.rate) / 1000;
    let toRun = Math.floor(macro.acc);
    if (toRun > 0) {
      macro.acc -= toRun;
      toRun = Math.min(toRun, 500);
      for (let i = 0; i < toRun; i++) dropBall();
    }
    updateMacroReadouts();
    drawMacroScene();
    macro.rafId = requestAnimationFrame(macroTick);
  }

  function macroStart() {
    if (macro.running) return;
    macro.running = true;
    macro.lastTime = performance.now();
    macro.acc = 0;
    $("macro-toggle").innerHTML = '<span class="led on" id="macro-led"></span>Stop run';
    macro.rafId = requestAnimationFrame(macroTick);
  }
  function macroStop() {
    macro.running = false;
    if (macro.rafId) cancelAnimationFrame(macro.rafId);
    $("macro-toggle").innerHTML = '<span class="led" id="macro-led"></span>Start run';
  }
  function macroReset() {
    macroStop();
    macro.bins = new Array(BINS).fill(0);
    macro.totalBalls = 0;
    macro.totalRights = 0;
    macro.animBalls = [];
    updateMacroReadouts();
    drawMacroScene();
  }

  const onMacroToggle = () => (macro.running ? macroStop() : macroStart());
  const onMacroReset = () => macroReset();
  const onMacroRate = (e: Event) => {
    macro.rate = Number((e.target as HTMLInputElement).value);
    $("macro-rate-val").textContent = String(macro.rate);
  };
  $("macro-toggle").addEventListener("click", onMacroToggle);
  $("macro-reset").addEventListener("click", onMacroReset);
  $("macro-rate").addEventListener("input", onMacroRate);

  const macroPills = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="macro"] [data-target-group] .pill')
  );
  const macroPillHandlers = macroPills.map((btn) => {
    const handler = () => {
      macroPills.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      macro.target = btn.dataset.value as typeof macro.target;
      updateMacroReadouts();
    };
    btn.addEventListener("click", handler);
    return { btn, handler };
  });

  // ================= tabs =================
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".tab"));
  const tabHandlers = tabs.map((tab) => {
    const handler = () => {
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      const target = tab.dataset.tab;
      root.querySelectorAll<HTMLElement>(".panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.panel !== target);
      });
      requestAnimationFrame(() => {
        drawMicroChart();
        drawMacroScene();
      });
    };
    tab.addEventListener("click", handler);
    return { tab, handler };
  });

  const onResize = () => {
    drawMicroChart();
    drawMacroScene();
  };
  window.addEventListener("resize", onResize);

  updateMicroReadouts();
  drawMicroChart();
  updateMacroReadouts();
  drawMacroScene();

  return () => {
    if (micro.rafId) cancelAnimationFrame(micro.rafId);
    if (macro.rafId) cancelAnimationFrame(macro.rafId);
    window.removeEventListener("resize", onResize);
    $("micro-toggle").removeEventListener("click", onMicroToggle);
    $("micro-reset").removeEventListener("click", onMicroReset);
    $("micro-rate").removeEventListener("input", onMicroRate);
    $("macro-toggle").removeEventListener("click", onMacroToggle);
    $("macro-reset").removeEventListener("click", onMacroReset);
    $("macro-rate").removeEventListener("input", onMacroRate);
    microPillHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    macroPillHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    tabHandlers.forEach(({ tab, handler }) => tab.removeEventListener("click", handler));
  };
}

export function PkLab() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return initPkLab(root);
  }, []);

  return (
    <div className="pk-lab-page" ref={rootRef}>
      <div className="console">
        <header className="nameplate">
          <div className="nameplate-row">
            <span className="brand">PK Lab</span>
            <span className="model">Model REG · RMC — Rev. 1</span>
          </div>
          <p className="tagline">
            Two instruments for testing intention against a certified random source: a
            binary-trial generator and a mechanical ball cascade.
          </p>
        </header>

        <nav className="tabs" role="tablist">
          <button className="tab" data-tab="micro" role="tab" aria-selected="true" type="button">
            Micro-PK <small>REG · bit stream</small>
          </button>
          <button className="tab" data-tab="macro" role="tab" aria-selected="false" type="button">
            Macro-PK <small>RMC · ball cascade</small>
          </button>
        </nav>

        {/* MICRO PANEL */}
        <section className="panel" data-panel="micro">
          <div className="controls">
            <div className="control-group">
              <label>Target</label>
              <div className="pill-group" data-target-group>
                <button className="pill active" data-value="high" type="button">
                  ↑ High (1-bits)
                </button>
                <button className="pill" data-value="low" type="button">
                  ↓ Low (0-bits)
                </button>
                <button className="pill" data-value="baseline" type="button">
                  ○ Baseline
                </button>
              </div>
            </div>
            <div className="control-group">
              <label htmlFor="micro-rate">
                Trial rate — <span className="mono" id="micro-rate-val">20</span>/s
              </label>
              <input type="range" id="micro-rate" min="1" max="200" defaultValue="20" />
            </div>
            <div className="control-group buttons">
              <button className="btn-primary" id="micro-toggle" type="button">
                <span className="led" id="micro-led" />
                Start run
              </button>
              <button className="btn-ghost" id="micro-reset" type="button">
                Reset
              </button>
            </div>
          </div>

          <div className="readout-grid">
            <div className="stat">
              <span className="label">Trials</span>
              <span className="value" id="micro-n">0</span>
            </div>
            <div className="stat">
              <span className="label">Hits</span>
              <span className="value" id="micro-hits">0</span>
            </div>
            <div className="stat">
              <span className="label">Expected</span>
              <span className="value" id="micro-exp">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Deviation Δ</span>
              <span className="value" id="micro-dev">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Z-score</span>
              <span className="value" id="micro-z">0.00</span>
            </div>
            <div className="stat">
              <span className="label">p (two-tail)</span>
              <span className="value" id="micro-p">1.00</span>
            </div>
          </div>
          <span className="badge" id="micro-badge">awaiting data</span>

          <div className="scope">
            <canvas id="micro-canvas" />
          </div>
          <div className="caption">
            <span className="swatch" style={{ color: "var(--accent)" }}>
              cumulative deviation from 50%
            </span>
            <span className="swatch" style={{ color: "var(--muted)" }}>
              ±1.96σ control bounds
            </span>
          </div>
        </section>

        {/* MACRO PANEL */}
        <section className="panel hidden" data-panel="macro">
          <div className="controls">
            <div className="control-group">
              <label>Target</label>
              <div className="pill-group" data-target-group>
                <button className="pill active" data-value="right" type="button">
                  → Right bins
                </button>
                <button className="pill" data-value="left" type="button">
                  ← Left bins
                </button>
                <button className="pill" data-value="baseline" type="button">
                  ○ Baseline
                </button>
              </div>
            </div>
            <div className="control-group">
              <label htmlFor="macro-rate">
                Ball rate — <span className="mono" id="macro-rate-val">4</span>/s
              </label>
              <input type="range" id="macro-rate" min="1" max="30" defaultValue="4" />
            </div>
            <div className="control-group buttons">
              <button className="btn-primary" id="macro-toggle" type="button">
                <span className="led" id="macro-led" />
                Start run
              </button>
              <button className="btn-ghost" id="macro-reset" type="button">
                Reset
              </button>
            </div>
          </div>

          <div className="readout-grid">
            <div className="stat">
              <span className="label">Balls</span>
              <span className="value" id="macro-n">0</span>
            </div>
            <div className="stat">
              <span className="label">Mean bin</span>
              <span className="value" id="macro-mean">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Expected</span>
              <span className="value" id="macro-exp">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Deviation Δ</span>
              <span className="value" id="macro-dev">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Z-score</span>
              <span className="value" id="macro-z">0.00</span>
            </div>
            <div className="stat">
              <span className="label">p (two-tail)</span>
              <span className="value" id="macro-p">1.00</span>
            </div>
          </div>
          <span className="badge" id="macro-badge">awaiting data</span>

          <div className="scope">
            <canvas id="macro-canvas" />
          </div>
          <div className="caption">
            <span className="swatch" style={{ color: "var(--accent-2)" }}>
              observed bin counts
            </span>
            <span className="swatch" style={{ color: "var(--muted)" }}>
              expected binomial curve
            </span>
          </div>
        </section>

        <p className="disclaimer">
          <strong>What this is:</strong> a recreational/educational instrument, not a validated
          psi experiment. Both instruments draw from <code>crypto.getRandomValues</code> (a
          CSPRNG) as their sole source of randomness — the &quot;target&quot; controls only
          change how results are labeled and scored afterward, they never touch the generator.
          Micro-PK reports a live REG binary-trial test; Macro-PK simulates a Random Mechanical
          Cascade, where each ball&apos;s bin is the sum of independent 50/50 decisions. Treat |z|
          ≳ 2 as &quot;worth a second run,&quot; not as proof of anything.
        </p>
      </div>
    </div>
  );
}
