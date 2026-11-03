"use strict";

/* ===================== utilidades ===================== */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const session = {
  get token() { try { return localStorage.getItem("sm_token"); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem("sm_token", v) : localStorage.removeItem("sm_token"); } catch { /* sin storage */ } },
};

const state = { me: null, genres: null, timer: null, nav: 0, tracks: new Map() };

const parseDate = (iso) => new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
const fmtDate = (iso) =>
  parseDate(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso) => parseDate(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
function fmtDur(s) {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
function fmtSize(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1e3)) + " KB";
}
const fmtGB = (g) => (g < 1 ? g.toFixed(2) : g.toFixed(1));

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.setAttribute("role", "status");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 7000 : 3500);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copiado", "ok"); }
  catch { toast("No se pudo copiar. Seleccionalo y copialo a mano.", "err"); }
}

async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

/* ===================== API ===================== */
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
function errText(data, fallback) {
  const d = data && data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e.msg || "").filter(Boolean).join(". ") || fallback;
  return fallback;
}
async function api(path, { method = "GET", json, form } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = "Bearer " + session.token;
  let body;
  if (json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  else if (form) body = form;
  let res;
  try { res = await fetch(path, { method, headers, body }); }
  catch { throw new ApiError("No hay conexión con el servidor", 0); }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 401 && session.token && path !== "/auth/login") logout(true);
    throw new ApiError(errText(data, `Algo salió mal (${res.status})`), res.status);
  }
  return data;
}
function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (session.token) xhr.setRequestHeader("Authorization", "Bearer " + session.token);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* sin cuerpo */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        if (xhr.status === 401) logout(true);
        reject(new ApiError(errText(data, `No se pudo subir (${xhr.status})`), xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("Se cortó la conexión mientras subía", 0));
    xhr.send(form);
  });
}
function logout(expired = false) {
  session.token = null;
  state.me = null;
  state.genres = null;
  stopPlayer();
  if (expired) toast("Tu sesión venció. Entrá de nuevo.", "err");
  location.hash = "#/login";
}
async function getGenres(force = false) {
  if (force || !state.genres) state.genres = await api("/genres");
  return state.genres;
}

/* ===================== vista base ===================== */
function setApp(html) {
  $("#app").innerHTML = html;
  document.body.classList.toggle("is-auth", html.includes('class="auth"'));
  window.scrollTo(0, 0);
}
function showError(e) {
  setApp(`<div class="card"><h2>No se pudo cargar</h2><p class="muted">${esc(e.message || e)}</p>
    <button class="btn" id="retry">Reintentar</button></div>`);
  $("#retry").addEventListener("click", router);
}
function notFound() {
  setApp(`<div class="card empty"><span class="big">🤷</span>No encontramos lo que buscás.<br><a href="#/">Volver al inicio</a></div>`);
}
function openModal(html, setup) {
  const m = $("#modal");
  m.innerHTML = html;
  if (setup) setup(m);
  if (!m.open) m.showModal();
}
function closeModal() { const m = $("#modal"); if (m.open) m.close(); }

function renderTopbar(active) {
  const bar = $("#topbar");
  if (!state.me || !session.token) { bar.hidden = true; bar.innerHTML = ""; return; }
  bar.hidden = false;
  const link = (hash, label, key) =>
    `<a href="${hash}" class="${active === key ? "active" : ""}" ${active === key ? 'aria-current="page"' : ""}>${label}</a>`;
  bar.innerHTML = `
    <a class="brand" href="#/"><img class="brand-img" src="/logo-mark.png" alt="" width="34" height="34"><span class="brand-text">Diablo Master</span></a>
    <nav class="nav" aria-label="Principal">
      ${link("#/", "Bandas", "home")}${link("#/refs", "Referencias", "refs")}
      ${state.me.is_super ? link("#/admin", "Admin", "admin") : ""}${link("#/account", "Cuenta", "account")}
    </nav>`;
}

/* ===================== reproductor ===================== */
function stopPlayer() {
  const audio = $("#audio");
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  $("#player").hidden = true;
  document.body.classList.remove("has-player");
}
async function playVersion(id, title) {
  try {
    const { url } = await api(`/versions/${id}/link?fmt=preview`);
    const audio = $("#audio");
    audio.src = url;
    $("#player-title").textContent = title;
    $("#player").hidden = false;
    document.body.classList.add("has-player");
    await audio.play().catch(() => { /* el usuario puede darle play a mano */ });
  } catch (e) { toast(e.message, "err"); }
}
async function download(id, fmt) {
  try {
    if (fmt !== "flac") toast("Preparando el archivo… con ensayos largos puede tardar un rato.");
    const { url } = await api(`/versions/${id}/link?fmt=${fmt}`);
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) { toast(e.message, "err"); }
}

/* ===================== router ===================== */
function parseRoute() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  return { name: parts[0] || "home", arg: parts[1] };
}
async function router() {
  clearTimeout(state.timer);
  const nav = ++state.nav;
  const { name, arg } = parseRoute();
  try {
    if (name === "invite") { renderTopbar(null); return viewInvite(arg); }
    if (!session.token) {
      if (name !== "login") { location.hash = "#/login"; return; }
      renderTopbar(null);
      return viewLogin();
    }
    if (!state.me) state.me = await api("/me");
    if (nav !== state.nav) return;
    if (name === "login") { location.hash = "#/"; return; }
    renderTopbar(name === "band" ? "home" : name);
    switch (name) {
      case "home": return viewHome();
      case "band": return await viewBand(arg, nav);
      case "refs": return await viewRefs(nav);
      case "admin": return await viewAdmin(nav);
      case "account": return await viewAccount(nav);
      default: return notFound();
    }
  } catch (e) {
    if (nav === state.nav && !(e instanceof ApiError && e.status === 401)) showError(e);
  }
}
window.addEventListener("hashchange", router);

/* ===================== login e invitación ===================== */
const BRAND = `<div class="brand brand-big"><img class="brand-logo" src="/logo-login.png" alt="" width="150" height="150"><span>Diablo Master</span></div>`;

function viewLogin() {
  setApp(`<section class="auth">${BRAND}
    <form id="f" class="card">
      <h1>Entrar</h1>
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn primary block">Entrar</button>
      <p class="muted small" style="margin-top:.9rem">¿Todavía no tenés cuenta? Pedile el link de invitación a quien administra la app.</p>
    </form></section>`);
  $("#f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy($("button", ev.target), async () => {
      try {
        const r = await api("/auth/login", { method: "POST", json: { email: $("#email").value, password: $("#pw").value } });
        session.token = r.token;
        state.me = null;
        location.hash = "#/";
        if (parseRoute().name === "home") router();
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

function viewInvite(token) {
  if (!token) { location.hash = "#/login"; return; }
  setApp(`<section class="auth">${BRAND}
    <form id="f" class="card">
      <h1>Te invitaron a una banda</h1>
      <p class="muted">Elegí tu nombre y una contraseña para entrar.</p>
      <div class="field"><label for="name">Tu nombre</label><input id="name" type="text" autocomplete="name" maxlength="120" required></div>
      <div class="field"><label for="pw">Contraseña (mínimo 10 caracteres)</label><input id="pw" type="password" autocomplete="new-password" minlength="10" required></div>
      <button class="btn primary block">Crear cuenta y entrar</button>
      <p class="muted small" style="margin-top:.9rem">Si ya tenías cuenta con este email, poné tu contraseña de siempre.</p>
    </form></section>`);
  $("#f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy($("button", ev.target), async () => {
      try {
        const r = await api("/auth/accept-invite", {
          method: "POST", json: { token, name: $("#name").value.trim(), password: $("#pw").value },
        });
        session.token = r.token;
        state.me = null;
        location.hash = "#/";
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

/* ===================== inicio ===================== */
function viewHome() {
  const bands = state.me.bands;
  if (bands.length === 1 && !state.me.is_super) { location.replace(`#/band/${bands[0].id}`); return; }
  let html = `<h1>Tus bandas</h1>`;
  if (!bands.length) {
    html += `<div class="card empty"><span class="big">🎸</span>Todavía no estás en ninguna banda.<br>${
      state.me.is_super ? `Creala desde <a href="#/admin">Admin</a>.` : "Pedile una invitación a quien administra la app."}</div>`;
  } else {
    html += `<div class="grid">${bands.map((b) => `
      <a class="card band-card" href="#/band/${b.id}"><h3>${esc(b.name)}</h3>
      <p class="muted small">${b.role === "admin" ? "Administrás esta banda" : "Integrante"}</p></a>`).join("")}</div>`;
  }
  setApp(html);
}

/* ===================== banda ===================== */
const KIND = { mix: "Mezcla", stem: "Pista", master: "Master", raw: "Ensayo completo" };

async function viewBand(id, nav) {
  const band = state.me.bands.find((b) => String(b.id) === String(id));
  if (!band) return notFound();
  const data = await api(`/bands/${band.id}/tracks`);
  if (nav !== state.nav) return;

  setApp(`
    ${state.me.bands.length > 1 || state.me.is_super ? `<p class="small"><a href="#/">← Bandas</a></p>` : ""}
    <h1>${esc(band.name)}</h1>
    <div id="usage" class="stack" style="margin-bottom:1rem"></div>
    <section class="card" aria-labelledby="up-h">
      <h2 id="up-h">Subir audio</h2>
      <form id="up" class="stack">
        <div class="seg" role="radiogroup" aria-label="Qué vas a subir">
          <label><input type="radio" name="mode" value="mix" checked>🎵 Una canción<span class="hint">Mezcla ya lista</span></label>
          <label><input type="radio" name="mode" value="stems">🎚 Pistas separadas<span class="hint">Una por instrumento</span></label>
          <label><input type="radio" name="mode" value="raw">🎙 Ensayo completo<span class="hint">Se borra solo a los ${esc(data.raw_retention_days ?? 30)} días</span></label>
        </div>
        <div class="field" style="margin-bottom:0"><label for="title">Nombre del tema</label>
          <input id="title" type="text" maxlength="200" placeholder="Ej: Ensayo 3/11 - tema nuevo"></div>
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="Elegir archivos de audio">
          <strong>Tocá para elegir el audio</strong><br><span class="small">o arrastralo hasta acá (WAV, FLAC, MP3, M4A…)</span>
          <input type="file" id="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aif,.aiff,.ogg" hidden>
        </div>
        <div id="picked" class="small muted"></div>
        <div class="progress hidden" id="prog" role="progressbar" aria-label="Progreso de la subida"><i></i></div>
        <p class="small muted hidden" id="upmsg"></p>
        <button class="btn primary block" id="send" disabled>Subir</button>
      </form>
    </section>
    <h2 style="margin-top:1.5rem">Temas</h2>
    <div id="tracks"></div>`);

  renderTracks(band.id, data);
  scheduleBandPoll(band.id, nav, data);
  setupUploadForm(band.id, nav);
  $("#tracks").addEventListener("click", onTrackClick);
}

function scheduleBandPoll(bandId, nav, data) {
  clearTimeout(state.timer);
  const busy = data.tracks.some((t) => t.versions.some((v) => v.status === "processing"));
  if (!busy) return;
  state.timer = setTimeout(async () => {
    if (nav !== state.nav) return;
    try {
      const fresh = await api(`/bands/${bandId}/tracks`);
      if (nav !== state.nav) return;
      renderTracks(bandId, fresh);
      scheduleBandPoll(bandId, nav, fresh);
    } catch { state.timer = setTimeout(() => scheduleBandPoll(bandId, nav, data), 6000); }
  }, 3000);
}

async function refreshBand(bandId, nav) {
  const fresh = await api(`/bands/${bandId}/tracks`);
  if (nav !== state.nav) return;
  renderTracks(bandId, fresh);
  scheduleBandPoll(bandId, nav, fresh);
}

function renderTracks(bandId, data) {
  const pct = Math.min(100, (data.used_gb / data.quota_gb) * 100 || 0);
  $("#usage").innerHTML = `
    <div class="small muted row between"><span>Espacio de la banda</span><span>${fmtGB(data.used_gb)} de ${esc(data.quota_gb)} GB</span></div>
    <div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}" role="progressbar" aria-label="Espacio usado"
      aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;
  state.tracks = new Map(data.tracks.map((t) => [t.id, t]));
  state.bandId = bandId;
  $("#tracks").innerHTML = data.tracks.length
    ? data.tracks.map(trackCard).join("")
    : `<div class="card empty"><span class="big">🎧</span>Todavía no hay temas.<br>Subí el primero con el formulario de arriba.</div>`;
}

function trackCard(t) {
  const ready = t.versions.some((v) => v.status === "ready" && ["mix", "stem", "raw"].includes(v.kind));
  const order = { master: 0, mix: 1, raw: 2, stem: 3 };
  const versions = [...t.versions].sort((a, b) => order[a.kind] - order[b.kind] || a.id - b.id);
  return `
    <article class="card">
      <div class="track-head">
        <div class="grow"><h3>${esc(t.title)}</h3>
          <div class="muted small">Subido por ${esc(t.uploaded_by || "—")} · ${fmtDate(t.created_at)}</div></div>
        <button class="icon-btn" data-act="del-track" data-id="${t.id}" aria-label="Borrar el tema ${esc(t.title)}" title="Borrar tema">🗑</button>
      </div>
      <ul class="versions">${versions.map((v) => versionRow(t, v)).join("")}</ul>
      <div class="track-foot"><button class="btn primary" data-act="master" data-id="${t.id}" ${ready ? "" : "disabled"}>✨ Masterizar</button></div>
    </article>`;
}

function versionRow(t, v) {
  const title = `${t.title} — ${v.label}`;
  let info;
  if (v.status === "processing") info = `<span class="status processing"><span class="spinner"></span>Procesando…</span>`;
  else if (v.status === "error") info = `<span class="status error">Falló: ${esc(v.error || "error desconocido")}</span>`;
  else info = `<span class="muted small">${fmtDur(v.duration)} · ${fmtSize(v.size_bytes)}</span>`;
  const expires = v.expires_at ? `<div class="small muted">Se borra solo el ${fmtDay(v.expires_at)}</div>` : "";
  const actions = v.status === "ready" ? `
    <div class="ver-actions">
      <button class="btn small primary" data-act="play" data-id="${v.id}" data-title="${esc(title)}">▶ Escuchar</button>
      <span class="dl-label">Bajar:</span>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="flac" title="Calidad original, sin pérdida">FLAC</button>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="wav" title="Calidad original, sin comprimir">WAV</button>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="mp3" title="Liviano, para el celular">MP3</button>
    </div>` : "";
  return `
    <li class="ver">
      <div class="ver-top">
        <span class="badge ${esc(v.kind)}">${esc(KIND[v.kind] || v.kind)}</span>
        <strong class="grow">${esc(v.label)}</strong>
        <button class="icon-btn" data-act="del-ver" data-id="${v.id}" aria-label="Borrar ${esc(title)}" title="Borrar esta versión">🗑</button>
      </div>
      <div style="margin-top:.25rem">${info} <span class="muted small">· ${esc(v.created_by || "")}</span></div>
      ${expires}${actions}
    </li>`;
}

async function onTrackClick(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const id = Number(btn.dataset.id);
  const nav = state.nav;
  try {
    switch (btn.dataset.act) {
      case "play": return playVersion(id, btn.dataset.title);
      case "dl": return download(id, btn.dataset.fmt);
      case "master": return openMasterModal(id);
      case "del-track": {
        const t = state.tracks.get(id);
        if (!confirm(`¿Borrar "${t ? t.title : "el tema"}" con todas sus versiones? No se puede deshacer.`)) return;
        await api(`/tracks/${id}`, { method: "DELETE" });
        stopPlayer();
        toast("Tema borrado", "ok");
        return refreshBand(state.bandId, nav);
      }
      case "del-ver": {
        if (!confirm("¿Borrar esta versión? No se puede deshacer.")) return;
        await api(`/versions/${id}`, { method: "DELETE" });
        stopPlayer();
        toast("Versión borrada", "ok");
        return refreshBand(state.bandId, nav);
      }
    }
  } catch (e) { toast(e.message, "err"); }
}

function setupUploadForm(bandId, nav) {
  const form = $("#up"), drop = $("#drop"), file = $("#file"), picked = $("#picked"), send = $("#send");
  let files = [];
  const mode = () => form.elements.mode.value;

  function showPicked() {
    picked.textContent = files.length
      ? files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(" · ")
      : "";
    send.disabled = !files.length;
  }
  function take(list) {
    files = Array.from(list || []);
    if (mode() !== "stems") files = files.slice(0, 1);
    if (files.length && !$("#title").value.trim() && mode() !== "stems") {
      $("#title").value = files[0].name.replace(/\.[^.]+$/, "");
    }
    showPicked();
  }
  $$('input[name="mode"]', form).forEach((r) => r.addEventListener("change", () => {
    file.multiple = mode() === "stems";
    take(files);
  }));
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
  file.addEventListener("change", () => take(file.files));
  ["dragenter", "dragover"].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => take(e.dataTransfer.files));

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!files.length) return;
    const title = $("#title").value.trim();
    if (mode() === "stems" && !title) { toast("Poné el nombre del tema para agrupar las pistas.", "err"); $("#title").focus(); return; }
    const fd = new FormData();
    fd.append("title", title);
    fd.append("mode", mode());
    files.forEach((f) => fd.append("files", f));
    const prog = $("#prog"), bar = $("i", prog), msg = $("#upmsg");
    send.disabled = true;
    prog.classList.remove("hidden");
    msg.classList.remove("hidden");
    msg.textContent = "Subiendo… no cierres esta pantalla.";
    try {
      await uploadWithProgress(`/bands/${bandId}/tracks`, fd, (p) => {
        bar.style.width = Math.round(p * 100) + "%";
        if (p >= 1) msg.textContent = "Subido. Guardando…";
      });
      toast("Listo. Lo estamos convirtiendo, aparece abajo.", "ok");
      files = []; file.value = ""; $("#title").value = ""; showPicked();
      await refreshBand(bandId, nav);
    } catch (e) { toast(e.message, "err"); send.disabled = !files.length; }
    finally { prog.classList.add("hidden"); msg.classList.add("hidden"); bar.style.width = "0"; }
  });
}

/* ===================== masterizar ===================== */
async function openMasterModal(trackId) {
  const track = state.tracks.get(trackId);
  if (!track) return;
  const nav = state.nav;
  let genres, refs;
  try { [genres, refs] = await Promise.all([getGenres(), api("/references")]); }
  catch (e) { return toast(e.message, "err"); }

  const hasStems = track.versions.some((v) => v.kind === "stem" && v.status === "ready");
  const hasMix = track.versions.some((v) => v.kind === "mix" && v.status === "ready");
  const sourceNote = hasMix ? "Se masteriza la mezcla del tema."
    : hasStems ? "Se suman las pistas separadas y se masteriza el resultado."
    : "Se masteriza el ensayo completo.";
  const opts = (list, sel) => list.map((g) => `<option value="${g.id}" ${g.id === sel ? "selected" : ""}>${esc(g.name)}</option>`).join("");

  openModal(`
    <form id="mf" class="stack">
      <h2>Masterizar "${esc(track.title)}"</h2>
      <p class="muted small">${sourceNote} Vas a tener una versión nueva, la original no se toca.</p>
      <div class="seg" role="radiogroup" aria-label="Cómo masterizar">
        <label><input type="radio" name="how" value="genre" checked>🎛 Por estilo<span class="hint">Volumen típico del género</span></label>
        <label><input type="radio" name="how" value="ref">🎯 Imitar una referencia<span class="hint">Que suene como otro tema</span></label>
      </div>
      <div id="by-genre" class="field"><label for="g">Estilo</label>
        <select id="g">${genres.map((g) => `<option value="${g.id}">${esc(g.name)} (${g.target_lufs} LUFS)</option>`).join("")}</select></div>
      <div id="by-ref" hidden>
        <div class="field"><label for="rg">Estilo de la referencia</label><select id="rg">${opts(genres, genres[0]?.id)}</select></div>
        <div class="field"><label for="r">Referencia</label><select id="r"></select></div>
        <p class="small muted hidden" id="no-refs">Todavía no hay referencias de este estilo. Cargá una en la sección Referencias.</p>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn" id="mc">Cancelar</button>
        <button class="btn primary" id="mgo">Masterizar</button>
      </div>
    </form>`, (m) => {
    const form = $("#mf", m), how = () => form.elements.how.value;
    const fillRefs = () => {
      const gid = Number($("#rg", m).value);
      const list = refs.filter((r) => r.genre_id === gid);
      $("#r", m).innerHTML = list.map((r) => `<option value="${r.id}">${esc(r.name)}${r.scope === "band" ? " (de la banda)" : ""}</option>`).join("");
      $("#no-refs", m).classList.toggle("hidden", list.length > 0);
      sync();
    };
    const sync = () => {
      const byRef = how() === "ref";
      $("#by-genre", m).hidden = byRef;
      $("#by-ref", m).hidden = !byRef;
      $("#mgo", m).disabled = byRef && !$("#r", m).value;
    };
    $$('input[name="how"]', m).forEach((r) => r.addEventListener("change", sync));
    $("#rg", m).addEventListener("change", fillRefs);
    $("#mc", m).addEventListener("click", closeModal);
    fillRefs();
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const json = how() === "ref" ? { reference_id: Number($("#r", m).value) } : { genre_id: Number($("#g", m).value) };
      await withBusy($("#mgo", m), async () => {
        try {
          await api(`/tracks/${trackId}/master`, { method: "POST", json });
          closeModal();
          toast("En cola. La versión master aparece en el tema cuando termina.", "ok");
          await refreshBand(state.bandId, nav);
        } catch (e) { toast(e.message, "err"); }
      });
    });
  });
}

/* ===================== referencias ===================== */
async function viewRefs(nav) {
  const [genres, refs] = await Promise.all([getGenres(true), api("/references")]);
  if (nav !== state.nav) return;
  const me = state.me;
  const byGenre = genres.map((g) => ({ g, list: refs.filter((r) => r.genre_id === g.id) })).filter((x) => x.list.length);
  const scopes = [
    ...(me.is_super ? [`<option value="">Global (todas las bandas)</option>`] : []),
    ...me.bands.map((b) => `<option value="${b.id}">Solo ${esc(b.name)}</option>`),
  ];
  setApp(`
    <h1>Referencias</h1>
    <div class="callout" style="margin-bottom:1rem">Una referencia es un tema que te gusta cómo suena. Al masterizar, la app lleva tu mezcla hacia ese volumen y ese carácter.
      Solo se guarda un fragmento de 1 minuto y medio, y <strong>nadie puede escucharlo ni bajarlo</strong>: se usa únicamente para masterizar.</div>
    ${byGenre.length ? byGenre.map(({ g, list }) => `
      <section class="card"><h2>${esc(g.name)}</h2>
        <ul style="list-style:none;margin:0;padding:0">${list.map((r) => `
          <li class="row between" style="padding:.4rem 0;border-bottom:1px solid var(--line)">
            <span>${esc(r.name)} <span class="badge">${r.scope === "global" ? "global" : "banda"}</span></span>
            ${me.is_super || r.mine ? `<button class="icon-btn" data-del="${r.id}" aria-label="Borrar la referencia ${esc(r.name)}" title="Borrar">🗑</button>` : ""}
          </li>`).join("")}</ul></section>`).join("")
      : `<div class="card empty"><span class="big">🎯</span>Todavía no hay referencias. Cargá la primera abajo.</div>`}
    <section class="card"><h2>Cargar una referencia</h2>
      <form id="rf" class="stack">
        <div class="field" style="margin:0"><label for="rgen">Estilo</label><select id="rgen" required>${genres.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="field" style="margin:0"><label for="rname">Nombre (ej: "Kyuss - Green Machine")</label><input id="rname" type="text" maxlength="160" required></div>
        <div class="field" style="margin:0"><label for="rscope">Quién la puede usar</label><select id="rscope">${scopes.join("")}</select></div>
        <div class="field" style="margin:0"><label for="rfile">Archivo de audio (mejor WAV o FLAC)</label><input id="rfile" type="file" accept="audio/*,.wav,.flac,.mp3,.m4a" required></div>
        <div class="progress hidden" id="rprog" role="progressbar" aria-label="Progreso"><i></i></div>
        <button class="btn primary block">Cargar</button>
      </form></section>`);

  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("¿Borrar esta referencia?")) return;
    try { await api(`/references/${b.dataset.del}`, { method: "DELETE" }); toast("Referencia borrada", "ok"); viewRefs(nav); }
    catch (e) { toast(e.message, "err"); }
  }));
  $("#rf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = $("#rfile").files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("genre_id", $("#rgen").value);
    fd.append("name", $("#rname").value.trim());
    if ($("#rscope").value) fd.append("band_id", $("#rscope").value);
    fd.append("file", f);
    const prog = $("#rprog"), bar = $("i", prog);
    prog.classList.remove("hidden");
    await withBusy($("button", ev.target), async () => {
      try {
        await uploadWithProgress("/references", fd, (p) => { bar.style.width = Math.round(p * 100) + "%"; });
        toast("Referencia cargada", "ok");
        await viewRefs(nav);
      } catch (e) { toast(e.message, "err"); prog.classList.add("hidden"); }
    });
  });
}

/* ===================== admin ===================== */
async function viewAdmin(nav) {
  if (!state.me.is_super) { location.hash = "#/"; return; }
  const [bands, genres] = await Promise.all([api("/admin/bands"), getGenres(true)]);
  if (nav !== state.nav) return;
  const roleName = (r) => (r === "admin" ? "Admin de banda" : "Integrante");

  setApp(`
    <h1>Administración</h1>

    <section class="card"><h2>Invitar a alguien</h2>
      ${bands.length ? `
      <form id="inv" class="stack">
        <div class="field" style="margin:0"><label for="ib">Banda</label><select id="ib">${bands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
        <div class="field" style="margin:0"><label for="ie">Email de la persona</label><input id="ie" type="email" required></div>
        <div class="field" style="margin:0"><label for="ir">Rol</label><select id="ir"><option value="member">Integrante</option><option value="admin">Admin de la banda</option></select></div>
        <button class="btn primary">Crear invitación</button>
      </form>
      <div id="invout" class="stack hidden" style="margin-top:1rem"></div>` : `<p class="muted">Primero creá una banda.</p>`}
    </section>

    <section class="card"><h2>Bandas</h2>
      ${bands.map((b) => {
        const pct = Math.min(100, (b.used_gb / b.quota_gb) * 100 || 0);
        return `<div style="margin-bottom:1.2rem"><h3>${esc(b.name)}</h3>
          <div class="small muted row between"><span>Espacio</span><span>${fmtGB(b.used_gb)} de ${esc(b.quota_gb)} GB</span></div>
          <div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
          ${b.members.length ? `<table class="table" style="margin-top:.5rem"><tbody>${b.members.map((m) => `
            <tr><td>${esc(m.name || "—")}<div class="small muted">${esc(m.email)}</div></td><td class="small muted">${roleName(m.role)}</td>
            <td style="text-align:right"><button class="icon-btn" data-rm="${b.id}:${m.user_id}" aria-label="Sacar a ${esc(m.name || m.email)} de ${esc(b.name)}" title="Sacar de la banda">✕</button></td></tr>`).join("")}</tbody></table>`
            : `<p class="small muted" style="margin-top:.5rem">Sin integrantes todavía.</p>`}</div>`;
      }).join("") || `<p class="muted">Todavía no hay bandas.</p>`}
      <form id="nb" class="row" style="margin-top:.5rem">
        <input id="nbn" type="text" maxlength="120" placeholder="Nombre de la banda nueva" aria-label="Nombre de la banda nueva" required class="grow">
        <button class="btn">Crear banda</button>
      </form>
    </section>

    <section class="card"><h2>Estilos</h2>
      <p class="small muted">El volumen objetivo se mide en LUFS: cuanto más cerca de 0, más fuerte. Se usa al masterizar "por estilo".</p>
      <table class="table"><thead><tr><th>Estilo</th><th>LUFS</th><th></th></tr></thead><tbody>
      ${genres.map((g) => `<tr data-g="${g.id}">
        <td><input type="text" data-f="name" value="${esc(g.name)}" aria-label="Nombre del estilo" maxlength="60"></td>
        <td style="width:90px"><input type="number" data-f="lufs" value="${g.target_lufs}" step="0.5" min="-24" max="-6" aria-label="LUFS de ${esc(g.name)}"></td>
        <td style="white-space:nowrap"><button class="btn small" data-gsave="${g.id}">Guardar</button> <button class="icon-btn" data-gdel="${g.id}" aria-label="Borrar estilo ${esc(g.name)}">🗑</button></td></tr>`).join("")}
      </tbody></table>
      <form id="ng" class="row" style="margin-top:.75rem">
        <input id="ngn" type="text" maxlength="60" placeholder="Estilo nuevo" aria-label="Nombre del estilo nuevo" required class="grow">
        <input id="ngl" type="number" value="-12" step="0.5" min="-24" max="-6" aria-label="LUFS del estilo nuevo" style="width:90px">
        <button class="btn">Agregar</button>
      </form>
    </section>`);

  const reload = () => viewAdmin(nav);
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, "err"); } };

  const inv = $("#inv");
  if (inv) inv.addEventListener("submit", guard(async (ev) => {
    ev.preventDefault();
    const email = $("#ie").value.trim();
    const r = await api("/admin/invites", { method: "POST", json: { email, band_id: Number($("#ib").value), role: $("#ir").value } });
    const link = `${location.origin}/#/invite/${r.invite_token}`;
    const bandName = bands.find((b) => String(b.id) === $("#ib").value)?.name || "";
    const wa = `https://wa.me/?text=${encodeURIComponent(`Te invité a la banda "${bandName}" en Diablo Master. Entrá acá y creá tu cuenta: ${link}`)}`;
    const out = $("#invout");
    out.classList.remove("hidden");
    out.innerHTML = `<p>Listo. Pasale este link a <strong>${esc(email)}</strong> (sirve una sola vez y vence en ${esc(r.expires_in_days)} días):</p>
      <div class="copybox"><span class="grow">${esc(link)}</span><button type="button" class="btn small" id="cp">Copiar</button></div>
      <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>`;
    $("#cp").addEventListener("click", () => copyText(link));
  }));

  $("#nb").addEventListener("submit", guard(async (ev) => {
    ev.preventDefault();
    await api("/admin/bands", { method: "POST", json: { name: $("#nbn").value } });
    state.me = await api("/me");
    toast("Banda creada", "ok");
    reload();
  }));
  $$("[data-rm]").forEach((b) => b.addEventListener("click", guard(async () => {
    const [bid, uid] = b.dataset.rm.split(":");
    if (!confirm("¿Sacar a esta persona de la banda? Deja de ver sus temas.")) return;
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "DELETE" });
    toast("Listo", "ok");
    reload();
  })));
  $$("[data-gsave]").forEach((b) => b.addEventListener("click", guard(async () => {
    const row = b.closest("tr");
    await api(`/admin/genres/${b.dataset.gsave}`, {
      method: "PUT", json: { name: $('[data-f="name"]', row).value, target_lufs: Number($('[data-f="lufs"]', row).value) },
    });
    state.genres = null;
    toast("Estilo guardado", "ok");
  })));
  $$("[data-gdel]").forEach((b) => b.addEventListener("click", guard(async () => {
    if (!confirm("¿Borrar este estilo?")) return;
    await api(`/admin/genres/${b.dataset.gdel}`, { method: "DELETE" });
    state.genres = null;
    reload();
  })));
  $("#ng").addEventListener("submit", guard(async (ev) => {
    ev.preventDefault();
    await api("/admin/genres", { method: "POST", json: { name: $("#ngn").value, target_lufs: Number($("#ngl").value) } });
    state.genres = null;
    reload();
  }));
}

/* ===================== cuenta ===================== */
async function viewAccount(nav) {
  const tokens = await api("/me/api-tokens");
  if (nav !== state.nav) return;
  const me = state.me;
  setApp(`
    <h1>Tu cuenta</h1>
    <section class="card">
      <p><strong>${esc(me.name || "—")}</strong><br><span class="muted">${esc(me.email)}</span></p>
      <button class="btn" id="out">Cerrar sesión</button>
    </section>
    <section class="card"><h2>Conexión con Reaper</h2>
      <p class="muted">Para subir tus renders directo desde Reaper hace falta un token personal. Es como una contraseña: no se lo des a nadie.</p>
      <div id="newtok" class="hidden stack" style="margin-bottom:1rem"></div>
      <form id="tf" class="row"><input id="tl" type="text" maxlength="80" value="Reaper de mi compu" aria-label="Nombre del token" class="grow"><button class="btn primary">Crear token</button></form>
      ${tokens.length ? `<table class="table" style="margin-top:.75rem"><tbody>${tokens.map((t) => `
        <tr><td>${esc(t.label)}<div class="small muted">Creado ${fmtDate(t.created_at)}${t.last_used_at ? " · último uso " + fmtDate(t.last_used_at) : " · sin usar"}</div></td>
        <td style="text-align:right"><button class="btn small danger" data-rev="${t.id}">Revocar</button></td></tr>`).join("")}</tbody></table>` : ""}
    </section>`);

  $("#out").addEventListener("click", () => logout(false));
  $("#tf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const r = await api("/me/api-tokens", { method: "POST", json: { label: $("#tl").value || "reaper" } });
      const box = $("#newtok");
      box.classList.remove("hidden");
      box.innerHTML = `<div class="callout">Copialo ahora: <strong>no se vuelve a mostrar</strong>.</div>
        <div class="copybox"><span class="grow">${esc(r.token)}</span><button type="button" class="btn small" id="cpt">Copiar</button></div>`;
      $("#cpt").addEventListener("click", () => copyText(r.token));
    } catch (e) { toast(e.message, "err"); }
  });
  $$("[data-rev]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("¿Revocar este token? El script que lo use deja de funcionar.")) return;
    try { await api(`/me/api-tokens/${b.dataset.rev}`, { method: "DELETE" }); toast("Token revocado", "ok"); viewAccount(nav); }
    catch (e) { toast(e.message, "err"); }
  }));
}

/* ===================== arranque ===================== */
$("#player-close").addEventListener("click", stopPlayer);
$("#audio").addEventListener("error", () => {
  if ($("#audio").getAttribute("src")) toast("No se pudo reproducir. Probá de nuevo con ▶ Escuchar.", "err");
});
$("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) closeModal(); });
$("#modal").addEventListener("close", () => { $("#modal").innerHTML = ""; });
router();
