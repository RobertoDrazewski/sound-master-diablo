/* Tocar encima: mesa con las pistas separadas de un tema. Silenciás (M), dejás sola (S) o bajás cada pista
   y tocás arriba del resto. Todas las pistas arrancan en el mismo instante, así que no se corren entre sí.
   En el celular es una lista simple; en pantallas grandes cada pista muestra su onda, como en Reaper.
   Define openMixer(trackId). Se carga antes que app.js. */
"use strict";

const MX_BUDGET_MB = { mobile: 150, desktop: 600 };    // memoria que se anima a usar para el audio decodificado
const MX_COLORS = ["#ff7a2f", "#f5b042", "#e5533d", "#c98bff", "#58c4dd", "#7bd88f", "#f06aa8", "#9aa5ff"];
const MX_COLS = 2400;                                  // resolución de la onda (columnas por pista)

function mxFmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function mxIsMobile() {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || "") || (navigator.deviceMemory && navigator.deviceMemory <= 4);
}
function mxDecode(ctx, data) {              // Safari viejo solo entiende la forma con callbacks
  return new Promise((ok, fail) => { const p = ctx.decodeAudioData(data, ok, fail); if (p && p.catch) p.catch(fail); });
}
async function mxFetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("No se pudo bajar una pista");
  return res.arrayBuffer();
}
/* Cuánta calidad entra en la memoria: primero estéreo, después mono, y como último recurso menos frecuencia de muestreo. */
function mxPlan(n, dur, mobile) {
  const budget = mobile ? MX_BUDGET_MB.mobile : MX_BUDGET_MB.desktop;
  const top = mobile ? 32000 : 44100;
  const mb = (rate, ch) => (n * dur * rate * 4 * ch) / 1048576;
  for (const [rate, ch] of [[top, 2], [top, 1], [24000, 1], [16000, 1]]) {
    if (mb(rate, ch) <= budget) return { rate, mono: ch === 1, reduced: rate < 32000 };
  }
  if (mb(16000, 1) <= budget * 1.5) return { rate: 16000, mono: true, reduced: true };
  return null;
}
/* Mínimo y máximo de cada columna: con eso se dibuja la onda sin recorrer el audio en cada cuadro. */
function mxPeaks(buf, cols) {
  const out = new Float32Array(cols * 2);
  const ch = [];
  for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
  const per = buf.length / cols;
  for (let i = 0; i < cols; i++) {
    const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
    let lo = 0, hi = 0;
    for (const d of ch) for (let k = a; k < b; k++) { const v = d[k]; if (v < lo) lo = v; else if (v > hi) hi = v; }
    out[i * 2] = lo; out[i * 2 + 1] = hi;
  }
  return out;
}

async function openMixer(trackId) {
  const track = state.tracks && state.tracks.get(trackId);
  if (!track) return;
  const stems = track.versions.filter((v) => v.kind === "stem" && v.status === "ready");
  if (stems.length < 2) return toast("Hacen falta al menos dos pistas separadas", "err");
  const dur = Math.max(...stems.map((v) => v.duration || 0), 1);
  const plan = mxPlan(stems.length, dur, mxIsMobile());
  if (!plan) return toast("Este tema tiene demasiadas pistas para mezclarlas acá. Sumá algunas en Reaper y subilo de nuevo.", "err");

  let stop = () => {};
  openModal(`
    <div class="mx">
      <div class="st-modal-head"><h2>Tocar encima · ${esc(track.title)}</h2>
        <button type="button" class="icon-btn" id="mx-x" aria-label="Cerrar">✕</button></div>
      <div id="mx-body"><p class="muted">Preparando las pistas…</p></div>
    </div>`, (m) => {
    m.classList.add("wide", "mixer");
    $("#mx-x", m).addEventListener("click", closeModal);
    m.addEventListener("close", () => { stop(); m.classList.remove("mixer"); }, { once: true });
    mxMesa(m, track, stems, plan).then((fn) => { stop = fn || stop; }).catch((e) => {
      $("#mx-body", m).innerHTML = `<p class="muted">${esc(e.message || "No se pudieron preparar las pistas")}</p>`;
    });
  });
}

async function mxMesa(m, track, stems, plan) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Este navegador no puede mezclar pistas.");
  let ctx;
  try { ctx = new Ctx({ sampleRate: plan.rate, latencyHint: "playback" }); } catch { ctx = new Ctx(); }
  const body = $("#mx-body", m);
  let closed = false;
  const out = ctx.createGain();
  out.connect(ctx.destination);

  // baja y decodifica de a tres, con progreso
  const bufs = new Array(stems.length);
  let done = 0, next = 0;
  const tick = () => { body.innerHTML = `<p class="muted">Preparando las pistas… ${done} de ${stems.length}</p>`; };
  tick();
  async function worker() {
    while (next < stems.length && !closed) {
      const i = next++;
      const { url } = await api(`/versions/${stems[i].id}/link?fmt=preview`);
      let b = await mxDecode(ctx, await mxFetchBuffer(url));
      if (plan.mono && b.numberOfChannels > 1) {                    // mitad de memoria: la pista pasa a mono
        const mono = ctx.createBuffer(1, b.length, b.sampleRate);
        const d = mono.getChannelData(0);
        for (let c = 0; c < b.numberOfChannels; c++) { const s = b.getChannelData(c); for (let k = 0; k < d.length; k++) d[k] += s[k] / b.numberOfChannels; }
        b = mono;
      }
      bufs[i] = b; done++; tick();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (closed) return;

  const total = Math.max(...bufs.map((b) => b.duration));
  const S = stems.map((v, i) => ({ v, buf: bufs[i], peaks: mxPeaks(bufs[i], MX_COLS), color: MX_COLORS[i % MX_COLORS.length],
    gain: ctx.createGain(), vol: 1, mute: false, solo: false }));
  S.forEach((s) => s.gain.connect(out));

  let playing = false, t0 = 0, pos = 0, srcs = [], raf = 0, A = null, B = null, loop = false, drag = false;
  const here = () => (playing ? Math.min(total, ctx.currentTime - t0) : pos);

  function levels() {
    const anySolo = S.some((s) => s.solo);
    S.forEach((s) => {
      const on = anySolo ? s.solo : !s.mute;
      s.gain.gain.setTargetAtTime(on ? s.vol : 0, ctx.currentTime, 0.01);
    });
  }
  function halt() { srcs.forEach((x) => { try { x.stop(); } catch { /* ya parada */ } x.disconnect(); }); srcs = []; }
  function start(at) {
    halt();
    at = Math.max(0, Math.min(at, total - 0.05));
    const when = ctx.currentTime + 0.05;                // todas arrancan en el mismo instante
    S.forEach((s) => { const x = ctx.createBufferSource(); x.buffer = s.buf; x.connect(s.gain); x.start(when, at); srcs.push(x); });
    t0 = when - at; playing = true; levels(); paint();
  }
  function pause() { pos = here(); halt(); playing = false; paint(); }
  function seek(t) { pos = Math.max(0, Math.min(t, total)); if (playing) start(pos); else paint(); }

  body.innerHTML = `
    <p class="muted small mx-help">Silenciá la pista que vas a tocar (<b>M</b>) y tocá encima. Con <b>S</b> escuchás solo esa pista.${plan.reduced ? " Para que entre en la memoria de este equipo, el sonido está en calidad reducida." : ""}</p>
    <div class="mx-transport">
      <button type="button" class="btn primary" id="mx-play"></button>
      <button type="button" class="btn" id="mx-rew" aria-label="Volver al principio"><span>Inicio</span></button>
      <span class="mx-time"><span id="mx-cur">0:00</span> / ${mxFmt(total)}</span>
    </div>
    <input type="range" id="mx-seek" class="mx-seek" min="0" max="1000" step="1" value="0" aria-label="Posición del tema">
    <div class="mx-loop">
      <button type="button" class="pl-chip" id="mx-a" title="Marcar el inicio del tramo">A</button>
      <button type="button" class="pl-chip" id="mx-b" title="Marcar el final del tramo">B</button>
      <button type="button" class="pl-chip" id="mx-loop" aria-pressed="false" title="Repetir el tramo A–B">Repetir</button>
      <button type="button" class="pl-chip" id="mx-clear" hidden>Borrar tramo</button>
    </div>
    <div class="mx-tracks" id="mx-tracks">
      <div class="mx-over" aria-hidden="true"><div class="mx-zone" id="mx-zone" hidden></div><div class="mx-head" id="mx-head"></div></div>
      ${S.map((s, i) => `
      <div class="mx-row" data-row="${i}" style="--c:${s.color}">
        <div class="mx-ctl">
          <span class="mx-ico">${ic("music")}</span>
          <span class="mx-name">${esc(s.v.label || "Pista " + (i + 1))}</span>
          <button type="button" class="mx-btn mute" data-m="${i}" aria-pressed="false" aria-label="Silenciar ${esc(s.v.label)}">M</button>
          <button type="button" class="mx-btn solo" data-s="${i}" aria-pressed="false" aria-label="Escuchar solo ${esc(s.v.label)}">S</button>
          <input type="range" class="mx-vol" data-v="${i}" min="0" max="1.5" step="0.02" value="1" aria-label="Volumen de ${esc(s.v.label)}">
        </div>
        <canvas class="mx-wave" data-w="${i}" aria-hidden="true"></canvas>
      </div>`).join("")}
    </div>
    <div class="row mx-foot"><button type="button" class="btn small" id="mx-all">Todas sonando</button></div>`;

  // onda de cada pista (solo se ve en pantallas grandes)
  function drawWaves() {
    $$("canvas[data-w]", m).forEach((cv) => {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const g = cv.getContext("2d");
      g.scale(dpr, dpr);
      const s = S[Number(cv.dataset.w)], mid = h / 2;
      g.fillStyle = s.color;
      const cols = Math.min(w, MX_COLS);
      for (let x = 0; x < cols; x++) {
        const k = Math.floor((x / cols) * MX_COLS);
        const lo = s.peaks[k * 2], hi = s.peaks[k * 2 + 1];
        const y1 = mid - Math.min(1, hi) * mid * 0.95, y2 = mid - Math.max(-1, lo) * mid * 0.95;
        g.fillRect((x / cols) * w, y1, Math.max(1, w / cols), Math.max(1, y2 - y1));
      }
    });
  }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => drawWaves()) : null;
  if (ro) ro.observe($("#mx-tracks", m));
  drawWaves();

  function paint() {
    const t = here();
    $("#mx-play", m).innerHTML = (playing ? ic("pause") : ic("play")) + `<span>${playing ? "Pausa" : "Tocar"}</span>`;
    $("#mx-play", m).setAttribute("aria-label", playing ? "Pausa" : "Reproducir");
    $("#mx-cur", m).textContent = mxFmt(t);
    if (!drag) $("#mx-seek", m).value = String(total ? (t / total) * 1000 : 0);
    $("#mx-head", m).style.left = total ? (t / total) * 100 + "%" : "0";
    const z = $("#mx-zone", m);
    z.hidden = !(A != null && B != null && B > A);
    if (!z.hidden) { z.style.left = (A / total) * 100 + "%"; z.style.width = ((B - A) / total) * 100 + "%"; }
    $("#mx-a", m).classList.toggle("on", A != null);
    $("#mx-b", m).classList.toggle("on", B != null);
    $("#mx-loop", m).classList.toggle("on", loop);
    $("#mx-loop", m).setAttribute("aria-pressed", String(loop));
    $("#mx-clear", m).hidden = A == null && B == null;
    const anySolo = S.some((x) => x.solo);
    S.forEach((s, i) => {
      $(`[data-m="${i}"]`, m).setAttribute("aria-pressed", String(s.mute));
      $(`[data-s="${i}"]`, m).setAttribute("aria-pressed", String(s.solo));
      $(`[data-row="${i}"]`, m).classList.toggle("quiet", anySolo ? !s.solo : s.mute);
    });
  }
  function frame() {
    if (closed) return;
    if (playing) {
      const t = here();
      if (loop && A != null && B != null && B > A && t >= B) start(A);
      else if (t >= total - 0.02) { halt(); playing = false; pos = 0; }
    }
    paint();
    raf = requestAnimationFrame(frame);
  }

  $("#mx-play", m).addEventListener("click", async () => {
    try { if (ctx.state !== "running") await ctx.resume(); } catch { /* iOS: ya está activo */ }
    if (playing) pause(); else start(pos >= total - 0.1 ? 0 : pos);
  });
  $("#mx-rew", m).addEventListener("click", () => seek(0));
  const sk = $("#mx-seek", m);
  sk.addEventListener("pointerdown", () => { drag = true; });
  sk.addEventListener("input", () => { $("#mx-cur", m).textContent = mxFmt((Number(sk.value) / 1000) * total); });
  sk.addEventListener("change", () => { drag = false; seek((Number(sk.value) / 1000) * total); });
  // tocar o arrastrar sobre una onda mueve la posición
  $$("canvas[data-w]", m).forEach((cv) => {
    const at = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total; };
    let down = false;
    cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); seek(at(e)); });
    cv.addEventListener("pointermove", (e) => { if (down) seek(at(e)); });
    cv.addEventListener("pointerup", () => { down = false; });
    cv.addEventListener("pointercancel", () => { down = false; });
  });
  $("#mx-a", m).addEventListener("click", () => { A = here(); if (B != null && B <= A) B = null; paint(); });
  $("#mx-b", m).addEventListener("click", () => { const t = here(); if (A == null) A = 0; if (t > A) { B = t; loop = true; } paint(); });
  $("#mx-loop", m).addEventListener("click", () => { loop = !loop; paint(); });
  $("#mx-clear", m).addEventListener("click", () => { A = B = null; loop = false; paint(); });
  $$("[data-m]", m).forEach((b) => b.addEventListener("click", () => { const s = S[Number(b.dataset.m)]; s.mute = !s.mute; levels(); paint(); }));
  $$("[data-s]", m).forEach((b) => b.addEventListener("click", () => { const s = S[Number(b.dataset.s)]; s.solo = !s.solo; levels(); paint(); }));
  $$("[data-v]", m).forEach((r) => r.addEventListener("input", () => { S[Number(r.dataset.v)].vol = Number(r.value); levels(); }));
  $("#mx-all", m).addEventListener("click", () => {
    S.forEach((s) => { s.mute = false; s.solo = false; s.vol = 1; });
    $$("[data-v]", m).forEach((r) => { r.value = "1"; });
    levels(); paint();
  });
  paint();
  raf = requestAnimationFrame(frame);

  return () => { closed = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); halt(); try { ctx.close(); } catch { /* ya cerrado */ } };
}
