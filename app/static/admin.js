/* Panel del super admin: solo herramientas de administración (sin música). Se carga antes que app.js. */
"use strict";

const AD_TABS = [
  ["resumen", "Resumen"], ["bandas", "Bandas"], ["cobros", "Cobros"], ["planes", "Planes"],
  ["personas", "Personas"], ["referencias", "Referencias"], ["estilos", "Estilos"], ["mensajes", "Mensajes"],
];
const AD_STATE = {
  exempt: ["Sin cargo", "ok"], trial: ["En prueba", "warn"], active: ["Pagando", "ok"], past_due: ["Pago atrasado", "warn"], suspended: ["Servicio cortado", "err"], closing: ["De baja", "err"],
};
const adChip = (st) => { const [l, k] = AD_STATE[st] || [st, ""]; return `<span class="chip-st ${k}">${l}</span>`; };
const adDay = (iso) => (iso ? parseDate(iso).toLocaleDateString(I18N.loc, { day: "numeric", month: "short", year: "numeric" }) : "—");
const adGuard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, "err"); } };

async function viewAdmin(nav, tab) {
  if (!state.me.is_super) { location.hash = "#/"; return; }
  tab = AD_TABS.some(([k]) => k === tab) ? tab : "resumen";
  setApp(`
    <div class="page-head"><div class="grow"><h1>Administración</h1><p class="lead">Bandas, cobros y todo lo de la plataforma.</p></div></div>
    <nav class="ad-tabs" aria-label="Secciones de administración">${AD_TABS.map(([k, l]) =>
      `<a href="#/admin/${k}" class="${k === tab ? "on" : ""}" ${k === tab ? 'aria-current="page"' : ""}>${l}<span class="ad-badge" id="adb-${k}" hidden></span></a>`).join("")}</nav>
    <div id="ad-body"><div class="card"><span class="spinner"></span> Cargando…</div></div>`);
  const body = $("#ad-body");
  const fn = { resumen: adResumen, bandas: adBandas, cobros: adCobros, planes: adPlanes, personas: adPersonas, referencias: adRefs, estilos: adEstilos, mensajes: adMensajes }[tab];
  try { await fn(body, nav); } catch (e) { if (nav === state.nav) body.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="muted">${esc(e.message)}</p></div>`; }
  api("/admin/billing/summary").then((s) => {
    const b = $("#adb-mensajes"); if (b && s.unread_messages) { b.textContent = s.unread_messages; b.hidden = false; }
  }).catch(() => {});
}

const adMoney = (n) => "$" + Math.round(n).toLocaleString(I18N.loc);

async function adResumen(body, nav) {
  const [ov, s] = await Promise.all([api("/admin/overview"), api("/admin/billing/summary")]);
  if (nav !== state.nav) return;
  const tile = (n, l, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
  const check = (ok, label, hint) => `<li class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} <b>${label}</b>${ok ? "" : ` <span class="small muted">${hint}</span>`}</li>`;
  body.innerHTML = `
    <section class="stats">
      ${tile(s.bands, "Bandas")}${tile(s.active, "Pagando", "ok")}${tile(s.trial, "En prueba gratis")}${tile(s.exempt, "Sin cargo")}
      ${tile(s.past_due + s.suspended, "Atrasadas o cortadas", s.past_due + s.suspended ? "bad" : "")}
      ${tile(adMoney(s.mrr), "Ingreso mensual (MRR)")}${tile(adMoney(s.collected_month), "Cobrado este mes")}
    </section>
    <section class="card"><h2>Servidor</h2>
      <section class="stats" style="margin:0">${tile(ov.users, "Personas")}${tile(ov.tracks, "Temas")}${tile(fmtGB(ov.used_gb) + " GB", "Audio guardado")}${tile(fmtGB(ov.disk_free_gb) + " GB", "Libres en el servidor")}</section></section>
    <section class="card"><h2>Puesta en marcha</h2>
      <ul class="checks">
        ${check(s.mp_enabled, "Cobro con Mercado Pago", "Falta la variable MP_ACCESS_TOKEN en Coolify.")}
        ${check(s.mail_enabled, "Envío de mails del formulario", "Falta RESEND_API_KEY o SMTP_USER y SMTP_PASSWORD. Los mensajes igual llegan a la pestaña Mensajes.")}
        ${check(s.turnstile, "Casilla anti-robots (Cloudflare Turnstile)", "Faltan TURNSTILE_SITE_KEY y TURNSTILE_SECRET.")}
        ${check(ov.ai_enabled, "IA (consejos, tapas y chat)", "Falta OPENAI_API_KEY.")}
      </ul></section>`;
}

/* ---------- bandas ---------- */
async function adBandas(body, nav) {
  const [bands, plans] = await Promise.all([api("/admin/bands"), api("/admin/plans")]);
  if (nav !== state.nav) return;
  const planName = (id) => (plans.find((p) => p.id === id) || {}).name || "—";
  const ago = (iso) => (iso ? fmtDate(iso) : "sin actividad");
  body.innerHTML = `
    <section class="card"><h2>Alta de banda</h2>
      <form id="nb" class="stack">
        <div class="field" style="margin:0"><label for="nbn">Nombre de la banda</label><input id="nbn" type="text" maxlength="120" required></div>
        <div class="seg" role="radiogroup" aria-label="Si la banda paga">
          <label><input type="radio" name="pay" value="free" checked>No paga<span class="hint">Banda de prueba o amiga: sin cargo</span></label>
          <label><input type="radio" name="pay" value="paid">Paga la suscripción<span class="hint">Mensual por Mercado Pago</span></label>
        </div>
        <div id="nb-paid" class="row" style="gap:.8rem;flex-wrap:wrap" hidden>
          <div class="field" style="margin:0"><label for="nbp">Plan</label><select id="nbp">${plans.filter((p) => p.active).map((p) => `<option value="${p.id}" ${p.slug === "estudio" ? "selected" : ""}>${esc(p.name)} · ${adMoney(p.price_ars)}</option>`).join("")}</select></div>
          <div class="field" style="margin:0"><label for="nbd">Días de prueba gratis</label><input id="nbd" type="number" min="0" max="365" value="14" style="width:110px"></div>
        </div>
        <div class="field" style="margin:0"><label for="nbe">Email del admin de la banda (opcional: genera la invitación)</label><input id="nbe" type="email"></div>
        <button class="btn primary">Crear banda</button>
      </form>
      <div id="nb-out" class="stack hidden" style="margin-top:1rem"></div>
    </section>
    ${bands.map((b) => {
      const pct = Math.min(100, (b.used_gb / b.quota_gb) * 100 || 0), st = b.stats, bl = b.billing;
      return `<section class="card admin-band" data-b="${b.id}">
        <div class="row" style="gap:.7rem">${avatar(b.photo, b.name)}<div class="grow"><h3 style="margin:0">${esc(b.name)}</h3>
          <div class="small muted">${adChip(bl.state)} ${b.exempt ? "" : `Plan ${esc(planName(b.plan_id))} · `}${bl.state === "active" || bl.state === "past_due" ? `pagado hasta ${adDay(bl.paid_until)}` : bl.state === "trial" ? `prueba hasta ${adDay(bl.trial_ends_at)}` : ""}${b.mp_status ? ` · MP: ${esc(b.mp_status)}` : ""}</div></div></div>
        <p class="small muted" style="margin:.6rem 0 .3rem">${st.ensayos} ensayos · ${st.produccion} en producción · ${st.master} en master · ${st.masters_hechos} masters hechos · ${st.albumes} álbumes · Este mes: ${b.usage.masters_month} masters · Última actividad: ${ago(st.ultima_actividad)}</p>
        <div class="small muted row between"><span>Espacio</span><span>${fmtGB(b.used_gb)} de ${esc(b.quota_gb)} GB</span></div>
        <div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></div>
        <div class="ad-actions">
          <label class="check"><input type="checkbox" data-exempt ${b.exempt ? "checked" : ""}> Sin cargo (no paga)</label>
          ${b.exempt ? "" : `<select class="mini-sel" data-plan aria-label="Plan de ${esc(b.name)}">${plans.map((p) => `<option value="${p.id}" ${p.id === b.plan_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <button class="btn small" data-act="paid30" title="Registrar un pago manual (transferencia, efectivo) y sumar 30 días">+30 días pagados</button>
          <button class="btn small" data-act="trial" title="Darle una prueba gratis nueva">Prueba gratis…</button>
          ${b.mp_status ? `<button class="btn small" data-act="sync" title="Preguntar a Mercado Pago el estado">Sincronizar MP</button>` : ""}`}
          <button class="btn small ${b.blocked ? "primary" : "danger"}" data-act="block">${b.blocked ? "Reactivar servicio" : "Cortar servicio"}</button>
          <button class="btn small" data-bren="${b.id}" data-name="${esc(b.name)}">Cambiar nombre</button>
          <button class="btn small danger" data-bdel="${b.id}" data-name="${esc(b.name)}">Borrar banda</button>
        </div>
        ${b.members.length ? `<table class="table" style="margin-top:.5rem"><tbody>${b.members.map((m) => `
          <tr><td>${esc(m.name || "—")}<div class="small muted">${esc(m.email)}</div></td>
          <td><select class="mini-sel" data-role="${b.id}:${m.user_id}" aria-label="Rol de ${esc(m.name || m.email)}"><option value="member" ${m.role === "member" ? "selected" : ""}>Integrante</option><option value="admin" ${m.role === "admin" ? "selected" : ""}>Admin de banda</option></select></td>
          <td style="text-align:right"><button class="icon-btn" data-rm="${b.id}:${m.user_id}" aria-label="Sacar a ${esc(m.name || m.email)} de ${esc(b.name)}" title="Sacar de la banda">${ic("x")}</button></td></tr>`).join("")}</tbody></table>`
          : `<p class="small muted" style="margin-top:.5rem">Sin integrantes todavía. Invitá a su admin desde Personas.</p>`}
      </section>`;
    }).join("") || `<div class="card empty">Todavía no hay bandas.</div>`}`;

  const reload = () => viewAdmin(nav, "bandas");
  $$('input[name="pay"]', body).forEach((r) => r.addEventListener("change", () => { $("#nb-paid", body).hidden = $('input[name="pay"]:checked', body).value !== "paid"; }));
  $("#nb", body).addEventListener("submit", adGuard(async (ev) => {
    ev.preventDefault();
    const paid = $('input[name="pay"]:checked', body).value === "paid";
    const json = { name: $("#nbn").value, exempt: !paid, admin_email: $("#nbe").value.trim() };
    if (paid) { json.plan_id = Number($("#nbp").value); json.trial_days = Number($("#nbd").value || 0); }
    const r = await api("/admin/bands", { method: "POST", json });
    toast("Banda creada", "ok");
    if (r.invite) {
      const link = r.invite.link_hint;
      const wa = `https://wa.me/?text=${encodeURIComponent(`Te invité a administrar la banda "${r.name}" en Diablo Master Mix. Entrá acá y creá tu cuenta: ${link}`)}`;
      const out = $("#nb-out"); out.classList.remove("hidden");
      out.innerHTML = `<p>Banda creada. Pasale este link al admin (sirve una vez, vence en ${esc(r.invite.expires_in_days)} días):</p>
        <div class="copybox"><span class="grow">${esc(link)}</span><button type="button" class="btn small" id="cpl">Copiar</button></div>
        <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>`;
      $("#cpl").addEventListener("click", () => copyText(link));
    } else reload();
  }));
  const put = (bid, json) => api(`/admin/bands/${bid}/billing`, { method: "PUT", json });
  $$("[data-b]", body).forEach((card) => {
    const bid = card.dataset.b;
    $("[data-exempt]", card).addEventListener("change", adGuard(async (e) => { await put(bid, { exempt: e.target.checked }); toast(e.target.checked ? "Ahora no paga" : "Ahora paga suscripción", "ok"); reload(); }));
    const ps = $("[data-plan]", card);
    if (ps) ps.addEventListener("change", adGuard(async () => { await put(bid, { plan_id: Number(ps.value) }); toast("Plan cambiado", "ok"); reload(); }));
    $$("[data-act]", card).forEach((btn) => btn.addEventListener("click", adGuard(async () => {
      const a = btn.dataset.act;
      if (a === "paid30") { if (!confirm("¿Registrar un pago manual y sumar 30 días de servicio?")) return; await put(bid, { add_paid_days: 30 }); toast("30 días sumados", "ok"); }
      else if (a === "trial") { const d = prompt("¿Cuántos días de prueba gratis?", "14"); if (d === null) return; await put(bid, { trial_days: Number(d) || 0 }); toast("Prueba actualizada", "ok"); }
      else if (a === "sync") { await api(`/admin/bands/${bid}/billing/sync`, { method: "POST" }); toast("Sincronizado con Mercado Pago", "ok"); }
      else if (a === "block") { const bl = btn.textContent.includes("Cortar"); if (bl && !confirm("¿Cortar el servicio? La banda sigue viendo y bajando su material, pero no puede subir ni masterizar.")) return; await put(bid, { blocked: bl }); toast(bl ? "Servicio cortado" : "Servicio reactivado", "ok"); }
      reload();
    })));
  });
  $$("[data-bren]", body).forEach((b) => b.addEventListener("click", () => {
    openModal(`<form id="brf" class="stack"><h2>Cambiar el nombre de la banda</h2>
      <div class="field"><label for="brn">Nombre</label><input id="brn" type="text" maxlength="120" value="${esc(b.dataset.name)}" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="brc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`, (m) => {
      $("#brc", m).addEventListener("click", closeModal);
      $("#brf", m).addEventListener("submit", adGuard(async (ev) => { ev.preventDefault(); await api(`/admin/bands/${b.dataset.bren}`, { method: "PUT", json: { name: $("#brn", m).value } }); closeModal(); toast("Nombre guardado", "ok"); reload(); }));
    });
  }));
  $$("[data-bdel]", body).forEach((b) => b.addEventListener("click", () => {
    openModal(`<form id="bdf" class="stack"><h2>Borrar "${esc(b.dataset.name)}"</h2>
      <p class="callout">Se borran <strong>todos</strong> sus ensayos, temas, masters, álbumes, eventos y avisos. No se puede deshacer. Las personas no se borran. Si tiene una suscripción activa en Mercado Pago, cancelala antes.</p>
      <div class="field"><label for="bdn">Para confirmar, escribí el nombre de la banda</label><input id="bdn" type="text" autocomplete="off" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="bdc">Cancelar</button><button class="btn danger">Borrar para siempre</button></div></form>`, (m) => {
      $("#bdc", m).addEventListener("click", closeModal);
      $("#bdf", m).addEventListener("submit", adGuard(async (ev) => { ev.preventDefault(); await api(`/admin/bands/${b.dataset.bdel}?confirm_name=${encodeURIComponent($("#bdn", m).value)}`, { method: "DELETE" }); closeModal(); toast("Banda borrada", "ok"); reload(); }));
    });
  }));
  $$("[data-role]", body).forEach((s) => s.addEventListener("change", adGuard(async () => {
    const [bid, uid] = s.dataset.role.split(":");
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "PUT", json: { role: s.value } }); toast("Rol actualizado", "ok");
  })));
  $$("[data-rm]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    const [bid, uid] = b.dataset.rm.split(":");
    if (!confirm("¿Sacar a esta persona de la banda? Deja de ver sus temas.")) return;
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "DELETE" }); toast("Listo", "ok"); reload();
  })));
}

/* ---------- cobros ---------- */
async function adCobros(body, nav) {
  const [pays, bands, sum] = await Promise.all([api("/admin/payments"), api("/admin/bands"), api("/admin/billing/summary")]);
  if (nav !== state.nav) return;
  const pend = sum.pending_signups || [];
  const bajas = sum.cancellations || [];
  const problem = bands.filter((b) => ["past_due", "suspended"].includes(b.billing.state) && !b.exempt);
  body.innerHTML = `
    ${bajas.length ? `<section class="card"><h2>Bajas</h2><p class="small muted">Motivos que marcaron las bandas al darse de baja. Se borran todos sus datos a las 48 horas; si fue un error, frená la baja antes de que pase el plazo.</p>
      <ul class="upcoming">${bajas.map((c) => `<li><div class="grow"><strong>${esc(c.band)}</strong> ${c.plan ? `<span class="chip-st">${esc(c.plan)}</span>` : ""}
        ${c.purged_at ? `<span class="chip-st">Eliminada</span>` : c.stopped ? `<span class="chip-st ok">Frenada</span>` : `<span class="chip-st err">Se borra ${adDay(c.purge_at)}</span>`}
        <div class="small muted">${adDay(c.created_at)} · ${c.months} ${c.months === 1 ? "mes" : "meses"} de antigüedad</div>
        <ul class="cx-why">${c.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${c.comment ? `<div class="small">“${esc(c.comment)}”</div>` : ""}</div>
        ${!c.purged_at && !c.stopped && c.band_id ? `<button class="btn small" data-stop="${c.band_id}">Frenar baja</button>` : ""}</li>`).join("")}</ul></section>` : ""}
    ${pend.length ? `<section class="card"><h2>Altas sin terminar</h2><p class="small muted">Eligieron un plan pero todavía no completaron el pago en Mercado Pago. Si lo completan, la banda se crea sola y se te avisa.</p>
      <ul class="upcoming">${pend.map((s) => `<li><div class="grow"><strong>${esc(s.band)}</strong> <span class="chip-st">${esc(s.plan)}</span><div class="small muted">${esc(s.name)} · ${esc(s.email)} · ${adDay(s.created_at)}</div></div></li>`).join("")}</ul></section>` : ""}
    ${problem.length ? `<section class="card"><h2>Para mirar</h2><ul class="upcoming">${problem.map((b) => `<li><div class="grow"><strong>${esc(b.name)}</strong> ${adChip(b.billing.state)}
      <div class="small muted">${b.billing.state === "past_due" ? `El pago venció el ${adDay(b.billing.paid_until)}. Si no paga, se corta solo a los pocos días.` : "Sin servicio: solo puede ver y bajar su material."}</div></div></li>`).join("")}</ul></section>` : ""}
    <section class="card"><h2>Pagos</h2>
      <p class="small muted">El corte por falta de pago es automático: cuando Mercado Pago no cobra el mes, la banda pasa a “pago atrasado” unos días y después queda sin servicio hasta que se regularice.</p>
      ${pays.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Banda</th><th>Monto</th><th>Estado</th><th>Origen</th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td>${adDay(p.paid_at)}</td><td>${esc(p.band || "—")}</td><td>${p.amount ? adMoney(p.amount) : "—"}</td><td>${p.status === "approved" ? `<span class="chip-st ok">Aprobado</span>` : `<span class="chip-st err">Rechazado</span>`}</td><td>${p.kind === "manual" ? "Manual" : "Mercado Pago"}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Todavía no hay pagos.</p>`}</section>`;
  $$("[data-stop]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    if (!confirm("¿Frenar la baja? No se borra nada, pero la banda queda sin suscripción y tiene que volver a suscribirse.")) return;
    await api(`/admin/bands/${b.dataset.stop}/billing/stop-closing`, { method: "POST" }); toast("Baja frenada", "ok"); adCobros(body, nav);
  })));
}

/* ---------- planes ---------- */
async function adPlanes(body, nav) {
  const plans = await api("/admin/plans");
  if (nav !== state.nav) return;
  const num = (id, label, v, min, max, step = 1) => `<div class="field" style="margin:0"><label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
  body.innerHTML = `
    <div class="callout" style="margin-bottom:1rem">Hay 3 planes y se cobra por banda. Si cambiás un precio, se actualiza solo en Mercado Pago para las bandas que ya están suscriptas (rige desde su próximo cobro). Pensá siempre el costo: disco, IA, servidor y la comisión de Mercado Pago (~8%).</div>
    ${plans.map((p) => `<section class="card plan-ed" data-p="${p.id}"><div class="row between"><h2 style="margin:0">${esc(p.name)}</h2><span class="muted small">${p.bands} ${p.bands === 1 ? "banda" : "bandas"} en este plan</span></div>
      <div class="plan-grid">
        <div class="field" style="margin:0"><label for="pn${p.id}">Nombre</label><input id="pn${p.id}" type="text" maxlength="60" value="${esc(p.name)}"></div>
        <div class="field" style="margin:0;grid-column:span 2"><label for="pt${p.id}">Frase corta</label><input id="pt${p.id}" type="text" maxlength="160" value="${esc(p.tagline)}"></div>
        ${num("pp" + p.id, "Precio por mes (ARS)", p.price_ars, 0, 100000000, 100)}${num("pq" + p.id, "Espacio (GB)", p.quota_gb, 1, 2000, 1)}${num("pm" + p.id, "Masters por mes", p.masters_month, 1, 10000)}
        ${num("pc" + p.id, "Tapas con IA por mes", p.ai_covers_month, 0, 10000)}${num("pd" + p.id, "Consejos IA por día", p.ai_notes_day, 0, 1000)}${num("pi" + p.id, "Integrantes máx.", p.max_members, 1, 100)}
      </div>
      <div class="row" style="margin-top:.8rem;gap:1rem;flex-wrap:wrap"><label class="check"><input type="checkbox" id="pa${p.id}" ${p.active ? "checked" : ""}> Visible</label>
        <label class="check"><input type="checkbox" id="ph${p.id}" ${p.highlight ? "checked" : ""}> Destacado (“El más elegido”)</label><span class="grow"></span>
        <button class="btn primary" data-save="${p.id}">Guardar</button></div></section>`).join("")}`;
  $$("[data-save]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    const id = b.dataset.save, v = (k) => $(`#${k}${id}`).value;
    const r = await api(`/admin/plans/${id}`, { method: "PUT", json: {
      name: v("pn"), tagline: v("pt"), price_ars: Number(v("pp")), quota_gb: Number(v("pq")), masters_month: Number(v("pm")),
      ai_covers_month: Number(v("pc")), ai_notes_day: Number(v("pd")), max_members: Number(v("pi")), active: $(`#pa${id}`).checked, highlight: $(`#ph${id}`).checked } });
    state.pub = null;
    toast(r.repriced ? `Guardado. Precio actualizado en ${r.repriced} suscripción(es).` : "Plan guardado", r.failed ? "err" : "ok");
    if (r.failed) toast(`${r.failed} suscripción(es) no se pudieron actualizar en Mercado Pago.`, "err");
  })));
}

/* ---------- personas ---------- */
async function adPersonas(body, nav) {
  const [users, bands] = await Promise.all([api("/admin/users"), api("/admin/bands")]);
  if (nav !== state.nav) return;
  body.innerHTML = `
    <section class="card"><h2>Invitar a alguien</h2>
      ${bands.length ? `<form id="inv" class="stack">
        <div class="field" style="margin:0"><label for="ib">Banda</label><select id="ib">${bands.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></div>
        <div class="field" style="margin:0"><label for="ie">Email de la persona</label><input id="ie" type="email" required></div>
        <div class="field" style="margin:0"><label for="ir">Rol</label><select id="ir"><option value="member">Integrante</option><option value="admin">Admin de la banda</option></select></div>
        <button class="btn primary">Crear invitación</button></form><div id="invout" class="stack hidden" style="margin-top:1rem"></div>` : `<p class="muted">Primero creá una banda.</p>`}</section>
    <section class="card"><h2>Personas</h2>
      <p class="small muted">Si alguien olvidó su contraseña, generale una nueva y pasásela. Puede cambiarla desde Tu cuenta.</p>
      <div class="table-wrap"><table class="table"><tbody>${users.map((u) => `
        <tr class="${u.active ? "" : "inactive"}"><td><div class="row" style="gap:.6rem;flex-wrap:nowrap">${avatar(u.photo, u.name || u.email)}
          <div><strong>${esc(u.name || "—")}</strong> ${u.is_super ? `<span class="badge">Super admin</span>` : ""}${u.active ? "" : ` <span class="badge raw">Desactivado</span>`}
          <div class="small muted">${esc(u.email)}</div><div class="small muted">${u.bands.length ? u.bands.map((b) => esc(b.name) + (b.role === "admin" ? " (admin)" : "")).join(" · ") : "Sin banda"}</div></div></div></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn small" data-reset="${u.id}" data-who="${esc(u.name || u.email)}">${ic("key")} Nueva contraseña</button>
          ${u.id === state.me.id ? "" : `<button class="btn small ${u.active ? "danger" : ""}" data-active="${u.id}" data-to="${u.active ? "0" : "1"}">${u.active ? "Desactivar" : "Activar"}</button>`}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  const inv = $("#inv");
  if (inv) inv.addEventListener("submit", adGuard(async (ev) => {
    ev.preventDefault();
    const email = $("#ie").value.trim();
    const r = await api("/admin/invites", { method: "POST", json: { email, band_id: Number($("#ib").value), role: $("#ir").value } });
    const link = r.link_hint || `${location.origin}/#/invite/${r.invite_token}`;
    const bandName = bands.find((b) => String(b.id) === $("#ib").value)?.name || "";
    const wa = `https://wa.me/?text=${encodeURIComponent(`Te invité a la banda "${bandName}" en Diablo Master Mix. Entrá acá y creá tu cuenta: ${link}`)}`;
    const out = $("#invout"); out.classList.remove("hidden");
    out.innerHTML = `<p>Listo. Pasale este link a <strong>${esc(email)}</strong> (sirve una sola vez y vence en ${esc(r.expires_in_days)} días):</p>
      <div class="copybox"><span class="grow">${esc(link)}</span><button type="button" class="btn small" id="cp">Copiar</button></div>
      <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>`;
    $("#cp").addEventListener("click", () => copyText(link));
  }));
  $$("[data-reset]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    if (!confirm(`¿Generar una contraseña nueva para ${b.dataset.who}? La anterior deja de funcionar.`)) return;
    const r = await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: "POST" });
    const msg = `Hola ${r.name || ""}! Tu acceso a Diablo Master Mix (${location.origin}): email ${r.email}, contraseña temporal ${r.password}. Entrá y cambiala desde Tu cuenta.`;
    openModal(`<div class="stack"><h2>Contraseña nueva</h2><p>Para <strong>${esc(r.email)}</strong>. Pasásela ahora: <strong>no se vuelve a mostrar</strong>.</p>
      <div class="copybox"><span class="grow" style="font-size:1.25rem;letter-spacing:.04em">${esc(r.password)}</span><button type="button" class="btn small" id="cpw">Copiar</button></div>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="cpd">Listo</button></div></div>`, (m) => {
      $("#cpw", m).addEventListener("click", () => copyText(r.password)); $("#cpd", m).addEventListener("click", closeModal);
    });
  })));
  $$("[data-active]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    const to = b.dataset.to === "1";
    if (!to && !confirm("¿Desactivar esta cuenta? No va a poder entrar, pero sus temas quedan.")) return;
    await api(`/admin/users/${b.dataset.active}`, { method: "PUT", json: { active: to } });
    toast(to ? "Cuenta activada" : "Cuenta desactivada", "ok"); viewAdmin(nav, "personas");
  })));
}

/* ---------- referencias globales ---------- */
async function adRefs(body, nav) {
  const genres = await getGenres(true);
  if (nav !== state.nav) return;
  body.innerHTML = `<div class="callout" style="margin-bottom:1rem">Estas referencias las ven <b>todas las bandas</b> dentro de Master. Solo se guarda un fragmento de 90 segundos que nadie puede escuchar ni bajar.</div>
    <section class="card" id="ad-reflib"></section>`;
  await refLibrary($("#ad-reflib", body), { bandId: null, genres, selected: { id: null }, onPick: null });
}

/* ---------- estilos ---------- */
async function adEstilos(body, nav) {
  const genres = await getGenres(true);
  if (nav !== state.nav) return;
  const fams = genreFamilies(genres);
  body.innerHTML = `<section class="card"><h2>Estilos de master</h2>
    <p class="small muted">El volumen objetivo se mide en LUFS: cuanto más cerca de 0, más fuerte. Cada estilo además trae su receta de tono, compresión y ancho. Acá podés ajustar el volumen de cada uno o agregar estilos nuevos.</p>
    ${fams.map(([f, list]) => `<h3 class="st-sub">${esc(f)}</h3><table class="table"><tbody>${list.map((g) => `<tr data-g="${g.id}">
      <td><input type="text" data-f="name" value="${esc(g.name)}" aria-label="Nombre del estilo" maxlength="60"></td>
      <td style="width:90px"><input type="number" data-f="lufs" value="${g.target_lufs}" step="0.5" min="-24" max="-6" aria-label="LUFS de ${esc(g.name)}"></td>
      <td style="white-space:nowrap"><button class="btn small" data-gsave="${g.id}">Guardar</button> <button class="icon-btn" data-gdel="${g.id}" aria-label="Borrar estilo ${esc(g.name)}">${ic("trash")}</button></td></tr>`).join("")}</tbody></table>`).join("")}
    <form id="ng" class="row" style="margin-top:.75rem"><input id="ngn" type="text" maxlength="60" placeholder="Estilo nuevo" aria-label="Nombre del estilo nuevo" required class="grow">
      <input id="ngl" type="number" value="-12" step="0.5" min="-24" max="-6" aria-label="LUFS del estilo nuevo" style="width:90px"><button class="btn">Agregar</button></form></section>`;
  $$("[data-gsave]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    const row = b.closest("tr");
    await api(`/admin/genres/${b.dataset.gsave}`, { method: "PUT", json: { name: $('[data-f="name"]', row).value, target_lufs: Number($('[data-f="lufs"]', row).value) } });
    state.genres = null; toast("Estilo guardado", "ok");
  })));
  $$("[data-gdel]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    if (!confirm("¿Borrar este estilo?")) return;
    await api(`/admin/genres/${b.dataset.gdel}`, { method: "DELETE" }); state.genres = null; viewAdmin(nav, "estilos");
  })));
  $("#ng", body).addEventListener("submit", adGuard(async (ev) => {
    ev.preventDefault();
    await api("/admin/genres", { method: "POST", json: { name: $("#ngn").value, target_lufs: Number($("#ngl").value) } });
    state.genres = null; viewAdmin(nav, "estilos");
  }));
}

/* ---------- mensajes de contacto ---------- */
async function adMensajes(body, nav) {
  const list = await api("/admin/contact-messages");
  if (nav !== state.nav) return;
  body.innerHTML = list.length ? list.map((m) => `<section class="card msg ${m.handled ? "done" : ""}" data-m="${m.id}">
      <div class="row between"><strong>${esc(m.name)}</strong><span class="muted small">${fmtDate(m.created_at)}</span></div>
      <div class="small muted">${esc(m.email)}${m.band ? " · " + esc(m.band) : ""}${m.emailed ? "" : " · el mail no salió (mirá la configuración de correo)"}</div>
      <p style="white-space:pre-wrap;margin:.6rem 0">${esc(m.message)}</p>
      <div class="row" style="gap:.5rem;flex-wrap:wrap"><a class="btn small primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("Diablo Master Mix")}">Responder</a>
        <button class="btn small" data-h="${m.id}" data-to="${m.handled ? 0 : 1}">${m.handled ? "Marcar sin atender" : "Marcar atendido"}</button>
        <button class="btn small danger" data-d="${m.id}">Borrar</button></div></section>`).join("")
    : `<div class="card empty">${ic("bell")}Todavía no hay mensajes del formulario de contacto.</div>`;
  $$("[data-h]", body).forEach((b) => b.addEventListener("click", adGuard(async () => { await api(`/admin/contact-messages/${b.dataset.h}?handled=${b.dataset.to === "1"}`, { method: "PUT" }); viewAdmin(nav, "mensajes"); })));
  $$("[data-d]", body).forEach((b) => b.addEventListener("click", adGuard(async () => { if (!confirm("¿Borrar este mensaje?")) return; await api(`/admin/contact-messages/${b.dataset.d}`, { method: "DELETE" }); viewAdmin(nav, "mensajes"); })));
}
