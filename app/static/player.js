/* Reproductor de la banda: play, ±10 s, barra con loop A–B para practicar, velocidad y volumen.
   Define stopPlayer() y playVersion() (los usa app.js). Se carga antes que app.js. */
"use strict";

const PL = { A: null, B: null, loop: false, whole: false, ready: false, drag: null };
const PL_SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5];

function plFmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
function plStore(k, v) { try { if (v === undefined) return localStorage.getItem("dm.pl." + k); localStorage.setItem("dm.pl." + k, v); } catch { return null; } }

function plBuild() {
  const box = document.getElementById("player");
  if (!box || PL.ready) return;
  const sp = Number(plStore("speed")) || 1;
  const vol = plStore("vol") != null ? Number(plStore("vol")) : 1;
  box.innerHTML = `
    <div class="pl">
      <div class="pl-head">
        <span class="player-title" id="player-title"></span>
        <button class="icon-btn" id="player-close" aria-label="Cerrar reproductor">✕</button>
      </div>
      <audio id="audio" preload="metadata"></audio>
      <div class="pl-seek">
        <span class="pl-time" id="pl-cur">0:00</span>
        <div class="pl-track" id="pl-track" role="slider" tabindex="0" aria-label="Posición" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="pl-bar"><div class="pl-loopzone" id="pl-zone"></div><div class="pl-prog" id="pl-prog"></div></div>
          <button type="button" class="pl-mark a" id="pl-ma" aria-label="Inicio del loop (A)" hidden>A</button>
          <button type="button" class="pl-mark b" id="pl-mb" aria-label="Fin del loop (B)" hidden>B</button>
          <div class="pl-knob" id="pl-knob"></div>
        </div>
        <span class="pl-time" id="pl-dur">0:00</span>
      </div>
      <div class="pl-ctrl">
        <div class="pl-group">
          <button class="pl-btn" id="pl-back" aria-label="Retroceder 10 segundos" title="−10 s  (←)">${plIcon("back")}</button>
          <button class="pl-btn main" id="pl-play" aria-label="Reproducir" title="Reproducir / pausa  (espacio)">${plIcon("play")}</button>
          <button class="pl-btn" id="pl-fwd" aria-label="Adelantar 10 segundos" title="+10 s  (→)">${plIcon("fwd")}</button>
        </div>
        <div class="pl-group pl-loopgrp" role="group" aria-label="Loop para practicar">
          <button class="pl-chip" id="pl-a" title="Marcar el inicio del tramo  ( [ )">A</button>
          <button class="pl-chip" id="pl-b" title="Marcar el final del tramo  ( ] )">B</button>
          <button class="pl-chip loop" id="pl-loop" aria-pressed="false" title="Repetir el tramo A–B  (L)">${plIcon("loop")}<span>Loop</span></button>
          <button class="pl-chip" id="pl-clear" title="Borrar el tramo" hidden>Borrar</button>
        </div>
        <div class="pl-group right">
          <button class="pl-chip" id="pl-whole" aria-pressed="false" title="Repetir todo el tema">${plIcon("loop")}<span>Tema</span></button>
          <label class="pl-sel" title="Velocidad (el tono no cambia)"><select id="pl-speed" aria-label="Velocidad">${PL_SPEEDS.map((v) => `<option value="${v}" ${v === sp ? "selected" : ""}>${v === 1 ? "1×" : String(v).replace(".", ",") + "×"}</option>`).join("")}</select></label>
          <label class="pl-vol" title="Volumen">${plIcon("vol")}<input type="range" id="pl-vol" min="0" max="1" step="0.02" value="${vol}" aria-label="Volumen"></label>
        </div>
      </div>
      <p class="pl-hint" id="pl-hint" hidden></p>
    </div>`;
  PL.ready = true;
  plWire();
}
function plIcon(n) {
  const p = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    back: '<path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="8.2" y="16.2" font-size="6.2" font-weight="800" fill="currentColor" stroke="none">10</text>',
    fwd: '<path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="8.2" y="16.2" font-size="6.2" font-weight="800" fill="currentColor" stroke="none">10</text>',
    loop: '<path d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5h10zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5H7z"/>',
    vol: '<path d="M3 9v6h4l5 4V5L7 9zM16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  }[n];
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none">${p}</svg>`;
}

function plAudio() { return document.getElementById("audio"); }
function plDur() { const d = plAudio().duration; return isFinite(d) ? d : 0; }
function plHint(msg) {
  const h = document.getElementById("pl-hint");
  if (!h) return;
  h.textContent = msg || "";
  h.hidden = !msg;
}

function plPaint() {
  const a = plAudio(), d = plDur();
  const t = a.currentTime || 0;
  const pct = d ? (t / d) * 100 : 0;
  const $q = (id) => document.getElementById(id);
  $q("pl-prog").style.width = pct + "%";
  $q("pl-knob").style.left = pct + "%";
  $q("pl-cur").textContent = plFmt(t);
  $q("pl-dur").textContent = plFmt(d);
  $q("pl-track").setAttribute("aria-valuenow", String(Math.round(pct)));
  $q("pl-track").setAttribute("aria-valuetext", `${plFmt(t)} de ${plFmt(d)}`);
  const play = $q("pl-play");
  const playing = !a.paused && !a.ended;
  play.innerHTML = plIcon(playing ? "pause" : "play");
  play.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
  // tramo A–B
  const ma = $q("pl-ma"), mb = $q("pl-mb"), zone = $q("pl-zone");
  ma.hidden = PL.A == null; mb.hidden = PL.B == null;
  if (PL.A != null && d) ma.style.left = (PL.A / d) * 100 + "%";
  if (PL.B != null && d) mb.style.left = (PL.B / d) * 100 + "%";
  const both = PL.A != null && PL.B != null && d;
  zone.style.display = both ? "block" : "none";
  if (both) { zone.style.left = (PL.A / d) * 100 + "%"; zone.style.width = ((PL.B - PL.A) / d) * 100 + "%"; }
  const lp = $q("pl-loop");
  lp.classList.toggle("on", PL.loop && !!both);
  lp.setAttribute("aria-pressed", PL.loop && both ? "true" : "false");
  lp.disabled = !both;
  $q("pl-a").classList.toggle("on", PL.A != null);
  $q("pl-b").classList.toggle("on", PL.B != null);
  $q("pl-clear").hidden = PL.A == null && PL.B == null;
  const wh = $q("pl-whole");
  wh.classList.toggle("on", PL.whole);
  wh.setAttribute("aria-pressed", PL.whole ? "true" : "false");
}

function plTick() {
  const a = plAudio();
  if (PL.loop && PL.A != null && PL.B != null && PL.B - PL.A > 0.25 && a.currentTime >= PL.B) a.currentTime = PL.A;
  plPaint();
  if (!a.paused && !a.ended) PL.raf = requestAnimationFrame(plTick);
}
function plStartLoop() { cancelAnimationFrame(PL.raf); PL.raf = requestAnimationFrame(plTick); }

function plSeek(t) {
  const a = plAudio(), d = plDur();
  a.currentTime = Math.max(0, Math.min(d || t, t));
  plPaint();
}
function plToggle() {
  const a = plAudio();
  if (a.paused) { a.play().catch(() => {}); } else a.pause();
}
function plSetA() {
  const t = plAudio().currentTime;
  PL.A = t;
  if (PL.B != null && PL.B <= PL.A + 0.25) PL.B = null;
  plHint(PL.B == null ? "Punto A marcado. Ahora marcá la B donde termina el tramo." : "");
  if (PL.B != null) { PL.loop = true; }
  plPaint();
}
function plSetB() {
  const a = plAudio(), t = a.currentTime;
  if (PL.A == null) PL.A = 0;
  if (t <= PL.A + 0.25) { plHint("La B tiene que estar después de la A."); return; }
  PL.B = t;
  PL.loop = true;
  plHint("Practicando el tramo " + plFmt(PL.A) + " – " + plFmt(PL.B) + ". Podés arrastrar A y B para ajustarlos.");
  plPaint();
}
function plClear() { PL.A = PL.B = null; PL.loop = false; plHint(""); plPaint(); }
function plToggleLoop() {
  if (PL.A == null || PL.B == null) return;
  PL.loop = !PL.loop;
  plPaint();
}

function plWire() {
  const a = plAudio();
  const $q = (id) => document.getElementById(id);
  a.volume = Number($q("pl-vol").value);
  a.playbackRate = Number($q("pl-speed").value);
  a.preservesPitch = true; a.webkitPreservesPitch = true;
  $q("player-close").addEventListener("click", stopPlayer);
  $q("pl-play").addEventListener("click", plToggle);
  $q("pl-back").addEventListener("click", () => plSeek(a.currentTime - 10));
  $q("pl-fwd").addEventListener("click", () => plSeek(a.currentTime + 10));
  $q("pl-a").addEventListener("click", plSetA);
  $q("pl-b").addEventListener("click", plSetB);
  $q("pl-loop").addEventListener("click", plToggleLoop);
  $q("pl-clear").addEventListener("click", plClear);
  $q("pl-whole").addEventListener("click", () => { PL.whole = !PL.whole; a.loop = PL.whole; plPaint(); });
  $q("pl-speed").addEventListener("change", (e) => { a.playbackRate = Number(e.target.value); plStore("speed", e.target.value); });
  $q("pl-vol").addEventListener("input", (e) => { a.volume = Number(e.target.value); plStore("vol", e.target.value); });
  ["play", "playing"].forEach((n) => a.addEventListener(n, plStartLoop));
  ["pause", "ended", "seeked", "timeupdate", "loadedmetadata", "durationchange"].forEach((n) => a.addEventListener(n, plPaint));
  a.addEventListener("error", () => { if (a.getAttribute("src")) toast("No se pudo reproducir. Probá de nuevo con Escuchar.", "err"); });

  // arrastrar la barra y los marcadores A / B
  const track = $q("pl-track");
  const at = (ev) => {
    const r = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * plDur();
  };
  const down = (what) => (ev) => {
    if (!plDur()) return;
    ev.preventDefault(); ev.stopPropagation();
    PL.drag = what;
    track.setPointerCapture && track.setPointerCapture(ev.pointerId);
    if (what === "seek") plSeek(at(ev));
  };
  track.addEventListener("pointerdown", down("seek"));
  $q("pl-ma").addEventListener("pointerdown", down("A"));
  $q("pl-mb").addEventListener("pointerdown", down("B"));
  track.addEventListener("pointermove", (ev) => {
    if (!PL.drag) return;
    const t = at(ev);
    if (PL.drag === "seek") return plSeek(t);
    if (PL.drag === "A") PL.A = PL.B != null ? Math.min(t, PL.B - 0.3) : t;
    else PL.B = Math.max(t, (PL.A ?? 0) + 0.3);
    plPaint();
  });
  const up = () => { PL.drag = null; };
  track.addEventListener("pointerup", up);
  track.addEventListener("pointercancel", up);
  track.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { ev.preventDefault(); ev.stopPropagation(); plSeek(a.currentTime - (ev.shiftKey ? 10 : 5)); }
    if (ev.key === "ArrowRight") { ev.preventDefault(); ev.stopPropagation(); plSeek(a.currentTime + (ev.shiftKey ? 10 : 5)); }
  });
}

document.addEventListener("keydown", (ev) => {
  const box = document.getElementById("player");
  if (!box || box.hidden || !PL.ready) return;
  const tag = (ev.target.tagName || "").toLowerCase();
  if (["input", "textarea", "select"].includes(tag) || ev.target.isContentEditable || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  if (ev.target.getAttribute && ev.target.getAttribute("role") === "slider") return;
  const a = plAudio();
  switch (ev.key) {
    case " ": if (tag === "button" || tag === "a") return; ev.preventDefault(); plToggle(); break;
    case "ArrowLeft": plSeek(a.currentTime - (ev.shiftKey ? 10 : 5)); break;
    case "ArrowRight": plSeek(a.currentTime + (ev.shiftKey ? 10 : 5)); break;
    case "[": plSetA(); break;
    case "]": plSetB(); break;
    case "l": case "L": plToggleLoop(); break;
    case "\\": plClear(); break;
  }
});

function stopPlayer() {
  const box = document.getElementById("player");
  if (!box) return;
  const a = document.getElementById("audio");
  if (a) { a.pause(); a.removeAttribute("src"); a.load(); }
  cancelAnimationFrame(PL.raf);
  PL.A = PL.B = null; PL.loop = false;
  box.hidden = true;
  document.body.classList.remove("has-player");
}

async function playUrl(url, title) {
  plBuild();
  const a = plAudio();
  PL.A = PL.B = null; PL.loop = false; plHint("");
  a.src = url;
  a.playbackRate = Number(document.getElementById("pl-speed").value);
  document.getElementById("player-title").textContent = title;
  document.getElementById("player").hidden = false;
  document.body.classList.add("has-player");
  plPaint();
  await a.play().catch(() => { /* el usuario puede darle play a mano */ });
}

async function playVersion(id, title) {
  try {
    const { url } = await api(`/versions/${id}/link?fmt=preview`);
    await playUrl(url, title);
  } catch (e) { toast(e.message, "err"); }
}
