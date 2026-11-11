/* Portada pública, planes, contacto y bloques desplegables. Se carga antes que app.js. */
"use strict";

const LAND_BLOCKS = [
  { k: "ensayos", icon: "mic", t: "Ensayos", lead: "Grabá el ensayo en el celular y que lo escuche toda la banda.",
    items: ["Grabás desde el navegador o subís el archivo (hasta varias horas)", "Cada ensayo queda ordenado por fecha y sesión",
      "Todos los integrantes escuchan y descargan en WAV, MP3 o FLAC", "Aviso automático a la banda cuando se sube algo nuevo", "Los ensayos crudos se borran solos para no ocupar espacio"] },
  { k: "produccion", icon: "music", t: "Producción", lead: "Demos, tomas y mezclas en un solo lugar, antes del master.",
    items: ["Subí desde REAPER con un clic (script incluido)", "Pistas separadas o mezcla completa", "Reproductor con loop A–B y velocidad para practicar un pasaje",
      "Asistente que te dice qué corregir en la mezcla", "Pasá cada tema a Master cuando esté listo"] },
  { k: "master", icon: "sliders", t: "Master", lead: "La herramienta principal: dejá tu mezcla lista para publicar y escuchá la diferencia.", star: true,
    items: ["Más de 70 estilos: rock, hard rock, heavy metal, stoner, punk, pop, funk, jazz, reggae, cumbia, hip hop y más",
      "Master por referencia: subí el tema que te gusta y el tuyo copia su sonido", "Controlás volumen, potencia, tono, ancho estéreo y el balance de instrumentos",
      "Si la batería tapa al resto, la baja; si el bajo no se oye, lo sube", "Informe de qué hizo, paso a paso, y comparación A/B a igual volumen"] },
  { k: "asistente", icon: "spark", t: "Asistente", lead: "Escucha tu audio y te explica qué corregir, en palabras simples.",
    items: ["Mide volumen, picos, saturación y compatibilidad estéreo", "Un veredicto claro y consejos priorizados", "Consejo personalizado con IA cuando lo necesitás",
      "Un chat con un ingeniero de audio para tus dudas de mezcla y master"] },
  { k: "albumes", icon: "disc", t: "Álbumes", lead: "Ordená los temas y armá la tapa del disco.",
    items: ["Arrastrá los temas hasta el orden final", "Tapa con tu foto, con estilos listos o generada con inteligencia artificial",
      "Tipografías, logo de la banda y marca de contenido explícito", "Todo en 3000 px, el tamaño que piden las plataformas"] },
  { k: "lanzamiento", icon: "rocket", t: "Lanzamiento", lead: "Descargá el álbum listo para cada plataforma.",
    items: ["WAV 24 bits, MP3 320 y la tapa, en un solo paquete", "Para Spotify, Apple Music y YouTube Music (con distribuidora)", "Para Bandcamp, directo de la banda",
      "Para vinilo y CD, con la guía de qué pedirle a la planta", "Guía paso a paso de cómo se publica en cada una"] },
  { k: "calendario", icon: "calendar", t: "Calendario", lead: "Ensayos y shows con aviso a toda la banda.",
    items: ["Agendá ensayos, shows y grabaciones", "Aviso automático a todos los integrantes", "Los próximos eventos aparecen en el inicio"] },
];

function landLogoBar(active) {
  return `<header class="l2-top">
    <a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">diablomastermix.com.ar</span></a>
    <nav class="l2-nav" aria-label="Secciones">
      <button type="button" class="l2-link" id="l2-plans-top">Planes</button>
      <button type="button" class="l2-link" id="l2-contact-top">Contacto</button>
      <a class="btn" href="#/login">Entrar</a>
    </nav></header>`;
}

function viewLanding() {
  setApp(`
    <section class="land2" aria-label="Diablo Master Mix">
      <div class="l2-bg" aria-hidden="true">
        <div class="l2-glow"></div>
        <svg class="l2-pulse" viewBox="0 0 1600 200" preserveAspectRatio="none">
          <path class="p2" d="M0 100 H520 l24 -10 l18 10 H640 l16 -28 l18 70 l22 -120 l22 150 l24 -140 l22 110 l20 -42 l14 0 H1000 l18 -10 l22 10 H1600"/>
          <path class="p1" d="M0 100 H520 l24 -10 l18 10 H640 l16 -28 l18 70 l22 -120 l22 150 l24 -140 l22 110 l20 -42 l14 0 H1000 l18 -10 l22 10 H1600"/>
        </svg>
      </div>
      ${landLogoBar()}
      <div class="l2-hero">
        <div class="l2-logo"><img src="/logo-hero.png" alt="Diablo Master Mix" width="1080" height="1080" fetchpriority="high"></div>
        <h1 class="l2-word">Diablo Master Mix</h1>
        <p class="l2-line">De la sala de ensayo al master, sin productora.</p>
        <div class="l2-cta">
          <a class="btn primary big" href="#/login">Entrar</a>
          <button type="button" class="btn big" id="l2-plans">Ver planes</button>
        </div>
      </div>
      <div class="l2-blocks" role="list" aria-label="Qué podés hacer. Tocá uno para ver qué trae.">
        ${LAND_BLOCKS.map((b, i) => `<button type="button" role="listitem" class="l2-blk ${b.star ? "star" : ""}" data-i="${i}" aria-haspopup="dialog">
          <span class="l2-ico">${ic(b.icon)}</span><span class="l2-bt">${b.t}</span></button>`).join("")}
      </div>
      <footer class="l2-foot"><span class="mark"><img src="/logo-mark.png" alt="">© ${new Date().getFullYear()} Diablo Master Mix · Propiedad de Puma Code</span>
        <a href="https://www.puma-code.com" target="_blank" rel="noopener">www.puma-code.com</a></footer>
    </section>`);
  const root = $(".land2");
  $("#l2-plans", root).addEventListener("click", openPlans);
  $("#l2-plans-top", root).addEventListener("click", openPlans);
  $("#l2-contact-top", root).addEventListener("click", () => openContact());
  // brillo que sigue al cursor en cada bloque
  $$(".l2-blk", root).forEach((b) => {
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      b.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
    b.addEventListener("click", () => openBlock(Number(b.dataset.i), b));
  });
  if (typeof chatMount === "function") chatMount();
}

function openBlock(i, from) {
  const b = LAND_BLOCKS[(i + LAND_BLOCKS.length) % LAND_BLOCKS.length];
  const idx = LAND_BLOCKS.indexOf(b);
  openModal(`
    <div class="blk">
      <button type="button" class="icon-btn blk-x" id="blk-x" aria-label="Cerrar">✕</button>
      <div class="blk-ico">${ic(b.icon)}</div>
      <h2>${b.t}</h2>
      <p class="blk-lead">${b.lead}</p>
      <ul class="blk-list">${b.items.map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="blk-foot">
        <button type="button" class="btn ghost small" id="blk-prev" aria-label="Bloque anterior">${ic("left")}</button>
        <span class="blk-dots" aria-hidden="true">${LAND_BLOCKS.map((_, j) => `<i class="${j === idx ? "on" : ""}"></i>`).join("")}</span>
        <button type="button" class="btn ghost small" id="blk-next" aria-label="Bloque siguiente">${ic("right")}</button>
        <span class="grow"></span>
        <button type="button" class="btn primary" id="blk-go">${b.star ? "Ver planes" : "Entrar"}</button>
      </div>
    </div>`, (m) => {
    m.classList.add("blk-dlg");
    if (from) {
      const r = from.getBoundingClientRect();
      m.style.setProperty("--ox", r.left + r.width / 2 + "px");
      m.style.setProperty("--oy", r.top + r.height / 2 + "px");
    }
    $("#blk-x", m).addEventListener("click", closeModal);
    $("#blk-prev", m).addEventListener("click", () => openBlock(idx - 1));
    $("#blk-next", m).addEventListener("click", () => openBlock(idx + 1));
    $("#blk-go", m).addEventListener("click", () => { closeModal(); if (b.star) openPlans(); else location.hash = "#/login"; });
  });
  $("#modal").addEventListener("close", () => { $("#modal").classList.remove("blk-dlg"); }, { once: true });
}

/* ---------------------------------------------------------------- planes */
const fmtARS = (n) => "$" + Number(n).toLocaleString("es-AR");

async function loadPublicConfig() {
  if (!state.pub) { try { state.pub = await api("/public-config"); } catch { state.pub = { plans: [], trial_days: 14, turnstile_site_key: "", chat: false }; } }
  return state.pub;
}

function planFeatures(p) {
  return [
    `<b>${p.masters_month}</b> masters por mes`, `<b>${p.quota_gb}</b> GB de espacio`, `Hasta <b>${p.max_members}</b> integrantes`,
    `<b>${p.ai_covers_month}</b> tapas con IA por mes`, "Estudio de master completo", "Informe y comparación A/B",
  ];
}

async function openPlans() {
  const cfg = await loadPublicConfig();
  openModal(`
    <div class="plans-wrap">
      <div class="st-modal-head"><h2>Un plan por banda, no por músico</h2><button type="button" class="icon-btn" id="pl-x" aria-label="Cerrar">✕</button></div>
      <p class="muted" style="margin:0 0 1.1rem">Lo paga el admin de la banda y lo usan todos los integrantes. Se cobra todos los meses con Mercado Pago y cancelás cuando quieras. ${cfg.trial_days ? `<b>${cfg.trial_days} días gratis</b> para probar.` : ""}</p>
      <div class="plans">
        ${cfg.plans.map((p) => `
          <article class="plan ${p.highlight ? "hl" : ""}">
            ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
            <h3>${esc(p.name)}</h3>
            <p class="plan-tag-line">${esc(p.tagline)}</p>
            <p class="plan-price"><b>${fmtARS(p.price_ars)}</b><span>por mes</span></p>
            <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
            <button type="button" class="btn ${p.highlight ? "primary" : ""}" data-plan="${esc(p.name)}">Quiero probar ${esc(p.name)}</button>
          </article>`).join("")}
      </div>
      <p class="small muted" style="margin:1rem 0 0">Hoy se entra por invitación: elegí un plan y te armamos la banda enseguida. Los precios están en pesos argentinos e incluyen todo, sin cargos por canción.</p>
    </div>`, (m) => {
    m.classList.add("wide");
    $("#pl-x", m).addEventListener("click", closeModal);
    $$("[data-plan]", m).forEach((b) => b.addEventListener("click", () => openContact(`Hola! Quiero probar Diablo Master Mix con el plan ${b.dataset.plan} para mi banda.`)));
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}

/* ---------------------------------------------------------------- contacto (Cloudflare Turnstile) */
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!state._tsPromise) {
    state._tsPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  return state._tsPromise;
}

async function openContact(prefill = "") {
  const cfg = await loadPublicConfig();
  let token = "", widget = null;
  const me = state.me;
  openModal(`
    <form id="cf" class="stack contact" novalidate>
      <div class="st-modal-head"><h2>Escribinos</h2><button type="button" class="icon-btn" id="cf-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small" style="margin:0">Contanos de tu banda y te respondemos por mail.</p>
      <div class="field"><label for="cf-name">Tu nombre</label><input id="cf-name" type="text" maxlength="120" autocomplete="name" required value="${esc(me ? me.name || "" : "")}"></div>
      <div class="field"><label for="cf-email">Tu email</label><input id="cf-email" type="email" maxlength="255" autocomplete="email" required value="${esc(me ? me.email : "")}"></div>
      <div class="field"><label for="cf-band">Banda (opcional)</label><input id="cf-band" type="text" maxlength="120"></div>
      <div class="field"><label for="cf-msg">Mensaje</label><textarea id="cf-msg" rows="5" maxlength="3000" required>${esc(prefill)}</textarea></div>
      <div class="hp" aria-hidden="true"><label>No completar<input id="cf-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="cf-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="cf-err" role="alert"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cf-cancel">Cancelar</button><button class="btn primary" id="cf-send">Enviar mensaje</button></div>
    </form>`, (m) => {
    $("#cf-x", m).addEventListener("click", closeModal);
    $("#cf-cancel", m).addEventListener("click", closeModal);
    if (cfg.turnstile_site_key) {
      loadTurnstile().then(() => {
        widget = window.turnstile.render("#cf-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: "es",
          callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
      }).catch(() => { const e = $("#cf-err", m); e.textContent = "No se pudo cargar la verificación anti-robots. Revisá tu conexión."; e.classList.remove("hidden"); });
    }
    $("#cf", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = $("#cf-err", m); err.classList.add("hidden");
      const body = { name: $("#cf-name", m).value.trim(), email: $("#cf-email", m).value.trim(), band: $("#cf-band", m).value.trim(),
        message: $("#cf-msg", m).value.trim(), website: $("#cf-web", m).value, turnstile_token: token };
      if (!body.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || body.message.length < 5) {
        err.textContent = "Completá tu nombre, un email válido y el mensaje."; err.classList.remove("hidden"); return;
      }
      if (cfg.turnstile_site_key && !token) { err.textContent = "Marcá la casilla “No soy un robot”."; err.classList.remove("hidden"); return; }
      await withBusy($("#cf-send", m), async () => {
        try {
          await api("/contact", { method: "POST", json: body });
          openModal(`<div class="stack" style="text-align:center;padding:1rem .5rem"><div class="blk-ico">${ic("flame")}</div><h2>¡Mensaje enviado!</h2>
            <p class="muted">Gracias por escribirnos. Te respondemos por mail lo antes posible.</p><button class="btn primary" id="cf-ok">Listo</button></div>`,
            (m2) => $("#cf-ok", m2).addEventListener("click", closeModal));
        } catch (e) {
          err.textContent = e.message; err.classList.remove("hidden");
          if (widget !== null && window.turnstile) { window.turnstile.reset(widget); token = ""; }
        }
      });
    });
  });
}
