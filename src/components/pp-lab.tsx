"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { REMOTE_TARGETS } from "@/lib/remote-targets";
import "./pp-lab.css";

type PkUser = { id: string };

type PkRunRow = {
  test_type: "micro" | "macro" | "instinct" | "remote";
  trials: number;
  observed: number;
  z: number;
  p: number;
  created_at: string;
};

type PkRemoteSessionRow = {
  target_name: string;
  guess_name: string;
  hit: boolean;
  notes: string;
  created_at: string;
};

const REMOTE_ROUND_SIZE = 20;

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
function binomialDeviation(hits: number, trials: number, p0: number) {
  const expected = trials * p0;
  const dev = hits - expected;
  const sd = Math.sqrt(trials * p0 * (1 - p0));
  const z = sd > 0 ? dev / sd : 0;
  return { expected, dev, z };
}
function comb(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}
// Unbiased random integer in [0, maxExclusive) via rejection sampling —
// needed for pool sizes (500+) too large for the single-byte trick used
// elsewhere in this file.
function cryptoRandomInt(maxExclusive: number) {
  const byteLen = Math.max(1, Math.ceil(Math.log2(maxExclusive) / 8));
  const range = 256 ** byteLen;
  const ceiling = range - (range % maxExclusive);
  const bytes = new Uint8Array(byteLen);
  let v: number;
  do {
    crypto.getRandomValues(bytes);
    v = bytes.reduce((acc, b) => acc * 256 + b, 0);
  } while (v >= ceiling);
  return v % maxExclusive;
}
function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function initPpLab(root: HTMLElement, user: PkUser | null) {
  const cssVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;

  // ================= STATISTICS (all-time, signed-in only) =================
  let disposed = false;
  const stats = {
    micro: [] as PkRunRow[],
    macro: [] as PkRunRow[],
    instinct: [] as PkRunRow[],
    remote: [] as PkRunRow[],
  };

  function updateAllTimePanel(kind: "micro" | "macro" | "instinct" | "remote") {
    if (!user) return;
    const rows = stats[kind];
    const p = `stats-${kind}`;
    if (rows.length === 0) {
      $(`${p}-runs`).textContent = "0";
      $(`${p}-total-n`).textContent = "0";
      $(`${p}-best-z`).textContent = "—";
      $(`${p}-last`).textContent = "—";
      return;
    }
    let totalTrials = 0;
    let bestAbsZ = 0;
    let lastAt = rows[0].created_at;
    for (const r of rows) {
      totalTrials += r.trials;
      if (Math.abs(r.z) > bestAbsZ) bestAbsZ = Math.abs(r.z);
      if (r.created_at > lastAt) lastAt = r.created_at;
    }
    $(`${p}-runs`).textContent = String(rows.length);
    $(`${p}-total-n`).textContent = String(totalTrials);
    $(`${p}-best-z`).textContent = fmt(bestAbsZ, 2);
    $(`${p}-last`).textContent = new Date(lastAt).toLocaleString();
  }

  if (user) {
    createClient()
      .from("pk_runs")
      .select("test_type, trials, observed, z, p, created_at")
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) console.error("pk_runs select failed:", error);
        if (disposed || error || !data) return;
        stats.micro = data.filter((r) => r.test_type === "micro") as PkRunRow[];
        stats.macro = data.filter((r) => r.test_type === "macro") as PkRunRow[];
        stats.instinct = data.filter((r) => r.test_type === "instinct") as PkRunRow[];
        stats.remote = data.filter((r) => r.test_type === "remote") as PkRunRow[];
        updateAllTimePanel("micro");
        updateAllTimePanel("macro");
        updateAllTimePanel("instinct");
        updateAllTimePanel("remote");
      });
  }

  let remoteSessions: PkRemoteSessionRow[] = [];

  function renderRemoteHistory() {
    if (!user) return;
    const list = root.querySelector<HTMLElement>("#remote-history-list");
    if (!list) return;
    if (remoteSessions.length === 0) {
      list.innerHTML = '<p class="stats-anon-note">No sessions saved yet.</p>';
      return;
    }
    list.innerHTML = remoteSessions
      .map((s) => {
        const when = new Date(s.created_at).toLocaleString();
        const notes = s.notes.trim() ? escapeHtml(s.notes) : "<em>no notes</em>";
        const targetName = escapeHtml(s.target_name);
        const guessName = escapeHtml(s.guess_name);
        const verdict = s.hit
          ? '<span class="remote-history-match hit">HIT</span>'
          : '<span class="remote-history-match miss">miss</span>';
        const detail = s.hit ? targetName : `guessed ${guessName} · was ${targetName}`;
        return `<div class="remote-history-item">
          <div class="remote-history-item-head">
            <span class="remote-history-detail">${verdict} ${detail}</span>
            <span class="remote-history-time">${when}</span>
          </div>
          <p class="remote-history-notes">${notes}</p>
        </div>`;
      })
      .join("");
  }

  if (user) {
    createClient()
      .from("pk_remote_sessions")
      .select("target_name, guess_name, hit, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error("pk_remote_sessions select failed:", error);
        if (disposed || error || !data) return;
        remoteSessions = data as PkRemoteSessionRow[];
        renderRemoteHistory();
      });
  }

  function saveRemoteSession(targetName: string, guessName: string, hit: boolean, notes: string) {
    if (!user) return;
    createClient()
      .from("pk_remote_sessions")
      .insert({ user_id: user.id, target_name: targetName, guess_name: guessName, hit, notes })
      .then(({ error }) => {
        if (error) console.error("pk_remote_sessions insert failed:", error);
        if (disposed || error) return;
        remoteSessions.unshift({
          target_name: targetName,
          guess_name: guessName,
          hit,
          notes,
          created_at: new Date().toISOString(),
        });
        renderRemoteHistory();
      });
  }

  function saveRun(row: Omit<PkRunRow, "created_at"> & { target: string; expected: number; deviation: number }) {
    if (!user) return;
    createClient()
      .from("pk_runs")
      .insert({ user_id: user.id, ...row })
      .then(({ error }) => {
        if (error) console.error("pk_runs insert failed:", error);
        if (disposed || error) return;
        stats[row.test_type].unshift({ ...row, created_at: new Date().toISOString() });
        updateAllTimePanel(row.test_type);
      });
  }

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

    $("stats-micro-n").textContent = String(micro.n);
    $("stats-micro-z").textContent = fmt(z, 2);
    $("stats-micro-p").textContent = micro.n > 0 ? fmt(p, 3) : "1.000";
    $("stats-micro-badge").textContent = badge.textContent;
    $("stats-micro-badge").className = badge.className;
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
    if (micro.n > 0) {
      const { observed, expected, dev } = microDirectional(micro.n, micro.ones);
      const sd = Math.sqrt(micro.n * 0.25);
      const z = sd > 0 ? dev / sd : 0;
      saveRun({
        test_type: "micro",
        target: micro.target,
        trials: micro.n,
        observed,
        expected,
        deviation: dev,
        z,
        p: twoTailedP(z),
      });
    }
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

  function updateMicroInstruction() {
    const el = $("micro-instruction");
    if (micro.target === "high") {
      el.innerHTML = "<strong>Concentrate.</strong> Try to push the stream toward more 1s.";
    } else if (micro.target === "low") {
      el.innerHTML = "<strong>Concentrate.</strong> Try to push the stream toward more 0s.";
    } else {
      el.innerHTML = "<strong>Relax.</strong> Baseline run — no target, no intention.";
    }
  }

  const microPills = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="micro"] [data-target-group] .pill')
  );
  const microPillHandlers = microPills.map((btn) => {
    const handler = () => {
      microPills.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      micro.target = btn.dataset.value as typeof micro.target;
      updateMicroInstruction();
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

    $("stats-macro-n").textContent = String(macro.totalBalls);
    $("stats-macro-z").textContent = fmt(z, 2);
    $("stats-macro-p").textContent = macro.totalBalls > 0 ? fmt(p, 3) : "1.000";
    $("stats-macro-badge").textContent = badge.textContent;
    $("stats-macro-badge").className = badge.className;
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
    if (macro.totalBalls > 0) {
      const { expected, dev } = macroDirectional();
      const totalDecisions = macro.totalBalls * ROWS;
      const sd = Math.sqrt(totalDecisions * 0.25);
      let rightsDev = macro.totalRights - totalDecisions * 0.5;
      if (macro.target === "left") rightsDev = -rightsDev;
      const z = sd > 0 ? rightsDev / sd : 0;
      saveRun({
        test_type: "macro",
        target: macro.target,
        trials: macro.totalBalls,
        observed: macro.totalRights,
        expected,
        deviation: dev,
        z,
        p: twoTailedP(z),
      });
    }
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

  function updateMacroInstruction() {
    const el = $("macro-instruction");
    if (macro.target === "right") {
      el.innerHTML = "<strong>Concentrate.</strong> Try to guide the ball toward the right.";
    } else if (macro.target === "left") {
      el.innerHTML = "<strong>Concentrate.</strong> Try to guide the ball toward the left.";
    } else {
      el.innerHTML = "<strong>Relax.</strong> Baseline run — no target, no intention.";
    }
  }

  const macroPills = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="macro"] [data-target-group] .pill')
  );
  const macroPillHandlers = macroPills.map((btn) => {
    const handler = () => {
      macroPills.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      macro.target = btn.dataset.value as typeof macro.target;
      updateMacroInstruction();
      updateMacroReadouts();
    };
    btn.addEventListener("click", handler);
    return { btn, handler };
  });

  // ================= PK INSTINCT (forced-choice) =================
  const SYMBOLS = ["●", "■", "▲", "◆", "★", "✚", "≈"];
  const instinctCanvas = $<HTMLCanvasElement>("instinct-canvas");
  const P0 = 1 / SYMBOLS.length;
  const instinct = {
    target: 0,
    trials: 0,
    hits: 0,
    history: [] as { n: number; hits: number }[],
    lastGuess: null as number | null,
    lastTarget: null as number | null,
    lastHit: null as boolean | null,
    phase: "countdown" as "countdown" | "ready" | "result",
    countdown: 3,
  };
  let instinctCountdownTimer: number | null = null;

  function instinctNewTarget() {
    const bytes = new Uint8Array(1);
    const ceiling = 256 - (256 % SYMBOLS.length);
    let v: number;
    do {
      crypto.getRandomValues(bytes);
      v = bytes[0];
    } while (v >= ceiling);
    instinct.target = v % SYMBOLS.length;
  }
  instinctNewTarget();

  function instinctDirectional(n: number, hits: number) {
    const expected = n * P0;
    return { expected, dev: hits - expected };
  }

  function updateInstinctReadouts() {
    const { expected, dev, z } = binomialDeviation(instinct.hits, instinct.trials, P0);
    const p = instinct.trials > 0 ? twoTailedP(z) : 1;

    $("instinct-n").textContent = String(instinct.trials);
    $("instinct-hits").textContent = String(instinct.hits);
    $("instinct-exp").textContent = fmt(expected, 1);
    const devEl = $("instinct-dev");
    devEl.textContent = (dev >= 0 ? "+" : "") + fmt(dev, 1);
    devEl.className = "value" + (dev > 0 ? " hit" : dev < 0 ? " miss" : "");
    $("instinct-z").textContent = fmt(z, 2);
    $("instinct-p").textContent = instinct.trials > 0 ? fmt(p, 3) : "1.000";

    const lastEl = $("instinct-last");
    if (instinct.lastGuess === null || instinct.lastTarget === null) {
      lastEl.textContent = "—";
      lastEl.className = "value";
    } else {
      const g = SYMBOLS[instinct.lastGuess];
      const t = SYMBOLS[instinct.lastTarget];
      lastEl.textContent = `guessed ${g} · was ${t} · ${instinct.lastHit ? "HIT" : "miss"}`;
      lastEl.className = "value" + (instinct.lastHit ? " hit" : " miss");
    }

    const badge = $("instinct-badge");
    if (instinct.trials < 20) {
      badge.textContent = "collecting baseline…";
      badge.className = "badge";
    } else if (Math.abs(z) >= 1.96 && dev > 0) {
      badge.textContent = "p < .05 · above chance";
      badge.className = "badge sig-for";
    } else if (Math.abs(z) >= 1.96 && dev < 0) {
      badge.textContent = "p < .05 · below chance";
      badge.className = "badge sig-against";
    } else {
      badge.textContent = "within chance range";
      badge.className = "badge";
    }

    $("stats-instinct-n").textContent = String(instinct.trials);
    $("stats-instinct-z").textContent = fmt(z, 2);
    $("stats-instinct-p").textContent = instinct.trials > 0 ? fmt(p, 3) : "1.000";
    $("stats-instinct-badge").textContent = badge.textContent;
    $("stats-instinct-badge").className = badge.className;
  }

  function renderInstinctPhase() {
    const countdownEl = $("instinct-countdown");
    const keypadEl = root.querySelector<HTMLElement>('[data-panel="instinct"] .symbol-keypad')!;
    const resultEl = $("instinct-result");
    const resetBtn = $<HTMLButtonElement>("instinct-reset");

    countdownEl.classList.toggle("hidden", instinct.phase !== "countdown");
    keypadEl.classList.toggle("hidden", instinct.phase !== "ready");
    resultEl.classList.toggle("hidden", instinct.phase !== "result");

    if (instinct.phase === "countdown") {
      countdownEl.textContent = String(instinct.countdown);
    }

    resetBtn.textContent = instinct.phase === "result" ? "Continue" : "Reset";
  }

  function instinctStartRound() {
    if (instinctCountdownTimer !== null) {
      window.clearInterval(instinctCountdownTimer);
      instinctCountdownTimer = null;
    }
    instinct.phase = "countdown";
    instinct.countdown = 3;
    renderInstinctPhase();
    instinctCountdownTimer = window.setInterval(() => {
      instinct.countdown--;
      if (instinct.countdown <= 0) {
        window.clearInterval(instinctCountdownTimer!);
        instinctCountdownTimer = null;
        instinct.phase = "ready";
      }
      renderInstinctPhase();
    }, 1000);
  }

  function showInstinctResult() {
    const g = SYMBOLS[instinct.lastGuess!];
    const t = SYMBOLS[instinct.lastTarget!];
    $("instinct-result-guess").textContent = g;
    $("instinct-result-target").textContent = t;
    const verdict = $("instinct-result-verdict");
    verdict.textContent = instinct.lastHit ? "Hit" : "Miss";
    verdict.classList.toggle("hit", !!instinct.lastHit);
    instinct.phase = "result";
    renderInstinctPhase();
  }

  function drawInstinctChart() {
    if (instinctCanvas.clientWidth === 0) return;
    const { ctx, w, h } = setupCanvas(instinctCanvas);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 8, r: 8, t: 10, b: 10 };
    const plotW = w - pad.l - pad.r,
      plotH = h - pad.t - pad.b;
    const midY = pad.t + plotH / 2;

    if (instinct.trials === 0) {
      ctx.strokeStyle = cssVar("--grid");
      ctx.beginPath();
      ctx.moveTo(pad.l, midY);
      ctx.lineTo(w - pad.r, midY);
      ctx.stroke();
      return;
    }

    const nMax = instinct.trials;
    let devMax = 4;
    for (const pt of instinct.history) {
      const d = Math.abs(instinctDirectional(pt.n, pt.hits).dev);
      if (d > devMax) devMax = d;
    }
    const boundAtEnd = 1.96 * Math.sqrt(nMax * P0 * (1 - P0));
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
        const d = mult * Math.sqrt(n * P0 * (1 - P0));
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

    ctx.strokeStyle = cssVar("--accent-3");
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    instinct.history.forEach((pt, i) => {
      const dev = instinctDirectional(pt.n, pt.hits).dev;
      const x = xOf(pt.n),
        y = yOf(dev);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = instinct.history[instinct.history.length - 1];
    if (last) {
      const dev = instinctDirectional(last.n, last.hits).dev;
      ctx.fillStyle = cssVar("--accent-3");
      ctx.beginPath();
      ctx.arc(xOf(last.n), yOf(dev), 2.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function instinctGuess(value: number) {
    const target = instinct.target;
    const hit = value === target;
    instinct.trials++;
    if (hit) instinct.hits++;
    instinct.lastGuess = value;
    instinct.lastTarget = target;
    instinct.lastHit = hit;
    instinct.history.push({ n: instinct.trials, hits: instinct.hits });
    if (instinct.history.length > 4000) {
      instinct.history = instinct.history.filter((_, idx) => idx % 2 === 0);
    }
    instinctNewTarget();
    updateInstinctReadouts();
    drawInstinctChart();
    return hit;
  }

  function instinctReset() {
    if (instinct.trials > 0) {
      const { expected, dev, z } = binomialDeviation(instinct.hits, instinct.trials, P0);
      saveRun({
        test_type: "instinct",
        target: "hidden-symbol",
        trials: instinct.trials,
        observed: instinct.hits,
        expected,
        deviation: dev,
        z,
        p: twoTailedP(z),
      });
    }
    instinct.trials = 0;
    instinct.hits = 0;
    instinct.history = [];
    instinct.lastGuess = null;
    instinct.lastTarget = null;
    instinct.lastHit = null;
    instinctNewTarget();
    updateInstinctReadouts();
    drawInstinctChart();
    instinctStartRound();
  }

  const onInstinctResetOrContinue = () => {
    if (instinct.phase === "result") {
      instinctStartRound();
    } else {
      instinctReset();
    }
  };
  $("instinct-reset").addEventListener("click", onInstinctResetOrContinue);

  const instinctKeys = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="instinct"] .symbol-key')
  );
  const instinctKeyHandlers = instinctKeys.map((btn) => {
    const handler = () => {
      if (instinct.phase !== "ready") return;
      const value = parseInt(btn.dataset.value!, 10);
      const hit = instinctGuess(value);
      btn.classList.remove("hit", "miss");
      void btn.offsetWidth;
      btn.classList.add(hit ? "hit" : "miss");
      window.setTimeout(() => btn.classList.remove("hit", "miss"), 500);
      showInstinctResult();
    };
    btn.addEventListener("click", handler);
    return { btn, handler };
  });

  // ================= REMOTE VIEW (ARV, 500+ target pool, commit-reveal) =================
  const REMOTE_P0 = 1 / REMOTE_ROUND_SIZE;
  type RemotePhase = "viewing" | "matching" | "revealed";
  const remote = {
    roundPool: [] as { name: string; blurb: string }[],
    targetIndex: 0,
    nonceHex: "",
    commitHash: "",
    verified: false,
    guessIndex: null as number | null,
    phase: "viewing" as RemotePhase,
    trials: 0,
    hits: 0,
    history: [] as { n: number; hits: number }[],
  };

  // Samples REMOTE_ROUND_SIZE distinct targets out of the full pool via an
  // unbiased partial Fisher-Yates shuffle, so both which targets appear and
  // where they land change every round — nothing to memorize.
  function pickRemoteRoundPool() {
    const n = REMOTE_TARGETS.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const roundSize = Math.min(REMOTE_ROUND_SIZE, n);
    for (let i = 0; i < roundSize; i++) {
      const j = i + cryptoRandomInt(n - i);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, roundSize).map((idx) => REMOTE_TARGETS[idx]);
  }

  // Picks and hides the target, then commits to it by publishing
  // sha256(targetName:nonce) before any impressions are recorded. At
  // reveal the same hash is recomputed from the disclosed values, proving
  // the target couldn't have been changed after commitment.
  async function remoteCommit() {
    remote.roundPool = pickRemoteRoundPool();
    remote.targetIndex = cryptoRandomInt(remote.roundPool.length);

    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    remote.nonceHex = bytesToHex(nonceBytes);
    const targetName = remote.roundPool[remote.targetIndex].name;
    remote.commitHash = await sha256Hex(`${targetName}:${remote.nonceHex}`);

    remote.guessIndex = null;
    remote.verified = false;
    remote.phase = "viewing";
  }

  const remoteCells = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-panel="remote"] .remote-cell')
  );

  function renderRemoteRoundPool() {
    remoteCells.forEach((btn, i) => {
      const t = remote.roundPool[i];
      if (!t) return;
      btn.querySelector<HTMLElement>(".remote-cell-name")!.textContent = t.name;
      btn.title = t.blurb;
    });
  }

  function renderRemoteCommit() {
    const hashEl = $("remote-commit-hash");
    hashEl.textContent = remote.commitHash.slice(0, 24) + "…";
    hashEl.title = remote.commitHash;
    const verifyEl = $("remote-verify");
    verifyEl.classList.add("hidden");
    verifyEl.classList.remove("mismatch");
  }

  function renderRemoteNotesLock() {
    const ta = $<HTMLTextAreaElement>("remote-notes");
    const locked = remote.phase !== "viewing";
    ta.readOnly = locked;
    ta.classList.toggle("locked", locked);
  }

  function updateRemoteInstruction() {
    const el = $("remote-instruction");
    if (remote.phase === "viewing") {
      el.innerHTML =
        "<strong>Blind.</strong> A target has been committed and hidden. Record your impressions below before the target list is shown.";
    } else if (remote.phase === "matching") {
      el.innerHTML =
        "<strong>Match.</strong> Impressions locked. Compare them to the 20 targets and pick the one you sense best fits.";
    } else {
      el.innerHTML =
        "<strong>Result.</strong> The commitment hash has been recomputed from the disclosed target — see below.";
    }
  }

  function renderRemoteGrid() {
    $("remote-grid-wrap").classList.toggle("hidden", remote.phase === "viewing");
    for (const btn of remoteCells) {
      const idx = parseInt(btn.dataset.value!, 10);
      btn.classList.remove("active", "correct", "miss");
      btn.disabled = remote.phase !== "matching";
      if (remote.phase === "matching") {
        if (idx === remote.guessIndex) btn.classList.add("active");
      } else if (remote.phase === "revealed") {
        if (idx === remote.targetIndex) btn.classList.add("correct");
        else if (idx === remote.guessIndex) btn.classList.add("miss");
      }
    }
  }

  function renderRemoteResult() {
    const resultEl = $("remote-result");
    resultEl.classList.toggle("hidden", remote.phase !== "revealed");
    if (remote.phase !== "revealed") return;
    const hit = remote.guessIndex === remote.targetIndex;
    const target = remote.roundPool[remote.targetIndex];
    const verdict = $("remote-result-verdict");
    verdict.textContent = hit ? "Hit" : "Miss";
    verdict.classList.toggle("hit", hit);
    $("remote-result-number").textContent = String(remote.targetIndex + 1);
    $("remote-result-name").textContent = target.name;
    $("remote-result-blurb").textContent = target.blurb;
    $("remote-result-guess").classList.toggle("hidden", hit || remote.guessIndex === null);
    if (!hit && remote.guessIndex !== null) {
      $("remote-result-guess-number").textContent = String(remote.guessIndex + 1);
      $("remote-result-guess-name").textContent = remote.roundPool[remote.guessIndex].name;
    }
    $("remote-nonce").textContent = remote.nonceHex;
    const verifyEl = $("remote-verify");
    verifyEl.textContent = remote.verified ? "✓ commitment verified" : "✗ commitment mismatch";
    verifyEl.classList.toggle("mismatch", !remote.verified);
    verifyEl.classList.remove("hidden");
  }

  function renderRemoteControls() {
    $<HTMLButtonElement>("remote-lock").disabled = remote.phase !== "viewing";
    $<HTMLButtonElement>("remote-reveal").disabled =
      remote.phase !== "matching" || remote.guessIndex === null;
  }

  async function remoteStartRound() {
    await remoteCommit();
    renderRemoteRoundPool();
    renderRemoteCommit();
    renderRemoteGrid();
    renderRemoteResult();
    renderRemoteControls();
    renderRemoteNotesLock();
    updateRemoteInstruction();
  }

  function updateRemoteReadouts() {
    const { expected, dev, z } = binomialDeviation(remote.hits, remote.trials, REMOTE_P0);
    const p = remote.trials > 0 ? twoTailedP(z) : 1;

    $("remote-n").textContent = String(remote.trials);
    $("remote-hits").textContent = String(remote.hits);
    $("remote-exp").textContent = fmt(expected, 2);
    const devEl = $("remote-dev");
    devEl.textContent = (dev >= 0 ? "+" : "") + fmt(dev, 2);
    devEl.className = "value" + (dev > 0 ? " hit" : dev < 0 ? " miss" : "");
    $("remote-z").textContent = fmt(z, 2);
    $("remote-p").textContent = remote.trials > 0 ? fmt(p, 3) : "1.000";

    const badge = $("remote-badge");
    if (remote.trials < 20) {
      badge.textContent = "collecting baseline…";
      badge.className = "badge";
    } else if (Math.abs(z) >= 1.96 && dev > 0) {
      badge.textContent = "p < .05 · above chance";
      badge.className = "badge sig-for";
    } else if (Math.abs(z) >= 1.96 && dev < 0) {
      badge.textContent = "p < .05 · below chance";
      badge.className = "badge sig-against";
    } else {
      badge.textContent = "within chance range";
      badge.className = "badge";
    }

    $("stats-remote-n").textContent = String(remote.trials);
    $("stats-remote-z").textContent = fmt(z, 2);
    $("stats-remote-p").textContent = remote.trials > 0 ? fmt(p, 3) : "1.000";
    $("stats-remote-badge").textContent = badge.textContent;
    $("stats-remote-badge").className = badge.className;
  }

  const onRemoteLock = () => {
    if (remote.phase !== "viewing") return;
    remote.phase = "matching";
    renderRemoteGrid();
    renderRemoteControls();
    renderRemoteNotesLock();
    updateRemoteInstruction();
  };
  const onRemoteReveal = async () => {
    if (remote.phase !== "matching" || remote.guessIndex === null) return;
    const hit = remote.guessIndex === remote.targetIndex;
    const targetName = remote.roundPool[remote.targetIndex].name;
    const guessName = remote.roundPool[remote.guessIndex].name;
    const recomputed = await sha256Hex(`${targetName}:${remote.nonceHex}`);
    remote.verified = recomputed === remote.commitHash;
    remote.phase = "revealed";
    remote.trials++;
    if (hit) remote.hits++;
    remote.history.push({ n: remote.trials, hits: remote.hits });
    if (remote.history.length > 4000) {
      remote.history = remote.history.filter((_, idx) => idx % 2 === 0);
    }
    const notes = $<HTMLTextAreaElement>("remote-notes").value.trim();
    saveRemoteSession(targetName, guessName, hit, notes);
    renderRemoteGrid();
    renderRemoteResult();
    renderRemoteControls();
    renderRemoteNotesLock();
    updateRemoteInstruction();
    updateRemoteReadouts();
  };
  const onRemoteNew = async () => {
    await remoteStartRound();
    $<HTMLTextAreaElement>("remote-notes").value = "";
  };
  const onRemoteReset = () => {
    if (remote.trials > 0) {
      const { expected, dev, z } = binomialDeviation(remote.hits, remote.trials, REMOTE_P0);
      saveRun({
        test_type: "remote",
        target: "hidden-target-number",
        trials: remote.trials,
        observed: remote.hits,
        expected,
        deviation: dev,
        z,
        p: twoTailedP(z),
      });
    }
    remote.trials = 0;
    remote.hits = 0;
    remote.history = [];
    updateRemoteReadouts();
  };
  $("remote-lock").addEventListener("click", onRemoteLock);
  $("remote-reveal").addEventListener("click", onRemoteReveal);
  $("remote-new").addEventListener("click", onRemoteNew);
  $("remote-reset").addEventListener("click", onRemoteReset);

  const remoteCellHandlers = remoteCells.map((btn) => {
    const handler = () => {
      if (remote.phase !== "matching") return;
      remote.guessIndex = parseInt(btn.dataset.value!, 10);
      renderRemoteGrid();
      renderRemoteControls();
    };
    btn.addEventListener("click", handler);
    return { btn, handler };
  });

  // ================= tabs =================
  const TAB_TITLES: Record<string, string> = {
    micro: "Psychokinesis Test",
    macro: "Psychokinesis Test",
    instinct: "Precognition Test",
    remote: "Psychic Intuition test",
    stats: "Overview",
  };
  const TAB_TAGLINES: Record<string, string> = {
    micro:
      "A binary-trial generator (REG) testing whether focused intention can bias a live stream of random bits toward one direction.",
    macro:
      "A mechanical ball cascade (RMC) testing whether focused intention can bias a ball's path through a field of independent 50/50 decisions.",
    instinct:
      "A forced-choice test (FC) measuring whether you can sense a hidden symbol before it's revealed, against a 1-in-7 chance baseline.",
    remote:
      "An associative remote-viewing exercise (ARV) with commit-reveal: a target is committed via a published hash before you write anything, kept hidden while you record blind impressions, then matched against a random 20-target sample from a 500+ target pool before it's revealed.",
    stats: "Session and all-time statistics across all four instruments: REG, RMC, FC, and ARV.",
  };
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>(".tab"));
  const tabHandlers = tabs.map((tab) => {
    const handler = () => {
      const alreadyActive = tab.getAttribute("aria-selected") === "true";
      tabs.forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      const target = tab.dataset.tab;
      root.querySelectorAll<HTMLElement>(".panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.panel !== target);
      });
      $("page-title").textContent = TAB_TITLES[target ?? "micro"] ?? "Psychokinesis Lab";
      $("page-tagline").textContent = TAB_TAGLINES[target ?? "micro"] ?? "";
      if (target === "instinct" && !alreadyActive) {
        instinctStartRound();
      }
      requestAnimationFrame(() => {
        drawMicroChart();
        drawMacroScene();
        drawInstinctChart();
      });
    };
    tab.addEventListener("click", handler);
    return { tab, handler };
  });

  const onResize = () => {
    drawMicroChart();
    drawMacroScene();
    drawInstinctChart();
  };
  window.addEventListener("resize", onResize);

  updateMicroInstruction();
  updateMicroReadouts();
  drawMicroChart();
  updateMacroInstruction();
  updateMacroReadouts();
  drawMacroScene();
  updateInstinctReadouts();
  drawInstinctChart();
  instinctStartRound();
  void remoteStartRound();
  updateRemoteReadouts();
  renderRemoteHistory();

  return () => {
    disposed = true;
    if (instinctCountdownTimer !== null) window.clearInterval(instinctCountdownTimer);
    if (micro.rafId) cancelAnimationFrame(micro.rafId);
    if (macro.rafId) cancelAnimationFrame(macro.rafId);
    window.removeEventListener("resize", onResize);
    $("micro-toggle").removeEventListener("click", onMicroToggle);
    $("micro-reset").removeEventListener("click", onMicroReset);
    $("micro-rate").removeEventListener("input", onMicroRate);
    $("macro-toggle").removeEventListener("click", onMacroToggle);
    $("macro-reset").removeEventListener("click", onMacroReset);
    $("macro-rate").removeEventListener("input", onMacroRate);
    $("instinct-reset").removeEventListener("click", onInstinctResetOrContinue);
    $("remote-lock").removeEventListener("click", onRemoteLock);
    $("remote-reveal").removeEventListener("click", onRemoteReveal);
    $("remote-new").removeEventListener("click", onRemoteNew);
    $("remote-reset").removeEventListener("click", onRemoteReset);
    microPillHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    macroPillHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    instinctKeyHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    remoteCellHandlers.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
    tabHandlers.forEach(({ tab, handler }) => tab.removeEventListener("click", handler));
  };
}

export function PpLab({ user }: { user: PkUser | null }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return initPpLab(root, user);
  }, [user]);

  return (
    <div className="pp-lab-page" ref={rootRef}>
      <div className="console">
        <header className="nameplate">
          <div className="nameplate-row">
            <span className="brand" id="page-title">Psychokinesis Test</span>
            <span className="model">Model REG · RMC · FC · ARV — Rev. 1</span>
          </div>
          <p className="tagline" id="page-tagline">
            A binary-trial generator (REG) testing whether focused intention can bias a live
            stream of random bits toward one direction.
          </p>
        </header>

        <nav className="tabs" role="tablist">
          <button className="tab" data-tab="micro" role="tab" aria-selected="true" type="button">
            Micro-PK <small>REG · bit stream</small>
          </button>
          <button className="tab" data-tab="macro" role="tab" aria-selected="false" type="button">
            Macro-PK <small>RMC · ball cascade</small>
          </button>
          <button className="tab" data-tab="instinct" role="tab" aria-selected="false" type="button">
            Precognition <small>FC · guess the symbol</small>
          </button>
          <button className="tab" data-tab="remote" role="tab" aria-selected="false" type="button">
            PI Instinct <small>ARV · pick the number</small>
          </button>
          <button className="tab" data-tab="stats" role="tab" aria-selected="false" type="button">
            Statistics <small>all tests</small>
          </button>
        </nav>

        {/* MICRO PANEL */}
        <section className="panel" data-panel="micro">
          <p className="instruction" id="micro-instruction">
            <strong>Concentrate.</strong> Try to push the stream toward more 1s.
          </p>
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
          <p className="instruction" id="macro-instruction">
            <strong>Concentrate.</strong> Try to guide the ball toward the right.
          </p>
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

        {/* INSTINCT PANEL */}
        <section className="panel hidden" data-panel="instinct">
          <p className="instruction" id="instinct-instruction">
            <strong>Concentrate.</strong> A symbol is hidden. Guess it before you look.
          </p>

          <div className="instinct-board">
            <div className="instinct-stage">
              <div className="instinct-countdown" id="instinct-countdown">3</div>
              <div className="symbol-keypad hidden" role="group" aria-label="Symbol guess">
                <button className="symbol-key" data-value="0" type="button">●</button>
                <button className="symbol-key" data-value="1" type="button">■</button>
                <button className="symbol-key" data-value="2" type="button">▲</button>
                <button className="symbol-key" data-value="3" type="button">◆</button>
                <button className="symbol-key" data-value="4" type="button">★</button>
                <button className="symbol-key" data-value="5" type="button">✚</button>
                <button className="symbol-key" data-value="6" type="button">≈</button>
              </div>
              <div className="instinct-result hidden" id="instinct-result">
                <span className="instinct-result-verdict" id="instinct-result-verdict">HIT</span>
                <span className="instinct-result-detail" id="instinct-result-detail">
                  guessed <strong id="instinct-result-guess">A</strong> · was{" "}
                  <strong id="instinct-result-target">A</strong>
                </span>
              </div>
            </div>
            <div className="instinct-side">
              <div className="stat">
                <span className="label">Last trial</span>
                <span className="value" id="instinct-last">—</span>
              </div>
              <button className="btn-ghost" id="instinct-reset" type="button">
                Reset
              </button>
            </div>
          </div>

          <div className="readout-grid">
            <div className="stat">
              <span className="label">Trials</span>
              <span className="value" id="instinct-n">0</span>
            </div>
            <div className="stat">
              <span className="label">Hits</span>
              <span className="value" id="instinct-hits">0</span>
            </div>
            <div className="stat">
              <span className="label">Expected</span>
              <span className="value" id="instinct-exp">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Deviation Δ</span>
              <span className="value" id="instinct-dev">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Z-score</span>
              <span className="value" id="instinct-z">0.00</span>
            </div>
            <div className="stat">
              <span className="label">p (two-tail)</span>
              <span className="value" id="instinct-p">1.00</span>
            </div>
          </div>
          <span className="badge" id="instinct-badge">awaiting data</span>

          <div className="scope">
            <canvas id="instinct-canvas" />
          </div>
          <div className="caption">
            <span className="swatch" style={{ color: "var(--accent-3)" }}>
              cumulative deviation from 1-in-16 chance
            </span>
            <span className="swatch" style={{ color: "var(--muted)" }}>
              ±1.96σ control bounds
            </span>
          </div>
        </section>

        {/* REMOTE VIEW PANEL */}
        <section className="panel hidden" data-panel="remote">
          <p className="instruction" id="remote-instruction">
            <strong>Blind.</strong> A target has been committed and hidden. Record your
            impressions below before the target list is shown.
          </p>

          <div className="remote-commit">
            <span className="remote-commit-label">Commitment (SHA-256)</span>
            <span className="remote-commit-hash" id="remote-commit-hash">—</span>
            <span className="remote-verify hidden" id="remote-verify">✓ commitment verified</span>
          </div>

          <div className="control-group">
            <label htmlFor="remote-notes">Impressions / notes</label>
            <textarea
              id="remote-notes"
              rows={4}
              placeholder="Shapes, colors, textures, terrain, temperature, feelings…"
            />
          </div>

          <div className="control-group buttons">
            <button className="btn-primary" id="remote-lock" type="button">
              Lock impressions
            </button>
          </div>

          <div className="remote-grid-wrap hidden" id="remote-grid-wrap">
            <p className="remote-grid-label">
              Impressions locked. Match them to a target, then reveal.
            </p>
            <div className="remote-grid" role="group" aria-label="Target number guess">
              {Array.from({ length: REMOTE_ROUND_SIZE }).map((_, i) => (
                <button className="remote-cell" data-value={i} type="button" key={i}>
                  <span className="remote-cell-num">{i + 1}</span>
                  <span className="remote-cell-name" />
                </button>
              ))}
            </div>
            <div className="control-group buttons">
              <button className="btn-primary" id="remote-reveal" type="button" disabled>
                Reveal target
              </button>
            </div>
          </div>

          <div className="remote-result hidden" id="remote-result">
            <span className="remote-result-verdict" id="remote-result-verdict">HIT</span>
            <span className="remote-result-detail">
              Target #<strong id="remote-result-number">1</strong> —{" "}
              <strong id="remote-result-name">Waterfall</strong>
            </span>
            <span className="remote-result-detail hidden" id="remote-result-guess">
              You guessed #<strong id="remote-result-guess-number">1</strong> —{" "}
              <strong id="remote-result-guess-name">Waterfall</strong>
            </span>
            <p className="remote-result-blurb" id="remote-result-blurb" />
            <p className="remote-nonce">nonce: <span id="remote-nonce" /></p>
          </div>

          <div className="control-group buttons">
            <button className="btn-ghost" id="remote-new" type="button">
              New target
            </button>
            <button className="btn-ghost" id="remote-reset" type="button">
              Reset session
            </button>
          </div>

          <div className="readout-grid">
            <div className="stat">
              <span className="label">Trials</span>
              <span className="value" id="remote-n">0</span>
            </div>
            <div className="stat">
              <span className="label">Hits</span>
              <span className="value" id="remote-hits">0</span>
            </div>
            <div className="stat">
              <span className="label">Expected</span>
              <span className="value" id="remote-exp">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Deviation Δ</span>
              <span className="value" id="remote-dev">0.0</span>
            </div>
            <div className="stat">
              <span className="label">Z-score</span>
              <span className="value" id="remote-z">0.00</span>
            </div>
            <div className="stat">
              <span className="label">p (two-tail)</span>
              <span className="value" id="remote-p">1.00</span>
            </div>
          </div>
          <span className="badge" id="remote-badge">awaiting data</span>

          {!user && (
            <p className="stats-anon-note">
              Sign in to keep a log of your past guesses and notes under Statistics. A session is
              saved to your history each time you reveal a target.
            </p>
          )}
        </section>

        {/* STATISTICS PANEL */}
        <section className="panel hidden" data-panel="stats">
          <div className="stats-grid">
            <div className="stats-box">
              <div className="stats-box-head">
                <span className="stats-box-title">Micro-PK</span>
                <small>REG · bit stream</small>
              </div>
              <div className="readout-grid">
                <div className="stat">
                  <span className="label">Trials (session)</span>
                  <span className="value" id="stats-micro-n">0</span>
                </div>
                <div className="stat">
                  <span className="label">Z-score</span>
                  <span className="value" id="stats-micro-z">0.00</span>
                </div>
                <div className="stat">
                  <span className="label">p (two-tail)</span>
                  <span className="value" id="stats-micro-p">1.000</span>
                </div>
              </div>
              <span className="badge" id="stats-micro-badge">awaiting data</span>

              {user ? (
                <div className="stats-alltime">
                  <div className="stats-alltime-head">All-time · signed in</div>
                  <div className="readout-grid">
                    <div className="stat">
                      <span className="label">Runs saved</span>
                      <span className="value" id="stats-micro-runs">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Total trials</span>
                      <span className="value" id="stats-micro-total-n">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Best |z|</span>
                      <span className="value" id="stats-micro-best-z">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Last run</span>
                      <span className="value" id="stats-micro-last">—</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="stats-anon-note">Sign in to keep a running history of your tests across visits.</p>
              )}
            </div>

            <div className="stats-box">
              <div className="stats-box-head">
                <span className="stats-box-title">Macro-PK</span>
                <small>RMC · ball cascade</small>
              </div>
              <div className="readout-grid">
                <div className="stat">
                  <span className="label">Balls (session)</span>
                  <span className="value" id="stats-macro-n">0</span>
                </div>
                <div className="stat">
                  <span className="label">Z-score</span>
                  <span className="value" id="stats-macro-z">0.00</span>
                </div>
                <div className="stat">
                  <span className="label">p (two-tail)</span>
                  <span className="value" id="stats-macro-p">1.000</span>
                </div>
              </div>
              <span className="badge" id="stats-macro-badge">awaiting data</span>

              {user ? (
                <div className="stats-alltime">
                  <div className="stats-alltime-head">All-time · signed in</div>
                  <div className="readout-grid">
                    <div className="stat">
                      <span className="label">Runs saved</span>
                      <span className="value" id="stats-macro-runs">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Total balls</span>
                      <span className="value" id="stats-macro-total-n">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Best |z|</span>
                      <span className="value" id="stats-macro-best-z">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Last run</span>
                      <span className="value" id="stats-macro-last">—</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="stats-anon-note">Sign in to keep a running history of your tests across visits.</p>
              )}
            </div>

            <div className="stats-box">
              <div className="stats-box-head">
                <span className="stats-box-title">Precognition</span>
                <small>FC · guess the symbol</small>
              </div>
              <div className="readout-grid">
                <div className="stat">
                  <span className="label">Trials (session)</span>
                  <span className="value" id="stats-instinct-n">0</span>
                </div>
                <div className="stat">
                  <span className="label">Z-score</span>
                  <span className="value" id="stats-instinct-z">0.00</span>
                </div>
                <div className="stat">
                  <span className="label">p (two-tail)</span>
                  <span className="value" id="stats-instinct-p">1.000</span>
                </div>
              </div>
              <span className="badge" id="stats-instinct-badge">awaiting data</span>

              {user ? (
                <div className="stats-alltime">
                  <div className="stats-alltime-head">All-time · signed in</div>
                  <div className="readout-grid">
                    <div className="stat">
                      <span className="label">Runs saved</span>
                      <span className="value" id="stats-instinct-runs">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Total trials</span>
                      <span className="value" id="stats-instinct-total-n">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Best |z|</span>
                      <span className="value" id="stats-instinct-best-z">—</span>
                    </div>
                    <div className="stat">
                      <span className="label">Last run</span>
                      <span className="value" id="stats-instinct-last">—</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="stats-anon-note">Sign in to keep a running history of your tests across visits.</p>
              )}
            </div>

            <div className="stats-box">
              <div className="stats-box-head">
                <span className="stats-box-title">PI Instinct</span>
                <small>ARV · 500+ pool</small>
              </div>
              <div className="readout-grid">
                <div className="stat">
                  <span className="label">Trials (session)</span>
                  <span className="value" id="stats-remote-n">0</span>
                </div>
                <div className="stat">
                  <span className="label">Z-score</span>
                  <span className="value" id="stats-remote-z">0.00</span>
                </div>
                <div className="stat">
                  <span className="label">p (two-tail)</span>
                  <span className="value" id="stats-remote-p">1.000</span>
                </div>
              </div>
              <span className="badge" id="stats-remote-badge">awaiting data</span>

              {user ? (
                <>
                  <div className="stats-alltime">
                    <div className="stats-alltime-head">All-time · signed in</div>
                    <div className="readout-grid">
                      <div className="stat">
                        <span className="label">Runs saved</span>
                        <span className="value" id="stats-remote-runs">—</span>
                      </div>
                      <div className="stat">
                        <span className="label">Total trials</span>
                        <span className="value" id="stats-remote-total-n">—</span>
                      </div>
                      <div className="stat">
                        <span className="label">Best |z|</span>
                        <span className="value" id="stats-remote-best-z">—</span>
                      </div>
                      <div className="stat">
                        <span className="label">Last run</span>
                        <span className="value" id="stats-remote-last">—</span>
                      </div>
                    </div>
                  </div>
                  <div className="remote-history">
                    <div className="remote-history-head">Recent guesses · signed in</div>
                    <div className="remote-history-list" id="remote-history-list">
                      <p className="stats-anon-note">No sessions saved yet.</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="stats-anon-note">Sign in to keep a running history of your tests across visits.</p>
              )}
            </div>
          </div>
          <p className="caption">
            Session numbers reflect the current run and reset with it. Saved runs are recorded when
            you hit Reset on a test with at least one trial.
          </p>
        </section>

        <p className="disclaimer">
          <strong>What this is:</strong> a recreational/educational instrument, not a validated
          psi experiment. All four instruments draw from <code>crypto.getRandomValues</code> (a
          CSPRNG) as their sole source of randomness — the &quot;target&quot; controls only
          change how results are labeled and scored afterward, they never touch the generator.
          Micro-PK reports a live REG binary-trial test; Macro-PK simulates a Random Mechanical
          Cascade, where each ball&apos;s bin is the sum of independent 50/50 decisions; Precognition
          is a forced-choice test — a symbol (1-in-7 chance) is generated and held
          in memory, never rendered, until you guess; PI Instinct is a forced-choice test
          (1-in-20 chance) over a random 20-target sample redrawn each round from a 500+ target
          pool, using a commit-reveal scheme — the target and a random nonce are chosen first, a
          SHA-256 hash of the two is published immediately, and only the hash is shown while you
          record impressions and pick a match, so the target list itself can&apos;t bias your
          notes and the hash lets you confirm nothing changed after the fact. Treat |z| ≳ 2 as
          &quot;worth a second run,&quot; not as proof of anything.
        </p>
      </div>
    </div>
  );
}
