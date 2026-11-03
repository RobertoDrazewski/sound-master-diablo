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
const pref = {
  get(k) { try { return localStorage.getItem("dm_" + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("dm_" + k, v); } catch { /* sin storage */ } },
};

const state = {
  me: null, genres: null, timer: null, nav: 0, notif: null, notifTimer: null,
  tracks: new Map(), albums: [], refresh: null, bandId: null,
  openAssist: new Set(), assistCache: new Map(), cal: null,
};

const parseDate = (iso) => new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z");
const fmtDate = (iso) =>
  parseDate(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso) => parseDate(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
const fmtTime = (iso) => parseDate(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function fmtDur(s) {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = pad2(s % 60);
  return h ? `${h}:${pad2(m)}:${sec}` : `${m}:${sec}`;
}
function fmtSize(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  return Math.max(1, Math.round(b / 1e3)) + " KB";
}
const fmtGB = (g) => (g < 1 ? g.toFixed(2) : g.toFixed(1));

const ICONS = {
  play: '<path d="M7 4l13 8-13 8z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  rocket: '<path d="M12 3c3.2 2.2 5 5.3 5 9l-2 3.5H9L7 12c0-3.7 1.8-6.8 5-9zM9 15.5 7 20l3.2-1.2M15 15.5l2 4.5-3.2-1.2M12 8.5v.01"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.4 3.4 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.5 4-6.5 8-6.5s7.2 2 8 6.5"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

function avatar(photo, name, cls = "") {
  return photo
    ? `<img class="avatar ${cls}" src="${esc(photo)}" alt="">`
    : `<span class="avatar ${cls}" aria-hidden="true">${esc((name || "?").trim().charAt(0).toUpperCase())}</span>`;
}

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
function uploadWithProgress(url, form, onProgress, method = "POST") {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
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
// Cloudflare corta los envios de mas de 100 MB: lo grande se manda en partes de 50 MB y se arma en el servidor.
const BIG_FILE = 90 * 1024 * 1024, PART_SIZE = 50 * 1024 * 1024;
async function chunkUpload(file, onProgress) {
  const uid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const parts = Math.ceil(file.size / PART_SIZE);
  for (let i = 0; i < parts; i++) {
    const blob = file.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
    let ok = false, last = null;
    for (let t = 0; t < 3 && !ok; t++) {
      try { await uploadWithProgress(`/uploads/${uid}/${i}`, blob, (p) => onProgress((i + p) / parts), "PUT"); ok = true; }
      catch (e) { last = e; if (e.status && e.status < 500) throw e; }
    }
    if (!ok) throw last;
  }
  return { upload_id: uid, filename: file.name, parts };
}
// Sube un tema (uno o varios archivos si son pistas). Devuelve cuando el servidor ya lo recibio.
async function sendTrack(bandId, { title, mode, section, session, files }, onProgress) {
  const base = { title, mode, section, session: session || "" };
  if (files.every((f) => f.size <= BIG_FILE)) {
    const fd = new FormData();
    Object.entries(base).forEach(([k, v]) => fd.append(k, v));
    files.forEach((f) => fd.append("files", f));
    return uploadWithProgress(`/bands/${bandId}/tracks`, fd, onProgress);
  }
  const items = [];
  for (let i = 0; i < files.length; i++) items.push(await chunkUpload(files[i], (p) => onProgress((i + p) / files.length)));
  const fd = new FormData();
  Object.entries(base).forEach(([k, v]) => fd.append(k, v));
  fd.append("items", JSON.stringify(items));
  return uploadWithProgress(`/bands/${bandId}/tracks/chunked`, fd, () => {});
}
function logout(expired = false) {
  session.token = null;
  state.me = null; state.genres = null; state.notif = null;
  clearInterval(state.notifTimer); state.notifTimer = null;
  stopPlayer();
  closeNotif();
  if (expired) toast("Tu sesión venció. Entrá de nuevo.", "err");
  if (location.hash === "#/login") router(); else location.hash = "#/login";
}
async function getGenres(force = false) {
  if (force || !state.genres) state.genres = await api("/genres");
  return state.genres;
}
function pickImage(onFile) {
  // En iPhone el input tiene que estar dentro de la pagina o el navegador lo descarta antes de elegir la foto.
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  const done = () => setTimeout(() => inp.remove(), 60000);
  inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; inp.remove(); if (f) onFile(f); });
  document.body.appendChild(inp);
  inp.click();
  done();
}
// Achica la foto en el telefono antes de subirla (las fotos del iPhone pesan mucho).
async function shrinkImage(file, max = 1280) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
}
async function sendPhoto(url, file) {
  toast("Subiendo foto…");
  const fd = new FormData();
  fd.append("file", await shrinkImage(file));
  try {
    await uploadWithProgress(url, fd, () => {});
    state.me = await api("/me");
    toast("Foto actualizada", "ok");
    router();
  } catch (e) { toast(e.message || "No se pudo subir la foto", "err"); }
}

/* ===================== estructura de pantalla ===================== */
function setPublic(isPublic) {
  document.body.classList.toggle("public", isPublic);
  $("#topbar").hidden = isPublic;
  $("#side").hidden = isPublic;
  if (isPublic) { $("#tabbar").hidden = true; document.body.classList.remove("has-tabbar", "drawer-open"); }
}
function setApp(html) {
  $("#app").innerHTML = html;
  window.scrollTo(0, 0);
}
function showError(e) {
  setApp(`<div class="card"><h2>No se pudo cargar</h2><p class="muted">${esc(e.message || e)}</p>
    <button class="btn" id="retry">Reintentar</button></div>`);
  $("#retry").addEventListener("click", router);
}
function notFound() {
  setApp(`<div class="card empty">${ic("target")}No encontramos lo que buscás.<br><a href="#/">Volver al inicio</a></div>`);
}
function openModal(html, setup) {
  const m = $("#modal");
  m.innerHTML = html;
  if (setup) setup(m);
  if (!m.open) m.showModal();
}
function closeModal() { const m = $("#modal"); if (m.open) m.close(); }

const TOOLS = [
  ["ensayos", "Ensayos", "mic", "Grabá y guardá los ensayos"],
  ["produccion", "Producción", "music", "Trabajá tus temas antes del master"],
  ["master", "Master", "sliders", "Dejá el tema listo para publicar"],
  ["albumes", "Álbumes", "disc", "Armá el disco con su tapa"],
  ["lanzamiento", "Lanzamiento", "rocket", "Todo listo para Spotify, Bandcamp o vinilo"],
  ["calendario", "Calendario", "calendar", "Ensayos y shows con aviso"],
  ["integrantes", "Integrantes", "users", "Quiénes están en la banda"],
];
function currentBand() {
  const bands = state.me ? state.me.bands : [];
  return bands.find((b) => String(b.id) === String(state.bandId)) || bands[0] || null;
}
function closeDrawer() { document.body.classList.remove("drawer-open"); const m = $("#menu"); if (m) m.setAttribute("aria-expanded", "false"); }

function renderShell(active) {
  setPublic(false);
  const me = state.me;
  const unread = state.notif ? state.notif.unread : 0;
  $("#topbar").innerHTML = `
    <button class="icon-btn menu-btn" id="menu" aria-label="Menú" aria-expanded="false">${ic("menu")}</button>
    <a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">diablomastermix.com.ar</span></a>
    <div class="top-actions">
      <button class="bell" id="bell" aria-label="Avisos" aria-expanded="false">${ic("bell")}${unread ? `<span class="badge-n">${unread > 9 ? "9+" : unread}</span>` : ""}</button>
      <a class="me-chip" href="#/account" aria-label="Tu cuenta">${avatar(me.photo, me.name || me.email)}<span class="me-name">${esc(me.name || me.email)}</span></a>
    </div>`;
  $("#bell").addEventListener("click", (e) => { e.stopPropagation(); toggleNotif(); });
  $("#menu").addEventListener("click", () => {
    const open = document.body.classList.toggle("drawer-open");
    $("#menu").setAttribute("aria-expanded", open ? "true" : "false");
  });

  const link = (hash, label, icon, on) =>
    `<a class="nav-link ${on ? "active" : ""}" href="${hash}" ${on ? 'aria-current="page"' : ""}>${ic(icon)}${label}</a>`;
  let h = link("#/", "Inicio", "home", active.key === "home");
  h += `<div class="side-group"><p class="side-title">Tus bandas</p>`;
  for (const b of me.bands) {
    const cur = String(active.bandId) === String(b.id);
    h += `<a class="nav-link band-link ${cur ? "active-band" : ""}" href="#/band/${b.id}/ensayos">${avatar(b.photo, b.name)}<span>${esc(b.name)}</span></a>`;
    if (cur) h += `<div class="side-tools">${TOOLS.map(([k, l, i]) => link(`#/band/${b.id}/${k}`, l, i, active.tool === k)).join("")}</div>`;
  }
  h += `</div><div class="side-sep"></div>`;
  h += link("#/reaper", "Conectar Reaper", "headphones", active.key === "reaper");
  h += link("#/refs", "Referencias", "target", active.key === "refs");
  if (me.is_super) h += link("#/admin", "Admin", "shield", active.key === "admin");
  h += link("#/account", "Tu cuenta", "user", active.key === "account");
  h += `<button type="button" class="nav-link nav-out" id="side-out">${ic("logout")}Cerrar sesión</button>`;
  $("#side").innerHTML = h;
  $("#side-out").addEventListener("click", () => logout(false));
  closeDrawer();
  const cb = currentBand();
  const tb = $("#tabbar");
  if (cb) {
    tb.innerHTML = TOOLS.slice(0, 5).map(([k, l, i]) =>
      `<a href="#/band/${cb.id}/${k}" class="${active.bandId != null && String(active.bandId) === String(cb.id) && active.tool === k ? "on" : ""}" aria-label="${l}">${ic(i)}<span>${l}</span></a>`).join("");
    tb.hidden = false;
  } else { tb.hidden = true; tb.innerHTML = ""; }
  document.body.classList.toggle("has-tabbar", !!cb);
}

/* ===================== avisos (campana) ===================== */
async function loadNotif() {
  try { state.notif = await api("/notifications"); updateBadge(); } catch { /* sin red: se reintenta */ }
}
function updateBadge() {
  const b = $("#bell");
  if (!b) return;
  const old = $(".badge-n", b);
  if (old) old.remove();
  const n = state.notif ? state.notif.unread : 0;
  if (n) b.insertAdjacentHTML("beforeend", `<span class="badge-n">${n > 9 ? "9+" : n}</span>`);
}
function startNotifPolling() {
  clearInterval(state.notifTimer);
  loadNotif();
  state.notifTimer = setInterval(() => { if (!document.hidden) loadNotif(); }, 60000);
}
function closeNotif() { const p = $("#notif"); if (p) { p.hidden = true; p.innerHTML = ""; } const b = $("#bell"); if (b) b.setAttribute("aria-expanded", "false"); }
async function toggleNotif() {
  const p = $("#notif");
  if (!p.hidden) return closeNotif();
  await loadNotif();
  const n = state.notif || { items: [], upcoming: [] };
  const up = n.upcoming.map((e) => `
    <a class="item" href="#/band/${e.band_id}/calendario"><strong>${esc(e.title)}</strong>
      <span class="when">${esc(e.band_name)} · ${fmtDate(e.starts_at)}${e.place ? " · " + esc(e.place) : ""}</span></a>`).join("");
  const items = n.items.map((i) => `
    <a class="item ${i.read ? "" : "unread"}" href="${esc(i.link || "#/")}">${esc(i.text)}<span class="when">${fmtDate(i.created_at)}</span></a>`).join("");
  p.innerHTML = `
    <h4>Próximos eventos</h4>${up || `<p class="muted small">No hay nada agendado para esta semana.</p>`}
    <h4 style="margin-top:.9rem">Novedades</h4>${items || `<p class="muted small">Sin novedades por ahora.</p>`}`;
  p.hidden = false;
  $("#bell").setAttribute("aria-expanded", "true");
  if (n.items.some((i) => !i.read)) {
    try { await api("/notifications/read", { method: "POST" }); n.unread = 0; updateBadge(); } catch { /* se marca la próxima */ }
  }
}
document.addEventListener("click", (e) => {
  const p = $("#notif");
  if (p && !p.hidden && !p.contains(e.target)) closeNotif();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNotif(); });

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
    a.href = url; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast(e.message, "err"); }
}

/* ===================== router ===================== */
function parseRoute() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  return { name: parts[0] || "home", arg: parts[1], sub: parts[2] };
}
async function router() {
  clearTimeout(state.timer);
  state.refresh = null;
  closeNotif();
  const nav = ++state.nav;
  const { name, arg, sub } = parseRoute();
  try {
    if (name === "invite") { setPublic(true); return viewInvite(arg); }
    if (!session.token) {
      setPublic(true);
      if (name === "login") return viewLogin();
      if (name === "home") return viewLanding();
      location.hash = "#/";
      return;
    }
    if (!state.me) state.me = await api("/me");
    if (nav !== state.nav) return;
    if (!state.notifTimer) startNotifPolling();
    if (name === "login") { location.hash = "#/"; return; }
    switch (name) {
      case "home": renderShell({ key: "home" }); return await viewHome(nav);
      case "band": return await viewBand(arg, sub, nav);
      case "refs": renderShell({ key: "refs" }); return await viewRefs(nav);
      case "reaper": renderShell({ key: "reaper" }); return await viewReaper(nav);
      case "admin": renderShell({ key: "admin" }); return await viewAdmin(nav);
      case "account": renderShell({ key: "account" }); return await viewAccount(nav);
      default: renderShell({ key: "" }); return notFound();
    }
  } catch (e) {
    if (nav === state.nav && !(e instanceof ApiError && e.status === 401)) showError(e);
  }
}
window.addEventListener("hashchange", router);

/* ===================== inicio público, login, invitación ===================== */
function viewLanding() {
  const tools = [
    ["mic", "Ensayos", "Grabá desde el celular, ponele nombre y la banda lo escucha y lo descarga."],
    ["music", "Producción", "Demos, tomas y mezclas ordenadas antes del master. Subí desde Reaper con un clic."],
    ["sliders", "Master", "Subí la mezcla, elegí un estilo de referencia y bajá la versión masterizada."],
    ["spark", "Asistente", "Analiza tu audio y te explica qué corregir, en palabras simples."],
    ["disc", "Álbumes", "Ordená los temas y creá la tapa con tu foto o con inteligencia artificial."],
    ["rocket", "Lanzamiento", "El álbum masterizado listo para Spotify, Bandcamp o para prensar un vinilo."],
    ["calendar", "Calendario", "Ensayos y shows con aviso automático a toda la banda."],
  ];
  setApp(`
    <section class="land">
      <header class="land-top">
        <a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">diablomastermix.com.ar</span></a>
        <a class="btn" href="#/login">Entrar</a>
      </header>
      <div class="land-hero">
        <h1>Diablo Master</h1>
        <p class="lead">De la sala de ensayo al master, sin productora.</p>
        <p class="sub">Grabá el ensayo en el celular, mezclalo en tu estudio, masterizalo en un clic y publicá el disco donde quieras. Todo el equipo de la banda en un solo lugar.</p>
        <div class="cta">
          <a class="btn primary big" href="#/login">Entrar</a>
          <span class="muted">¿Te invitaron? Abrí el link que te pasaron.</span>
        </div>
        <span class="chip-reaper">${ic("headphones")} Se conecta con REAPER</span>
      </div>
      <div class="land-tools" aria-label="Qué podés hacer">
        ${tools.map(([i, t, d]) => `<article class="land-tool"><h2>${ic(i)}${t}</h2><p>${d}</p></article>`).join("")}
      </div>
      <footer class="land-foot">
        <span class="mark"><img src="/logo-mark.png" alt="">© ${new Date().getFullYear()} Diablo Master · Propiedad de Puma Code</span>
        <span><a href="https://www.puma-code.com" target="_blank" rel="noopener">www.puma-code.com</a></span>
      </footer>
    </section>`);
}

function authShell(inner, artText) {
  return `<section class="auth-wrap">
    <div class="auth-art"><h2>${esc(artText)}</h2></div>
    <div class="auth-form">${inner}</div></section>`;
}
const AUTH_BRAND = `<a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">Diablo Master</span></a>`;

function viewLogin() {
  setApp(authShell(`
    <form id="f">
      ${AUTH_BRAND}
      <h1>Entrar</h1>
      <div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="pw">Contraseña</label><input id="pw" type="password" autocomplete="current-password" required></div>
      <button class="btn primary block big">Entrar</button>
      <p class="muted small" style="margin-top:1rem">¿Todavía no tenés cuenta? Pedile el link de invitación a quien administra la banda.</p>
      <p class="small"><a href="#/">← Volver al inicio</a></p>
    </form>`, "Tu banda, tus temas, un solo lugar."));
  $("#f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy($("button", ev.target), async () => {
      try {
        const r = await api("/auth/login", { method: "POST", json: { email: $("#email").value, password: $("#pw").value } });
        session.token = r.token;
        state.me = null;
        if (location.hash === "#/") router(); else location.hash = "#/";
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

async function viewInvite(token) {
  if (!token) { location.hash = "#/login"; return; }
  let info;
  try { info = await api(`/auth/invite-info?token=${encodeURIComponent(token)}`); }
  catch (e) {
    setApp(authShell(`<div>${AUTH_BRAND}<h1>Invitación no válida</h1>
      <p class="muted">${esc(e.message)}. Pedile a quien te invitó que te mande otra.</p>
      <a class="btn primary block big" href="#/login">Ir a entrar</a></div>`, "Entrá y sumate a tu banda."));
    return;
  }
  // ¿Ya está con la sesión abierta con ese mismo email? Entonces se suma con un toque.
  let me = null;
  if (session.token) {
    try {
      const r = await fetch("/me", { headers: { Authorization: "Bearer " + session.token } });
      me = r.ok ? await r.json() : null;
    } catch { me = null; }
  }
  if (info.exists && me && me.email && me.email.toLowerCase() === info.email.toLowerCase()) {
    setApp(authShell(`<div>${AUTH_BRAND}
      <h1>Te invitaron a ${esc(info.band)}</h1>
      <p class="muted">Vas a sumar esta banda a tu cuenta (${esc(info.email)}). Tus otras bandas siguen igual.</p>
      <button class="btn primary block big" id="join">Sumarme a ${esc(info.band)}</button></div>`, "Entrá y sumate a tu banda."));
    $("#join").addEventListener("click", async (ev) => {
      await withBusy(ev.currentTarget, async () => {
        try {
          const r = await api("/auth/accept-invite-session", { method: "POST", json: { token } });
          state.me = null;
          location.hash = `#/band/${r.band_id}/ensayos`;
        } catch (e) { toast(e.message, "err"); }
      });
    });
    return;
  }
  const nuevo = !info.exists;
  setApp(authShell(`
    <form id="f">
      ${AUTH_BRAND}
      <h1>Te invitaron a ${esc(info.band)}</h1>
      ${nuevo
        ? `<p class="muted">Creá tu cuenta con <strong>${esc(info.email)}</strong>. Elegí tu nombre y una contraseña.</p>
           <div class="field"><label for="name">Tu nombre</label><input id="name" type="text" autocomplete="off" maxlength="120" required></div>
           <div class="field"><label for="pw">Contraseña (mínimo 10 caracteres)</label><input id="pw" type="password" autocomplete="new-password" minlength="10" required></div>
           <button class="btn primary block big">Crear cuenta y entrar</button>`
        : `<p class="muted"><strong>${esc(info.email)}</strong> ya tiene cuenta en Diablo Master. Poné la contraseña de esa cuenta y esta banda se suma a las que ya tenés.</p>
           <div class="field"><label for="pw">Tu contraseña de siempre</label><input id="pw" type="password" autocomplete="off" required></div>
           <button class="btn primary block big">Sumarme a ${esc(info.band)}</button>
           <p class="muted small" style="margin-top:1rem">Si estás con otra cuenta abierta en este navegador, cerrá sesión primero o abrí el link en una ventana privada.</p>`}
    </form>`, "Entrá y sumate a tu banda."));
  $("#f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy($("button", ev.target), async () => {
      try {
        const r = await api("/auth/accept-invite", {
          method: "POST", json: { token, name: nuevo ? $("#name").value.trim() : "", password: $("#pw").value },
        });
        session.token = r.token;
        state.me = null;
        location.hash = "#/";
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

/* ===================== inicio de la app ===================== */
function isStandalone() {
  return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}
function installCard() {
  if (isStandalone()) return "";
  const ua = navigator.userAgent || "";
  let how;
  if (state.installEvt) how = `<button class="btn primary" id="do-install">${ic("download")} Instalar la app</button>`;
  else if (/iPhone|iPad|iPod/i.test(ua)) how = `<p class="muted" style="margin:0">En Safari tocá el botón <strong>Compartir</strong> y después <strong>Agregar a inicio</strong>.</p>`;
  else if (/Android/i.test(ua)) how = `<p class="muted" style="margin:0">En Chrome abrí el menú <strong>⋮</strong> y tocá <strong>Instalar app</strong> (o <strong>Agregar a la pantalla principal</strong>).</p>`;
  else return "";
  return `<section class="card install"><div class="row"><span class="ico-lg">${ic("phone")}</span>
    <div class="grow"><h3 style="margin:0">Llevala en el celular</h3>
    <p class="muted small" style="margin:.15rem 0 .6rem">Instalala como app: queda el ícono en tu pantalla y se abre sin barra del navegador.</p>${how}</div></div></section>`;
}
function wireInstall() {
  const b = $("#do-install");
  if (!b) return;
  b.addEventListener("click", async () => {
    const e = state.installEvt;
    if (!e) return;
    e.prompt();
    try { await e.userChoice; } catch { /* sin respuesta */ }
    state.installEvt = null;
    router();
  });
}

async function viewHome(nav) {
  const bands = state.me.bands;
  if (!state.notif) await loadNotif();
  if (nav !== state.nav) return;
  const up = (state.notif && state.notif.upcoming) || [];
  const first = (state.me.name || "").trim().split(/\s+/)[0];
  let html = `<div class="page-head"><div class="grow"><h1>${first ? "Hola, " + esc(first) : "Inicio"}</h1>
    <p class="lead">Elegí qué querés hacer con tu banda.</p></div>
    ${state.me.is_super ? `<a class="btn primary" href="#/admin">${ic("shield")} Administración</a>` : ""}</div>`;
  if (!bands.length) {
    html += `<div class="card empty">${ic("mic")}Todavía no estás en ninguna banda.<br>${
      state.me.is_super ? `Creala desde <a href="#/admin">Administración</a>.` : "Pedile una invitación a quien administra la app."}</div>`;
  }
  for (const b of bands) {
    html += `<section class="card band-card">
      <div class="row" style="gap:1rem">
        <div class="band-photo" style="width:64px;height:64px">${b.photo ? `<img src="${esc(b.photo)}" alt="">` : `<img src="/img/banda-sin-foto.jpg" alt="">`}</div>
        <div class="grow"><h2 style="margin:0">${esc(b.name)}</h2><p class="muted small" style="margin:0">${b.role === "admin" ? "Administrás esta banda" : "Integrante"}</p></div>
        <a class="btn primary big rec-cta" href="#/band/${b.id}/ensayos">${ic("mic")} Grabar ensayo</a>
      </div>
      <div class="tool-grid">${TOOLS.slice(0, 6).map(([k, l, i, d]) =>
        `<a class="tool-tile" href="#/band/${b.id}/${k}">${ic(i)}<strong>${l}</strong><span>${d}</span></a>`).join("")}</div>
    </section>`;
  }
  if (up.length) {
    html += `<section class="card"><h2>Próximos eventos</h2><ul class="upcoming">${up.map((e) => {
      const d = parseDate(e.starts_at);
      return `<li><div class="date-chip"><b>${d.getDate()}</b><span>${d.toLocaleDateString("es-AR", { month: "short" })}</span></div>
        <div class="grow"><strong>${esc(e.title)}</strong><div class="muted small">${esc(e.band_name)} · ${fmtTime(e.starts_at)}${e.place ? " · " + esc(e.place) : ""}</div></div>
        <a class="btn small" href="#/band/${e.band_id}/calendario">Ver</a></li>`;
    }).join("")}</ul></section>`;
  }
  html += installCard();
  setApp(html);
  wireInstall();
}

/* ===================== banda: estructura común ===================== */
async function viewBand(id, sub, nav) {
  const band = state.me.bands.find((b) => String(b.id) === String(id));
  const tool = sub || "ensayos";
  renderShell({ key: "band", bandId: id, tool });
  if (!band) return notFound();
  state.bandId = band.id;
  switch (tool) {
    case "ensayos": return await viewEnsayos(band, nav);
    case "produccion": return await viewProduccion(band, nav);
    case "master": return await viewMaster(band, nav);
    case "albumes": return await viewAlbums(band, nav);
    case "lanzamiento": return await viewRelease(band, nav);
    case "calendario": return await viewCalendar(band, nav);
    case "integrantes": return await viewMembers(band, nav);
    default: return notFound();
  }
}

function bandHead(band, title, lead) {
  const canEdit = !!band.role || state.me.is_super;
  return `<div class="page-head">
    <div class="band-photo" id="bphoto">${band.photo ? `<img src="${esc(band.photo)}" alt="Foto de ${esc(band.name)}">` : `<img src="/img/banda-sin-foto.jpg" alt="">`}
      ${canEdit ? `<button type="button" id="bphoto-btn" aria-label="Cambiar la foto de la banda" title="Cambiar la foto de la banda">${ic("camera")}</button>` : ""}</div>
    <div class="grow"><p class="muted small" style="margin:0">${esc(band.name)}</p><h1 style="margin:0">${esc(title)}</h1>
    ${lead ? `<p class="lead" style="margin-top:.4rem">${esc(lead)}</p>` : ""}</div></div>`;
}
function wireBandHead(band) {
  const b = $("#bphoto-btn");
  if (b) b.addEventListener("click", () => pickImage((f) => sendPhoto(`/bands/${band.id}/photo`, f)));
}
function paintUsage(data) {
  const pct = Math.min(100, (data.used_gb / data.quota_gb) * 100 || 0);
  const el = $("#usage");
  if (!el) return;
  el.innerHTML = `
    <div class="small muted row between"><span>Espacio de la banda</span><span>${fmtGB(data.used_gb)} de ${esc(data.quota_gb)} GB</span></div>
    <div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}" role="progressbar" aria-label="Espacio usado"
      aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;
}
function makeLive(nav, fetchFn, paintFn) {
  const busy = (d) => (d.tracks || []).some((t) => t.versions.some((v) => v.status === "processing"));
  const schedule = (d) => {
    clearTimeout(state.timer);
    if (!busy(d)) return;
    state.timer = setTimeout(async () => {
      if (nav !== state.nav) return;
      try { await run(); } catch { state.timer = setTimeout(() => schedule(d), 6000); }
    }, 3000);
  };
  const run = async () => {
    const d = await fetchFn();
    if (nav !== state.nav) return;
    paintFn(d);
    schedule(d);
  };
  state.refresh = run;
  return run;
}
function setupDrop(drop, input, onFiles) {
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => onFiles(Array.from(input.files)));
  ["dragenter", "dragover"].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => onFiles(Array.from(e.dataTransfer.files)));
}

/* ===================== temas (tarjetas compartidas) ===================== */
const KIND = { mix: "Mezcla", stem: "Pista", master: "Master", raw: "Ensayo completo" };

function primarySource(t) {
  const ready = t.versions.filter((v) => v.status === "ready" && v.kind !== "master");
  return ready.find((v) => v.kind === "mix") || ready.find((v) => v.kind === "raw") || ready[0] || null;
}
function bestPlayable(t) {
  const ready = t.versions.filter((v) => v.status === "ready");
  const masters = ready.filter((v) => v.kind === "master");
  return masters.length ? masters[masters.length - 1] : primarySource(t);
}
function styleSelect(id, genres) {
  const saved = Number(pref.get("style"));
  const sel = genres.some((g) => g.id === saved) ? saved : (genres.find((g) => /rock/i.test(g.name)) || genres[0] || {}).id;
  return `<select id="oc-${id}" class="mini-sel" data-style aria-label="Estilo para masterizar">${genres.map((g) =>
    `<option value="${g.id}" ${g.id === sel ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`;
}

function trackCard(t, ctx) {
  const hasAudio = !!primarySource(t);
  const order = { master: 0, mix: 1, raw: 2, stem: 3 };
  const versions = [...t.versions].sort((a, b) => order[a.kind] - order[b.kind] || (a.kind === "master" ? b.id - a.id : a.id - b.id));
  const sec = ctx.section || "master";
  const moveOpts = [["ensayo", "Ensayos"], ["produccion", "Producción"], ["master", "Master"]].filter(([k]) => k !== sec);
  const moveSel = `<select class="mini-sel" data-act="move" data-id="${t.id}" aria-label="Mover ${esc(t.title)} a otra sección">
    <option value="">Mover a…</option>${moveOpts.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>`;
  const albumSel = sec === "ensayo" ? "" : `<select class="mini-sel" data-act="to-album" data-id="${t.id}" aria-label="Álbum de ${esc(t.title)}">
    <option value="">Sin álbum</option>${ctx.albums.map((a) => `<option value="${a.id}" ${a.id === t.album_id ? "selected" : ""}>${esc(a.title)}</option>`).join("")}</select>`;
  return `
    <article class="card" id="t${t.id}">
      <div class="track-head">
        <div class="grow"><h3>${esc(t.title)}</h3>
          <div class="muted small">Subido por ${esc(t.uploaded_by || "—")} · ${fmtDate(t.created_at)}</div></div>
        <button class="icon-btn" data-act="rename" data-id="${t.id}" aria-label="Cambiar el nombre de ${esc(t.title)}" title="Cambiar nombre">${ic("edit")}</button>
        <button class="icon-btn" data-act="del-track" data-id="${t.id}" aria-label="Borrar el tema ${esc(t.title)}" title="Borrar tema">${ic("trash")}</button>
      </div>
      <ul class="versions">${versions.map((v) => versionRow(t, v)).join("")}</ul>
      <div class="track-foot">
        <div class="oneclick">${styleSelect(t.id, ctx.genres)}
          <button class="btn primary" data-act="oneclick" data-id="${t.id}" ${hasAudio ? "" : "disabled"}>${ic("sliders")} Masterizar con un clic</button></div>
        <button class="btn" data-act="assist" data-id="${t.id}" ${hasAudio ? "" : "disabled"}>${ic("spark")} Asistente</button>
        <button class="btn ghost small" data-act="master" data-id="${t.id}" ${hasAudio ? "" : "disabled"}>Más opciones</button>
        ${albumSel}${moveSel}
      </div>
      <div id="as-${t.id}" hidden></div>
    </article>`;
}

function versionRow(t, v) {
  const title = `${t.title} — ${v.label}`;
  let info;
  if (v.status === "processing") info = `<span class="status processing"><span class="spinner"></span>Procesando…</span>`;
  else if (v.status === "error") info = `<span class="status error">Falló: ${esc(v.error || "error desconocido")}</span>`;
  else info = `<span class="muted small">${fmtDur(v.duration)} · ${fmtSize(v.size_bytes)}</span>`;
  const expires = v.expires_at ? `<div class="small muted">Se borra solo el ${fmtDay(v.expires_at)}</div>` : "";
  const isMaster = v.kind === "master";
  const actions = v.status === "ready" ? `
    <div class="ver-actions">
      <button class="btn small ${isMaster ? "primary" : ""}" data-act="play" data-id="${v.id}" data-title="${esc(title)}">${ic("play")} Escuchar</button>
      <span class="dl-label">Bajar:</span>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="wav" title="Calidad original, sin comprimir">WAV</button>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="mp3" title="Liviano, para el celular">MP3</button>
      <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="flac" title="Sin pérdida, pesa la mitad que el WAV">FLAC</button>
    </div>` : "";
  return `
    <li class="ver ${isMaster ? "is-master" : ""}">
      <div class="ver-top">
        <span class="badge ${esc(v.kind)}">${esc(KIND[v.kind] || v.kind)}</span>
        <strong class="grow">${esc(v.label)}</strong>
        <button class="icon-btn" data-act="del-ver" data-id="${v.id}" aria-label="Borrar ${esc(title)}" title="Borrar esta versión">${ic("trash")}</button>
      </div>
      <div style="margin-top:.25rem">${info} <span class="muted small">· ${esc(v.created_by || "")}</span></div>
      ${expires}${actions}
    </li>`;
}

function paintTracks(data, ctx, emptyText) {
  paintUsage(data);
  state.tracks = new Map(data.tracks.map((t) => [t.id, t]));
  state.albums = ctx.albums;
  const box = $("#tracks");
  if (!box) return;
  const groups = [];
  const seen = new Map();
  for (const t of data.tracks) {
    const key = t.session || "";
    if (!seen.has(key)) { seen.set(key, { key, items: [] }); groups.push(seen.get(key)); }
    seen.get(key).items.push(t);
  }
  const grouped = groups.some((g) => g.key);
  box.innerHTML = data.tracks.length
    ? groups.map((g) => (grouped ? `<h3 class="sess-title">${g.key ? esc(g.key) : "Sin ensayo"} <span class="muted small">${g.items.length} ${g.items.length === 1 ? "tema" : "temas"}</span></h3>` : "")
        + g.items.map((t) => trackCard(t, ctx)).join("")).join("")
    : `<div class="card empty">${ic("headphones")}${emptyText}</div>`;
  state.openAssist.forEach((id) => {
    const el = $("#as-" + id);
    if (el && state.assistCache.has(id)) { el.hidden = false; el.innerHTML = assistHtml(id); }
  });
}

async function onTrackClick(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn || btn.disabled || btn.tagName === "SELECT") return;
  const id = Number(btn.dataset.id);
  try {
    switch (btn.dataset.act) {
      case "play": return playVersion(id, btn.dataset.title);
      case "dl": return download(id, btn.dataset.fmt);
      case "master": return openMasterModal(id);
      case "oneclick": return oneClick(id, btn);
      case "assist": return toggleAssist(id);
      case "ai-note": return askAiNote(id, btn);
      case "rename": return renameTrack(id);
      case "del-track": {
        const t = state.tracks.get(id);
        if (!confirm(`¿Borrar "${t ? t.title : "el tema"}" con todas sus versiones? No se puede deshacer.`)) return;
        await api(`/tracks/${id}`, { method: "DELETE" });
        stopPlayer();
        toast("Tema borrado", "ok");
        return state.refresh && state.refresh();
      }
      case "del-ver": {
        if (!confirm("¿Borrar esta versión? No se puede deshacer.")) return;
        await api(`/versions/${id}`, { method: "DELETE" });
        stopPlayer();
        state.assistCache.clear();
        toast("Versión borrada", "ok");
        return state.refresh && state.refresh();
      }
    }
  } catch (e) { toast(e.message, "err"); }
}
async function onTrackChange(ev) {
  const el = ev.target;
  if (el.matches("[data-style]")) { pref.set("style", el.value); return; }
  if (el.dataset && el.dataset.act === "move") {
    if (!el.value) return;
    const names = { ensayo: "Ensayos", produccion: "Producción", master: "Master" };
    try {
      await api(`/tracks/${el.dataset.id}`, { method: "PUT", json: { section: el.value } });
      toast(`Movido a ${names[el.value]}`, "ok");
      if (state.refresh) await state.refresh();
    } catch (e) { toast(e.message, "err"); }
    return;
  }
  if (el.dataset && el.dataset.act === "to-album") {
    try {
      await api(`/tracks/${el.dataset.id}`, { method: "PUT", json: el.value ? { album_id: Number(el.value) } : { clear_album: true } });
      toast(el.value ? "Agregado al álbum" : "Sacado del álbum", "ok");
    } catch (e) { toast(e.message, "err"); }
  }
}

async function oneClick(id, btn) {
  const sel = $("#oc-" + id);
  const gid = Number(sel.value);
  await withBusy(btn, async () => {
    await api(`/tracks/${id}/master`, { method: "POST", json: { genre_id: gid } });
    pref.set("style", gid);
    toast("Masterizando. Cuando termine aparece abajo y le avisamos a la banda.", "ok");
    if (state.refresh) await state.refresh();
  });
}

function renameTrack(id) {
  const t = state.tracks.get(id);
  if (!t) return;
  openModal(`
    <form id="rf" class="stack">
      <h2>Nombre del tema</h2>
      <div class="field"><label for="rn">Nombre</label><input id="rn" type="text" maxlength="200" value="${esc(t.title)}" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="rc">Cancelar</button><button class="btn primary">Guardar</button></div>
    </form>`, (m) => {
    $("#rc", m).addEventListener("click", closeModal);
    $("#rf", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        await api(`/tracks/${id}`, { method: "PUT", json: { title: $("#rn", m).value } });
        closeModal();
        toast("Nombre guardado", "ok");
        if (state.refresh) await state.refresh();
      } catch (e) { toast(e.message, "err"); }
    });
    setTimeout(() => $("#rn", m).select(), 30);
  });
}

/* ===================== asistente ===================== */
function assistHtml(id) {
  const c = state.assistCache.get(id);
  const d = c.d;
  const mark = { ok: "✓", warn: "!", bad: "✕" };
  const m = d.metrics || {};
  const tech = [
    m.lufs != null ? `Volumen: ${m.lufs.toFixed(1)} LUFS` : null,
    m.true_peak != null ? `Pico máximo: ${m.true_peak.toFixed(1)} dB` : null,
    m.lra != null ? `Variación de volumen: ${m.lra.toFixed(1)} LU` : null,
    `Saturación: ${m.clipping_pct}%`,
    `Compatibilidad izquierda/derecha: ${m.stereo_corr}`,
  ].filter(Boolean).join(" · ");
  const ai = d.ai_note
    ? `<div class="ai-note">${esc(d.ai_note)}</div>`
    : d.ai_available ? `<p style="margin-top:.8rem"><button class="btn small" data-act="ai-note" data-id="${id}">${ic("spark")} Pedir un consejo más personalizado</button></p>` : "";
  return `<div class="assistant">
    <h4>Asistente Diablo</h4>
    <div class="verdict ${esc(d.verdict)}">${esc(d.verdict_text)}</div>
    <ul class="tips">${d.tips.map((t) => `<li class="${esc(t.level)}"><span class="mark">${mark[t.level] || "·"}</span><div><b>${esc(t.title)}</b><span>${esc(t.text)}</span></div></li>`).join("")}</ul>
    ${ai}
    <p class="small muted" style="margin-top:.8rem">Escuché ${d.analyzed_seconds} s de ${d.of_seconds} s. Es una guía: tus oídos mandan.</p>
    <details class="small"><summary>Datos técnicos</summary><p class="muted">${esc(tech)}</p></details>
  </div>`;
}
async function toggleAssist(id) {
  const box = $("#as-" + id);
  if (!box) return;
  if (!box.hidden) { box.hidden = true; state.openAssist.delete(id); return; }
  box.hidden = false;
  state.openAssist.add(id);
  if (state.assistCache.has(id)) { box.innerHTML = assistHtml(id); return; }
  const t = state.tracks.get(id);
  const src = t && primarySource(t);
  if (!src) { box.innerHTML = `<div class="assistant"><p class="muted">Todavía no hay audio listo para escuchar.</p></div>`; return; }
  box.innerHTML = `<div class="assistant"><span class="spinner"></span>Escuchando el tema… puede tardar unos segundos.</div>`;
  try {
    const d = await api(`/versions/${src.id}/analysis`);
    state.assistCache.set(id, { d, vid: src.id });
    box.innerHTML = assistHtml(id);
  } catch (e) {
    state.openAssist.delete(id);
    box.innerHTML = `<div class="assistant"><p class="status error">${esc(e.message)}</p></div>`;
  }
}
async function askAiNote(id, btn) {
  const c = state.assistCache.get(id);
  if (!c) return;
  const sel = $("#oc-" + id);
  const style = sel ? sel.options[sel.selectedIndex].text : null;
  await withBusy(btn, async () => {
    try {
      const r = await api(`/versions/${c.vid}/assistant-note`, { method: "POST", json: { style } });
      c.d.ai_note = r.note;
      const box = $("#as-" + id);
      if (box) box.innerHTML = assistHtml(id);
    } catch (e) { toast(e.message, "err"); }
  });
}

/* ===================== masterizar: más opciones ===================== */
async function openMasterModal(trackId) {
  const track = state.tracks.get(trackId);
  if (!track) return;
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
        <label><input type="radio" name="how" value="genre" checked>Por estilo<span class="hint">Volumen típico del género</span></label>
        <label><input type="radio" name="how" value="ref">Imitar una referencia<span class="hint">Que suene como otro tema</span></label>
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
          if (state.refresh) await state.refresh();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  });
}

/* ===================== ENSAYOS y PRODUCCIÓN ===================== */
const SECTION_CFG = {
  ensayo: {
    section: "ensayo", tool: "ensayos", title: "Ensayos",
    lead: "Grabá el ensayo desde el celular o subí un audio. Toda la banda lo escucha y lo baja.",
    recTitle: "Grabar un ensayo",
    recText: "Tocá el botón rojo para empezar. Dejá esta pantalla abierta mientras grabás y poné el celu cerca del centro de la sala.",
    namePrefix: "Ensayo", fixedMode: null, stems: false,
    modes: [["raw", "Ensayo completo", "Se borra solo a los {days} días"], ["mix", "Una canción", "Se guarda siempre"], ["multi", "Varias canciones", "Cada archivo es un tema"]],
    empty: "Todavía no hay ensayos.<br>Grabá el primero con el botón rojo.",
  },
  produccion: {
    section: "produccion", tool: "produccion", title: "Producción",
    lead: "Acá trabajás tus temas: grabá tomas, subí mezclas y escuchá cómo suenan antes de pasarlos a Master.",
    recTitle: "Grabar una toma",
    recText: "Grabá una idea, un demo o una toma de tu tema. Después lo escuchás, le pedís consejo al Asistente y lo mandás a Master cuando esté listo.",
    namePrefix: "Toma", fixedMode: "mix", stems: true,
    modes: [["mix", "Una toma o mezcla", "El tema ya armado"], ["stems", "Pistas separadas", "Una por instrumento"], ["multi", "Varias canciones", "Cada archivo es un tema"]],
    empty: "Todavía no hay temas en producción.<br>Grabá una toma o subí tu mezcla.",
  },
};
const viewEnsayos = (band, nav) => viewRecordSection(band, nav, SECTION_CFG.ensayo);
const viewProduccion = (band, nav) => viewRecordSection(band, nav, SECTION_CFG.produccion);

async function viewRecordSection(band, nav, cfg) {
  const url = `/bands/${band.id}/tracks?section=${cfg.section}`;
  const [genres, data, alb] = await Promise.all([getGenres(), api(url), api(`/bands/${band.id}/albums`)]);
  if (nav !== state.nav) return;
  const ctx = { genres, albums: alb.albums, section: cfg.section };
  const days = data.raw_retention_days ?? 30;
  setApp(`
    ${bandHead(band, cfg.title, cfg.lead)}
    <div id="usage" class="stack" style="margin-bottom:1rem"></div>
    <section class="card" id="recorder" aria-label="Grabador"></section>
    <p class="muted small" style="margin:-.2rem 0 .8rem">${ic("headphones")} ¿Grabás y mezclás en Reaper? <a href="#/reaper">Conectalo y subí desde ahí</a>.</p>
    <details class="card"><summary>Subir un audio que ya tengo</summary>
      <form id="up" class="stack" style="margin-top:1rem">
        <div class="seg" role="radiogroup" aria-label="Qué vas a subir">
          ${cfg.modes.map(([v, l, h], i) => `<label><input type="radio" name="mode" value="${v}" ${i === 0 ? "checked" : ""}>${l}<span class="hint">${h.replace("{days}", days)}</span></label>`).join("")}
        </div>
        <div class="field" style="margin-bottom:0" id="title-box"><label for="title">Nombre</label>
          <input id="title" type="text" maxlength="200" placeholder="Ej: ${cfg.section === "ensayo" ? "Ensayo 3/11" : "Camino al sur"}"></div>
        <div class="field" style="margin-bottom:0"><label for="sess">Ensayo (opcional)</label>
          <input id="sess" type="text" maxlength="120" list="sess-list" placeholder="Ej: Ensayo del 12/10. Agrupa los temas del mismo ensayo.">
          <datalist id="sess-list">${[...new Set(data.tracks.map((t) => t.session).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join("")}</datalist></div>
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="Elegir archivos de audio">
          <strong>Tocá para elegir el audio</strong><br><span class="small">o arrastralo hasta acá (WAV, FLAC, MP3, M4A…)</span>
          <input type="file" id="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aif,.aiff,.ogg,.webm" hidden>
        </div>
        <div id="picked" class="small muted"></div>
        <div id="names" class="stack" hidden></div>
        <div class="progress hidden" id="prog" role="progressbar" aria-label="Progreso de la subida"><i></i></div>
        <button class="btn primary" id="send" disabled>Subir</button>
      </form></details>
    <h2 style="margin-top:1.8rem">Historial</h2>
    <div id="tracks"></div>`);
  wireBandHead(band);
  const run = makeLive(nav, () => api(url), (d) => paintTracks(d, ctx, cfg.empty));
  paintTracks(data, ctx, cfg.empty);
  clearTimeout(state.timer);
  if (data.tracks.some((t) => t.versions.some((v) => v.status === "processing"))) state.timer = setTimeout(run, 3000);
  const list = $("#tracks");
  list.addEventListener("click", onTrackClick);
  list.addEventListener("change", onTrackChange);
  setupRecorder(band, nav, run, cfg);

  const form = $("#up"), send = $("#send"), picked = $("#picked"), names = $("#names");
  let files = [];
  const mode = () => form.elements.mode.value;
  const multi = () => mode() === "multi";
  const baseName = (f) => f.name.replace(/\.[^.]+$/, "");
  const take = (fs) => {
    files = mode() === "stems" || multi() ? fs : fs.slice(0, 1);
    picked.textContent = multi() ? "" : files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(" · ");
    $("#title-box").hidden = multi();
    names.hidden = !multi() || !files.length;
    names.innerHTML = multi() ? files.map((f, i) => `<div class="field" style="margin:0"><label for="nm${i}">${esc(f.name)} <span class="muted small">(${fmtSize(f.size)})</span></label>
      <input id="nm${i}" type="text" maxlength="200" value="${esc(baseName(f))}" data-nm="${i}"></div>`).join("") : "";
    if (files.length && !multi() && !$("#title").value.trim() && mode() !== "stems") $("#title").value = baseName(files[0]);
    send.disabled = !files.length;
    send.textContent = multi() && files.length > 1 ? `Subir ${files.length} canciones` : "Subir";
  };
  setupDrop($("#drop"), $("#file"), take);
  $$('input[name="mode"]', form).forEach((r) => r.addEventListener("change", () => { $("#file").multiple = mode() === "stems" || multi(); take(files); }));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!files.length) return;
    const title = $("#title").value.trim();
    if (mode() === "stems" && !title) { toast("Poné el nombre del tema para agrupar las pistas.", "err"); $("#title").focus(); return; }
    const session = $("#sess").value.trim();
    const prog = $("#prog"), bar = $("i", prog);
    send.disabled = true; prog.classList.remove("hidden");
    const jobs = multi()
      ? files.map((f, i) => ({ title: ($(`#nm${i}`).value.trim() || baseName(f)), mode: cfg.section === "ensayo" ? "mix" : "mix", files: [f] }))
      : [{ title, mode: mode(), files }];
    let done = 0;
    try {
      for (const job of jobs) {
        await sendTrack(band.id, { ...job, section: cfg.section, session }, (p) => { bar.style.width = Math.round(((done + p) / jobs.length) * 100) + "%"; });
        done += 1;
        if (jobs.length > 1) send.textContent = `Subiendo ${done} de ${jobs.length}…`;
      }
      toast(jobs.length > 1 ? `Listo: ${jobs.length} canciones. Se están procesando, aparecen abajo.` : "Listo. Lo estamos procesando, aparece abajo.", "ok");
      files = []; $("#file").value = ""; $("#title").value = ""; picked.textContent = ""; names.innerHTML = ""; names.hidden = true;
      send.textContent = "Subir";
      await run();
    } catch (e) {
      toast(`${done ? `Subí ${done} de ${jobs.length}. ` : ""}${e.message}`, "err");
      files = files.slice(done); take(files);
      if (done) await run();
    }
    finally { prog.classList.add("hidden"); bar.style.width = "0"; }
  });
}

/* ---------- grabador ---------- */
function setupRecorder(band, nav, onSaved, cfg) {
  const box = $("#recorder");
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!supported) {
    box.innerHTML = `<h2>${cfg.recTitle}</h2><p class="muted">Para grabar desde el celular hay que abrir la app con https (diablomastermix.com.ar). Si ya lo hacés y no aparece el botón, probá con Chrome o Safari actualizados.</p>`;
    return;
  }
  const mimes = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  const BARS = 32;
  let stream = null, mr = null, chunks = [], ctx = null, analyser = null, raf = 0, tick = 0, wake = null;
  let t0 = 0, acc = 0, paused = false, blob = null, phase = "idle";

  const elapsed = () => acc + (paused || !t0 ? 0 : (Date.now() - t0) / 1000);
  const guard = (e) => { e.preventDefault(); e.returnValue = ""; };

  function paint() {
    if (nav !== state.nav) { cleanup(); return; }
    if (phase === "idle") {
      box.innerHTML = `<div class="recorder">
        <button class="rec-btn" id="rec" aria-label="Empezar a grabar"></button>
        <div><h2 style="margin:0">${cfg.recTitle}</h2>
          <p class="muted" style="margin:.2rem 0 0">${cfg.recText}</p></div></div>`;
      $("#rec").addEventListener("click", start);
    } else if (phase === "rec") {
      box.innerHTML = `<div class="recorder">
        <button class="rec-btn on" id="rec" aria-label="Terminar la grabación"></button>
        <div><div class="rec-time" id="rtime" role="timer" aria-label="Tiempo grabado">0:00</div>
          <div class="rec-meter" id="rmeter" aria-hidden="true">${"<i></i>".repeat(BARS)}</div>
          <div class="row"><button class="btn small" id="rpause">${ic("pause")} Pausar</button>
            <span class="small muted" id="rhint">Si las barras se ponen rojas, el sonido está saturando: alejá el celu del amplificador.</span></div></div></div>`;
      $("#rec").addEventListener("click", stop);
      $("#rpause").addEventListener("click", togglePause);
    } else if (phase === "review") {
      const d = new Date();
      box.innerHTML = `<form id="rsave" class="rec-review stack">
        <h2 style="margin:0">Escuchá y guardá</h2>
        <audio controls src="${esc(URL.createObjectURL(blob))}"></audio>
        <div class="field" style="margin-bottom:0"><label for="rtitle">Nombre</label>
          <input id="rtitle" type="text" maxlength="200" value="${cfg.namePrefix} ${d.getDate()}-${d.getMonth() + 1}" required></div>
        ${cfg.fixedMode ? "" : `<div class="seg" role="radiogroup" aria-label="Qué grabaste">
          <label><input type="radio" name="rmode" value="raw" checked>Ensayo completo<span class="hint">Se borra solo a los 30 días</span></label>
          <label><input type="radio" name="rmode" value="mix">Una canción<span class="hint">Se guarda siempre</span></label>
        </div>`}
        <div class="progress hidden" id="rprog" role="progressbar" aria-label="Progreso"><i></i></div>
        <div class="row"><button class="btn primary big" id="rgo">Guardar para la banda</button>
          <button type="button" class="btn ghost" id="rdiscard">Descartar</button></div></form>`;
      $("#rdiscard").addEventListener("click", () => {
        if (!confirm("¿Descartar esta grabación? No se puede recuperar.")) return;
        blob = null; phase = "idle"; window.removeEventListener("beforeunload", guard); paint();
      });
      $("#rsave").addEventListener("submit", save);
    }
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
      });
    } catch (e) {
      toast(e.name === "NotAllowedError" ? "Necesitamos permiso para usar el micrófono." : "No se pudo abrir el micrófono.", "err");
      return;
    }
    chunks = []; acc = 0; paused = false; blob = null;
    mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      blob = new Blob(chunks, { type: mr.mimeType || mime || "audio/webm" });
      cleanup(false);
      phase = "review";
      paint();
    };
    mr.start(1000);
    t0 = Date.now();
    phase = "rec";
    window.addEventListener("beforeunload", guard);
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch { /* sin wake lock */ }
    paint();
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const bars = $$("#rmeter i");
      const frame = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
        const lit = Math.round(Math.min(1, peak * 1.15) * BARS);
        bars.forEach((b, i) => {
          b.className = i < lit ? (peak > 0.97 && i >= BARS - 3 ? "on hot" : "on") : "";
          b.style.height = `${8 + (i / BARS) * 92}%`;
        });
        raf = requestAnimationFrame(frame);
      };
      frame();
    } catch { /* sin medidor: igual graba */ }
    tick = setInterval(() => { const t = $("#rtime"); if (t) t.textContent = fmtDur(elapsed()); }, 250);
  }
  function togglePause() {
    if (!mr) return;
    if (paused) { mr.resume(); t0 = Date.now(); paused = false; $("#rpause").innerHTML = `${ic("pause")} Pausar`; }
    else { mr.pause(); acc = elapsed(); paused = true; $("#rpause").innerHTML = `${ic("play")} Seguir`; }
  }
  function stop() {
    if (mr && mr.state !== "inactive") mr.stop();
  }
  function cleanup(dropBlob = true) {
    cancelAnimationFrame(raf); clearInterval(tick);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
    if (wake) wake.release().catch(() => {});
    stream = ctx = analyser = wake = null;
    if (dropBlob) { window.removeEventListener("beforeunload", guard); }
  }
  async function save(ev) {
    ev.preventDefault();
    const ext = /mp4/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
    const title = $("#rtitle").value.trim();
    const fd = new FormData();
    fd.append("title", title);
    fd.append("mode", cfg.fixedMode || $("#rsave").elements.rmode.value);
    fd.append("section", cfg.section);
    fd.append("files", new File([blob], `${title || "ensayo"}.${ext}`, { type: blob.type }));
    const prog = $("#rprog"), bar = $("i", prog);
    prog.classList.remove("hidden");
    await withBusy($("#rgo"), async () => {
      try {
        await uploadWithProgress(`/bands/${band.id}/tracks`, fd, (p) => { bar.style.width = Math.round(p * 100) + "%"; });
        toast("Guardado. Ya lo puede escuchar toda la banda.", "ok");
        blob = null; phase = "idle";
        window.removeEventListener("beforeunload", guard);
        paint();
        await onSaved();
      } catch (e) { toast(e.message, "err"); prog.classList.add("hidden"); }
    });
  }
  paint();
}

/* ===================== MASTER ===================== */
async function viewMaster(band, nav) {
  const [genres, refs, data, alb] = await Promise.all([
    getGenres(), api("/references"), api(`/bands/${band.id}/tracks?section=master`), api(`/bands/${band.id}/albums`)]);
  if (nav !== state.nav) return;
  const ctx = { genres, albums: alb.albums, section: "master" };
  const refGroups = genres.map((g) => {
    const list = refs.filter((r) => r.genre_id === g.id);
    return list.length ? `<optgroup label="${esc(g.name)}">${list.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const saved = Number(pref.get("style"));
  const defGenre = genres.some((g) => g.id === saved) ? saved : (genres.find((g) => /rock/i.test(g.name)) || genres[0] || {}).id;

  setApp(`
    ${bandHead(band, "Master", "Subí tu mezcla, elegí cómo querés que suene y bajá la versión masterizada.")}
    <div id="usage" class="stack" style="margin-bottom:1rem"></div>
    <section class="card"><h2>Masterizá un tema</h2>
      <form id="mw" class="steps" style="margin-top:1rem">
        <div class="step"><h3>Subí tu mezcla</h3>
          <div class="seg" role="radiogroup" aria-label="Qué vas a subir">
            <label><input type="radio" name="mode" value="mix" checked>Una canción<span class="hint">La mezcla ya armada</span></label>
            <label><input type="radio" name="mode" value="stems">Pistas separadas<span class="hint">Una por instrumento</span></label>
          </div>
          <div class="field" style="margin:.8rem 0"><label for="title">Nombre del tema</label><input id="title" type="text" maxlength="200" placeholder="Ej: Camino al sur"></div>
          <div class="drop" id="drop" tabindex="0" role="button" aria-label="Elegir archivos de audio">
            <strong>Tocá para elegir el audio</strong><br><span class="small">o arrastralo hasta acá (WAV, FLAC, MP3, M4A…)</span>
            <input type="file" id="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aif,.aiff,.ogg" hidden>
          </div>
          <div id="picked" class="small muted" style="margin-top:.4rem"></div>
        </div>
        <div class="step"><h3>Elegí cómo querés que suene</h3>
          <div class="seg" role="radiogroup" aria-label="Cómo masterizar">
            <label><input type="radio" name="how" value="genre" checked>Por estilo<span class="hint">El volumen típico del género</span></label>
            <label><input type="radio" name="how" value="ref">Que suene como otro tema<span class="hint">Usá una referencia</span></label>
          </div>
          <div class="field" id="by-genre" style="margin-top:.8rem"><label for="g">Estilo</label>
            <select id="g">${genres.map((g) => `<option value="${g.id}" ${g.id === defGenre ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>
          <div class="field" id="by-ref" style="margin-top:.8rem" hidden><label for="r">Referencia</label>
            ${refGroups ? `<select id="r">${refGroups}</select>` : `<p class="muted small">Todavía no hay referencias. Cargalas en la sección Referencias.</p>`}</div>
        </div>
        <div class="step"><h3>Masterizá y bajalo</h3>
          <label class="check"><input type="checkbox" id="auto" checked> Masterizar apenas termine de subir</label>
          <p class="small muted" id="autonote" hidden style="margin:.3rem 0 0">Con pistas separadas se sube primero y después masterizás desde el tema con el botón.</p>
          <div class="progress hidden" id="prog" role="progressbar" aria-label="Progreso de la subida" style="margin:.8rem 0"><i></i></div>
          <button class="btn primary big" id="send" style="margin-top:.8rem" disabled>Subir y masterizar</button>
        </div>
      </form></section>
    <h2>Tus temas</h2>
    <div id="tracks"></div>`);
  wireBandHead(band);
  const empty = "Todavía no hay temas masterizados.<br>Subí el primero con el formulario de arriba.";
  const run = makeLive(nav, () => api(`/bands/${band.id}/tracks?section=master`), (d) => paintTracks(d, ctx, empty));
  paintTracks(data, ctx, empty);
  clearTimeout(state.timer);
  if (data.tracks.some((t) => t.versions.some((v) => v.status === "processing"))) state.timer = setTimeout(run, 3000);
  const list = $("#tracks");
  list.addEventListener("click", onTrackClick);
  list.addEventListener("change", onTrackChange);

  const form = $("#mw"), send = $("#send"), picked = $("#picked");
  let files = [];
  const mode = () => form.elements.mode.value;
  const how = () => form.elements.how.value;
  const sync = () => {
    $("#by-genre").hidden = how() === "ref";
    $("#by-ref").hidden = how() !== "ref";
    const stems = mode() === "stems";
    $("#auto").disabled = stems;
    $("#autonote").hidden = !stems;
    send.textContent = stems ? "Subir las pistas" : ($("#auto").checked ? "Subir y masterizar" : "Subir");
    send.disabled = !files.length || (how() === "ref" && !$("#r"));
  };
  const take = (fs) => {
    files = fs;
    if (mode() !== "stems") files = files.slice(0, 1);
    picked.textContent = files.map((f) => `${f.name} (${fmtSize(f.size)})`).join(" · ");
    if (files.length && !$("#title").value.trim() && mode() !== "stems") $("#title").value = files[0].name.replace(/\.[^.]+$/, "");
    sync();
  };
  setupDrop($("#drop"), $("#file"), take);
  $$('input[name="mode"]', form).forEach((r) => r.addEventListener("change", () => { $("#file").multiple = mode() === "stems"; take(files); }));
  $$('input[name="how"]', form).forEach((r) => r.addEventListener("change", sync));
  $("#auto").addEventListener("change", sync);
  $("#g").addEventListener("change", () => pref.set("style", $("#g").value));
  sync();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!files.length) return;
    const title = $("#title").value.trim();
    if (mode() === "stems" && !title) { toast("Poné el nombre del tema para agrupar las pistas.", "err"); $("#title").focus(); return; }
    const fd = new FormData();
    fd.append("title", title);
    fd.append("mode", mode());
    fd.append("section", "master");
    if (mode() === "mix" && $("#auto").checked) {
      if (how() === "ref" && $("#r")) fd.append("master_reference_id", $("#r").value);
      else fd.append("master_genre_id", $("#g").value);
    }
    files.forEach((f) => fd.append("files", f));
    const prog = $("#prog"), bar = $("i", prog);
    send.disabled = true; prog.classList.remove("hidden");
    try {
      await uploadWithProgress(`/bands/${band.id}/tracks`, fd, (p) => { bar.style.width = Math.round(p * 100) + "%"; });
      toast(mode() === "mix" && $("#auto").checked ? "Subido. Se está masterizando, aparece abajo." : "Subido. Aparece abajo.", "ok");
      files = []; $("#file").value = ""; $("#title").value = ""; picked.textContent = ""; sync();
      await run();
    } catch (e) { toast(e.message, "err"); sync(); }
    finally { prog.classList.add("hidden"); bar.style.width = "0"; }
  });
}

/* ===================== ÁLBUMES ===================== */
async function viewAlbums(band, nav) {
  const load = () => api(`/bands/${band.id}/albums`);
  const d = await load();
  if (nav !== state.nav) return;
  setApp(`
    ${bandHead(band, "Álbumes", "Armá el disco: elegí los temas, el orden y la tapa. Acá queda todo el historial.")}
    <div class="row" style="margin-bottom:1rem"><button class="btn primary" id="new-album">${ic("plus")} Nuevo álbum</button></div>
    <div id="albums"></div>`);
  wireBandHead(band);

  let current = d;
  const trackRow = (t, i, a, total) => {
    const v = bestPlayable(t);
    const master = v && v.kind === "master";
    return `<li><span class="n">${i + 1}</span>
      <span class="grow">${esc(t.title)} ${master ? `<span class="badge master">Master</span>` : (v ? `<span class="badge">${esc(KIND[v.kind] || v.kind)}</span>` : "")}</span>
      ${v ? `<button class="btn small" data-act="play" data-id="${v.id}" data-title="${esc(t.title)}">${ic("play")}</button>
        <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="wav">WAV</button>
        <button class="btn small" data-act="dl" data-id="${v.id}" data-fmt="mp3">MP3</button>` : `<span class="small muted">Sin audio listo</span>`}
      <button class="icon-btn" data-act="up" data-album="${a.id}" data-id="${t.id}" aria-label="Subir de lugar" ${i === 0 ? "disabled" : ""}>${ic("up")}</button>
      <button class="icon-btn" data-act="down" data-album="${a.id}" data-id="${t.id}" aria-label="Bajar de lugar" ${i === total - 1 ? "disabled" : ""}>${ic("down")}</button>
      <button class="icon-btn" data-act="remove" data-album="${a.id}" data-id="${t.id}" aria-label="Sacar del álbum" title="Sacar del álbum">${ic("x")}</button></li>`;
  };
  const albumCard = (a) => `
    <article class="card"><div class="album">
      <div><div class="cover">${a.photo ? `<img src="${esc(a.photo)}" alt="Tapa de ${esc(a.title)}">` : `<img src="/img/album-sin-tapa.jpg" alt="">`}
        <button type="button" data-act="cover" data-album="${a.id}" aria-label="Cambiar la tapa de ${esc(a.title)}" title="Cambiar la tapa">${ic("camera")}</button></div></div>
      <div>
        <div class="row between"><div><h3 style="margin:0">${esc(a.title)}</h3><p class="muted small" style="margin:0">${a.year ? a.year + " · " : ""}${a.tracks.length} ${a.tracks.length === 1 ? "tema" : "temas"}</p></div>
          <div class="row" style="gap:.2rem"><button class="btn small" data-act="cover-maker" data-album="${a.id}">${ic("spark")} Crear tapa</button><button class="icon-btn" data-act="edit-album" data-album="${a.id}" aria-label="Editar ${esc(a.title)}" title="Editar">${ic("edit")}</button>
            <button class="icon-btn" data-act="del-album" data-album="${a.id}" aria-label="Borrar el álbum ${esc(a.title)}" title="Borrar álbum">${ic("trash")}</button></div></div>
        ${a.tracks.length ? `<ol class="tracklist" style="list-style:none">${a.tracks.map((t, i) => trackRow(t, i, a, a.tracks.length)).join("")}</ol>` : `<p class="muted" style="margin-top:.8rem">Todavía no tiene temas.</p>`}
        ${current.loose.length ? `<div class="row" style="margin-top:.9rem"><select class="mini-sel" id="add-${a.id}" aria-label="Tema para agregar">${current.loose.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select>
          <button class="btn small" data-act="add" data-album="${a.id}">Agregar al álbum</button></div>` : ""}
      </div></div></article>`;

  function paint() {
    $("#albums").innerHTML = (current.albums.length ? current.albums.map(albumCard).join("")
      : `<div class="card empty">${ic("disc")}Todavía no armaron ningún álbum.<br>Creá el primero y sumale temas.</div>`)
      + (current.loose.length ? `<section class="card"><h2>Temas sin álbum</h2><ul class="tracklist">${current.loose.map((t) => {
        const v = bestPlayable(t);
        return `<li><span class="grow">${esc(t.title)}</span>${v ? `<button class="btn small" data-act="play" data-id="${v.id}" data-title="${esc(t.title)}">${ic("play")}</button>` : ""}
          ${current.albums.length ? `<select class="mini-sel" data-act="to-album" data-id="${t.id}" aria-label="Agregar ${esc(t.title)} a un álbum"><option value="">Agregar a un álbum…</option>${current.albums.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join("")}</select>` : ""}</li>`;
      }).join("")}</ul></section>` : "");
  }
  const reload = async () => { current = await load(); if (nav === state.nav) paint(); };
  state.refresh = reload;
  paint();

  const ids = (a) => a.tracks.map((t) => t.id);
  const setOrder = async (aid, list) => { await api(`/albums/${aid}/order`, { method: "PUT", json: { track_ids: list } }); await reload(); };
  const albumForm = (a) => {
    openModal(`
      <form id="af" class="stack"><h2>${a ? "Editar álbum" : "Nuevo álbum"}</h2>
        <div class="field"><label for="at">Nombre del álbum</label><input id="at" type="text" maxlength="160" value="${esc(a ? a.title : "")}" required></div>
        <div class="field"><label for="ay">Año (opcional)</label><input id="ay" type="number" min="1900" max="2100" value="${a && a.year ? a.year : new Date().getFullYear()}"></div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="ac">Cancelar</button><button class="btn primary">Guardar</button></div></form>`, (m) => {
      $("#ac", m).addEventListener("click", closeModal);
      $("#af", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const json = { title: $("#at", m).value.trim(), year: $("#ay", m).value ? Number($("#ay", m).value) : null };
        try {
          if (a) await api(`/albums/${a.id}`, { method: "PUT", json });
          else await api(`/bands/${band.id}/albums`, { method: "POST", json });
          closeModal(); await reload();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  };

  async function coverMaker(a) {
    let opts;
    try { opts = await api("/cover-options"); } catch (e) { return toast(e.message, "err"); }
    let blob = null, file = null, mode = "style";
    const sub0 = `${band.name}${a.year ? " · " + a.year : ""}`;
    openModal(`
      <form id="cf" class="stack"><h2>Crear la tapa de "${esc(a.title)}"</h2>
        ${opts.ai_available ? `<div class="seg" role="radiogroup" aria-label="Cómo crearla">
          <label><input type="radio" name="cmode" value="style" checked>Con mi foto<span class="hint">Gratis, al instante</span></label>
          <label><input type="radio" name="cmode" value="ai">Con IA<span class="hint">Describís la imagen (hasta ${esc(opts.ai_daily_limit)} por día)</span></label></div>` : ""}
        <div class="field" style="margin:0"><label for="cfile">Foto o imagen <span id="cfopt" class="muted"></span></label><input id="cfile" type="file" accept="image/*"></div>
        <div id="cstyle"><div class="seg" role="radiogroup" aria-label="Estilo">${opts.styles.map((s, i) =>
          `<label><input type="radio" name="cst" value="${s.id}" ${i === 0 ? "checked" : ""}>${esc(s.name)}<span class="hint">${esc(s.hint)}</span></label>`).join("")}</div></div>
        <div id="cai" hidden><div class="field" style="margin:0"><label for="cprompt">Qué imagen querés</label>
          <textarea id="cprompt" maxlength="600" placeholder="Ej: una guitarra eléctrica envuelta en humo naranja, en un galpón oscuro"></textarea></div>
          <p class="small muted" style="margin:.3rem 0 0">Si subís una foto, la IA la usa de base. Cada imagen generada tiene un costo para la app.</p></div>
        <label class="check"><input type="checkbox" id="ctxt" checked> Escribir el nombre del álbum sobre la tapa</label>
        <div class="field-row"><div><label for="ctit">Título</label><input id="ctit" type="text" maxlength="60" value="${esc(a.title)}"></div>
          <div><label for="csub">Debajo (opcional)</label><input id="csub" type="text" maxlength="50" value="${esc(sub0)}"></div></div>
        <div id="cprev" class="cover" style="width:min(100%,300px);height:auto;aspect-ratio:1;margin:0 auto" hidden></div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cx">Cancelar</button>
          <button class="btn" id="cview">Ver tapa</button><button type="button" class="btn primary" id="cuse" disabled>Usar como tapa</button></div>
      </form>`, (m) => {
      const sync = () => {
        mode = (m.querySelector('input[name="cmode"]:checked') || { value: "style" }).value;
        $("#cstyle", m).hidden = mode === "ai";
        $("#cai", m).hidden = mode !== "ai";
        $("#cfopt", m).textContent = mode === "ai" ? "(opcional, sirve de base)" : "";
      };
      $$('input[name="cmode"]', m).forEach((r) => r.addEventListener("change", sync));
      sync();
      $("#cx", m).addEventListener("click", closeModal);
      $("#cfile", m).addEventListener("change", (e) => { file = e.target.files[0] || null; });
      $("#cf", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const fd = new FormData();
        fd.append("mode", mode);
        fd.append("style", (m.querySelector('input[name="cst"]:checked') || {}).value || "ember");
        fd.append("title", $("#ctit", m).value);
        fd.append("subtitle", $("#csub", m).value);
        fd.append("show_text", $("#ctxt", m).checked ? "true" : "false");
        fd.append("prompt", $("#cprompt", m).value);
        if (file) fd.append("file", file);
        if (mode === "style" && !file && fd.get("style") !== "oscuro") { toast("Subí una foto o elegí el estilo Oscuro.", "err"); return; }
        $("#cview", m).textContent = mode === "ai" ? "Generando…" : "Armando…";
        await withBusy($("#cview", m), async () => {
          try {
            const res = await fetch(`/albums/${a.id}/cover-preview`, { method: "POST", headers: { Authorization: "Bearer " + session.token }, body: fd });
            if (!res.ok) { let d = null; try { d = await res.json(); } catch { /* sin cuerpo */ } throw new Error(errText(d, "No se pudo armar la tapa")); }
            blob = await res.blob();
            const box = $("#cprev", m);
            box.hidden = false;
            box.innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Vista previa de la tapa">`;
            $("#cuse", m).disabled = false;
          } catch (e) { toast(e.message, "err"); }
          $("#cview", m).textContent = "Ver tapa";
        });
      });
      $("#cuse", m).addEventListener("click", async () => {
        if (!blob) return;
        const fd = new FormData();
        fd.append("file", new File([blob], "tapa.jpg", { type: "image/jpeg" }));
        await withBusy($("#cuse", m), async () => {
          try { await uploadWithProgress(`/albums/${a.id}/photo`, fd, () => {}); closeModal(); toast("Tapa guardada en el álbum", "ok"); await reload(); }
          catch (e) { toast(e.message, "err"); }
        });
      });
    });
  }
  $("#new-album").addEventListener("click", () => albumForm(null));
  const box = $("#albums");
  box.addEventListener("change", async (ev) => {
    const el = ev.target;
    if (el.dataset.act === "to-album" && el.value) {
      try { await api(`/tracks/${el.dataset.id}`, { method: "PUT", json: { album_id: Number(el.value) } }); toast("Agregado al álbum", "ok"); await reload(); }
      catch (e) { toast(e.message, "err"); }
    }
  });
  box.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b || b.disabled || b.tagName === "SELECT") return;
    const act = b.dataset.act, aid = Number(b.dataset.album), tid = Number(b.dataset.id);
    const a = current.albums.find((x) => x.id === aid);
    try {
      switch (act) {
        case "play": return playVersion(tid, b.dataset.title);
        case "dl": return download(tid, b.dataset.fmt);
        case "cover": return pickImage(async (f) => {
          const fd = new FormData(); fd.append("file", f);
          try { await uploadWithProgress(`/albums/${aid}/photo`, fd, () => {}); toast("Tapa actualizada", "ok"); await reload(); }
          catch (e) { toast(e.message, "err"); }
        });
        case "cover-maker": return coverMaker(a);
        case "edit-album": return albumForm(a);
        case "del-album":
          if (!confirm(`¿Borrar el álbum "${a.title}"? Los temas no se borran, quedan sin álbum.`)) return;
          await api(`/albums/${aid}`, { method: "DELETE" }); toast("Álbum borrado", "ok"); return reload();
        case "up": case "down": {
          const list = ids(a), i = list.indexOf(tid), j = act === "up" ? i - 1 : i + 1;
          [list[i], list[j]] = [list[j], list[i]];
          return setOrder(aid, list);
        }
        case "remove": return setOrder(aid, ids(a).filter((x) => x !== tid));
        case "add": { const v = $("#add-" + aid); if (v) return setOrder(aid, [...ids(a), Number(v.value)]); }
      }
    } catch (e) { toast(e.message, "err"); }
  });
}

/* ===================== CALENDARIO ===================== */
async function viewCalendar(band, nav) {
  let events = await api(`/bands/${band.id}/events`);
  if (nav !== state.nav) return;
  const today = new Date();
  if (!state.cal) state.cal = { y: today.getFullYear(), m: today.getMonth() };
  setApp(`
    ${bandHead(band, "Calendario", "Agendá ensayos, shows y grabaciones. A los demás les llega un aviso.")}
    <div class="row" style="margin-bottom:1rem"><button class="btn primary" id="new-ev">${ic("plus")} Agendar</button></div>
    <div id="cal"></div>
    <section class="card" style="margin-top:1.2rem"><h2>Próximos</h2><div id="next"></div></section>`);
  wireBandHead(band);

  const byDay = () => {
    const m = new Map();
    events.forEach((e) => { const k = dayKey(parseDate(e.starts_at)); (m.get(k) || m.set(k, []).get(k)).push(e); });
    return m;
  };
  function paint() {
    const { y, m } = state.cal, map = byDay(), first = new Date(y, m, 1), offset = (first.getDay() + 6) % 7;
    const dows = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(y, m, 1 - offset + i), k = dayKey(d), evs = map.get(k) || [];
      cells += `<button type="button" class="day ${d.getMonth() !== m ? "out" : ""} ${k === dayKey(today) ? "today" : ""}" data-day="${k}" aria-label="${d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}${evs.length ? ", " + evs.length + " evento(s)" : ""}">
        <span class="dn">${d.getDate()}</span>${evs.slice(0, 2).map((e) => `<span class="ev">${fmtTime(e.starts_at)} ${esc(e.title)}</span>`).join("")}${evs.length > 2 ? `<span class="small muted">+${evs.length - 2} más</span>` : ""}</button>`;
    }
    $("#cal").innerHTML = `<div class="cal-head"><h2>${new Date(y, m, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase())}</h2>
      <button class="icon-btn" id="prev" aria-label="Mes anterior">${ic("left")}</button>
      <button class="icon-btn" id="nextm" aria-label="Mes siguiente">${ic("right")}</button>
      <button class="btn small ghost" id="hoy">Hoy</button></div>
      <div class="cal">${dows.map((x) => `<div class="dow">${x}</div>`).join("")}${cells}</div>`;
    const nxt = events.filter((e) => parseDate(e.starts_at) >= new Date(Date.now() - 3 * 3600e3)).slice(0, 8);
    $("#next").innerHTML = nxt.length ? `<ul class="upcoming">${nxt.map((e) => {
      const d = parseDate(e.starts_at);
      return `<li><div class="date-chip"><b>${d.getDate()}</b><span>${d.toLocaleDateString("es-AR", { month: "short" })}</span></div>
        <div class="grow"><strong>${esc(e.title)}</strong><div class="muted small">${fmtTime(e.starts_at)}${e.place ? " · " + esc(e.place) : ""} · ${esc(e.created_by || "")}</div>${e.notes ? `<div class="small">${esc(e.notes)}</div>` : ""}</div>
        <button class="icon-btn" data-del="${e.id}" aria-label="Borrar ${esc(e.title)}" title="Borrar">${ic("trash")}</button></li>`;
    }).join("")}</ul>` : `<p class="muted">No hay nada agendado. Tocá un día del calendario para sumar algo.</p>`;
  }
  const reload = async () => { events = await api(`/bands/${band.id}/events`); if (nav === state.nav) paint(); };
  state.refresh = reload;

  function dayModal(key) {
    const evs = byDay().get(key) || [];
    const label = new Date(key + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    openModal(`
      <div class="stack"><h2 style="text-transform:capitalize">${esc(label)}</h2>
        ${evs.length ? `<ul class="upcoming">${evs.map((e) => `<li><div class="grow"><strong>${esc(e.title)}</strong><div class="muted small">${fmtTime(e.starts_at)}${e.place ? " · " + esc(e.place) : ""}</div>${e.notes ? `<div class="small">${esc(e.notes)}</div>` : ""}</div>
          <button class="icon-btn" data-del="${e.id}" aria-label="Borrar ${esc(e.title)}">${ic("trash")}</button></li>`).join("")}</ul>` : ""}
        <form id="ef" class="stack"><h3>Agendar algo este día</h3>
          <div class="field" style="margin:0"><label for="et">Qué</label><input id="et" type="text" maxlength="200" placeholder="Ej: Ensayo" required></div>
          <div class="field-row"><div><label for="eh">Hora</label><input id="eh" type="time" value="20:00" required></div>
            <div><label for="ep">Dónde (opcional)</label><input id="ep" type="text" maxlength="200" placeholder="Sala"></div></div>
          <div class="field" style="margin:0"><label for="en">Notas (opcional)</label><textarea id="en" maxlength="2000"></textarea></div>
          <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="ec">Cerrar</button><button class="btn primary">Agendar</button></div></form></div>`, (m) => {
      $("#ec", m).addEventListener("click", closeModal);
      $$("[data-del]", m).forEach((b) => b.addEventListener("click", () => delEvent(b.dataset.del, true)));
      $("#ef", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const when = new Date(`${key}T${$("#eh", m).value}`);
        try {
          await api(`/bands/${band.id}/events`, { method: "POST", json: {
            title: $("#et", m).value.trim(), starts_at: when.toISOString(), place: $("#ep", m).value, notes: $("#en", m).value } });
          closeModal(); toast("Agendado. Le avisamos a la banda.", "ok"); await reload();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  }
  async function delEvent(id, inModal) {
    if (!confirm("¿Borrar este evento?")) return;
    try { await api(`/events/${id}`, { method: "DELETE" }); if (inModal) closeModal(); toast("Evento borrado", "ok"); await reload(); }
    catch (e) { toast(e.message, "err"); }
  }
  paint();
  $("#new-ev").addEventListener("click", () => dayModal(dayKey(new Date())));
  $("#app").addEventListener("click", (ev) => {
    const t = ev.target;
    const day = t.closest("[data-day]");
    if (t.closest("#prev")) { state.cal.m--; if (state.cal.m < 0) { state.cal.m = 11; state.cal.y--; } return paint(); }
    if (t.closest("#nextm")) { state.cal.m++; if (state.cal.m > 11) { state.cal.m = 0; state.cal.y++; } return paint(); }
    if (t.closest("#hoy")) { state.cal = { y: today.getFullYear(), m: today.getMonth() }; return paint(); }
    const del = t.closest("#next [data-del]");
    if (del) return delEvent(del.dataset.del, false);
    if (day) dayModal(day.dataset.day);
  });
}

/* ===================== INTEGRANTES ===================== */
const INSTRUMENTS = ["Guitarra", "Bajo", "Batería", "Voz", "Teclados", "Percusión", "Saxo", "Violín", "Trompeta", "DJ / Electrónica"];
function profileLabel(m) {
  if (m.kind === "manager") return "Manager";
  const parts = [m.instrument || "Músico"];
  if (m.sings) parts.push("canta");
  return parts.join(" y ");
}
function profileFields(m, p = "", onlyMusico = false) {
  const kind = (m && m.kind) || "musico";
  return `
    <div class="seg" role="radiogroup" aria-label="Rol en la banda">
      <label><input type="radio" name="${p}kind" value="musico" ${kind === "musico" ? "checked" : ""}>Músico<span class="hint">Toca un instrumento</span></label>
      ${onlyMusico ? "" : `<label><input type="radio" name="${p}kind" value="manager" ${kind === "manager" ? "checked" : ""}>Manager<span class="hint">Organiza, no toca</span></label>`}
    </div>
    <div class="${p}mus stack">
      <div class="field" style="margin:0"><label for="${p}ins">Instrumento</label>
        <input id="${p}ins" type="text" list="${p}inslist" maxlength="120" value="${esc((m && m.instrument) || "")}" placeholder="Ej: Guitarra">
        <datalist id="${p}inslist">${INSTRUMENTS.map((i) => `<option value="${esc(i)}">`).join("")}</datalist></div>
      <label class="check"><input type="checkbox" id="${p}sings" ${m && m.sings ? "checked" : ""}> También canta</label>
    </div>`;
}
function wireProfileFields(root, p = "") {
  const sync = () => {
    const mgr = root.querySelector(`input[name="${p}kind"]:checked`).value === "manager";
    root.querySelector(`.${p}mus`).hidden = mgr;
  };
  $$(`input[name="${p}kind"]`, root).forEach((r) => r.addEventListener("change", sync));
  sync();
}
function readProfile(root, p = "") {
  const kind = root.querySelector(`input[name="${p}kind"]:checked`).value;
  return { kind, instrument: kind === "manager" ? "" : $(`#${p}ins`, root).value.trim(), sings: kind === "manager" ? false : $(`#${p}sings`, root).checked };
}

async function viewMembers(band, nav) {
  const isAdmin = true; // todos los integrantes tienen los mismos derechos en su banda
  const bandAdmin = band.role === "admin" || state.me.is_super;
  const [members, pending] = await Promise.all([
    api(`/bands/${band.id}/members`), isAdmin ? api(`/bands/${band.id}/invites`) : Promise.resolve([])]);
  if (nav !== state.nav) return;
  const myId = state.me.id;
  setApp(`
    ${bandHead(band, "Integrantes", "Sumá a tus compañeros: les llega un link para crear su cuenta y entrar a la banda.")}
    <section class="card"><ul class="upcoming">${members.map((m) => `
      <li>${avatar(m.photo, m.name, "")}<div class="grow"><strong>${esc(m.name)}</strong>${m.user_id === myId ? ` <span class="muted small">(vos)</span>` : ""}
          <div class="muted small">${esc(profileLabel(m))}${m.email ? " · " + esc(m.email) : ""}</div></div>
        ${m.role === "admin" ? `<span class="badge">Admin de la banda</span>` : ""}
        ${m.user_id === myId || isAdmin ? `<button class="icon-btn" data-edit="${m.user_id}" aria-label="Editar el lugar de ${esc(m.name)} en la banda" title="Editar">${ic("edit")}</button>` : ""}
        ${isAdmin && m.user_id !== myId && (m.role !== "admin" || state.me.is_super) ? `<button class="icon-btn" data-rm="${m.user_id}" aria-label="Sacar a ${esc(m.name)} de la banda" title="Sacar de la banda">${ic("x")}</button>` : ""}
      </li>`).join("")}</ul></section>
    ${isAdmin ? `
    <section class="card"><h2>Sumar a un compañero</h2>
      <form id="inv" class="stack">
        <div class="field" style="margin:0"><label for="ie">Email</label><input id="ie" type="email" required autocomplete="off"></div>
        ${profileFields(null, "i", !bandAdmin)}
        <div><button class="btn primary">Crear invitación</button></div>
      </form>
      <div id="invout" class="stack hidden" style="margin-top:1rem"></div>
      ${pending.length ? `<h3 style="margin-top:1.4rem">Invitaciones pendientes</h3><ul class="upcoming">${pending.map((i) => `
        <li><div class="grow">${esc(i.email)}<div class="muted small">${esc(profileLabel(i))} · vence ${fmtDay(i.expires_at)}</div></div>
          <button class="btn small" data-cancel="${i.id}">Cancelar</button></li>`).join("")}</ul>` : ""}
    </section>` : ""}`);
  wireBandHead(band);
  const reload = () => viewMembers(band, nav);

  if (isAdmin) {
    wireProfileFields($("#inv"), "i");
    $("#inv").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = $("#ie").value.trim();
      await withBusy($("#inv button.primary"), async () => {
        try {
          const r = await api(`/bands/${band.id}/invites`, { method: "POST", json: { email, ...readProfile($("#inv"), "i") } });
          const link = r.link_hint || `${location.origin}/#/invite/${r.invite_token}`;
          const wa = `https://wa.me/?text=${encodeURIComponent(`Te sumé a "${band.name}" en Diablo Master. Entrá acá y creá tu cuenta: ${link}`)}`;
          const out = $("#invout");
          out.classList.remove("hidden");
          out.innerHTML = `<p>Listo. Pasale este link a <strong>${esc(email)}</strong> (sirve una sola vez y vence en ${esc(r.expires_in_days)} días):</p>
            <div class="copybox"><span class="grow">${esc(link)}</span><button type="button" class="btn small" id="cp">Copiar</button></div>
            <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
            <p class="small muted">Cuando la persona entre, aparece en la lista.</p>`;
          $("#cp").addEventListener("click", () => copyText(link));
        } catch (e) { toast(e.message, "err"); }
      });
    });
    $$("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      try { await api(`/bands/${band.id}/invites/${b.dataset.cancel}`, { method: "DELETE" }); toast("Invitación cancelada", "ok"); reload(); }
      catch (e) { toast(e.message, "err"); }
    }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("¿Sacar a esta persona de la banda? Deja de ver sus temas.")) return;
      try { await api(`/bands/${band.id}/members/${b.dataset.rm}`, { method: "DELETE" }); toast("Listo", "ok"); reload(); }
      catch (e) { toast(e.message, "err"); }
    }));
  }
  $$("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const uid = Number(b.dataset.edit), m = members.find((x) => x.user_id === uid);
    openModal(`<form id="pf" class="stack"><h2>${uid === myId ? "Tu lugar en la banda" : esc(m.name)}</h2>${profileFields(m, "e")}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="pc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`, (md) => {
      wireProfileFields(md, "e");
      $("#pc", md).addEventListener("click", closeModal);
      $("#pf", md).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        try { await api(`/bands/${band.id}/members/${uid}`, { method: "PUT", json: readProfile(md, "e") }); closeModal(); toast("Guardado", "ok"); reload(); }
        catch (e) { toast(e.message, "err"); }
      });
    });
  }));
}

/* ===================== lanzamiento ===================== */
async function viewRelease(band, nav) {
  let list = await api(`/bands/${band.id}/releases`);
  if (nav !== state.nav) return;
  const dests = [
    ["Spotify, Apple Music y YouTube Music", "Se publican a través de una distribuidora (DistroKid, TuneCore, CD Baby, Amuse). Le subís los WAV y la tapa del paquete, y ella lo manda a todas las plataformas."],
    ["Bandcamp", "Recibe la música directo de la banda. Subís los WAV y la tapa, ponés el precio y compartís el link."],
    ["Vinilo y CD", "Para prensar, la planta pide los WAV (separados por lado en el vinilo) y la tapa. El paquete trae una guía con lo que tenés que preguntar."],
  ];
  const mins = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const card = (r) => {
    const b = r.build || {};
    const building = b.status === "building";
    const ready = b.status === "ready";
    const checks = [
      ...r.tracks.map((t) => `<li class="${t.has_master ? "ok" : "no"}">${t.has_master ? "✓" : "✗"} ${esc(t.title)}${t.has_master ? ` <span class="muted small">${mins(t.duration)}</span>` : ` <span class="small">falta el master</span>`}</li>`),
      `<li class="${r.cover ? "ok" : "no"}">${r.cover ? "✓" : "✗"} Tapa${r.cover ? ` <span class="muted small">${r.cover_px} px${r.cover_px < 3000 ? " (se agranda a 3000 px)" : ""}</span>` : ` <span class="small">falta la tapa, agregala en Álbumes</span>`}</li>`,
    ].join("");
    return `<article class="card release" data-album="${r.album_id}">
      <div class="album"><div><div class="cover">${r.cover ? `<img src="${esc(r.cover)}" alt="Tapa de ${esc(r.title)}">` : `<img src="/img/album-sin-tapa.jpg" alt="">`}</div></div>
      <div>
        <h3 style="margin:0">${esc(r.title)}</h3>
        <p class="muted small" style="margin:0 0 .6rem">${r.year ? r.year + " · " : ""}${r.tracks.length} ${r.tracks.length === 1 ? "tema" : "temas"}${r.total_seconds ? " · " + mins(r.total_seconds) : ""}</p>
        ${r.tracks.length ? `<ul class="checks">${checks}</ul>` : `<p class="muted">Este álbum no tiene temas. Sumalos en Álbumes.</p>`}
        <div class="row" style="margin-top:.9rem;gap:.6rem;flex-wrap:wrap">
          ${ready ? `<button class="btn primary" data-act="download">${ic("download")} Descargar paquete (${esc(b.size_mb)} MB)</button>` : ""}
          <button class="btn ${ready ? "" : "primary"}" data-act="build" ${building || !r.tracks.length || r.missing_masters.length ? "disabled" : ""}>${building ? "Preparando…" : ready ? "Volver a preparar" : "Preparar paquete"}</button>
        </div>
        ${building ? `<p class="muted small" style="margin-top:.5rem">${esc(b.step || "Preparando")}… ${b.total ? Math.round((b.done / b.total) * 100) : 0}%</p>` : ""}
        ${b.status === "error" ? `<p class="small" style="color:var(--err);margin-top:.5rem">No se pudo preparar: ${esc(b.error || "error")}</p>` : ""}
        ${ready ? `<p class="muted small" style="margin-top:.5rem">Incluye los WAV 24 bits, los MP3 320, la tapa en 3000 px y una guía para publicar. Queda disponible 24 horas.</p>` : ""}
      </div></div></article>`;
  };
  setApp(`
    ${bandHead(band, "Lanzamiento", "Cuando el álbum está masterizado, armá el paquete para publicarlo donde quieran o prensarlo.")}
    <div id="rel">${list.length ? list.map(card).join("") : `<div class="card empty">${ic("rocket")}Todavía no tienen álbumes.<br><a href="#/band/${band.id}/albumes">Armá el primero en Álbumes</a></div>`}</div>
    <section class="card"><h2>Dónde publicarlo</h2><div class="dest">${dests.map(([t, d]) => `<div><h3>${esc(t)}</h3><p class="muted">${esc(d)}</p></div>`).join("")}</div></section>`);
  wireBandHead(band);
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const paint = () => { if (nav !== state.nav) return stop(); $("#rel").innerHTML = list.length ? list.map(card).join("") : $("#rel").innerHTML; };
  const poll = () => {
    if (timer || !list.some((r) => r.build && r.build.status === "building")) return;
    timer = setInterval(async () => {
      if (nav !== state.nav) return stop();
      try { list = await api(`/bands/${band.id}/releases`); } catch (e) { return stop(); }
      paint();
      if (!list.some((r) => r.build && r.build.status === "building")) stop();
    }, 2000);
  };
  poll();
  $("#rel").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.closest("[data-album]").dataset.album;
    try {
      if (btn.dataset.act === "build") {
        await api(`/albums/${id}/release/build`, { method: "POST" });
        list = await api(`/bands/${band.id}/releases`); paint(); poll();
      } else {
        const r = await api(`/albums/${id}/release/link`);
        const a = document.createElement("a"); a.href = r.url; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e) { toast(e.message, "err"); }
  });
}

/* ===================== conectar con Reaper ===================== */
async function viewReaper(nav) {
  const site = location.origin;
  const band = currentBand();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const save = mac ? "Cmd+S" : "Ctrl+S";
  setApp(`
    <div class="page-head"><div class="grow"><p class="muted small" style="margin:0">Para quien graba y mezcla en Reaper</p>
      <h1 style="margin:0">Conectar Reaper</h1>
      <p class="lead" style="margin-top:.4rem">Mandá tu ensayo o tu mezcla a la banda sin salir de Reaper. Lo conectás una sola vez, en unos 5 minutos. Después, subir un tema son tres clics.</p></div></div>

    <section class="card"><h2>Qué vas a lograr</h2>
      <div class="dest">
        <div><h3>Grabás y mezclás como siempre</h3><p class="muted">Tus pistas, tus efectos, tu mezcla. Reaper sigue siendo tu estudio.</p></div>
        <div><h3>Apretás un botón y se sube</h3><p class="muted">Reaper arma el audio solo y lo manda a la banda. No tenés que exportar ni abrir el navegador.</p></div>
        <div><h3>Toda la banda lo escucha</h3><p class="muted">Aparece acá con aviso a todos. Lo escuchan, lo bajan y lo pasan por el master con un clic.</p></div>
      </div></section>

    <section class="card"><h2>Parte 1: conectarlo (se hace una sola vez)</h2>
      <p class="muted" style="margin-top:0">Vas a necesitar dos cosas: un archivito que le enseña a Reaper a hablar con esta web, y tu clave personal para que sepa que sos vos. Seguí los pasos en orden.</p>
      <ol class="steps">
        <li><strong>Descargá el archivito.</strong>
          <div class="row" style="margin-top:.5rem"><a class="btn primary" href="/reaper/DiabloMaster_subir.lua" download="DiabloMaster_subir.lua">${ic("download")} Descargar el archivo</a></div>
          <p class="muted small">Se llama <code>DiabloMaster_subir.lua</code>. Se guarda en la carpeta <em>Descargas</em>. Podés ignorar que dice "lua": es el tipo de archivo que lee Reaper.</p></li>
        <li><strong>Pasalo a <em>Documentos</em>.</strong> Movelo de Descargas a Documentos y no lo borres, porque Reaper lo lee desde ahí cada vez. Si lo borrás, tenés que descargarlo de nuevo.</li>
        <li><strong>Generá tu clave personal.</strong> Es una clave larga que empieza con <code>pck_</code>. Es solo tuya: no la compartas.
          <div class="row" style="margin-top:.5rem"><button class="btn" id="mk-token">Generar mi clave</button></div>
          <div id="token-out" class="stack hidden" style="margin-top:.6rem"></div>
          <p class="muted small">Se muestra una sola vez. Tocá <em>Copiar</em> y pegala en un lugar seguro, por ejemplo una nota del celular. Si la perdés, generás otra.</p></li>
        <li><strong>Abrí Reaper y buscá el menú <em>Actions</em></strong> (arriba, en la barra de menús). Tocá <em>Show action list…</em>. Se abre una ventana llamada <em>Actions</em> con una lista larga.</li>
        <li><strong>Cargá el archivito.</strong> En esa ventana, abajo, tocá el botón <em>New action…</em> y elegí <em>Load ReaScript…</em>. Se abre un selector de archivos: andá a <em>Documentos</em>, elegí <code>DiabloMaster_subir.lua</code> y tocá <em>Abrir</em>.
          <p class="muted small" style="margin:.4rem 0 0">Cómo saber que salió bien: en la lista aparece una línea que dice <code>Script: DiabloMaster_subir.lua</code>.</p></li>
        <li><strong>Ejecutalo por primera vez.</strong> Arriba de la lista hay un casillero que dice <em>Filter</em>: escribí <code>Diablo</code>. Tocá la línea del script y después el botón <em>Run</em>. Reaper te pide dos datos:
          <ul class="plain">
            <li><em>Dirección de la web:</em> copiá y pegá esta dirección:
              <div class="copybox" style="margin:.4rem 0"><span class="grow">${esc(site)}</span><button type="button" class="btn small" data-copy="${esc(site)}">Copiar</button></div></li>
            <li><em>Token personal:</em> pegá la clave que generaste en el paso 3.</li>
          </ul>
          <p class="muted small" style="margin:.4rem 0 0">Después te muestra tus bandas. Si tenés una sola, la elige sola. Si tenés varias, escribí el número de la que quieras. Esto no se vuelve a pedir.</p></li>
        <li><strong>Opcional: ponele una tecla.</strong> Con el script seleccionado en la lista, tocá <em>Add…</em> (a la izquierda, abajo) y apretá la combinación que quieras, por ejemplo Cmd+Shift+U. Así lo ejecutás sin abrir la lista.</li>
      </ol></section>

    <section class="card"><h2>Parte 2: subir un ensayo o un tema</h2>
      <ol class="steps">
        <li><strong>Guardá el proyecto</strong> (${save}). Si el proyecto no tiene nombre, Reaper no puede exportarlo y el script te lo avisa.</li>
        <li><strong>Ejecutá el script:</strong> con tu tecla, o desde <em>Actions &gt; Show action list…</em>, escribiendo <code>Diablo</code> en el filtro y tocando <em>Run</em>.</li>
        <li><strong>Completá la ventanita.</strong> Tiene tres casilleros:
          <ul class="plain">
            <li><em>Nombre del tema o ensayo:</em> cómo lo va a ver la banda. Por ejemplo "Camino al sur" o "Ensayo 3-11".</li>
            <li><em>Qué subir:</em> escribí <code>cancion</code> para subir la mezcla final, tal como suena todo junto. O escribí <code>pistas</code> para subir cada instrumento por separado (bajo, batería, guitarras…), por si alguien más quiere mezclar.</li>
            <li><em>Dónde:</em> escribí <code>ensayo</code> para guardar cómo sonó el ensayo (se borra solo a los 30 días), <code>produccion</code> para una mezcla en la que seguís trabajando, o <code>master</code> si ya está lista para masterizar.</li>
          </ul>
          <p class="muted small" style="margin:.4rem 0 0">El cuarto casillero (<em>Cambiar conexión</em>) dejalo en <code>no</code>. Tocá <em>OK</em>.</p></li>
        <li><strong>Esperá sin cerrar Reaper.</strong> Reaper tarda un rato en preparar el audio y subirlo: más si el ensayo es largo. Si es muy grande, lo sube de a partes y en la ventana de mensajes ves el avance. Cuando termina, aparece un cartel que dice <em>Listo</em>.</li>
      </ol>
      <h3>Dos ejemplos para copiar</h3>
      <div class="dest">
        <div><h3>Grabé el ensayo de hoy</h3><p class="muted">Nombre: <code>Ensayo 3-11</code><br>Qué subir: <code>cancion</code><br>Dónde: <code>ensayo</code></p></div>
        <div><h3>Terminé de mezclar un tema</h3><p class="muted">Nombre: <code>Camino al sur</code><br>Qué subir: <code>cancion</code><br>Dónde: <code>produccion</code></p></div>
      </div></section>

    <section class="card"><h2>Y después, ¿qué pasa con lo que subí?</h2>
      <ol class="steps">
        <li>Entrá a la banda y abrí <strong>Ensayos</strong> o <strong>Producción</strong>, según lo que hayas elegido. Ahí está tu tema y toda la banda lo puede escuchar y bajar.</li>
        <li>En Producción, el <strong>Asistente</strong> escucha tu mezcla y te dice qué corregir en palabras simples.</li>
        <li>Cuando te guste, tocá <strong>Master</strong> sobre el tema, elegí el estilo de referencia y se masteriza solo.</li>
        <li>Con los temas masterizados armás el disco en <strong>Álbumes</strong>, y en <strong>Lanzamiento</strong> bajás todo listo para Spotify, Bandcamp o vinilo.</li>
      </ol></section>

    <section class="card"><h2>Si algo sale mal</h2>
      <ul class="plain">
        <li><strong>"Primero guardá el proyecto":</strong> apretá ${save}, poné un nombre y volvé a ejecutar el script.</li>
        <li><strong>"No pude conectar":</strong> revisá que la dirección sea exactamente <code>${esc(site)}</code> y que la clave esté completa, sin espacios de más. Para cambiarlas, ejecutá el script y en el cuarto casillero (<em>Cambiar conexión</em>) escribí <code>si</code>.</li>
        <li><strong>"Todavía no estás en ninguna banda":</strong> pedile a quien administra la banda que te invite.</li>
        <li><strong>La mezcla suena distinta a la tuya:</strong> el script sube lo que sale por el canal Master de Reaper. Si querés subirla sin masterizar, sacá del Master los limitadores y maximizadores antes de ejecutar.</li>
        <li><strong>Subir solo un pedazo:</strong> marcá con el mouse un tramo del proyecto (selección de tiempo) y el script sube solo eso.</li>
        <li><strong>Pistas separadas:</strong> el script sube todas las pistas del proyecto. Silenciá las que no quieras mandar.</li>
        <li><strong>Calidad del audio:</strong> el script usa el último formato que hayas usado en <em>File &gt; Render</em>. Hacé un render de prueba una vez con <em>WAV 24 bit</em> o <em>FLAC</em>.</li>
        <li><strong>Para sacar el archivito de Reaper:</strong> en la lista de Actions, seleccionalo y tocá <em>Delete</em>.</li>
      </ul></section>`);
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
  $("#mk-token").addEventListener("click", async (ev) => {
    await withBusy(ev.currentTarget, async () => {
      try {
        const r = await api("/me/api-tokens", { method: "POST", json: { label: "Reaper" } });
        const out = $("#token-out");
        out.classList.remove("hidden");
        out.innerHTML = `<div class="copybox"><span class="grow">${esc(r.token)}</span><button type="button" class="btn small" id="cp-token">Copiar</button></div>
          <p class="small" style="color:var(--amber);margin:0">Copiala ahora: no se vuelve a mostrar.</p>`;
        $("#cp-token").addEventListener("click", () => copyText(r.token));
      } catch (e) { toast(e.message, "err"); }
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
    <div class="page-head"><div class="grow"><h1>Referencias</h1>
      <p class="lead">Una referencia es un tema que te gusta cómo suena. Al masterizar, la app lleva tu mezcla hacia ese volumen y ese carácter.</p></div></div>
    <div class="callout" style="margin-bottom:1rem">Solo se guarda un fragmento de 1 minuto y medio, y <strong>nadie puede escucharlo ni bajarlo</strong>: se usa únicamente para masterizar.</div>
    ${byGenre.length ? byGenre.map(({ g, list }) => `
      <section class="card"><h2>${esc(g.name)}</h2>
        <ul class="upcoming">${list.map((r) => `
          <li><span class="grow">${esc(r.name)} <span class="badge">${r.scope === "global" ? "global" : "banda"}</span></span>
            ${me.is_super || r.mine ? `<button class="icon-btn" data-del="${r.id}" aria-label="Borrar la referencia ${esc(r.name)}" title="Borrar">${ic("trash")}</button>` : ""}</li>`).join("")}</ul></section>`).join("")
      : `<div class="card empty">${ic("target")}Todavía no hay referencias. Cargá la primera abajo.</div>`}
    <section class="card"><h2>Cargar una referencia</h2>
      <form id="rf" class="stack">
        <div class="field" style="margin:0"><label for="rgen">Estilo</label><select id="rgen" required>${genres.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        <div class="field" style="margin:0"><label for="rname">Nombre (ej: "Kyuss - Green Machine")</label><input id="rname" type="text" maxlength="160" required></div>
        <div class="field" style="margin:0"><label for="rscope">Quién la puede usar</label><select id="rscope">${scopes.join("")}</select></div>
        <div class="field" style="margin:0"><label for="rfile">Archivo de audio (mejor WAV o FLAC)</label><input id="rfile" type="file" accept="audio/*,.wav,.flac,.mp3,.m4a" required></div>
        <div class="progress hidden" id="rprog" role="progressbar" aria-label="Progreso"><i></i></div>
        <button class="btn primary">Cargar</button>
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
  const [ov, bands, users, genres] = await Promise.all([api("/admin/overview"), api("/admin/bands"), api("/admin/users"), getGenres(true)]);
  if (nav !== state.nav) return;
  const roleName = (r) => (r === "admin" ? "Admin de banda" : "Integrante");
  const ago = (iso) => (iso ? fmtDate(iso) : "sin actividad");
  const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;

  setApp(`
    <div class="page-head"><div class="grow"><h1>Administración</h1><p class="lead">Todo lo de la plataforma en un solo lugar.</p></div></div>

    <section class="stats">
      ${tile(ov.users, "Personas")}${tile(ov.bands, "Bandas")}${tile(ov.tracks, "Temas")}
      ${tile(fmtGB(ov.used_gb) + " GB", "Audio guardado")}${tile(fmtGB(ov.disk_free_gb) + " GB", "Libres en el servidor")}
      ${tile(ov.ai_enabled ? "Activada" : "Apagada", "IA (con costo)")}
    </section>

    <section class="card"><h2>Bandas</h2>
      ${bands.map((b) => {
        const pct = Math.min(100, (b.used_gb / b.quota_gb) * 100 || 0);
        const st = b.stats;
        return `<div class="admin-band">
          <div class="row"><a href="#/band/${b.id}/ensayos" class="row grow" style="text-decoration:none;color:inherit">${avatar(b.photo, b.name)}<h3 style="margin:0">${esc(b.name)}</h3></a>
            <button class="btn small" data-bren="${b.id}" data-name="${esc(b.name)}">Cambiar nombre</button>
            <button class="btn small danger" data-bdel="${b.id}" data-name="${esc(b.name)}">Borrar banda</button></div>
          <p class="small muted" style="margin:.5rem 0 .3rem">${st.ensayos} ensayos · ${st.produccion} en producción · ${st.master} en master · ${st.masters_hechos} masters hechos · ${st.albumes} álbumes · Última actividad: ${ago(st.ultima_actividad)}</p>
          <div class="small muted row between"><span>Espacio</span><span>${fmtGB(b.used_gb)} de ${esc(b.quota_gb)} GB</span></div>
          <div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
          ${b.members.length ? `<table class="table" style="margin-top:.5rem"><tbody>${b.members.map((m) => `
            <tr><td>${esc(m.name || "—")}<div class="small muted">${esc(m.email)}</div></td>
            <td><select class="mini-sel" data-role="${b.id}:${m.user_id}" aria-label="Rol de ${esc(m.name || m.email)}"><option value="member" ${m.role === "member" ? "selected" : ""}>Integrante</option><option value="admin" ${m.role === "admin" ? "selected" : ""}>Admin de banda</option></select></td>
            <td style="text-align:right"><button class="icon-btn" data-rm="${b.id}:${m.user_id}" aria-label="Sacar a ${esc(m.name || m.email)} de ${esc(b.name)}" title="Sacar de la banda">${ic("x")}</button></td></tr>`).join("")}</tbody></table>`
            : `<p class="small muted" style="margin-top:.5rem">Sin integrantes todavía.</p>`}</div>`;
      }).join("") || `<p class="muted">Todavía no hay bandas.</p>`}
      <form id="nb" class="row" style="margin-top:.8rem">
        <input id="nbn" type="text" maxlength="120" placeholder="Nombre de la banda nueva" aria-label="Nombre de la banda nueva" required class="grow">
        <button class="btn primary">Crear banda</button>
      </form>
    </section>

    <section class="card"><h2>Personas</h2>
      <p class="small muted">Si alguien olvidó su contraseña, generale una nueva y pasásela. Puede cambiarla desde Tu cuenta.</p>
      <div class="table-wrap"><table class="table"><tbody>${users.map((u) => `
        <tr class="${u.active ? "" : "inactive"}"><td><div class="row" style="gap:.6rem;flex-wrap:nowrap">${avatar(u.photo, u.name || u.email)}
          <div><strong>${esc(u.name || "—")}</strong> ${u.is_super ? `<span class="badge">Super admin</span>` : ""}${u.active ? "" : ` <span class="badge raw">Desactivado</span>`}
          <div class="small muted">${esc(u.email)}</div>
          <div class="small muted">${u.bands.length ? u.bands.map((b) => esc(b.name) + (b.role === "admin" ? " (admin)" : "")).join(" · ") : "Sin banda"}</div></div></div></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn small" data-reset="${u.id}" data-who="${esc(u.name || u.email)}">${ic("key")} Nueva contraseña</button>
          ${u.id === state.me.id ? "" : `<button class="btn small ${u.active ? "danger" : ""}" data-active="${u.id}" data-to="${u.active ? "0" : "1"}">${u.active ? "Desactivar" : "Activar"}</button>`}</td></tr>`).join("")}
      </tbody></table></div>
    </section>

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

    <section class="card"><h2>Estilos de master</h2>
      <p class="small muted">El volumen objetivo se mide en LUFS: cuanto más cerca de 0, más fuerte. Se usa al masterizar "por estilo".</p>
      <table class="table"><thead><tr><th>Estilo</th><th>LUFS</th><th></th></tr></thead><tbody>
      ${genres.map((g) => `<tr data-g="${g.id}">
        <td><input type="text" data-f="name" value="${esc(g.name)}" aria-label="Nombre del estilo" maxlength="60"></td>
        <td style="width:90px"><input type="number" data-f="lufs" value="${g.target_lufs}" step="0.5" min="-24" max="-6" aria-label="LUFS de ${esc(g.name)}"></td>
        <td style="white-space:nowrap"><button class="btn small" data-gsave="${g.id}">Guardar</button> <button class="icon-btn" data-gdel="${g.id}" aria-label="Borrar estilo ${esc(g.name)}">${ic("trash")}</button></td></tr>`).join("")}
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
    const link = r.link_hint || `${location.origin}/#/invite/${r.invite_token}`;
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
  $$("[data-bren]").forEach((b) => b.addEventListener("click", () => {
    openModal(`<form id="brf" class="stack"><h2>Cambiar el nombre de la banda</h2>
      <div class="field"><label for="brn">Nombre</label><input id="brn" type="text" maxlength="120" value="${esc(b.dataset.name)}" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="brc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`, (m) => {
      $("#brc", m).addEventListener("click", closeModal);
      $("#brf", m).addEventListener("submit", guard(async (ev) => {
        ev.preventDefault();
        await api(`/admin/bands/${b.dataset.bren}`, { method: "PUT", json: { name: $("#brn", m).value } });
        closeModal(); state.me = await api("/me"); toast("Nombre guardado", "ok"); reload();
      }));
    });
  }));
  $$("[data-bdel]").forEach((b) => b.addEventListener("click", () => {
    openModal(`<form id="bdf" class="stack"><h2>Borrar "${esc(b.dataset.name)}"</h2>
      <p class="callout">Se borran <strong>todos</strong> sus ensayos, temas, masters, álbumes, eventos y avisos. No se puede deshacer. Las personas no se borran.</p>
      <div class="field"><label for="bdn">Para confirmar, escribí el nombre de la banda</label><input id="bdn" type="text" autocomplete="off" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="bdc">Cancelar</button><button class="btn danger">Borrar para siempre</button></div></form>`, (m) => {
      $("#bdc", m).addEventListener("click", closeModal);
      $("#bdf", m).addEventListener("submit", guard(async (ev) => {
        ev.preventDefault();
        await api(`/admin/bands/${b.dataset.bdel}?confirm_name=${encodeURIComponent($("#bdn", m).value)}`, { method: "DELETE" });
        closeModal(); state.me = await api("/me"); toast("Banda borrada", "ok"); reload();
      }));
    });
  }));
  $$("[data-role]").forEach((s) => s.addEventListener("change", guard(async () => {
    const [bid, uid] = s.dataset.role.split(":");
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "PUT", json: { role: s.value } });
    toast("Rol actualizado", "ok");
  })));
  $$("[data-rm]").forEach((b) => b.addEventListener("click", guard(async () => {
    const [bid, uid] = b.dataset.rm.split(":");
    if (!confirm("¿Sacar a esta persona de la banda? Deja de ver sus temas.")) return;
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "DELETE" });
    toast("Listo", "ok");
    reload();
  })));
  $$("[data-reset]").forEach((b) => b.addEventListener("click", guard(async () => {
    if (!confirm(`¿Generar una contraseña nueva para ${b.dataset.who}? La anterior deja de funcionar.`)) return;
    const r = await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: "POST" });
    const msg = `Hola ${r.name || ""}! Tu acceso a Diablo Master (${location.origin}): email ${r.email}, contraseña temporal ${r.password}. Entrá y cambiala desde Tu cuenta.`;
    openModal(`<div class="stack"><h2>Contraseña nueva</h2>
      <p>Para <strong>${esc(r.email)}</strong>. Pasásela ahora: <strong>no se vuelve a mostrar</strong>.</p>
      <div class="copybox"><span class="grow" style="font-size:1.25rem;letter-spacing:.04em">${esc(r.password)}</span><button type="button" class="btn small" id="cpw">Copiar</button></div>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cpd">Listo</button></div></div>`, (m) => {
      $("#cpw", m).addEventListener("click", () => copyText(r.password));
      $("#cpd", m).addEventListener("click", closeModal);
    });
  })));
  $$("[data-active]").forEach((b) => b.addEventListener("click", guard(async () => {
    const to = b.dataset.to === "1";
    if (!to && !confirm("¿Desactivar esta cuenta? No va a poder entrar, pero sus temas quedan.")) return;
    await api(`/admin/users/${b.dataset.active}`, { method: "PUT", json: { active: to } });
    toast(to ? "Cuenta activada" : "Cuenta desactivada", "ok");
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
    <div class="page-head"><div class="grow"><h1>Tu cuenta</h1></div></div>
    <section class="card"><div class="row" style="gap:1.2rem;align-items:flex-start">
      <div class="band-photo" style="border-radius:50%;width:96px;height:96px">${me.photo ? `<img src="${esc(me.photo)}" alt="Tu foto">` : `<div class="ph">${esc((me.name || me.email).charAt(0).toUpperCase())}</div>`}
        <button type="button" id="mphoto" aria-label="Cambiar tu foto" title="Cambiar tu foto">${ic("camera")}</button></div>
      <form id="nf" class="grow stack" style="min-width:240px">
        <div class="field" style="margin:0"><label for="nm">Tu nombre</label><input id="nm" type="text" maxlength="120" value="${esc(me.name || "")}" required></div>
        <p class="muted small" style="margin:0">${esc(me.email)}</p>
        <div class="row"><button class="btn primary">Guardar nombre</button><button type="button" class="btn" id="out">Cerrar sesión</button></div>
      </form></div>
    </section>
    <section class="card"><h2>Cambiar mi contraseña</h2>
      <form id="pf" class="stack">
        <div class="field" style="margin:0"><label for="pc">Contraseña actual</label><input id="pc" type="password" autocomplete="current-password" required></div>
        <div class="field" style="margin:0"><label for="pn">Contraseña nueva (mínimo 10 caracteres)</label><input id="pn" type="password" autocomplete="new-password" minlength="10" required></div>
        <div><button class="btn primary">Cambiar contraseña</button></div>
      </form>
      <p class="muted small" style="margin-bottom:0">¿La olvidaste? Pedile una nueva a quien administra la app.</p>
    </section>
    ${installCard()}
    <section class="card"><h2>Conexión con Reaper</h2>
      <p class="muted">Para subir tus renders directo desde Reaper hace falta un token personal. Es como una contraseña: no se lo des a nadie.</p>
      <div id="newtok" class="hidden stack" style="margin-bottom:1rem"></div>
      <form id="tf" class="row"><input id="tl" type="text" maxlength="80" value="Reaper de mi compu" aria-label="Nombre del token" class="grow"><button class="btn primary">Crear token</button></form>
      ${tokens.length ? `<table class="table" style="margin-top:.75rem"><tbody>${tokens.map((t) => `
        <tr><td>${esc(t.label)}<div class="small muted">Creado ${fmtDate(t.created_at)}${t.last_used_at ? " · último uso " + fmtDate(t.last_used_at) : " · sin usar"}</div></td>
        <td style="text-align:right"><button class="btn small danger" data-rev="${t.id}">Revocar</button></td></tr>`).join("")}</tbody></table>` : ""}
    </section>`);

  $("#out").addEventListener("click", () => logout(false));
  wireInstall();
  $("#pf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api("/me/password", { method: "POST", json: { current: $("#pc").value, new: $("#pn").value } });
      ev.target.reset();
      toast("Contraseña cambiada", "ok");
    } catch (e) { toast(e.message, "err"); }
  });
  $("#mphoto").addEventListener("click", () => pickImage((f) => sendPhoto("/me/photo", f)));
  $("#nf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      await api("/me", { method: "PUT", json: { name: $("#nm").value.trim() } });
      state.me = await api("/me");
      renderShell({ key: "account" });
      toast("Nombre guardado", "ok");
    } catch (e) { toast(e.message, "err"); }
  });
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
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.installEvt = e; if (state.me && /^#\/(account)?$/.test(location.hash || "#/")) router(); });
window.addEventListener("appinstalled", () => { state.installEvt = null; });
if ("serviceWorker" in navigator) window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
$("#scrim").addEventListener("click", closeDrawer);
$("#player-close").addEventListener("click", stopPlayer);
$("#audio").addEventListener("error", () => {
  if ($("#audio").getAttribute("src")) toast("No se pudo reproducir. Probá de nuevo con Escuchar.", "err");
});
$("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) closeModal(); });
$("#modal").addEventListener("close", () => { $("#modal").innerHTML = ""; });
router();
