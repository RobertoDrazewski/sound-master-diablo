/* Plan y suscripción de la banda (la paga el admin de la banda con Mercado Pago). Se carga antes que app.js. */
"use strict";

const BL_STATE = { exempt: ["Sin cargo", "ok"], trial: ["Prueba gratis", "warn"], active: ["Activa", "ok"], past_due: ["Pago atrasado", "warn"], suspended: ["Servicio suspendido", "err"], closing: ["Baja en curso", "err"] };

const fmtLong = (iso) => parseDate(iso).toLocaleString(I18N.loc, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const fmtShort = (iso) => parseDate(iso).toLocaleDateString(I18N.loc, { day: "2-digit", month: "2-digit", year: "numeric" });

function billingBanner(band) {
  const b = band && band.billing;
  if (!b || b.state === "exempt" || b.state === "active") return "";
  const go = `<a class="btn small primary" href="#/band/${band.id}/plan">${b.state === "closing" ? "Ver detalle" : band.role === "admin" ? "Elegir plan" : "Ver plan"}</a>`;
  const msg = {
    trial: `Prueba gratis: te quedan <b>${b.days_left ?? 0} ${b.days_left === 1 ? "día" : "días"}</b>.${band.role === "admin" ? " Elegí un plan para seguir sin cortes." : " El admin de la banda elige el plan."}`,
    past_due: `El pago de la banda está <b>atrasado</b>. ${band.role === "admin" ? "Regularizalo" : "Avisale al admin"} para no perder el servicio (te quedan ${b.days_left ?? 0} días).`,
    suspended: `El servicio está <b>suspendido</b>: podés escuchar y descargar todo, pero no subir ni masterizar.`,
    closing: `La banda está de baja: <b>todo se elimina el ${fmtLong(b.purge_at)}</b>. Descargá tu material antes.`,
  }[b.state];
  return `<div class="bill-banner ${b.state}" role="status"><span>${msg}</span>${go}</div>`;
}

async function viewPlan(band, nav, query = "") {
  const back = /(mp|polar)=back/.test(query);
  let d = await api(`/bands/${band.id}/billing`);
  if (back && d.is_admin && d.has_subscription) {
    try { await api(`/bands/${band.id}/billing/sync`, { method: "POST" }); d = await api(`/bands/${band.id}/billing`); } catch { /* el aviso de MP llega solo */ }
  }
  if (nav !== state.nav) return;
  try { state.me = await api("/me"); } catch { /* se queda con lo que había */ }
  const st = d.status, [label, kind] = BL_STATE[st.state] || [st.label, ""];
  const lim = d.limits, use = d.usage;
  const bar = (used, cap, text) => {
    const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
    return `<div class="bl-use"><div class="small muted row between"><span>${text}</span><span>${used}${cap ? " de " + cap : ""}</span></div>
      ${cap ? `<div class="meter ${pct >= 100 ? "full" : pct >= 80 ? "warn" : ""}"><i style="width:${pct}%"></i></div>` : ""}</div>`;
  };
  const when = st.state === "active" || st.state === "past_due" ? `Pagado hasta el <b>${fmtDay(st.paid_until)}</b>${d.status.mp_status === "cancelled" ? " · no se renueva" : ""}`
    : st.state === "trial" ? `La prueba termina el <b>${fmtDay(st.trial_ends_at)}</b> (${st.days_left} días)` : "";
  const cur = st.plan;
  const pm = d.has_subscription ? (d.provider === "polar" ? "polar" : "mp") : payMethod(d);
  setApp(`
    ${bandHead(band, "Plan", "La suscripción es de la banda: la paga el admin y la usan todos los integrantes.")}
    ${back ? `<div class="callout" style="margin-bottom:1rem">${pm === "polar" ? "Volviste del pago. Si ya se confirmó, en unos segundos tu plan queda activo." : "Volviste de Mercado Pago. Si ya autorizaste el pago, en unos segundos tu plan queda activo."}</div>` : ""}
    <section class="card"><div class="row between" style="flex-wrap:wrap;gap:.6rem"><div><span class="chip-st ${kind}">${label}</span>
      <h2 style="margin:.5rem 0 .2rem">${st.state === "exempt" ? "Tu banda no paga" : st.plan_name ? "Plan " + esc(st.plan_name) : "Sin plan elegido"}</h2>
      <p class="muted" style="margin:0">${st.state === "exempt" ? "Tienen el servicio sin cargo, cortesía de Diablo Master Mix." : when || (st.state === "suspended" ? "Elegí un plan para volver a subir y masterizar." : "")}</p></div>
      ${d.can_cancel ? `<button class="btn danger small" id="bl-cancel">Darme de baja</button>` : ""}</div>
      ${st.state === "closing" ? `<div class="cx-warn">${ic("alert")}<div><p><b>Se eliminan todos los datos de la banda el ${fmtLong(st.purge_at)}</b> (faltan unas ${Math.max(1, st.hours_left)} horas).</p>
        <p>Hasta entonces podés entrar, escuchar y descargar todo tu material. No se puede subir ni masterizar. Para volver a usar Diablo Master Mix hay que darse de alta y suscribirse de nuevo desde la portada.</p>
        <a class="btn small" href="#/band/${band.id}">Ir a descargar mi material</a></div></div>` : ""}
      <div class="bl-uses">${bar(use.masters_month, lim.masters_month, "Masters este mes")}${bar(use.ai_covers_month, lim.ai_covers_month, "Tapas con IA este mes")}
        ${bar(use.used_gb, lim.quota_gb, "Espacio (GB)")}${bar(use.members, lim.max_members, "Integrantes")}</div></section>
    ${st.state === "exempt" || st.state === "closing" ? "" : `
    <h2 style="margin-top:1.4rem">${d.is_admin ? "Elegí el plan de tu banda" : "Planes"}</h2>
    ${d.is_admin ? "" : `<p class="muted">Solo el admin de la banda puede cambiar el plan o pagar.</p>`}
    ${d.is_admin && !d.has_subscription ? payToggle(d) : ""}
    <div class="plans">${d.plans.map((p) => `
      <article class="plan ${p.highlight ? "hl" : ""} ${cur === p.slug && st.state === "active" ? "mine" : ""}">
        ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
        <h3>${esc(p.name)}</h3><p class="plan-tag-line">${esc(p.tagline)}</p>
        <p class="plan-price"><b>${priceOf(p, pm)}</b><span>por mes</span></p>
        <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
        ${mpBadge(pm)}
        ${d.is_admin ? `<button class="btn ${p.highlight ? "primary" : ""}" data-pick="${p.id}" ${cur === p.slug && st.mp_status === "authorized" ? "disabled" : ""}>${cur === p.slug && st.mp_status === "authorized" ? "Tu plan actual" : d.has_subscription && st.mp_status === "authorized" ? "Cambiar a este plan" : st.state === "trial" ? "Elegir y pagar al terminar la prueba" : "Suscribirme"}</button>` : ""}
      </article>`).join("")}</div>
    <p class="small muted">El cobro es mensual y automático ${pm === "polar" ? "con tarjeta, a través de Polar" : "con Mercado Pago"}. Si un mes no se puede cobrar, tenés unos días de gracia antes de que el servicio pase a solo lectura. Si te das de baja, ${pm === "polar" ? "se deja de cobrar" : "Mercado Pago deja de cobrarte"} y <b>todos los datos de la banda se eliminan a las ${d.purge_hours} horas</b>.</p>`}
    ${st.state === "exempt" ? "" : `<section class="card" id="bl-hist"><div class="row between" style="flex-wrap:wrap;gap:.4rem"><h2 style="margin:0">Historial de pagos</h2>
      ${d.payments.length ? `<span class="muted small">Total pagado <b>${fmtMoney(d.total_paid, d.payments[0]?.currency)}</b></span>` : ""}</div>
      ${d.payments.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th class="hide-sm">Concepto</th><th>Monto</th><th>Estado</th></tr></thead><tbody>${d.payments.map((p) => `<tr><td>${fmtShort(p.paid_at)}</td><td class="hide-sm">${p.kind === "manual" ? "Pago registrado" : "Suscripción mensual"}</td><td>${p.amount ? fmtMoney(p.amount, p.currency) : "—"}</td><td>${p.status === "approved" ? `<span class="chip-st ok">Aprobado</span>` : `<span class="chip-st err">Rechazado</span>`}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted" style="margin:.7rem 0 0">Todavía no hay pagos registrados. Cuando se cobre cada mes, lo vas a ver acá.</p>`}</section>`}`);
  wireBandHead(band);

  wirePay(document, d, () => viewPlan(band, state.nav));
  $$("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const plan = d.plans.find((p) => p.id === Number(b.dataset.pick));
    if (pm === "polar" ? !d.polar_enabled : !d.mp_enabled) { toast("El cobro online todavía no está activado. Escribinos desde Contacto.", "err"); return openContact(`Quiero suscribir a mi banda "${band.name}" al plan ${plan.name}.`); }
    const changing = d.has_subscription && st.mp_status === "authorized";
    openModal(`<form id="sf" class="stack"><h2>${changing ? "Cambiar" : "Suscribirme al"} plan ${esc(plan.name)}</h2>
      <p class="muted">${priceOf(plan, pm)} por mes${st.state === "trial" ? `. El primer cobro es cuando termine la prueba (${fmtDay(st.trial_ends_at)}).` : changing ? ". El nuevo precio rige desde el próximo cobro." : d.trial_days ? "." : "."}</p>
      ${changing ? "" : pm === "polar" ? `<div class="field"><label for="sf-mail">Email para el recibo</label><input id="sf-mail" type="email" required value="${esc(d.payer_email)}">
      <p class="small muted" style="margin:.3rem 0 0">Vas a pagar con tarjeta en una página segura de Polar. Te enviarán el recibo a este mail.</p></div>` : `<div class="field"><label for="sf-mail">Email de tu cuenta de Mercado Pago</label><input id="sf-mail" type="email" required value="${esc(d.payer_email)}">
      <p class="small muted" style="margin:.3rem 0 0">Tiene que ser el mail con el que entrás a Mercado Pago, porque vas a autorizar el pago ahí. Podés pagar con tarjeta o con tu dinero en cuenta.</p></div>`}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="sf-c">Cancelar</button><button class="btn primary" id="sf-go">${changing ? "Cambiar de plan" : pm === "polar" ? "Ir al pago seguro" : "Ir a Mercado Pago"}</button></div></form>`, (m) => {
      $("#sf-c", m).addEventListener("click", closeModal);
      $("#sf", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await withBusy($("#sf-go", m), async () => {
          try {
            const r = await api(`/bands/${band.id}/billing/subscribe`, { method: "POST", json: { plan_id: plan.id, payer_email: changing ? d.payer_email : $("#sf-mail", m).value.trim(), method: pm } });
            if (r.init_point) { location.href = r.init_point; return; }
            closeModal(); toast("Plan cambiado", "ok"); viewPlan(band, nav);
          } catch (e) { toast(e.message, "err"); }
        });
      });
    });
  }));
  const c = $("#bl-cancel");
  if (c) c.addEventListener("click", () => openCancelFlow(band, d, () => viewPlan(band, state.nav)));
}

/* Baja de la banda: 1) motivos (obligatorio) 2) ¿Estás seguro? 3) confirmación. Íconos a la izquierda, sin números. */
function openCancelFlow(band, d, done) {
  const hours = d.purge_hours;
  const when = fmtLong(new Date(Date.now() + hours * 3600 * 1000).toISOString());
  openModal(`<div class="cx" id="cx"></div>`, (m) => {
    m.classList.add("wide");
    const box = $("#cx", m);
    const head = (t) => `<div class="st-modal-head"><h2>${t}</h2><button type="button" class="icon-btn" id="cx-x" aria-label="Cerrar">✕</button></div>`;
    const bindX = () => $("#cx-x", m).addEventListener("click", closeModal);
    let picked = new Set(), note = "";
    const stepReasons = () => {
      box.innerHTML = `${head("Antes de irte")}
        <div class="cx-warn">${ic("alert")}<p><b>Si te das de baja, se eliminan todos los datos de la banda.</b> Tenés ${hours} horas para descargar tu material y después se borra todo, sin vuelta atrás.</p></div>
        <p class="muted" style="margin:.2rem 0 .7rem">Contanos por qué te vas. Es obligatorio elegir al menos un motivo (podés marcar varios).</p>
        <div class="cx-opts" role="group" aria-label="Motivos de la baja">${d.cancel_reasons.map((r) => `
          <label class="cx-opt"><input type="checkbox" value="${r.key}" ${picked.has(r.key) ? "checked" : ""}><span class="cx-ic">${ic("check")}</span><span>${esc(r.label)}</span></label>`).join("")}</div>
        <div class="field"><label for="cx-c">¿Algo más que quieras contarnos? (opcional)</label><textarea id="cx-c" rows="3" maxlength="500">${esc(note)}</textarea></div>
        <div class="row cx-actions"><button type="button" class="btn" id="cx-stay">Mejor me quedo</button><button type="button" class="btn danger" id="cx-next" ${picked.size ? "" : "disabled"}>Continuar</button></div>`;
      bindX();
      $("#cx-stay", m).addEventListener("click", closeModal);
      $$(".cx-opt input", m).forEach((i) => i.addEventListener("change", () => { i.checked ? picked.add(i.value) : picked.delete(i.value); $("#cx-next", m).disabled = !picked.size; }));
      $("#cx-c", m).addEventListener("input", (e) => { note = e.target.value; });
      $("#cx-next", m).addEventListener("click", stepSure);
    };
    const stepSure = () => {
      box.innerHTML = `${head("¿Estás seguro?")}
        <div class="cx-warn big">${ic("alert")}<div>
          <p><b>Diablo Master Mix necesita su espacio en el servidor</b>, por eso no guardamos información de ninguna banda que se da de baja.</p>
          <p>El <b>${when}</b> se eliminan para siempre:</p>
          <ul><li>los temas, ensayos y masters</li><li>los álbumes, tapas y lanzamientos</li><li>el calendario, las invitaciones y los avisos</li><li>las cuentas de todos los integrantes de <b>${esc(band.name)}</b></li></ul>
          <p>Cancelamos el cobro en Mercado Pago ahora mismo. Para volver a usar Diablo Master Mix vas a tener que darte de alta y suscribirte de nuevo.</p></div></div>
        <label class="cx-ok"><input type="checkbox" id="cx-sure"><span>Entiendo que se elimina todo y que no se puede recuperar.</span></label>
        <div class="row cx-actions"><button type="button" class="btn" id="cx-back">No, volver</button><button type="button" class="btn danger" id="cx-go" disabled>Sí, dar de baja y eliminar todo</button></div>`;
      bindX();
      $("#cx-back", m).addEventListener("click", stepReasons);
      $("#cx-sure", m).addEventListener("change", (e) => { $("#cx-go", m).disabled = !e.target.checked; });
      $("#cx-go", m).addEventListener("click", async () => {
        await withBusy($("#cx-go", m), async () => {
          try {
            const r = await api(`/bands/${band.id}/billing/cancel`, { method: "POST", json: { reasons: [...picked], comment: note.trim(), confirm: true } });
            box.innerHTML = `${head("Baja registrada")}
              <div class="cx-warn">${ic("check")}<div><p><b>Cancelamos el cobro en Mercado Pago.</b> No se te va a cobrar más.</p>
              <p>Todo se elimina el <b>${fmtLong(r.status.purge_at)}</b>. Hasta entonces podés entrar, escuchar y descargar tu material. Te mandamos un mail con esta confirmación.</p></div></div>
              <div class="row cx-actions"><button type="button" class="btn" id="cx-close">Cerrar</button><a class="btn primary" href="#/band/${band.id}" id="cx-dl">Ir a descargar mi material</a></div>`;
            bindX();
            $("#cx-close", m).addEventListener("click", () => { closeModal(); done(); });
            $("#cx-dl", m).addEventListener("click", closeModal);
          } catch (e) { toast(e.message, "err"); }
        });
      });
    };
    stepReasons();
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}
