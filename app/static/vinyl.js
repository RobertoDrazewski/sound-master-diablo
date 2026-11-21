/* Tocadiscos de los álbumes: el vinilo lleva la tapa del disco, gira mientras suena y
   reproduce el álbum completo, en orden o aleatorio. Usa el reproductor general (#audio). */

const VY = { album: null, title: "", list: [], order: [], pos: 0, url: null, shuffle: false };
try { VY.shuffle = localStorage.getItem("dm.vy.shuffle") === "1"; } catch { /* sin almacenamiento */ }

function vyIcon(n) {
  const p = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    stop: '<path d="M6 6h12v12H6z"/>',
    prev: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
    next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
    shuffle: '<path d="M16 3h5v5l-1.8-1.8L5.4 20 4 18.6 17.8 4.8zM4 5.4 5.4 4l5.2 5.2-1.4 1.4zm10.4 9.2 1.4-1.4 3.4 3.4L21 15v5h-5l1.8-1.8z"/>',
    order: '<path d="M4 6h12v2H4zm0 5h12v2H4zm0 5h8v2H4zm14-3v-3h2v3h3l-4 4-4-4z"/>',
  }[n];
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${p}</svg>`;
}

function vyAudio() { return document.getElementById("audio"); }

// lo que se puede escuchar del álbum, en el orden del disco
function vyPlayable(a) {
  return a.tracks.map((t, i) => ({ t, i, v: bestPlayable(t) })).filter((x) => x.v)
    .map((x) => ({ vid: x.v.id, title: x.t.title, n: x.i + 1 }));
}

function vyShuffled(n, first) {
  const rest = [...Array(n).keys()].filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return first == null ? rest : [first, ...rest];
}

function vyActive(aid) {
  const a = vyAudio();
  return VY.album === aid && a && VY.url && a.src === VY.url;
}

async function vyPlayAt(pos) {
  const item = VY.list[VY.order[pos]];
  if (!item) return vyStop();
  VY.pos = pos;
  try {
    const { url } = await api(`/versions/${item.vid}/link?fmt=preview`);
    await playUrl(url, `${VY.title} · ${item.title}`);
    VY.url = vyAudio().src;
  } catch (e) { toast(e.message, "err"); }
  vyPaint();
}

// arranca el disco; start = índice del tema en VY.list (o null para el principio)
function vyStart(a, start = null) {
  VY.album = a.id;
  VY.title = a.title;
  VY.list = vyPlayable(a);
  if (!VY.list.length) { toast("Este álbum todavía no tiene temas con audio", "err"); return; }
  VY.order = VY.shuffle ? vyShuffled(VY.list.length, start) : [...VY.list.keys()];
  return vyPlayAt(start == null || VY.shuffle ? 0 : start);
}

function vyStop() {
  const keep = VY.album;
  VY.album = null; VY.url = null;
  if (keep != null) stopPlayer();
  vyPaint();
}

function vyStep(d) {
  if (VY.album == null) return;
  // "anterior" con el tema ya avanzado lo vuelve a empezar, como en cualquier reproductor
  if (d < 0 && vyAudio().currentTime > 3) { vyAudio().currentTime = 0; return; }
  const p = VY.pos + d;
  if (p < 0) { vyAudio().currentTime = 0; return; }
  if (p >= VY.order.length) return vyStop();
  return vyPlayAt(p);
}

function vySetShuffle(on) {
  VY.shuffle = on;
  try { localStorage.setItem("dm.vy.shuffle", on ? "1" : "0"); } catch { /* sin almacenamiento */ }
  if (VY.album != null) {   // reordena lo que falta sin cortar el tema que suena
    const cur = VY.order[VY.pos];
    VY.order = on ? vyShuffled(VY.list.length, cur) : [...VY.list.keys()];
    VY.pos = VY.order.indexOf(cur);
  }
  vyPaint();
}

function vyPaint() {
  const a = vyAudio();
  document.querySelectorAll(".vinyl").forEach((el) => {
    const aid = Number(el.dataset.album);
    const on = vyActive(aid);
    const playing = on && !a.paused;
    el.classList.toggle("is-active", !!on);
    el.classList.toggle("is-playing", !!playing);
    const pb = el.querySelector(".vy-play");
    const st = playing ? "pause" : "play";
    if (pb && pb.dataset.st !== st) {   // solo cuando cambia: si se redibuja siempre, el clic se pierde
      pb.dataset.st = st;
      pb.innerHTML = vyIcon(st);
      pb.setAttribute("aria-label", playing ? "Pausar el disco" : "Escuchar el disco");
    }
    const sh = el.querySelector(".vy-shuffle");
    if (sh) {
      sh.classList.toggle("on", VY.shuffle);
      sh.setAttribute("aria-pressed", VY.shuffle ? "true" : "false");
      sh.title = VY.shuffle ? "Aleatorio" : "En orden";
      const lab = sh.querySelector("span");
      const want = VY.shuffle ? "Aleatorio" : "En orden";
      if (lab && lab.textContent !== want) { lab.textContent = want; sh.querySelector("svg").outerHTML = vyIcon(VY.shuffle ? "shuffle" : "order"); }
    }
    const now = el.querySelector(".vy-now");
    const item = on ? VY.list[VY.order[VY.pos]] : null;
    const txt = item ? `${item.n}. ${item.title}` : "Escuchá el disco completo";
    if (now && now.textContent !== txt) now.textContent = txt;
    const card = el.closest(".card");
    if (card) card.querySelectorAll(".tracklist li[data-vid]").forEach((li) => li.classList.toggle("vy-cur", !!(item && Number(li.dataset.vid) === item.vid)));
  });
}

// eventos del reproductor general: giran los vinilos y pasa al siguiente tema solo
["play", "pause", "emptied", "loadstart"].forEach((ev) => document.addEventListener(ev, (e) => {
  if (e.target && e.target.id === "audio") vyPaint();
}, true));
document.addEventListener("ended", (e) => {
  if (!e.target || e.target.id !== "audio") return;
  if (VY.album != null && vyAudio().src === VY.url) vyStep(1); else vyPaint();
}, true);

function vinylHTML(a) {
  const cover = a.photo ? esc(a.photo) : "/img/tapa-diablo.jpg";
  const playable = a.tracks.some((t) => bestPlayable(t));
  return `<div class="vinyl" data-album="${a.id}">
    <div class="vy-deck">
      <div class="vy-disc" aria-hidden="true"><div class="vy-spin"><div class="vy-grooves"></div><img class="vy-label" src="${cover}" alt=""><i class="vy-hole"></i></div><i class="vy-sheen"></i></div>
      <div class="vy-sleeve cover"><img src="${cover}" alt="Tapa de ${esc(a.title)}">
        <button type="button" data-act="cover" data-album="${a.id}" aria-label="Cambiar la tapa de ${esc(a.title)}" title="Cambiar la tapa">${ic("camera")}</button></div>
      <svg class="vy-arm" viewBox="0 0 60 200" aria-hidden="true">
        <circle cx="30" cy="22" r="17" class="vy-arm-base"/><circle cx="30" cy="22" r="7" class="vy-arm-pin"/>
        <path d="M30 22 L30 150 L20 178" class="vy-arm-bar"/><rect x="11" y="172" width="16" height="22" rx="3" class="vy-arm-head" transform="rotate(22 19 183)"/>
      </svg>
    </div>
    <div class="vy-ctrl">
      <button type="button" class="vy-btn vy-shuffle ${VY.shuffle ? "on" : ""}" data-vy="shuffle" aria-pressed="${VY.shuffle}" title="${VY.shuffle ? "Aleatorio" : "En orden"}">${vyIcon(VY.shuffle ? "shuffle" : "order")}<span>${VY.shuffle ? "Aleatorio" : "En orden"}</span></button>
      <div class="vy-main">
        <button type="button" class="vy-btn" data-vy="prev" aria-label="Tema anterior" title="Anterior">${vyIcon("prev")}</button>
        <button type="button" class="vy-btn vy-play" data-vy="play" data-st="play" aria-label="Escuchar el disco" ${playable ? "" : "disabled"}>${vyIcon("play")}</button>
        <button type="button" class="vy-btn" data-vy="stop" aria-label="Detener" title="Detener">${vyIcon("stop")}</button>
        <button type="button" class="vy-btn" data-vy="next" aria-label="Tema siguiente" title="Siguiente">${vyIcon("next")}</button>
      </div>
    </div>
    <p class="vy-now small muted">${playable ? "Escuchá el disco completo" : "Sumale temas con audio para escucharlo"}</p>
  </div>`;
}

// conecta los controles de los vinilos dentro de "box"; getAlbum(id) devuelve el álbum actual
function vinylWire(box, getAlbum) {
  box.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-vy]");
    if (!b || b.disabled) return;
    ev.stopPropagation();
    const aid = Number(b.closest(".vinyl").dataset.album);
    const a = getAlbum(aid);
    if (!a) return;
    const act = b.dataset.vy;
    if (act === "shuffle") return vySetShuffle(!VY.shuffle);
    if (act === "stop") { if (vyActive(aid)) vyStop(); return; }
    if (act === "play") {
      if (vyActive(aid)) { const au = vyAudio(); if (au.paused) au.play().catch(() => {}); else au.pause(); return; }
      return vyStart(a);
    }
    if (!vyActive(aid)) return vyStart(a);
    return vyStep(act === "next" ? 1 : -1);
  });
  vyPaint();
}
