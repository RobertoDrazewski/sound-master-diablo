/* Panel del super admin: solo herramientas de administración (sin música). Se carga antes que app.js. */
"use strict";

const AD_TABS = [
  ["resumen", "Resumen"], ["bandas", "Bandas"], ["pruebas", "Pruebas gratis"], ["cobros", "Cobros"], ["planes", "Planes"],
  ["personas", "Personas"], ["referencias", "Referencias"], ["estilos", "Estilos"], ["mensajes", "Mensajes"],
];
const AD_STATE = {
  exempt: ["Cortesía", "ok"], trial: ["En prueba", "warn"], active: ["Pagando", "ok"], past_due: ["Pago atrasado", "warn"], suspended: ["Servicio cortado", "err"], closing: ["De baja", "err"],
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
  const fn = { resumen: adResumen, bandas: adBandas, pruebas: adPruebas, cobros: adCobros, planes: adPlanes, personas: adPersonas, referencias: adRefs, estilos: adEstilos, mensajes: adMensajes }[tab];
  try { await fn(body, nav); } catch (e) { if (nav === state.nav) body.innerHTML = `<div class="card"><h2>No se pudo cargar</h2><p class="muted">${esc(e.message)}</p></div>`; }
  api("/admin/billing/summary").then((s) => {
    const b = $("#adb-mensajes"); if (b && s.unread_messages) { b.textContent = s.unread_messages; b.hidden = false; }
  }).catch(() => {});
}

const adMoney = (n) => "$" + Math.round(n || 0).toLocaleString(I18N.loc);
const adUsd = (n) => "US$" + Math.round(n || 0).toLocaleString(I18N.loc);
const AD_USE = { masters_month: ["sliders", "Masters del mes"], ai_covers_month: ["spark", "Tapas con IA del mes"], storage: ["disc", "Espacio (GB)"] };

async function adResumen(body, nav) {
  const [ov, s] = await Promise.all([api("/admin/overview"), api("/admin/billing/summary")]);
  if (nav !== state.nav) return;
  const tile = (n, l, cls = "") => `<div class="stat ${cls}"><b>${n}</b><span>${l}</span></div>`;
  const go = (n, l, cls, href, f = "") => `<a class="stat ${cls}" href="${href}" ${f ? `data-gof="${f}"` : ""}><b>${n}</b><span>${l}</span></a>`;
  const check = (ok, label, hint) => `<li class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"} <b>${label}</b>${ok ? "" : ` <span class="small muted">${hint}</span>`}</li>`;
  body.innerHTML = `
    <section class="stats">
      ${go(s.bands, "Bandas", "", "#/admin/bandas", "all")}${go(s.active, "Pagando", "ok", "#/admin/bandas", "paying")}
      ${go(s.trial, "En prueba gratis", s.trial ? "warn" : "", "#/admin/pruebas")}${go(s.exempt, "Cortesía", "", "#/admin/bandas", "courtesy")}
      ${go(s.past_due + s.suspended, "Atrasadas o cortadas", s.past_due + s.suspended ? "bad" : "", "#/admin/bandas", "problem")}
      <a class="stat ${s.near_limit ? "warn" : ""}" href="#/admin/bandas" data-near><b>${s.near_limit}</b><span>Cerca del límite del plan</span></a>
    </section>
    <section class="card"><h2>Suscripciones</h2>
      <section class="stats" style="margin:0">
        ${tile(s.subs_mp, "Mercado Pago (Argentina)")}${tile(s.subs_polar, "Polar (resto del mundo)")}
        ${tile(adMoney(s.mrr_ars), "Ingreso mensual en pesos")}${tile(adUsd(s.mrr_usd), "Ingreso mensual en dólares")}
        ${tile(adMoney(s.collected_ars), "Cobrado este mes en pesos")}${tile(adUsd(s.collected_usd), "Cobrado este mes en dólares")}
      </section></section>
    <section class="card"><h2>Servidor</h2>
      <section class="stats" style="margin:0">${tile(ov.users, "Personas")}${tile(ov.tracks, "Temas")}${tile(fmtGB(ov.used_gb) + " GB", "Audio guardado")}${tile(fmtGB(ov.disk_free_gb) + " GB", "Libres en el servidor")}</section></section>
    <section class="card"><h2>Puesta en marcha</h2>
      <ul class="checks">
        ${check(s.mp_enabled, "Cobro con Mercado Pago", "Falta la variable MP_ACCESS_TOKEN en Coolify.")}
        ${check(s.mail_enabled, "Envío de mails del formulario", "Falta RESEND_API_KEY o SMTP_USER y SMTP_PASSWORD. Los mensajes igual llegan a la pestaña Mensajes.")}
        ${check(s.turnstile, "Casilla anti-robots (Cloudflare Turnstile)", "Faltan TURNSTILE_SITE_KEY y TURNSTILE_SECRET.")}
        ${check(ov.ai_enabled, "IA (consejos, tapas y chat)", "Falta OPENAI_API_KEY.")}
      </ul></section>`;
  const near = $("[data-near]", body);
  if (near) near.addEventListener("click", () => { state._adFilter = "limit"; });
  $$("[data-gof]", body).forEach((a) => a.addEventListener("click", () => { state._adFilter = a.dataset.gof; }));
}

/* ---------- bandas ---------- */
async function adBandas(body, nav) {
  const [bands, plans] = await Promise.all([api("/admin/bands"), api("/admin/plans")]);
  if (nav !== state.nav) return;
  const planName = (id) => (plans.find((p) => p.id === id) || {}).name || "—";
  const ago = (iso) => (iso ? fmtDate(iso) : "sin actividad");
  body.innerHTML = `
    <details class="card ad-alta"><summary><h2 style="display:inline">Alta de banda</h2></summary>
      <form id="nb" class="stack" style="margin-top:1rem">
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
    </details>
    <p class="small muted" style="margin:.2rem 0 .6rem">Tocá una banda para ver y editar sus integrantes, su plan y sus datos.</p>
    <div class="ad-filters" role="group" aria-label="Filtrar bandas">${[["all", "Todas"], ["limit", "Cerca del límite"], ["paying", "Pagando"], ["trial", "En prueba"], ["courtesy", "Cortesía"], ["problem", "Atrasadas o cortadas"]].map(([k, l]) =>
      `<button type="button" class="chip-f ${(state._adFilter || "all") === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
    <div class="ad-grid">
    ${bands.map((b) => {
      const pct = Math.min(100, (b.used_gb / b.quota_gb) * 100 || 0), st = b.stats, bl = b.billing;
      const mx = Math.max(1, st.ensayos, st.produccion, st.master, st.masters_hechos, st.albumes);
      const kpi = (icon, label, val) => `<div class="kpi"><span class="k-lab">${ic(icon)}${label}</span><span class="k-bar"><i style="width:${Math.round((val / mx) * 100)}%"></i></span><b class="k-val">${val}</b></div>`;
      const fk = [b.alerts.length ? "limit" : "", ["active", "past_due"].includes(bl.state) && !b.exempt ? "paying" : "", bl.state === "trial" ? "trial" : "", b.exempt ? "courtesy" : "", ["past_due", "suspended"].includes(bl.state) && !b.exempt ? "problem" : ""].join(" ");
      return `<section class="card admin-band" data-b="${b.id}" data-fk="${fk}">
        <button type="button" class="ab-head" data-ab-open aria-expanded="false">
          ${avatar(b.photo, b.name)}
          <span class="grow">
            <span class="ab-name">${esc(b.name)}</span>
            <span class="small muted ab-sub">${adChip(bl.state)} ${b.alerts.length ? `<span class="chip-st ${b.alerts.some((a) => a.level === "full") ? "err" : "warn"}">${b.alerts.some((a) => a.level === "full") ? "En el tope" : "Cerca del límite"}</span> ` : ""}${[
              b.exempt ? (b.courtesy_note ? esc(b.courtesy_note) : "") : `Plan ${esc(planName(b.plan_id))}`,
              b.exempt && b.courtesy_until ? `vence el ${adDay(b.courtesy_until)}` : "",
              b.provider && !b.exempt ? (b.provider === "polar" ? "Polar" : "Mercado Pago") : "",
              bl.state === "active" || bl.state === "past_due" ? `pagado hasta ${adDay(bl.paid_until)}` : bl.state === "trial" ? `prueba hasta ${adDay(bl.trial_ends_at)}` : "",
            ].filter(Boolean).map((x) => `<span>${x}</span>`).join(" · ")}</span>
            <span class="meter mini ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></span>
          </span>
          <span class="ab-chev">${ic("down")}</span>
        </button>
        <div class="ab-body" hidden>
        <div class="ab-kpis">
          ${kpi("mic", "Ensayos", st.ensayos)}
          ${kpi("music", "En producción", st.produccion)}
          ${kpi("sliders", "En master", st.master)}
          ${kpi("flame", "Masters hechos", st.masters_hechos)}
          ${kpi("disc", "Álbumes", st.albumes)}
        </div>
        <p class="small muted" style="margin:.6rem 0 .2rem">Última actividad: ${ago(st.ultima_actividad)}</p>
        <div class="ab-use">${[["masters_month", b.usage.masters_month, b.limits.masters_month], ["ai_covers_month", b.usage.ai_covers_month, b.limits.ai_covers_month], ["storage", b.used_gb, b.quota_gb]].map(([k, u, cap]) => {
          const p = cap ? Math.min(100, (u / cap) * 100) : 0, al = b.alerts.find((a) => a.kind === k);
          return `<div class="use-row"><span class="u-lab">${ic(AD_USE[k][0])}<span>${AD_USE[k][1]}</span></span>
            <span class="meter ${p >= 100 ? "full" : p >= 80 ? "warn" : ""}"><i style="width:${p}%"></i></span>
            <b class="u-val">${k === "storage" ? fmtGB(u) : u} <span class="muted">/ ${cap == null ? "sin tope" : k === "storage" ? fmtGB(cap) : cap}</span></b>
            ${al && !b.exempt ? `<button type="button" class="btn small" data-upsell="${k}" title="Le manda al admin de la banda el aviso con el plan que le conviene, en su idioma">Mandar aviso</button>` : ""}</div>`;
        }).join("")}</div>
        <h3 class="ab-h">${ic("card")} Plan y cobro</h3>
        <div class="ad-actions">
          <label class="check"><input type="checkbox" data-exempt ${b.exempt ? "checked" : ""}> Cortesía (no paga)</label>
          ${b.exempt ? `<button class="btn small" data-act="courtesy" title="Motivo y vencimiento de la cortesía">Motivo y vencimiento</button>` : ""}
          ${b.exempt ? "" : `<select class="mini-sel" data-plan aria-label="Plan de ${esc(b.name)}">${plans.map((p) => `<option value="${p.id}" ${p.id === b.plan_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <button class="btn small" data-act="paid30" title="Registrar un pago manual (transferencia, efectivo) y sumar 30 días">+30 días pagados</button>
          <button class="btn small" data-act="trial" title="Darle una prueba gratis nueva">Prueba gratis…</button>
          ${b.mp_status ? `<button class="btn small" data-act="sync" title="Preguntar a Mercado Pago el estado">Sincronizar MP</button>` : ""}`}
        </div>
        <h3 class="ab-h">${ic("users")} Integrantes <span class="muted small">(${b.members.length})</span></h3>
        ${b.members.length ? `<ul class="ab-members">${b.members.map((m) => `
          <li><span class="grow"><b>${esc(m.name || "—")}</b>${m.user_id === state.me.id ? ` <span class="badge">Vos</span>` : ""}<span class="small muted">${esc(m.email)}</span></span>
          <select class="mini-sel" data-role="${b.id}:${m.user_id}" aria-label="Rol de ${esc(m.name || m.email)}"><option value="member" ${m.role === "member" ? "selected" : ""}>Integrante</option><option value="admin" ${m.role === "admin" ? "selected" : ""}>Admin de banda</option></select>
          <button class="btn small" data-rm="${b.id}:${m.user_id}" data-who="${esc(m.name || m.email)}">${ic("x")} Sacar de la banda</button>
          ${m.user_id === state.me.id ? "" : `<button class="btn small danger" data-udel="${m.user_id}" data-email="${esc(m.email)}" data-who="${esc(m.name || m.email)}">${ic("trash")} Borrar cuenta</button>`}</li>`).join("")}</ul>`
          : `<p class="small muted" style="margin:.3rem 0">Sin integrantes todavía.</p>`}
        <div class="ad-actions"><button class="btn small primary" data-addm="${b.id}" data-name="${esc(b.name)}">${ic("plus")} Sumar integrante</button></div>
        <h3 class="ab-h">${ic("edit")} Banda</h3>
        <div class="ad-actions">
          <button class="btn small" data-bren="${b.id}" data-name="${esc(b.name)}">Editar nombre</button>
          <button class="btn small ${b.blocked ? "primary" : "danger"}" data-act="block">${b.blocked ? "Reactivar servicio" : "Limitar: cortar servicio"}</button>
          <button class="btn small danger" data-bdel="${b.id}" data-name="${esc(b.name)}">${ic("trash")} Borrar banda</button>
        </div>
        </div>
      </section>`;
    }).join("") || `<div class="card empty">Todavía no hay bandas.</div>`}
    </div>`;

  const reload = () => viewAdmin(nav, "bandas");
  const applyFilter = () => {
    const f = state._adFilter || "all";
    $$(".chip-f", body).forEach((x) => x.classList.toggle("on", x.dataset.f === f));
    $$(".admin-band", body).forEach((c) => { c.hidden = f !== "all" && !c.dataset.fk.split(" ").includes(f); });
  };
  $$(".chip-f", body).forEach((x) => x.addEventListener("click", () => { state._adFilter = x.dataset.f; applyFilter(); }));
  applyFilter();
  $$("[data-upsell]", body).forEach((btn) => btn.addEventListener("click", adGuard(async () => {
    const bid = btn.closest("[data-b]").dataset.b;
    if (!confirm("¿Mandarle ahora al admin de la banda el aviso de que está cerca del límite, con el plan que le conviene?")) return;
    const r = await api(`/admin/bands/${bid}/upsell`, { method: "POST", json: { kind: btn.dataset.upsell } });
    toast(r.sent === 1 ? "Aviso enviado" : `Aviso enviado a ${r.sent} admins`, "ok");
  })));
  // ficha expandible: un toque abre la banda con sus KPIs y acciones; se recuerda cuál quedó abierta
  $$(".admin-band", body).forEach((card) => {
    const head = $("[data-ab-open]", card), panel = $(".ab-body", card);
    const setOpen = (open) => {
      panel.hidden = !open;
      card.classList.toggle("open", open);
      head.setAttribute("aria-expanded", open ? "true" : "false");
    };
    head.addEventListener("click", () => {
      const open = panel.hidden;
      setOpen(open);
      state._abOpen = open ? card.dataset.b : null;
    });
    if (state._abOpen && String(state._abOpen) === String(card.dataset.b)) setOpen(true);
  });
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
    $("[data-exempt]", card).addEventListener("change", adGuard(async (e) => { await put(bid, { exempt: e.target.checked }); toast(e.target.checked ? "Ahora es cortesía: no paga" : "Ahora paga suscripción", "ok"); reload(); }));
    const ps = $("[data-plan]", card);
    if (ps) ps.addEventListener("change", adGuard(async () => { await put(bid, { plan_id: Number(ps.value) }); toast("Plan cambiado", "ok"); reload(); }));
    $$("[data-act]", card).forEach((btn) => btn.addEventListener("click", adGuard(async () => {
      const a = btn.dataset.act;
      if (a === "courtesy") {
        const b0 = bands.find((x) => String(x.id) === String(bid)) || {};
        const note = prompt("Motivo de la cortesía (por ejemplo: artista invitado, banda amiga, prensa)", b0.courtesy_note || "");
        if (note === null) return;
        const d = prompt("¿Cuántos días dura? Dejá 0 para que no venza. Al vencer, la banda pasa a 7 días de prueba para elegir un plan.", "0");
        if (d === null) return;
        await put(bid, { courtesy_note: note, courtesy_days: Math.max(0, Number(d) || 0) }); toast("Cortesía guardada", "ok");
      } else if (a === "paid30") { if (!confirm("¿Registrar un pago manual y sumar 30 días de servicio?")) return; await put(bid, { add_paid_days: 30 }); toast("30 días sumados", "ok"); }
      else if (a === "trial") { const d = prompt("¿Cuántos días de prueba gratis?", "14"); if (d === null) return; await put(bid, { trial_days: Number(d) || 0 }); toast("Prueba actualizada", "ok"); }
      else if (a === "sync") { await api(`/admin/bands/${bid}/billing/sync`, { method: "POST" }); toast("Sincronizado con Mercado Pago", "ok"); }
      else if (a === "block") { const bl = !btn.textContent.includes("Reactivar"); if (bl && !confirm("¿Cortar el servicio? La banda sigue viendo y bajando su material, pero no puede subir ni masterizar.")) return; await put(bid, { blocked: bl }); toast(bl ? "Servicio cortado" : "Servicio reactivado", "ok"); }
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
      <label class="check"><input type="checkbox" id="bdu"> Borrar también las cuentas de sus integrantes que no estén en otra banda</label>
      <div class="field"><label for="bdn">Para confirmar, escribí el nombre de la banda</label><input id="bdn" type="text" autocomplete="off" required></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="bdc">Cancelar</button><button class="btn danger">Borrar para siempre</button></div></form>`, (m) => {
      $("#bdc", m).addEventListener("click", closeModal);
      $("#bdf", m).addEventListener("submit", adGuard(async (ev) => { ev.preventDefault(); const r = await api(`/admin/bands/${b.dataset.bdel}?confirm_name=${encodeURIComponent($("#bdn", m).value)}&with_users=${$("#bdu", m).checked}`, { method: "DELETE" }); closeModal(); toast(r.users_removed ? `Banda borrada y ${r.users_removed} cuenta(s) borradas` : "Banda borrada", "ok"); reload(); }));
    });
  }));
  $$("[data-role]", body).forEach((s) => s.addEventListener("change", adGuard(async () => {
    const [bid, uid] = s.dataset.role.split(":");
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "PUT", json: { role: s.value } }); toast("Rol actualizado", "ok");
  })));
  $$("[data-rm]", body).forEach((b) => b.addEventListener("click", adGuard(async () => {
    const [bid, uid] = b.dataset.rm.split(":");
    if (!confirm(`¿Sacar a ${b.dataset.who} de la banda? Deja de ver sus temas. Su cuenta sigue existiendo.`)) return;
    await api(`/admin/bands/${bid}/members/${uid}`, { method: "DELETE" }); toast("Lo sacaste de la banda", "ok"); reload();
  })));
  $$("[data-udel]", body).forEach((b) => b.addEventListener("click", () => adDeleteUser(b.dataset.udel, b.dataset.email, b.dataset.who, reload)));
  $$("[data-addm]", body).forEach((b) => b.addEventListener("click", () => adAddMember(b.dataset.addm, b.dataset.name)));
}

/* borrar la cuenta de una persona (desde Bandas o Personas) */
function adDeleteUser(uid, email, who, after) {
  openModal(`<form id="udf" class="stack"><h2>Borrar la cuenta de ${esc(who)}</h2>
    <p class="callout">Se borra la cuenta y sus datos personales, y sale de todas sus bandas. Lo que subió a una banda queda en la banda, sin su nombre. No se puede deshacer.</p>
    <div class="field"><label for="udn">Para confirmar, escribí su email: <strong>${esc(email)}</strong></label><input id="udn" type="email" autocomplete="off" required></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="udc">Cancelar</button><button class="btn danger">Borrar cuenta</button></div></form>`, (m) => {
    $("#udc", m).addEventListener("click", closeModal);
    $("#udf", m).addEventListener("submit", adGuard(async (ev) => {
      ev.preventDefault();
      await api(`/admin/users/${uid}?confirm_email=${encodeURIComponent($("#udn", m).value)}`, { method: "DELETE" });
      closeModal(); toast("Cuenta borrada", "ok"); after();
    }));
  });
}

/* sumar a alguien a una banda: genera la invitación para esa banda */
function adAddMember(bid, bandName) {
  openModal(`<form id="amf" class="stack"><h2>Sumar integrante a ${esc(bandName)}</h2>
    <div class="field" style="margin:0"><label for="ame">Email de la persona</label><input id="ame" type="email" required></div>
    <div class="field" style="margin:0"><label for="amr">Rol</label><select id="amr"><option value="member">Integrante</option><option value="admin">Admin de la banda</option></select></div>
    <div id="amo" class="stack" hidden></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="amc">Cerrar</button><button class="btn primary" id="amok">Crear invitación</button></div></form>`, (m) => {
    $("#amc", m).addEventListener("click", closeModal);
    $("#amf", m).addEventListener("submit", adGuard(async (ev) => {
      ev.preventDefault();
      const email = $("#ame", m).value.trim();
      const r = await api("/admin/invites", { method: "POST", json: { email, band_id: Number(bid), role: $("#amr", m).value } });
      const link = r.link_hint || `${location.origin}/#/invite/${r.invite_token}`;
      const wa = `https://wa.me/?text=${encodeURIComponent(`Te invité a la banda "${bandName}" en Diablo Master Mix. Entrá acá y creá tu cuenta: ${link}`)}`;
      const out = $("#amo", m); out.hidden = false; $("#amok", m).hidden = true;
      out.innerHTML = `<p>Pasale este link a <strong>${esc(email)}</strong> (sirve una sola vez y vence en ${esc(r.expires_in_days)} días). Si ya tiene cuenta, con el link entra directo a la banda.</p>
        <div class="copybox"><span class="grow">${esc(link)}</span><button type="button" class="btn small" id="amcp">Copiar</button></div>
        <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>`;
      $("#amcp", m).addEventListener("click", () => copyText(link));
    }));
  });
}

/* ---------- pruebas gratis ---------- */
async function adPruebas(body, nav) {
  const days = state._adTrialDays || 90;
  const d = await api(`/admin/trials?days=${days}`);
  if (nav !== state.nav) return;
  const f = d.funnel;
  const usage = (t) => `${t.usage.masters_month} / ${t.limits.masters_month ?? "—"} masters · ${t.usage.ai_covers_month} / ${t.limits.ai_covers_month ?? "—"} tapas · ${t.tracks} temas`;
  const mail = (p) => {
    const en = p.provider === "polar";
    const subj = en ? `Your Diablo Master Mix sign-up for ${p.band}` : `Tu alta en Diablo Master Mix: ${p.band}`;
    const txt = en
      ? `Hi ${p.name || ""},\n\nWe saw you started signing up "${p.band}" for Diablo Master Mix but the last step, confirming the subscription, wasn't completed. The ${p.plan} plan starts with free trial days, and nothing is charged until the trial ends.\n\nIf something went wrong with the payment page, reply to this email and we'll help you finish it.\n\nDiablo Master Mix\ndiablomastermix.com.ar`
      : `Hola ${p.name || ""},\n\nVimos que empezaste el alta de "${p.band}" en Diablo Master Mix pero no se completó el último paso, la confirmación de la suscripción en Mercado Pago. El plan ${p.plan} arranca con días de prueba gratis y no se cobra nada hasta que termina la prueba.\n\nSi tuviste algún problema con la página de pago, respondé este mail y te ayudamos a terminarlo.\n\nDiablo Master Mix\ndiablomastermix.com.ar`;
    return `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(txt)}`;
  };
  body.innerHTML = `
    <section class="stats">
      <div class="stat"><b>${f.started}</b><span>Empezaron el alta</span></div>
      <div class="stat ok"><b>${f.finished}</b><span>Terminaron y probaron</span></div>
      <div class="stat ${f.abandoned ? "warn" : ""}"><b>${f.abandoned}</b><span>Quedaron sin terminar</span></div>
      <div class="stat"><b>${d.trials.length}</b><span>En prueba ahora</span></div>
    </section>
    <div class="ad-filters" role="group" aria-label="Período">${[[30, "Últimos 30 días"], [90, "Últimos 90 días"], [365, "Último año"]].map(([n, l]) =>
      `<button type="button" class="chip-f ${days === n ? "on" : ""}" data-days="${n}">${l}</button>`).join("")}</div>
    <section class="card"><h2>En prueba ahora</h2>
      <p class="small muted">Bandas que confirmaron la suscripción y están en sus días gratis. Al terminar la prueba se les cobra el primer mes.</p>
      ${d.trials.length ? `<ul class="upcoming">${d.trials.map((t) => `<li><div class="grow"><strong>${esc(t.band)}</strong> <span class="chip-st warn">${t.days_left === 0 ? "Termina hoy" : t.days_left === 1 ? "Queda 1 día" : `Quedan ${t.days_left} días`}</span>
        <div class="small muted"><span>Plan ${esc(t.plan || "—")}</span> · <span>${t.provider === "polar" ? "Polar" : "Mercado Pago"}</span> · <span>desde ${adDay(t.created_at)}</span></div>
        <div class="small"><span>${usage(t)}</span></div>
        <div class="small muted">${t.emails.map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join(" · ")}</div></div></li>`).join("")}</ul>`
        : `<p class="muted">Ninguna banda está en prueba en este momento.</p>`}</section>
    <section class="card"><h2>Altas sin terminar</h2>
      <p class="small muted">Completaron el formulario pero no confirmaron la suscripción, así que la cuenta no se creó y no llegaron a probar. Escribirles suele destrabar a la mayoría.</p>
      ${d.pending.length ? `<ul class="upcoming">${d.pending.map((p) => `<li><div class="grow"><strong>${esc(p.band)}</strong> <span class="chip-st">${esc(p.plan)}</span>
        <div class="small muted"><span>${esc(p.name || "—")}</span> · <span>${esc(p.email)}</span> · <span>${p.provider === "polar" ? "Polar" : "Mercado Pago"}</span> · <span>${adDay(p.created_at)}</span>${p.attempts > 1 ? ` · <span>${p.attempts} intentos</span>` : ""}</div></div>
        <a class="btn small" href="${mail(p)}">${ic("chat")} Escribirle</a></li>`).join("")}</ul>`
        : `<p class="muted">No hay altas sin terminar en este período.</p>`}</section>`;
  $$("[data-days]", body).forEach((b) => b.addEventListener("click", () => { state._adTrialDays = Number(b.dataset.days); viewAdmin(nav, "pruebas"); }));
}

/* ---------- cobros ---------- */
async function adCobros(body, nav) {
  const [pays, bands, sum, subs] = await Promise.all([api("/admin/payments"), api("/admin/bands"), api("/admin/billing/summary"), api("/admin/subscriptions")]);
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
    <section class="card"><h2>Suscripciones</h2>
      <p class="small muted">Mercado Pago cobra en pesos a las bandas de Argentina; Polar cobra en dólares al resto del mundo. Acá no se ven datos de tarjetas ni de cuentas.</p>
      ${subs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Banda</th><th>Cobro</th><th>Plan</th><th>Precio</th><th>Estado</th><th>Próximo cobro</th></tr></thead><tbody>
      ${subs.map((x) => `<tr><td>${esc(x.band)}</td><td>${x.provider === "polar" ? "Polar" : "Mercado Pago"}</td><td>${esc(x.plan || "—")}</td>
        <td>${x.price ? (x.currency === "USD" ? adUsd(x.price) : adMoney(x.price)) : "—"}</td><td>${adChip(x.state)}</td>
        <td>${x.state === "trial" ? `prueba hasta ${adDay(x.trial_ends_at)}` : adDay(x.paid_until)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">Todavía no hay suscripciones.</p>`}</section>
    <section class="card"><h2>Pagos</h2>
      <p class="small muted">El corte por falta de pago es automático: cuando Mercado Pago o Polar no cobran el mes, la banda pasa a “pago atrasado” unos días y después queda sin servicio hasta que se regularice.</p>
      ${pays.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Banda</th><th>Monto</th><th>Estado</th><th>Origen</th></tr></thead><tbody>
      ${pays.map((p) => `<tr><td>${adDay(p.paid_at)}</td><td>${esc(p.band || "—")}</td><td>${p.amount ? (p.currency === "USD" ? adUsd(p.amount) : adMoney(p.amount)) : "—"}</td><td>${p.status === "approved" ? `<span class="chip-st ok">Aprobado</span>` : `<span class="chip-st err">Rechazado</span>`}</td><td>${p.kind === "manual" ? "Manual" : p.kind === "polar" ? "Polar" : "Mercado Pago"}</td></tr>`).join("")}
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
          ${u.id === state.me.id ? "" : `<button class="btn small ${u.active ? "danger" : ""}" data-active="${u.id}" data-to="${u.active ? "0" : "1"}">${u.active ? "Desactivar" : "Activar"}</button>`}
          ${u.id === state.me.id || u.is_super ? "" : `<button class="btn small danger" data-udel="${u.id}" data-email="${esc(u.email)}" data-who="${esc(u.name || u.email)}">${ic("trash")} Borrar cuenta</button>`}</td></tr>`).join("")}
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
  $$("[data-udel]", body).forEach((b) => b.addEventListener("click", () => adDeleteUser(b.dataset.udel, b.dataset.email, b.dataset.who, () => viewAdmin(nav, "personas"))));
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
