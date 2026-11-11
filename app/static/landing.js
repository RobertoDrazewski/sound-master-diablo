/* Portada pública, planes, contacto y bloques desplegables. Se carga antes que app.js. */
"use strict";


const LAND_BLOCKS = [
  { k: "ensayos", icon: "mic", t: "Ensayos", img: "/img/herramienta-ensayos.jpg", lead: "Grabá el ensayo en el celular y que lo escuche toda la banda.",
    items: ["Grabás desde el navegador o subís el archivo (hasta varias horas)", "Cada ensayo queda ordenado por fecha y sesión",
      "Todos los integrantes escuchan y descargan en WAV, MP3 o FLAC", "Aviso automático a la banda cuando se sube algo nuevo", "Los ensayos crudos se borran solos para no ocupar espacio"] },
  { k: "produccion", icon: "music", t: "Producción", img: "/img/hero-escenario.jpg", pos: "8% 70%", lead: "Demos, tomas y mezclas en un solo lugar, antes del master.",
    items: ["Subí desde REAPER con un clic (script incluido)", "Pistas separadas o mezcla completa", "Reproductor con loop A–B y velocidad para practicar un pasaje",
      "Asistente que te dice qué corregir en la mezcla", "Pasá cada tema a Master cuando esté listo"] },
  { k: "master", icon: "sliders", t: "Master", img: "/img/herramienta-master.jpg", star: true, lead: "La herramienta principal: dejá tu mezcla lista para publicar y escuchá la diferencia.",
    items: ["Más de 70 estilos: rock, hard rock, heavy metal, stoner, punk, pop, funk, jazz, reggae, cumbia, hip hop y más",
      "Master por referencia: subí el tema que te gusta y el tuyo copia su sonido", "Controlás volumen, potencia, tono, ancho estéreo y el balance de instrumentos",
      "Si la batería tapa al resto, la baja; si el bajo no se oye, lo sube", "Informe de qué hizo, paso a paso, y comparación A/B a igual volumen"] },
  { k: "asistente", icon: "spark", t: "Asistente", img: "/img/herramienta-asistente.jpg", lead: "Escucha tu audio y te explica qué corregir, en palabras simples.",
    items: ["Mide volumen, picos, saturación y compatibilidad estéreo", "Un veredicto claro y consejos priorizados", "Consejo personalizado con IA cuando lo necesitás",
      "Un chat con un ingeniero de audio para tus dudas de mezcla y master"] },
  { k: "albumes", icon: "disc", t: "Álbumes", img: "/img/herramienta-albumes.jpg", lead: "Ordená los temas y armá la tapa del disco.",
    items: ["Arrastrá los temas hasta el orden final", "Tapa con tu foto, con estilos listos o generada con inteligencia artificial",
      "Tipografías, logo de la banda y marca de contenido explícito", "Todo en 3000 px, el tamaño que piden las plataformas"] },
  { k: "lanzamiento", icon: "rocket", t: "Lanzamiento", img: "/img/hero-escenario.jpg", pos: "92% 25%", lead: "Descargá el álbum listo para cada plataforma.",
    items: ["WAV 24 bits, MP3 320 y la tapa, en un solo paquete", "Para Spotify, Apple Music y YouTube Music (con distribuidora)", "Para Bandcamp, directo de la banda",
      "Para vinilo y CD, con la guía de qué pedirle a la planta", "Guía paso a paso de cómo se publica en cada una"] },
  { k: "calendario", icon: "calendar", t: "Calendario", img: "/img/herramienta-calendario.jpg", lead: "Ensayos y shows con aviso a toda la banda.",
    items: ["Agendá ensayos, shows y grabaciones", "Aviso automático a todos los integrantes", "Los próximos eventos aparecen en el inicio"] },
  { k: "musicos", icon: "users", t: "Banco de músicos", img: "/img/hero-escenario.jpg", pos: "70% 40%", lead: "¿Te falta un bajista o un tecladista? Encontralo sin salir de la app.",
    items: ["Músicos disponibles para tocar en otros proyectos, por instrumento, estilo y zona", "Perfil con foto, bio, equipamiento, movilidad y sala de ensayo propia",
      "Contacto directo por WhatsApp o mail, con el mensaje ya escrito", "Publicá qué músico buscás y que lo vean los demás admins", "Solo lo ve el admin de cada banda; el músico decide si aparece"] },
];
const LAND_FLOW = [
  { icon: "mic", t: "Grabá", d: "El ensayo, desde el celular" },
  { icon: "music", t: "Producí", d: "Demos, tomas y mezclas" },
  { icon: "sliders", t: "Masterizá", d: "Con el sonido de tu estilo" },
  { icon: "rocket", t: "Publicá", d: "Listo para cada plataforma" },
];
const EKG_D = "M0 100 H520 l24 -10 l18 10 H640 l16 -28 l18 70 l22 -120 l22 150 l24 -140 l22 110 l20 -42 l14 0 H1000 l18 -10 l22 10 H1600";
const ekg = () => `<svg class="l2-ekg" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true"><path class="p2" d="${EKG_D}"/><path class="p1" d="${EKG_D}"/></svg>`;

function landLogoBar() {
  return `<header class="l2-top">
    <a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">diablomastermix.com.ar</span></a>
    <nav class="l2-nav" aria-label="Secciones">
      <button type="button" class="l2-link l2-opt" data-go="l2-planes">Planes</button>
      <button type="button" class="l2-link l2-opt" data-go="l2-contacto">Contacto</button>
      <a class="btn" href="#/login">Entrar</a>
      <button type="button" class="btn primary l2-reg" data-reg>Registrá tu banda</button>
    </nav></header>`;
}

/* regla de diseño: el ícono va siempre a la izquierda y el texto a la derecha; nada de números en los bloques */
function landHead(b) {
  return `<div class="l2-hd"><span class="l2-ibox">${ic(b.icon)}</span><div class="l2-ht"><h3>${b.t}</h3><p class="l2-lead">${b.lead}</p></div></div>`;
}
function landList(b) { return `<ul class="l2-list">${b.items.map((x) => `<li>${x}</li>`).join("")}</ul>`; }
function landPic(b, cls = "") {
  return `<div class="l2-pic ${cls}" style="background-image:url(${b.img});--pos:${b.pos || "50% 50%"}" role="img" aria-label="${b.t}"></div>`;
}

function landGo(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  return true;
}

function viewLanding() {
  const master = LAND_BLOCKS.find((b) => b.star);
  const rest = LAND_BLOCKS.filter((b) => !b.star);
  setApp(`
    <div class="l2-page">
      ${landLogoBar()}
      <section class="land2" aria-label="Diablo Master Mix">
        <div class="l2-bg" aria-hidden="true">
          <div class="l2-glow"></div>
          <svg class="l2-pulse" viewBox="0 0 1600 200" preserveAspectRatio="none">
            <path class="p2" d="${EKG_D}"/><path class="p1" d="${EKG_D}"/>
          </svg>
        </div>
        <div class="l2-hero">
          <div class="l2-logo"><img src="/logo-hero.png" alt="Diablo Master Mix" width="1080" height="1080" fetchpriority="high"></div>
          <h1 class="l2-word">Diablo Master Mix</h1>
          <p class="l2-pro">Masterización de audio con IA: la herramienta perfecta para bandas independientes.</p>
          <p class="l2-line">De la sala de ensayo al master, sin productora.</p>
          <div class="l2-cta">
            <a class="btn primary big" href="#/login">Entrar</a>
            <button type="button" class="btn big" data-go="l2-planes">Ver planes</button>
          </div>
        </div>
        <button type="button" class="l2-cue" data-go="l2-flow" aria-label="Ver qué trae">${ic("down")}</button>
      </section>

      <div class="l2-rest">
        <div class="l2-stage" aria-hidden="true"></div>

        <section class="l2-sec l2-flow" id="l2-flow">
          <h2 class="l2-h">Todo el camino de tu banda, en un solo lugar</h2>
          <ul class="l2-steps">
            ${LAND_FLOW.map((s) => `<li><span class="l2-ibox">${ic(s.icon)}</span><span class="l2-st"><b>${s.t}</b><small>${s.d}</small></span></li>`).join("")}
          </ul>
        </section>

        <section class="l2-sec" id="l2-master" aria-label="Master">
          <article class="l2-card l2-spot" data-glow>
            ${landPic(master, "tall")}
            <div class="l2-body">
              <span class="l2-star">La herramienta principal</span>
              ${landHead(master)}
              ${landList(master)}
              <div class="l2-cta left"><a class="btn primary" href="#/login">Entrar</a><button type="button" class="btn" data-go="l2-planes">Ver planes</button></div>
            </div>
          </article>
        </section>

        ${ekg()}

        <section class="l2-sec" id="l2-features" aria-label="Qué trae">
          <h2 class="l2-h">Lo que necesita una banda, sin vueltas</h2>
          <div class="l2-grid">
            ${rest.map((b) => `<article class="l2-card" data-glow id="f-${b.k}">
              ${landPic(b)}
              <div class="l2-body">${landHead(b)}${landList(b)}</div></article>`).join("")}
          </div>
        </section>

        ${ekg()}

        <section class="l2-sec" id="l2-planes" aria-label="Planes">
          <h2 class="l2-h">Un plan por banda, no por músico</h2>
          <p class="l2-sub" id="l2-plans-sub">Lo paga el admin de la banda y lo usan todos los integrantes. Se cobra todos los meses con Mercado Pago y cancelás cuando quieras.</p>
          <div class="plans l2-plans" id="l2-plans-box"><p class="muted">Cargando planes…</p></div>
        </section>

        <section class="l2-sec l2-contact" id="l2-contacto" aria-label="Contacto">
          <h2 class="l2-h">Escribinos</h2>
          <div class="l2-card l2-form" data-glow id="l2-form-box"></div>
        </section>
      </div>

      <footer class="l2-foot">
        <div class="l2-fl">
          <span class="l2-fbrand"><img src="/logo-mark.png" alt="" width="28" height="28"><b>Diablo Master Mix</b></span>
          <p>Del ensayo al master, sin productora.</p>
          <nav class="l2-flinks" aria-label="Accesos"><button type="button" data-go="l2-planes">Planes</button><button type="button" data-go="l2-contacto">Contacto</button><a href="#/login">Entrar</a></nav>
          <small>© ${new Date().getFullYear()} Diablo Master Mix. Todos los derechos reservados.</small>
        </div>
        <a class="l2-fmid" href="https://www.puma-code.com" target="_blank" rel="noopener" aria-label="Puma Code"><img src="/img/puma-code.png" alt="Puma Code" width="72" height="72"></a>
        <div class="l2-fr">
          <b>Puma Code</b>
          <p>Software a medida y ciberseguridad.</p>
          <small>© ${new Date().getFullYear()} Puma Code. Todos los derechos reservados.</small>
        </div>
      </footer>
    </div>`);
  const root = $(".l2-page");
  $$("[data-go]", root).forEach((b) => b.addEventListener("click", () => landGo(b.dataset.go)));
  $$("[data-reg]", root).forEach((b) => b.addEventListener("click", () => openPlans()));

  // la barra superior se vuelve sólida al bajar
  if (!window._l2scroll) {
    window._l2scroll = true;
    addEventListener("scroll", () => { const t = document.querySelector(".l2-top"); if (t) t.classList.toggle("scrolled", scrollY > 30); }, { passive: true });
  }
  // brillo que sigue al cursor y borde encendido cuando la tarjeta está a la vista
  $$("[data-glow]", root).forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      c.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("in", e.isIntersecting)), { rootMargin: "-18% 0px -18% 0px", threshold: 0.12 });
    $$("[data-glow]", root).forEach((c) => io.observe(c));
  } else $$("[data-glow]", root).forEach((c) => c.classList.add("in"));

  landPlans();
  landContact($("#l2-form-box", root));
  if (typeof chatMount === "function") chatMount();
}

/* sello de cobro: logo de Mercado Pago a la izquierda y el texto a la derecha */
function mpBadge() {
  return `<div class="plan-mp"><img class="plan-mp-logo" src="/img/mercadopago.png" alt="Mercado Pago" width="52" height="52"><p><b>Suscripción de Mercado Pago</b><small>Cobro mensual automático. Cancelás cuando quieras.</small></p></div>`;
}

async function landPlans() {
  const box = document.getElementById("l2-plans-box");
  if (!box) return;
  const cfg = await loadPublicConfig();
  if (!document.getElementById("l2-plans-box")) return;
  if (cfg.trial_days) $("#l2-plans-sub").innerHTML += ` <b>${cfg.trial_days} días gratis</b> para probar.`;
  box.innerHTML = cfg.plans.map((p) => `
    <article class="plan ${p.highlight ? "hl" : ""}">
      ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
      <h3>${esc(p.name)}</h3>
      <p class="plan-tag-line">${esc(p.tagline)}</p>
      <p class="plan-price"><b>${fmtARS(p.price_ars)}</b><span>por mes</span></p>
      <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
      ${mpBadge()}
      <button type="button" class="btn ${p.highlight ? "primary" : ""}" data-plan="${p.id}">Elegir ${esc(p.name)}</button>
    </article>`).join("") + `<p class="small muted l2-plans-note">Pagás con Mercado Pago y apenas se confirma te mandamos por mail el acceso a tu banda. Los precios están en pesos argentinos e incluyen todo, sin cargos por canción. Si te das de baja, se eliminan todos los datos de la banda a las 48 horas. ¿Dudas? Escribinos en Contacto.</p>`;
  $$("[data-plan]", box).forEach((b) => b.addEventListener("click", () => openSignup(cfg.plans.find((p) => String(p.id) === b.dataset.plan))));
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
    `<b>${p.ai_covers_month}</b> tapas con IA por mes`, "Estudio de master completo", "Informe y comparación A/B", "Banco de músicos: encontrá integrantes y publicá búsquedas",
  ];
}

async function openPlans() {
  if (document.getElementById("l2-planes")) return landGo("l2-planes");
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
            ${mpBadge()}
            <button type="button" class="btn ${p.highlight ? "primary" : ""}" data-plan="${p.id}">Elegir ${esc(p.name)}</button>
          </article>`).join("")}
      </div>
      <p class="small muted" style="margin:1rem 0 0">Pagás con Mercado Pago y apenas se confirma te mandamos por mail el acceso a tu banda. Los precios están en pesos argentinos e incluyen todo, sin cargos por canción. Si te das de baja, se eliminan todos los datos de la banda a las 48 horas.</p>
    </div>`, (m) => {
    m.classList.add("wide");
    $("#pl-x", m).addEventListener("click", closeModal);
    $$("[data-plan]", m).forEach((b) => b.addEventListener("click", () => openSignup(cfg.plans.find((p) => String(p.id) === b.dataset.plan))));
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

function contactFields(cfg, prefill) {
  const me = state.me;
  return `
      <div class="field"><label for="cf-name">Tu nombre</label><input id="cf-name" type="text" maxlength="120" autocomplete="name" required value="${esc(me ? me.name || "" : "")}"></div>
      <div class="field"><label for="cf-email">Tu email</label><input id="cf-email" type="email" maxlength="255" autocomplete="email" required value="${esc(me ? me.email : "")}"></div>
      <div class="field"><label for="cf-band">Banda (opcional)</label><input id="cf-band" type="text" maxlength="120"></div>
      <div class="field"><label for="cf-msg">Mensaje</label><textarea id="cf-msg" rows="5" maxlength="3000" required>${esc(prefill)}</textarea></div>
      <div class="hp" aria-hidden="true"><label>No completar<input id="cf-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="cf-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="cf-err" role="alert"></p>`;
}

/* Envío del formulario de contacto. root: contenedor con el <form id="cf">; sent(): qué mostrar al terminar. */
function bindContact(root, cfg, sent) {
  let token = "", widget = null;
  if (cfg.turnstile_site_key) {
    loadTurnstile().then(() => {
      widget = window.turnstile.render("#cf-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: "es",
        callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
    }).catch(() => { const e = $("#cf-err", root); e.textContent = "No se pudo cargar la verificación anti-robots. Revisá tu conexión."; e.classList.remove("hidden"); });
  }
  $("#cf", root).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#cf-err", root); err.classList.add("hidden");
    const body = { name: $("#cf-name", root).value.trim(), email: $("#cf-email", root).value.trim(), band: $("#cf-band", root).value.trim(),
      message: $("#cf-msg", root).value.trim(), website: $("#cf-web", root).value, turnstile_token: token };
    if (!body.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || body.message.length < 5) {
      err.textContent = "Completá tu nombre, un email válido y el mensaje."; err.classList.remove("hidden"); return;
    }
    if (cfg.turnstile_site_key && !token) { err.textContent = "Marcá la casilla “No soy un robot”."; err.classList.remove("hidden"); return; }
    await withBusy($("#cf-send", root), async () => {
      try {
        await api("/contact", { method: "POST", json: body });
        sent();
      } catch (e) {
        err.textContent = e.message; err.classList.remove("hidden");
        if (widget !== null && window.turnstile) { window.turnstile.reset(widget); token = ""; }
      }
    });
  });
}

const contactThanks = () => `<div class="stack" style="text-align:center;padding:1rem .5rem"><div class="blk-ico" style="margin-inline:auto">${ic("flame")}</div><h3>¡Mensaje enviado!</h3>
  <p class="muted">Gracias por escribirnos. Te respondemos por mail lo antes posible.</p></div>`;

/* Formulario dentro de la portada (sin ventana). */
async function landContact(box) {
  const cfg = await loadPublicConfig();
  if (!box.isConnected) return;
  box.innerHTML = `<form id="cf" class="stack contact" novalidate>
      <p class="muted" style="margin:0">Contanos de tu banda y te respondemos por mail.</p>
      ${contactFields(cfg, "")}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cf-send">Enviar mensaje</button></div>
    </form>`;
  bindContact(box, cfg, () => { box.innerHTML = contactThanks(); });
}

/* Ventana de contacto: solo para quien ya está dentro de la app. En la portada se baja al formulario. */
async function openContact(prefill = "") {
  if (document.getElementById("l2-contacto")) {
    const m = document.getElementById("cf-msg");
    if (m && prefill) m.value = prefill;
    return landGo("l2-contacto");
  }
  const cfg = await loadPublicConfig();
  openModal(`
    <form id="cf" class="stack contact" novalidate>
      <div class="st-modal-head"><h2>Escribinos</h2><button type="button" class="icon-btn" id="cf-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small" style="margin:0">Contanos de tu banda y te respondemos por mail.</p>
      ${contactFields(cfg, prefill)}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cf-cancel">Cancelar</button><button class="btn primary" id="cf-send">Enviar mensaje</button></div>
    </form>`, (m) => {
    $("#cf-x", m).addEventListener("click", closeModal);
    $("#cf-cancel", m).addEventListener("click", closeModal);
    bindContact(m, cfg, () => {
      openModal(`<div class="stack" style="text-align:center;padding:1rem .5rem"><div class="blk-ico" style="margin-inline:auto">${ic("flame")}</div><h2>¡Mensaje enviado!</h2>
        <p class="muted">Gracias por escribirnos. Te respondemos por mail lo antes posible.</p><button class="btn primary" id="cf-ok">Listo</button></div>`,
        (m2) => $("#cf-ok", m2).addEventListener("click", closeModal));
    });
  });
}


/* ---------------------------------------------------------------- compra: la banda se registra y paga sola */
async function openSignup(plan) {
  if (!plan) return;
  const cfg = await loadPublicConfig();
  const trial = cfg.trial_days || 0;
  openModal(`
    <form id="sg" class="stack signup" novalidate>
      <div class="st-modal-head"><h2>Plan ${esc(plan.name)}</h2><button type="button" class="icon-btn" id="sg-x" aria-label="Cerrar">✕</button></div>
      <div class="sg-plan">
        <span class="l2-ibox">${ic("card")}</span>
        <div class="sg-pt"><b>${fmtARS(plan.price_ars)} <small>por mes</small></b>
          <span>${trial ? `${trial} días gratis y después se cobra todos los meses.` : "Se cobra todos los meses."} Cancelás cuando quieras; al darte de baja se eliminan los datos de la banda a las 48 horas.</span></div>
      </div>
      <ul class="sg-feat">${planFeatures(plan).map((f) => `<li><span class="sg-ck" aria-hidden="true">✓</span><span>${f}</span></li>`).join("")}</ul>
      <div class="field"><label for="sg-band">Nombre de la banda</label><input id="sg-band" type="text" maxlength="120" autocomplete="organization" required></div>
      <div class="field"><label for="sg-name">Tu nombre</label><input id="sg-name" type="text" maxlength="120" autocomplete="name" required></div>
      <div class="field"><label for="sg-email">Tu email</label><input id="sg-email" type="email" maxlength="255" autocomplete="email" inputmode="email" required>
        <small class="muted">Ahí te mandamos la confirmación y tu clave de acceso.</small></div>
      <details class="sg-other"><summary>Mi cuenta de Mercado Pago usa otro email</summary>
        <div class="field"><label for="sg-payer">Email de tu cuenta de Mercado Pago</label><input id="sg-payer" type="email" maxlength="255" inputmode="email"></div></details>
      <div class="hp" aria-hidden="true"><label>No completar<input id="sg-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="sg-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="sg-err" role="alert"></p>
      <div class="row sg-actions"><button type="button" class="btn" id="sg-cancel">Cancelar</button><button class="btn primary" id="sg-go">Suscribirme y pagar</button></div>
      <p class="small muted" style="margin:0">Pagás en Mercado Pago, de forma segura. Cuando se confirma, tu banda queda creada y recibís el acceso por mail.</p>
    </form>`, (m) => {
    m.classList.add("wide");
    let token = "", widget = null;
    $("#sg-x", m).addEventListener("click", closeModal);
    $("#sg-cancel", m).addEventListener("click", closeModal);
    if (cfg.turnstile_site_key) {
      loadTurnstile().then(() => {
        widget = window.turnstile.render("#sg-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: "es",
          callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
      }).catch(() => { const e = $("#sg-err", m); e.textContent = "No se pudo cargar la verificación anti-robots. Revisá tu conexión."; e.classList.remove("hidden"); });
    }
    $("#sg", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = $("#sg-err", m); err.classList.add("hidden");
      const body = { plan_id: plan.id, band_name: $("#sg-band", m).value.trim(), name: $("#sg-name", m).value.trim(), email: $("#sg-email", m).value.trim(),
        payer_email: $("#sg-payer", m).value.trim(), website: $("#sg-web", m).value, turnstile_token: token };
      const bad = (t) => { err.textContent = t; err.classList.remove("hidden"); };
      if (body.band_name.length < 2) return bad("Poné el nombre de tu banda.");
      if (body.name.length < 2) return bad("Poné tu nombre.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || (body.payer_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.payer_email))) return bad("Revisá el email.");
      if (cfg.turnstile_site_key && !token) return bad("Marcá la casilla “No soy un robot”.");
      await withBusy($("#sg-go", m), async () => {
        try {
          const r = await api("/public/signup", { method: "POST", json: body });
          if (!r.init_point) return bad("No pudimos iniciar el pago. Probá de nuevo.");
          $("#sg-go", m).textContent = "Abriendo Mercado Pago…";
          location.href = r.init_point;
          await new Promise(() => {});   // la pagina se va a Mercado Pago
        } catch (e) {
          bad(e.message);
          if (widget !== null && window.turnstile) { window.turnstile.reset(widget); token = ""; }
        }
      });
    });
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}

/* Pagina a la que vuelve Mercado Pago: confirma el alta y avisa que ya llego el mail con el acceso. */
function viewThanks(token) {
  setApp(`
    <div class="l2-page">
      ${landLogoBar()}
      <section class="land2 l2-thanks" aria-label="Confirmación">
        <div class="l2-bg" aria-hidden="true"><div class="l2-glow"></div></div>
        <div class="l2-hero">
          <div class="l2-logo small"><img src="/logo-hero.png" alt="" width="540" height="540"></div>
          <h1 class="l2-h" id="th-h">Estamos confirmando tu pago</h1>
          <p class="l2-pro" id="th-p">Esto tarda unos segundos. Apenas se confirma te mandamos por mail la confirmación y tu clave de acceso.</p>
          <div class="l2-cta"><a class="btn primary big hidden" id="th-go" href="#/login">Entrar</a><a class="btn big" href="#/">Volver al inicio</a></div>
        </div>
      </section>
    </div>`);
  $$(".l2-top [data-go], .l2-top [data-reg]").forEach((b) => b.addEventListener("click", () => { location.hash = "#/"; }));
  let tries = 0;
  const poll = async () => {
    if (!document.getElementById("th-h")) return;   // la persona se fue de la pagina
    try {
      const r = await api("/public/signup-sync", { method: "POST", json: { token } });
      if (r.status === "done") {
        $("#th-h").textContent = "¡Listo! Tu banda está activa";
        $("#th-p").textContent = "Te enviamos por mail la confirmación del pago y tus datos de acceso. Si no lo ves, revisá la carpeta de spam. Podés cambiar la clave cuando quieras desde tu perfil.";
        $("#th-go").classList.remove("hidden");
        return;
      }
      if (r.status === "expired") { $("#th-h").textContent = "No pudimos confirmar el pago"; $("#th-p").textContent = "Si ya pagaste, escribinos desde Contacto y lo resolvemos enseguida."; return; }
    } catch (e) {
      if (/no encontramos/i.test(e.message || "")) { $("#th-h").textContent = "No encontramos tu pedido"; $("#th-p").textContent = "Si ya pagaste, escribinos desde Contacto y lo resolvemos enseguida."; return; }
    }
    if (++tries < 20) setTimeout(poll, 4000);
    else { $("#th-h").textContent = "Todavía no vemos el pago"; $("#th-p").textContent = "Mercado Pago puede demorar unos minutos. Cuando se confirme te llega el mail con tu acceso. Si pasa mucho tiempo, escribinos desde Contacto."; }
  };
  poll();
}
