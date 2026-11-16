"use strict";
/* Banco de músicos con cuenta gratis: registro del músico, su inicio (búsquedas, postulaciones, calendario de
   audiciones y bandas registradas) y, del lado de la banda, las postulaciones que recibe. */

/* ---------------------------------------------------------------- registro gratis (público) */
async function viewMusicianSignup() {
  const cfg = await loadPublicConfig();
  setApp(authShell(`
    <form id="ms" novalidate>
      ${AUTH_BRAND}
      <h1>Registrate gratis como músico</h1>
      <p class="muted">Creá tu perfil en el banco de músicos, mirá qué bandas están buscando integrantes y postulate. No se paga nada.</p>
      <div class="field"><label for="ms-name">Tu nombre</label><input id="ms-name" type="text" maxlength="120" autocomplete="name" required></div>
      <div class="field"><label for="ms-email">Tu email</label><input id="ms-email" type="email" maxlength="255" autocomplete="email" inputmode="email" required>
        <small class="muted">Es el mismo mail con el que una banda te suma después como integrante.</small></div>
      <div class="hp" aria-hidden="true"><label>No completar<input id="ms-web" type="text" tabindex="-1" autocomplete="off"></label></div>
      ${cfg.turnstile_site_key ? `<div id="ms-ts" class="ts-box"></div>` : ""}
      <p class="status error hidden" id="ms-err" role="alert"></p>
      <button class="btn primary block big" id="ms-go">Crear mi cuenta gratis</button>
      <p class="muted small" style="margin-top:1rem">¿Ya tenés cuenta? <a href="#/login">Entrar</a></p>
      <p class="small"><a href="#/">← Volver al inicio</a></p>
      <p class="small lang-auth">${I18N.inline()}</p>
    </form>`, "Encontrá tu próxima banda."));
  let token = "", widget = null;
  const err = $("#ms-err"), bad = (t) => { err.textContent = t; err.classList.remove("hidden"); };
  if (cfg.turnstile_site_key) {
    loadTurnstile().then(() => {
      widget = window.turnstile.render("#ms-ts", { sitekey: cfg.turnstile_site_key, theme: "dark", language: tsLang(),
        callback: (t) => { token = t; }, "expired-callback": () => { token = ""; }, "error-callback": () => { token = ""; } });
    }).catch(() => bad("No se pudo cargar la verificación anti-robots. Revisa tu conexión."));
  }
  $("#ms").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err.classList.add("hidden");
    const body = { name: $("#ms-name").value.trim(), email: $("#ms-email").value.trim(), website: $("#ms-web").value, turnstile_token: token };
    if (body.name.length < 2) return bad("Indica tu nombre.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return bad("Revisa el email.");
    if (cfg.turnstile_site_key && !token) return bad("Marca la casilla “No soy un robot”.");
    await withBusy($("#ms-go"), async () => {
      try {
        const r = await api("/public/musician-signup", { method: "POST", json: body });
        if (r.link) { location.href = r.link; return; }
        setApp(authShell(`<div>${AUTH_BRAND}
          <h1>Revisá tu mail</h1>
          <p class="muted">Te enviamos un link para confirmar tu cuenta y elegir tu contraseña. Vale 48 horas.</p>
          <p class="ms-mail"><strong>${esc(body.email)}</strong></p>
          <p class="muted small">Si no lo ves en unos minutos, mirá en correo no deseado.</p>
          <a class="btn block big" href="#/">Volver al inicio</a></div>`, "Encontrá tu próxima banda."));
      } catch (e) {
        bad(e.message);
        if (widget !== null && window.turnstile) { window.turnstile.reset(widget); token = ""; }
      }
    });
  });
}

async function viewMusicianConfirm(token) {
  let info;
  try { info = await api(`/public/musician-signup-info?token=${encodeURIComponent(token)}`); }
  catch (e) {
    setApp(authShell(`<div>${AUTH_BRAND}<h1>El link no sirve</h1>
      <p class="muted">${esc(e.message)}.</p>
      <a class="btn primary block big" href="#/musico">Registrarme de nuevo</a></div>`, "Encontrá tu próxima banda."));
    return;
  }
  setApp(authShell(`
    <form id="mc">
      ${AUTH_BRAND}
      <h1>Elegí tu contraseña</h1>
      <p class="muted">Vas a entrar con este mail:</p>
      <p class="ms-mail"><strong>${esc(info.email)}</strong></p>
      <div class="field"><label for="mc-name">Tu nombre</label><input id="mc-name" type="text" maxlength="120" value="${esc(info.name)}" required></div>
      <div class="field"><label for="mc-pw">Contraseña (mínimo 10 caracteres)</label><input id="mc-pw" type="password" autocomplete="new-password" minlength="10" required></div>
      <button class="btn primary block big">Crear cuenta y entrar</button>
    </form>`, "Encontrá tu próxima banda."));
  $("#mc").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy($("button", ev.target), async () => {
      try {
        const r = await api("/public/musician-confirm", { method: "POST", json: { token, name: $("#mc-name").value.trim(), password: $("#mc-pw").value } });
        session.token = r.token;
        state.me = null;
        location.hash = "#/";
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

/* ---------------------------------------------------------------- inicio del músico sin banda */
const APP_STATUS = { applied: "Postulación enviada", audition: "Audición agendada", accepted: "Te sumaron a la banda", rejected: "Búsqueda cerrada" };
const bandPic = (photo) => `<span class="bk-photo"><img src="${esc(photo || "/img/banda-sin-foto.jpg")}" alt=""></span>`;

async function viewMusicianHome(nav) {
  const [reqs, apps, bands, mp] = await Promise.all([api("/musician-requests"), api("/me/applications"), api("/bank/bands"), api("/me/music-profile")]);
  if (nav !== state.nav) return;
  const me = state.me, first = (me.name || "").trim().split(/\s+/)[0];
  const ready = mp.instruments.length || mp.sings;
  const auds = apps.filter((a) => a.status === "audition" && a.audition_at).sort((a, b) => a.audition_at.localeCompare(b.audition_at));
  const open = reqs.filter((r) => !r.member);
  setApp(`
    <div class="page-head"><div class="grow"><h1>${first ? "Hola, " + esc(first) : "Inicio"}</h1>
      <p class="lead">Tu lugar en el banco de músicos: mirá quién busca integrantes y postulate.</p></div></div>
    ${me.left_band ? `<section class="card bk-left"><div class="bk-row">${ic("user")}<div class="grow"><h2>Ya no estás en ninguna banda</h2>
        <p class="muted">Tu cuenta sigue abierta y es gratis. Elegí qué hacer con tus datos.</p></div></div>
        <div class="row bk-actions"><button class="btn primary" id="bk-keep">${ic("check")}Conservar mis datos para el banco de músicos</button>
          <button class="btn danger" id="bk-del">${ic("trash")}Cancelar mi cuenta y eliminar todos mis datos</button></div></section>` : ""}
    ${ready ? "" : `<section class="card bk-left"><div class="bk-row">${ic("user")}<div class="grow"><h2>Completá tu perfil de músico</h2>
        <p class="muted">Contá qué instrumento tocás, tus estilos y tu ciudad. Hace falta para postularte y para que las bandas te encuentren.</p></div>
        <a class="btn primary" href="#/account">Completar mi perfil</a></div></section>`}
    <section class="card"><h2>Tu calendario de audiciones</h2>
      ${auds.length ? `<ul class="upcoming">${auds.map((a) => {
        const d = parseDate(a.audition_at);
        return `<li><div class="date-chip"><b>${d.getDate()}</b><span>${d.toLocaleDateString(I18N.loc, { month: "short" })}</span></div>
          <div class="grow"><strong>${esc(a.band_name)}</strong>
            <div class="muted small"><span>${esc(d.toLocaleDateString(I18N.loc, { weekday: "long" }))}</span> · <span>${fmtTime(a.audition_at)}</span>${a.audition_place ? ` · <span>${esc(a.audition_place)}</span>` : ""}</div>
            ${a.audition_notes ? `<div class="small mp-bio">${esc(a.audition_notes)}</div>` : ""}</div>
          <span class="badge master">${esc(a.instrument)}</span></li>`;
      }).join("")}</ul>` : `<p class="muted" style="margin:0">Cuando una banda te cite a una audición, la vas a ver acá con día, hora y lugar.</p>`}
    </section>
    <section class="card"><h2>Bandas que buscan integrantes</h2>
      ${open.length ? `<ul class="mp-list">${open.map((r) => `<li class="mp-li">${bandPic(r.band_photo)}<div class="grow"><strong>${esc(r.instrument)}</strong>
          <div class="muted small"><span>${esc(r.band_name)}</span>${mpPlace(r) ? ` · <span>${esc(mpPlace(r))}</span>` : ""}</div>
          ${r.styles.length ? `<div style="margin:.25rem 0">${mpTags(r.styles)}</div>` : ""}${r.description ? `<div class="small mp-bio">${esc(r.description)}</div>` : ""}</div>
          ${r.my_application ? `<span class="badge ${r.my_application.status === "rejected" ? "" : "master"}">${APP_STATUS[r.my_application.status] || ""}</span>`
            : `<button class="btn small primary" data-apply="${r.id}">${ic("plus")}Postularme</button>`}</li>`).join("")}</ul>`
        : `<p class="muted" style="margin:0">Ahora no hay búsquedas publicadas. Dejá tu perfil disponible y las bandas te pueden encontrar.</p>`}
    </section>
    ${apps.length ? `<section class="card"><h2>Tus postulaciones</h2><ul class="mp-list">${apps.map((a) => `<li class="mp-li">${bandPic(a.band_photo)}
        <div class="grow"><strong>${esc(a.band_name)}</strong><div class="muted small">${esc(a.instrument)}</div>
          <div style="margin-top:.25rem"><span class="badge ${a.status === "rejected" ? "" : "master"}">${APP_STATUS[a.status] || ""}</span></div></div>
        ${a.status === "applied" || a.status === "audition" ? `<button class="btn small danger" data-withdraw="${a.id}">Retirar</button>`
          : a.status === "rejected" ? `<button class="btn small" data-withdraw="${a.id}">Quitar</button>` : ""}</li>`).join("")}</ul></section>` : ""}
    <section class="card"><h2>Bandas registradas</h2>
      ${bands.length ? `<ul class="bk-bands">${bands.map((b) => `<li>${bandPic(b.photo)}<div class="grow"><strong>${esc(b.name)}</strong>
          ${b.looking.length ? `<div style="margin-top:.2rem">${b.looking.map((x) => `<span class="badge master">${esc(x)}</span>`).join(" ")}</div>` : ""}</div></li>`).join("")}</ul>`
        : `<p class="muted" style="margin:0">Todavía no hay bandas registradas.</p>`}
    </section>
    ${installCard()}`);
  wireInstall();
  $$("[data-apply]").forEach((b) => b.addEventListener("click", () => {
    if (!ready) { toast("Antes de postularte completá tu perfil de músico: qué instrumento tocás o si cantás", "err"); location.hash = "#/account"; return; }
    const r = reqs.find((x) => String(x.id) === b.dataset.apply);
    openModal(`<form id="apf" class="modal-body stack">
        <h2 style="margin:0">Postularme</h2>
        <p class="muted" style="margin:0"><strong>${esc(r.band_name)}</strong> · <span>${esc(r.instrument)}</span></p>
        <div class="field" style="margin:0"><label for="ap-msg">Mensaje para la banda (opcional)</label>
          <textarea id="ap-msg" maxlength="600" placeholder="Contá por qué te interesa y cuándo podés ensayar"></textarea></div>
        <p class="muted small" style="margin:0">La banda va a ver tu perfil de músico y tu mail para coordinar la audición.</p>
        <div class="row"><button type="button" class="btn" id="ap-x">Cancelar</button><button class="btn primary">Enviar postulación</button></div>
      </form>`, (m) => {
      $("#ap-x", m).addEventListener("click", closeModal);
      $("#apf", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await withBusy($("button.primary", m), async () => {
          try {
            await api(`/musician-requests/${r.id}/apply`, { method: "POST", json: { message: $("#ap-msg", m).value } });
            closeModal(); toast("Postulación enviada", "ok"); router();
          } catch (e) { toast(e.message, "err"); }
        });
      });
    });
  }));
  $$("[data-withdraw]").forEach((b) => b.addEventListener("click", () => withBusy(b, async () => {
    try { await api(`/applications/${b.dataset.withdraw}`, { method: "DELETE" }); router(); } catch (e) { toast(e.message, "err"); }
  })));
  const keep = $("#bk-keep");
  if (keep) keep.addEventListener("click", () => withBusy(keep, async () => {
    try { await api("/me/keep-profile", { method: "POST" }); state.me = null; toast("Listo: tus datos quedan en el banco de músicos", "ok"); location.hash = "#/account"; }
    catch (e) { toast(e.message, "err"); }
  }));
  const del = $("#bk-del");
  if (del) del.addEventListener("click", openDeleteAccount);
}

/* ---------------------------------------------------------------- eliminar la cuenta */
function openDeleteAccount() {
  openModal(`<form id="daf" class="modal-body stack">
      <h2 style="margin:0">Eliminar mi cuenta</h2>
      <p class="muted" style="margin:0">Se borran tu perfil, tu foto, tus postulaciones y tu acceso. No se puede deshacer. Lo que hayas subido a una banda queda en esa banda, sin tu nombre.</p>
      <div class="field" style="margin:0"><label for="da-pw">Tu contraseña</label><input id="da-pw" type="password" autocomplete="current-password" required></div>
      <div class="row"><button type="button" class="btn" id="da-x">Cancelar</button><button class="btn danger" id="da-go">Eliminar mi cuenta y mis datos</button></div>
    </form>`, (m) => {
    $("#da-x", m).addEventListener("click", closeModal);
    $("#daf", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await withBusy($("#da-go", m), async () => {
        try {
          await api("/me/delete", { method: "POST", json: { password: $("#da-pw", m).value } });
          closeModal();
          logout(false);
          toast("Tu cuenta y tus datos fueron eliminados", "ok");
        } catch (e) { toast(e.message, "err"); }
      });
    });
  });
}
function deleteAccountCard() {
  if (state.me.is_super) return "";
  return `<section class="card"><h2>Eliminar mi cuenta</h2>
    <p class="muted">Cancela tu cuenta y borra todos tus datos del sistema. Si administrás una banda, primero hay que darla de baja o pasar la administración.</p>
    <div><button type="button" class="btn danger" id="acc-del">${ic("trash")}Cancelar mi cuenta y eliminar todos mis datos</button></div></section>`;
}
function wireDeleteAccount() { const b = $("#acc-del"); if (b) b.addEventListener("click", openDeleteAccount); }

/* ---------------------------------------------------------------- la banda: postulaciones que recibe */
function applicationsCard(data) {
  const items = data.items;
  const hint = data.discount.available
    ? `<div class="bk-row bk-disc">${ic("card")}<p class="grow"><span>Si sumás a la banda a un músico del banco, tu próximo cobro mensual sale con descuento:</span> <strong>${data.discount.pct}%</strong></p></div>` : "";
  return `<section class="card"><h2>Postulaciones</h2>
    ${hint}
    ${items.length ? `<ul class="mp-list">${items.map((a) => {
      const m = a.musician, d = a.audition_at ? parseDate(a.audition_at) : null;
      return `<li class="mp-li bk-app">${avatar(m.photo, m.name, "")}<div class="grow"><strong>${esc(m.name)}</strong>
        <div class="muted small"><span>Se postula para</span> <b>${esc(a.instrument)}</b></div>
        <div class="muted small">${esc(m.instruments.join(", "))}${mpPlace(m) ? " · " + esc(mpPlace(m)) : ""}</div>
        ${m.styles.length ? `<div style="margin:.25rem 0">${mpTags(m.styles)}</div>` : ""}
        ${a.message ? `<div class="small mp-bio" style="margin:.25rem 0">${esc(a.message)}</div>` : ""}
        ${m.bio ? `<div class="muted small mp-bio">${esc(m.bio)}</div>` : ""}
        ${d ? `<div class="bk-when">${ic("calendar")}<span><span>Audición:</span> <b>${esc(d.toLocaleDateString(I18N.loc, { weekday: "long", day: "numeric", month: "long" }))}</b> · <b>${fmtTime(a.audition_at)}</b>${a.audition_place ? " · " + esc(a.audition_place) : ""}</span></div>` : ""}
        <div class="row bk-actions">
          <button class="btn small" data-aud="${a.id}">${ic("calendar")}${d ? "Cambiar audición" : "Agendar audición"}</button>
          <button class="btn small primary" data-acc="${a.id}">${ic("check")}Sumar a la banda</button>
          <a class="btn small" href="mailto:${esc(m.email)}">${ic("chat")}Escribir por mail</a>
          <button class="btn small danger" data-rej="${a.id}">No avanzar</button>
        </div></div></li>`;
    }).join("")}</ul>` : `<p class="muted" style="margin:0">Cuando un músico se postule a una de tus búsquedas, aparece acá para que agendes la audición.</p>`}
  </section>`;
}
function wireApplications(band, data) {
  const find = (id) => data.items.find((x) => String(x.id) === String(id));
  $$("[data-aud]").forEach((b) => b.addEventListener("click", () => {
    const a = find(b.dataset.aud);
    const d = a.audition_at ? parseDate(a.audition_at) : new Date(Date.now() + 3 * 864e5);
    if (!a.audition_at) d.setHours(20, 0, 0, 0);
    const local = `${dayKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    openModal(`<form id="auf" class="modal-body stack">
        <h2 style="margin:0">Agendar audición</h2>
        <p class="muted" style="margin:0"><strong>${esc(a.musician.name)}</strong> · <span>${esc(a.instrument)}</span></p>
        <div class="field" style="margin:0"><label for="au-when">Día y hora</label><input id="au-when" type="datetime-local" value="${local}" required></div>
        <div class="field" style="margin:0"><label for="au-place">Lugar</label><input id="au-place" type="text" maxlength="200" value="${esc(a.audition_place || "")}" placeholder="Sala de ensayo, dirección"></div>
        <div class="field" style="margin:0"><label for="au-notes">Qué tiene que preparar (opcional)</label><textarea id="au-notes" maxlength="1000" placeholder="Temas para tocar, qué llevar">${esc(a.audition_notes || "")}</textarea></div>
        <p class="muted small" style="margin:0">Queda en el calendario de la banda y en el del músico, que recibe un mail con los datos.</p>
        <div class="row"><button type="button" class="btn" id="au-x">Cancelar</button><button class="btn primary">Guardar audición</button></div>
      </form>`, (m) => {
      $("#au-x", m).addEventListener("click", closeModal);
      $("#auf", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await withBusy($("button.primary", m), async () => {
          try {
            await api(`/applications/${a.id}/audition`, { method: "POST", json: {
              starts_at: new Date($("#au-when", m).value).toISOString(), place: $("#au-place", m).value, notes: $("#au-notes", m).value } });
            closeModal(); toast("Audición agendada", "ok"); router();
          } catch (e) { toast(e.message, "err"); }
        });
      });
    });
  }));
  $$("[data-acc]").forEach((b) => b.addEventListener("click", () => {
    const a = find(b.dataset.acc);
    openModal(`<div class="modal-body stack">
        <h2 style="margin:0">Sumar a la banda</h2>
        <p style="margin:0"><strong>${esc(a.musician.name)}</strong> · <span>${esc(a.instrument)}</span></p>
        <p class="muted" style="margin:0">Pasa a ser integrante y tiene todas las herramientas de la banda. La búsqueda se cierra.</p>
        <div class="row"><button type="button" class="btn" id="ac-x">Cancelar</button><button class="btn primary" id="ac-go">Sí, sumar a la banda</button></div>
      </div>`, (m) => {
      $("#ac-x", m).addEventListener("click", closeModal);
      $("#ac-go", m).addEventListener("click", () => withBusy($("#ac-go", m), async () => {
        try {
          const r = await api(`/applications/${a.id}/accept`, { method: "POST" });
          closeModal();
          toast(r.discount === "auto" ? "Ya es integrante. Tu próximo cobro sale con descuento"
            : r.discount === "manual" ? "Ya es integrante. Te vamos a aplicar el descuento en tu próximo cobro" : "Ya es integrante de la banda", "ok");
          router();
        } catch (e) { toast(e.message, "err"); }
      }));
    });
  }));
  $$("[data-rej]").forEach((b) => b.addEventListener("click", () => withBusy(b, async () => {
    if (!confirm(I18N.t("¿Cerrar esta postulación? Le avisamos al músico."))) return;
    try { await api(`/applications/${b.dataset.rej}/reject`, { method: "POST" }); toast("Postulación cerrada", "ok"); router(); }
    catch (e) { toast(e.message, "err"); }
  })));
}
