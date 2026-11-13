/* Portada pública, planes, contacto y bloques desplegables. Se carga antes que app.js. */
"use strict";


const LAND_BLOCKS = [
  { k: "ensayos", icon: "mic", t: "Ensayos", img: "/img/herramienta-ensayos.jpg", lead: "Graba el ensayo desde el teléfono y compártelo con toda la banda.",
    items: ["Graba desde el navegador o sube el archivo", "Ensayos ordenados por fecha y sesión", "Aviso automático a toda la banda"] },
  { k: "produccion", icon: "music", t: "Producción", img: "/img/herramienta-produccion.jpg", lead: "Demos, tomas y mezclas en un solo lugar, antes del master.",
    items: ["Subida desde REAPER con un script incluido", "Pistas separadas o mezcla completa", "Reproductor con loop A–B y control de velocidad"] },
  { k: "master", icon: "sliders", t: "Master", img: "/img/herramienta-master.jpg", star: true, lead: "Deja tu mezcla lista para publicar y compara el antes y el después.",
    items: ["Más de 70 estilos, desde rock y metal hasta jazz, cumbia y hip hop", "Master por referencia: tu tema adopta el sonido de otro que elijas",
      "Control de volumen, potencia, tono, ancho estéreo y balance de instrumentos", "Informe paso a paso y comparación A/B a igual volumen"] },
  { k: "practica", icon: "headphones", t: "Practica en casa", img: "/img/herramienta-practica.jpg", lead: "Silencia tu instrumento y toca encima del resto de la banda.",
    items: ["Mesa de pistas con silencio (M) y solo (S) por instrumento", "Loop A–B para repetir un pasaje", "Vista de ondas en pantallas grandes y lista simple en móvil"] },
  { k: "asistente", icon: "spark", t: "Asistente", img: "/img/herramienta-asistente.jpg", lead: "Analiza el audio y explica qué corregir, en lenguaje simple.",
    items: ["Medición de volumen, picos, saturación y compatibilidad estéreo", "Veredicto claro y consejos priorizados", "Chat con un ingeniero de audio para consultas de mezcla y master"] },
  { k: "albumes", icon: "disc", t: "Álbumes", img: "/img/herramienta-albumes.jpg", lead: "Ordena los temas y diseña la portada del disco.",
    items: ["Orden final de los temas por arrastre", "Portada con tu foto, estilos prediseñados o inteligencia artificial", "Archivo a 3000 px, el tamaño que piden las plataformas"] },
  { k: "lanzamiento", icon: "rocket", t: "Lanzamiento", img: "/img/herramienta-lanzamiento.jpg", lead: "Descarga el álbum listo para cada plataforma.",
    items: ["WAV 24 bits, MP3 320 y portada en un solo paquete", "Spotify, Apple Music y YouTube Music (mediante distribuidora) y Bandcamp", "Guía paso a paso de publicación, también para vinilo y CD"] },
  { k: "calendario", icon: "calendar", t: "Calendario", img: "/img/herramienta-calendario.jpg", lead: "Ensayos y presentaciones con aviso a toda la banda.",
    items: ["Agenda de ensayos, shows y grabaciones", "Aviso automático a los integrantes", "Próximos eventos visibles en el inicio"] },
  { k: "musicos", icon: "users", t: "Banco de músicos", img: "/img/herramienta-musicos.jpg", lead: "Encuentra músicos disponibles para completar tu formación.",
    items: ["Búsqueda por instrumento, estilo y zona", "Contacto directo por WhatsApp o correo", "Visible solo para administradores; cada músico decide si aparece"] },
];
const LAND_FLOW = [
  { icon: "mic", t: "Graba", d: "El ensayo, desde el teléfono" },
  { icon: "music", t: "Produce", d: "Demos, tomas y mezclas" },
  { icon: "sliders", t: "Masteriza", d: "Con el sonido de tu estilo" },
  { icon: "headphones", t: "Practica en casa", d: "Toca sobre las pistas del tema" },
  { icon: "rocket", t: "Publica", d: "Listo para cada plataforma" },
];
const EKG_D = "M0 100 H520 l24 -10 l18 10 H640 l16 -28 l18 70 l22 -120 l22 150 l24 -140 l22 110 l20 -42 l14 0 H1000 l18 -10 l22 10 H1600";
const ekg = () => `<svg class="l2-ekg" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true"><path class="p2" d="${EKG_D}"/><path class="p1" d="${EKG_D}"/></svg>`;

function landLogoBar() {
  return `<header class="l2-top">
    <a class="brand" href="#/"><img src="/logo-login.png" alt=""><span class="brand-name">diablomastermix.com.ar</span></a>
    <nav class="l2-nav" aria-label="Secciones">
      <button type="button" class="l2-link l2-opt" data-go="l2-planes">Planes</button>
      <button type="button" class="l2-link l2-opt" data-go="l2-contacto">Contacto</button>
      ${I18N.switcher("lang-top")}
      <a class="btn" href="#/login">Ingresar</a>
      <button type="button" class="btn primary l2-reg" data-reg>Registra tu banda</button>
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
      <div class="l2-photo" aria-hidden="true"></div>
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
          <p class="l2-pro">Masterización de audio con inteligencia artificial para bandas independientes.</p>
          <p class="l2-line">Del ensayo al master, en una sola plataforma.</p>
          <div class="l2-cta">
            <a class="btn primary big" href="#/login">Ingresar</a>
            <button type="button" class="btn big" data-go="l2-planes">Ver planes</button>
          </div>
        </div>
        <button type="button" class="l2-cue" data-go="l2-flow" aria-label="Ver las herramientas">${ic("down")}</button>
      </section>

      <div class="l2-rest">

        <section class="l2-sec l2-flow" id="l2-flow">
          <h2 class="l2-h">El proceso completo de tu banda, en una sola plataforma</h2>
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
              <div class="l2-cta left"><a class="btn primary" href="#/login">Ingresar</a><button type="button" class="btn" data-go="l2-planes">Ver planes</button></div>
            </div>
          </article>
        </section>

        ${ekg()}

        <section class="l2-sec" id="l2-features" aria-label="Herramientas">
          <h2 class="l2-h">Herramientas para cada etapa de tu banda</h2>
          <div class="l2-grid">
            ${rest.map((b) => `<article class="l2-card" data-glow id="f-${b.k}">
              ${landPic(b)}
              <div class="l2-body">${landHead(b)}${landList(b)}</div></article>`).join("")}
          </div>
        </section>

        ${ekg()}

        <section class="l2-sec" id="l2-planes" aria-label="Planes">
          <h2 class="l2-h">Un plan por banda, no por músico</h2>
          <p class="l2-sub" id="l2-plans-sub">Lo paga el administrador de la banda y lo usan todos los integrantes. Cobro mensual automático y cancelación en cualquier momento.</p>
          <div class="plans l2-plans" id="l2-plans-box"><p class="muted">Cargando planes…</p></div>
        </section>

        <section class="l2-sec l2-contact" id="l2-contacto" aria-label="Contacto">
          <h2 class="l2-h">Escríbenos</h2>
          <div class="l2-card l2-form" data-glow id="l2-form-box"></div>
        </section>
      </div>

      <footer class="l2-foot">
        <div class="l2-fl">
          <span class="l2-fbrand"><img src="/logo-mark.png" alt="" width="28" height="28"><b>Diablo Master Mix</b></span>
          <p>Del ensayo al master, en una sola plataforma.</p>
          <p class="l2-by">Un producto de <a href="https://www.puma-code.com" target="_blank" rel="noopener">Puma Code</a></p>
          <nav class="l2-flinks" aria-label="Accesos"><button type="button" data-go="l2-planes">Planes</button><button type="button" data-go="l2-contacto">Contacto</button><a href="#/login">Ingresar</a></nav>
          <div class="l2-fcontact">
            <a class="l2-fmail" href="mailto:diablomastermix@gmail.com">diablomastermix@gmail.com</a>
            <a class="l2-fig" href="https://www.instagram.com/diablomastermix/" target="_blank" rel="noopener" aria-label="Instagram @diablomastermix" title="Instagram"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg></a>
          </div>
          <nav class="l2-flinks l2-flang" aria-label="Idioma">${I18N.inline()}</nav>
          <small class="l2-trade">Compatible con REAPER. REAPER es una marca de Cockos Incorporated; Diablo Master Mix no está afiliado ni respaldado por Cockos.</small>
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
const MP_LOGO = "data:image/png;base64,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";   // embebido: se ve siempre, aunque falte el archivo en el servidor
function mpBadge(pm) {
  if (pm === "polar") return `<div class="plan-mp"><span class="l2-ibox">${ic("card")}</span><p><b>Suscripción en dólares</b><small>Pago con tarjeta. Cobro mensual automático. Cancelación en cualquier momento.</small></p></div>`;
  return `<div class="plan-mp"><img class="plan-mp-logo" src="${MP_LOGO}" alt="Mercado Pago" width="52" height="52"><p><b>Suscripción de Mercado Pago</b><small>Cobro mensual automático. Cancelación en cualquier momento.</small></p></div>`;
}

async function landPlans() {
  const box = document.getElementById("l2-plans-box");
  if (!box) return;
  const cfg = await loadPublicConfig();
  if (!document.getElementById("l2-plans-box")) return;
  if (cfg.trial_days) $("#l2-plans-sub").innerHTML += ` <b>${cfg.trial_days} días gratis</b> para probar.`;
  const draw = () => {
    const pm = payMethod(cfg);
    box.innerHTML = payToggle(cfg) + cfg.plans.map((p) => `
    <article class="plan ${p.highlight ? "hl" : ""}">
      ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
      <h3>${esc(p.name)}</h3>
      <p class="plan-tag-line">${esc(p.tagline)}</p>
      <p class="plan-price"><b>${priceOf(p, pm)}</b><span>por mes</span></p>
      <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
      ${mpBadge(pm)}
      <button type="button" class="btn ${p.highlight ? "primary" : ""}" data-plan="${p.id}">Elegir ${esc(p.name)}</button>
    </article>`).join("") + `<p class="small muted l2-plans-note">${payNote(pm)} ¿Consultas? Escríbenos en Contacto.</p>`;
    $$("[data-plan]", box).forEach((b) => b.addEventListener("click", () => openSignup(cfg.plans.find((p) => String(p.id) === b.dataset.plan))));
    wirePay(box, cfg, draw);
  };
  draw();
}

/* ---------------------------------------------------------------- planes */
const fmtARS = (n) => "$" + Number(n).toLocaleString(I18N.loc);
const fmtUSD = (n) => "US$" + Number(n).toLocaleString(I18N.loc, { minimumFractionDigits: Number(n) % 1 ? 2 : 0 });
const fmtMoney = (n, cur) => String(cur || "ARS").toUpperCase() === "USD" ? fmtUSD(n) : fmtARS(n);

/* Argentina paga en pesos con Mercado Pago; el resto del mundo en dólares con Polar. Si se puede elegir, hay selector. */
function payMethod(cfg) {
  if (state.pay === "mp" && cfg.mp_enabled || state.pay === "polar" && cfg.polar_enabled) return state.pay;
  // en español y desde Argentina: pesos con Mercado Pago. En inglés o portugués, o desde otro pais: dolares.
  const ar = I18N.lang === "es" && (cfg.country === "AR" || !cfg.country);
  let m = ar ? "mp" : "polar";
  if (m === "polar" && !cfg.polar_enabled) m = "mp";
  if (m === "mp" && !cfg.mp_enabled && cfg.polar_enabled) m = "polar";
  return m;
}
const priceOf = (p, pm) => pm === "polar" && p.price_usd ? fmtUSD(p.price_usd) : fmtARS(p.price_ars);
function payToggle(cfg) {
  if (!(cfg.polar_enabled && cfg.mp_enabled)) return "";
  const m = payMethod(cfg);
  return `<div class="pay-toggle" role="group" aria-label="Forma de pago"><button type="button" data-pay="mp" aria-pressed="${m === "mp"}">Pesos (Mercado Pago)</button><button type="button" data-pay="polar" aria-pressed="${m === "polar"}">Dólares (tarjeta)</button></div>`;
}
function wirePay(root, cfg, redraw) {
  $$("[data-pay]", root).forEach((b) => b.addEventListener("click", () => { state.pay = b.dataset.pay; redraw(); }));
}
function payNote(pm) {
  return pm === "polar"
    ? "El pago se realiza de forma segura con tarjeta a través de Polar y, una vez confirmado, el acceso a tu banda llega por correo. Los precios están en dólares estadounidenses e incluyen todo, sin cargos por canción (según tu país, el pago puede incluir impuestos locales). Si cancelas la suscripción, los datos de la banda se eliminan a las 48 horas."
    : "El pago se realiza con Mercado Pago y, una vez confirmado, el acceso a tu banda llega por correo. Los precios están en pesos argentinos e incluyen todo, sin cargos por canción. Si cancelas la suscripción, los datos de la banda se eliminan a las 48 horas.";
}

async function loadPublicConfig() {
  if (!state.pub) { try { state.pub = await api("/public-config"); } catch { state.pub = { plans: [], trial_days: 14, turnstile_site_key: "", chat: false }; } }
  return state.pub;
}

function planFeatures(p) {
  return [
    `<b>${p.masters_month}</b> masters por mes`, `<b>${p.quota_gb}</b> GB de espacio`, `Hasta <b>${p.max_members}</b> integrantes`,
    `<b>${p.ai_covers_month}</b> tapas con IA por mes`, "Estudio de master completo", "Informe y comparación A/B", "Banco de músicos: encuentra integrantes y publica búsquedas",
  ];
}

async function openPlans() {
  if (document.getElementById("l2-planes")) return landGo("l2-planes");
  const cfg = await loadPublicConfig();
  openModal(`
    <div class="plans-wrap">
      <div class="st-modal-head"><h2>Un plan por banda, no por músico</h2><button type="button" class="icon-btn" id="pl-x" aria-label="Cerrar">✕</button></div>
      <p class="muted" style="margin:0 0 1.1rem">Lo paga el administrador de la banda y lo usan todos los integrantes. Cobro mensual automático y cancelación en cualquier momento. ${cfg.trial_days ? `<b>${cfg.trial_days} días gratis</b> para probar.` : ""}</p>
      ${payToggle(cfg)}
      <div class="plans">
        ${cfg.plans.map((p) => `
          <article class="plan ${p.highlight ? "hl" : ""}">
            ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
            <h3>${esc(p.name)}</h3>
            <p class="plan-tag-line">${esc(p.tagline)}</p>
            <p class="plan-price"><b>${priceOf(p, payMethod(cfg))}</b><span>por mes</span></p>
            <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
            ${mpBadge(payMethod(cfg))}
            <button type="button" class="btn ${p.highlight ? "primary" : ""}" data-plan="${p.id}">Elegir ${esc(p.name)}</button>
          </article>`).join("")}
      </div>
      <p class="small muted" style="margin:1rem 0 0">${payNote(payMethod(cfg))}</p>
    </div>`, (m) => {
    m.classList.add("wide");
    $("#pl-x", m).addEventListener("click", closeModal);
    wirePay(m, cfg, () => { closeModal(); openPlans(); });
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
    }).catch(() => { const e = $("#cf-err", root); e.textContent = "No se pudo cargar la verificación anti-robots. Revisa tu conexión."; e.classList.remove("hidden"); });
  }
  $("#cf", root).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#cf-err", root); err.classList.add("hidden");
    const body = { name: $("#cf-name", root).value.trim(), email: $("#cf-email", root).value.trim(), band: $("#cf-band", root).value.trim(),
      message: $("#cf-msg", root).value.trim(), website: $("#cf-web", root).value, turnstile_token: token };
    if (!body.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || body.message.length < 5) {
      err.textContent = "Completa tu nombre, un email válido y el mensaje."; err.classList.remove("hidden"); return;
    }
    if (cfg.turnstile_site_key && !token) { err.textContent = "Marca la casilla “No soy un robot”."; err.classList.remove("hidden"); return; }
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
  <p class="muted">Gracias por escribirnos. Te responderemos por correo a la brevedad.</p></div>`;

/* Formulario dentro de la portada (sin ventana). */
async function landContact(box) {
  const cfg = await loadPublicConfig();
  if (!box.isConnected) return;
  box.innerHTML = `<div class="l2-cwrap">
    <div class="l2-cinfo">
      <h3>Hablemos de tu banda</h3>
      <p class="l2-lead">Cuéntanos sobre tu banda y te responderemos por correo.</p>
      <ul class="l2-cpts">
        <li><span class="l2-ibox">${ic("card")}</span><span><b>Planes y pagos</b><small>Consultas sobre la suscripción y la facturación.</small></span></li>
        <li><span class="l2-ibox">${ic("headphones")}</span><span><b>Soporte</b><small>Ayuda con tu cuenta, tus pistas y tus masters.</small></span></li>
        <li><span class="l2-ibox">${ic("users")}</span><span><b>Tu banda</b><small>Cuéntanos qué necesitas y lo resolvemos juntos.</small></span></li>
      </ul>
    </div>
    <form id="cf" class="stack contact" novalidate>
      ${contactFields(cfg, "")}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cf-send">Enviar mensaje</button></div>
    </form></div>`;
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
      <div class="st-modal-head"><h2>Escríbenos</h2><button type="button" class="icon-btn" id="cf-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small" style="margin:0">Cuéntanos sobre tu banda y te responderemos por correo.</p>
      ${contactFields(cfg, prefill)}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="cf-cancel">Cancelar</button><button class="btn primary" id="cf-send">Enviar mensaje</button></div>
    </form>`, (m) => {
    $("#cf-x", m).addEventListener("click", closeModal);
    $("#cf-cancel", m).addEventListener("click", closeModal);
    bindContact(m, cfg, () => {
      openModal(`<div class="stack" style="text-align:center;padding:1rem .5rem"><div class="blk-ico" style="margin-inline:auto">${ic("flame")}</div><h2>¡Mensaje enviado!</h2>
        <p class="muted">Gracias por escribirnos. Te responderemos por correo a la brevedad.</p><button class="btn primary" id="cf-ok">Listo</button></div>`,
        (m2) => $("#cf-ok", m2).addEventListener("click", closeModal));
    });
  });
}


/* ---------------------------------------------------------------- compra: la banda se registra y paga sola */
async function openSignup(plan) {
  if (!plan) return;
  const cfg = await loadPublicConfig();
  const trial = cfg.trial_days || 0;
  const pm = payMethod(cfg);
  openModal(`
    <form id="sg" class="stack signup" novalidate>
      <div class="st-modal-head"><h2>Plan ${esc(plan.name)}</h2><button type="button" class="icon-btn" id="sg-x" aria-label="Cerrar">✕</button></div>
      <div class="sg-plan">
        <span class="l2-ibox">${ic("card")}</span>
        <div class="sg-pt"><b>${priceOf(plan, pm)} <small>por mes</small></b>
          <span>${trial ? `${trial} días gratis y después cobro mensual.` : "Cobro mensual."} Puedes cancelar en cualquier momento; al hacerlo, los datos de la banda se eliminan a las 48 horas.</span>
          <span class="sg-note">Durante la prueba hay topes de uso y las descargas se habilitan con la suscripción. Si no se paga al terminar, los datos se eliminan.</span></div>
      </div>
      <ul class="sg-feat">${planFeatures(plan).map((f) => `<li><span class="sg-ck" aria-hidden="true">✓</span><span>${f}</span></li>`).join("")}</ul>
      <div class="field"><label for="sg-band">Nombre de la banda</label><input id="sg-band" type="text" maxlength="120" autocomplete="organization" required></div>
      <div class="field"><label for="sg-name">Tu nombre</label><input id="sg-name" type="text" maxlength="120" autocomplete="name" required></div>
      <div class="field"><label for="sg-email">Tu email</label><input id="sg-email" type="email" maxlength="255" autocomplete="email" inputmode="email" required>
        <small class="muted">Allí enviaremos la confirmación y tu clave de acceso.</small></div>
      ${pm === "polar" ? "" : `<details class="sg-other"><summary>Mi cuenta de Mercado Pago usa otro email</summary>
        <div class="field"><label for="sg-payer">Email de tu cuenta de Mercado Pago</label><input id="sg-payer" type="email" maxlength="255" inputmode="email"></div></details>`}
      <div class="hp" aria-hidden="true"><label>No completar<input id="sg-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="sg-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="sg-err" role="alert"></p>
      <div class="row sg-actions"><button type="button" class="btn" id="sg-cancel">Cancelar</button><button class="btn primary" id="sg-go">Suscribirme y pagar</button></div>
      <p class="small muted" style="margin:0">${pm === "polar" ? "El pago se realiza con tarjeta, de forma segura, a través de Polar. Al confirmarse, tu banda queda creada y recibirás el acceso por correo." : "El pago se realiza en Mercado Pago, de forma segura. Al confirmarse, tu banda queda creada y recibirás el acceso por correo."}</p>
    </form>`, (m) => {
    m.classList.add("wide");
    let token = "", widget = null;
    $("#sg-x", m).addEventListener("click", closeModal);
    $("#sg-cancel", m).addEventListener("click", closeModal);
    if (cfg.turnstile_site_key) {
      loadTurnstile().then(() => {
        widget = window.turnstile.render("#sg-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: "es",
          callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
      }).catch(() => { const e = $("#sg-err", m); e.textContent = "No se pudo cargar la verificación anti-robots. Revisa tu conexión."; e.classList.remove("hidden"); });
    }
    $("#sg", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = $("#sg-err", m); err.classList.add("hidden");
      const body = { plan_id: plan.id, band_name: $("#sg-band", m).value.trim(), name: $("#sg-name", m).value.trim(), email: $("#sg-email", m).value.trim(),
        payer_email: pm === "polar" ? "" : $("#sg-payer", m).value.trim(), method: pm, website: $("#sg-web", m).value, turnstile_token: token };
      const bad = (t) => { err.textContent = t; err.classList.remove("hidden"); };
      if (body.band_name.length < 2) return bad("Indica el nombre de tu banda.");
      if (body.name.length < 2) return bad("Indica tu nombre.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || (body.payer_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.payer_email))) return bad("Revisa el email.");
      if (cfg.turnstile_site_key && !token) return bad("Marca la casilla “No soy un robot”.");
      await withBusy($("#sg-go", m), async () => {
        try {
          const r = await api("/public/signup", { method: "POST", json: body });
          if (!r.init_point) return bad("No se pudo iniciar el pago. Inténtalo de nuevo.");
          $("#sg-go", m).textContent = pm === "polar" ? "Abriendo el pago seguro…" : "Abriendo Mercado Pago…";
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
          <p class="l2-pro" id="th-p">Esto tarda unos segundos. Al confirmarse, recibirás por correo la confirmación y tu clave de acceso.</p>
          <div class="l2-cta"><a class="btn primary big hidden" id="th-go" href="#/login">Ingresar</a><a class="btn big" href="#/">Volver al inicio</a></div>
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
        $("#th-p").textContent = "Te enviamos por correo la confirmación del pago y tus datos de acceso. Si no lo ves, revisa la carpeta de spam. Puedes cambiar la clave cuando quieras desde tu perfil.";
        $("#th-go").classList.remove("hidden");
        return;
      }
      if (r.status === "expired") { $("#th-h").textContent = "No pudimos confirmar el pago"; $("#th-p").textContent = "Si ya realizaste el pago, escríbenos desde Contacto y lo resolveremos a la brevedad."; return; }
    } catch (e) {
      if (/no encontramos/i.test(e.message || "")) { $("#th-h").textContent = "No encontramos tu pedido"; $("#th-p").textContent = "Si ya realizaste el pago, escríbenos desde Contacto y lo resolveremos a la brevedad."; return; }
    }
    if (++tries < 20) setTimeout(poll, 4000);
    else { $("#th-h").textContent = "Aún no vemos el pago"; $("#th-p").textContent = "El procesador de pagos puede demorar unos minutos. Al confirmarse, recibirás por correo tu acceso. Si pasa mucho tiempo, escríbenos desde Contacto."; }
  };
  poll();
}
