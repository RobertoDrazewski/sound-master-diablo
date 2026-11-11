/* Plan y suscripción de la banda (la paga el admin de la banda con Mercado Pago). Se carga antes que app.js. */
"use strict";

const BL_STATE = { exempt: ["Sin cargo", "ok"], trial: ["Prueba gratis", "warn"], active: ["Activa", "ok"], past_due: ["Pago atrasado", "warn"], suspended: ["Servicio suspendido", "err"] };

function billingBanner(band) {
  const b = band && band.billing;
  if (!b || b.state === "exempt" || b.state === "active") return "";
  const go = `<a class="btn small primary" href="#/band/${band.id}/plan">${band.role === "admin" ? "Elegir plan" : "Ver plan"}</a>`;
  const msg = {
    trial: `Prueba gratis: te quedan <b>${b.days_left ?? 0} ${b.days_left === 1 ? "día" : "días"}</b>.${band.role === "admin" ? " Elegí un plan para seguir sin cortes." : " El admin de la banda elige el plan."}`,
    past_due: `El pago de la banda está <b>atrasado</b>. ${band.role === "admin" ? "Regularizalo" : "Avisale al admin"} para no perder el servicio (te quedan ${b.days_left ?? 0} días).`,
    suspended: `El servicio está <b>suspendido</b>: podés escuchar y descargar todo, pero no subir ni masterizar.`,
  }[b.state];
  return `<div class="bill-banner ${b.state}" role="status"><span>${msg}</span>${go}</div>`;
}

async function viewPlan(band, nav, query = "") {
  const back = /mp=back/.test(query);
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
  setApp(`
    ${bandHead(band, "Plan", "La suscripción es de la banda: la paga el admin y la usan todos los integrantes.")}
    ${back ? `<div class="callout" style="margin-bottom:1rem">Volviste de Mercado Pago. Si ya autorizaste el pago, en unos segundos tu plan queda activo.</div>` : ""}
    <section class="card"><div class="row between" style="flex-wrap:wrap;gap:.6rem"><div><span class="chip-st ${kind}">${label}</span>
      <h2 style="margin:.5rem 0 .2rem">${st.state === "exempt" ? "Tu banda no paga" : st.plan_name ? "Plan " + esc(st.plan_name) : "Sin plan elegido"}</h2>
      <p class="muted" style="margin:0">${st.state === "exempt" ? "Tienen el servicio sin cargo, cortesía de Diablo Master Mix." : when || (st.state === "suspended" ? "Elegí un plan para volver a subir y masterizar." : "")}</p></div>
      ${d.is_admin && d.has_subscription && st.mp_status !== "cancelled" && st.state !== "exempt" ? `<button class="btn danger small" id="bl-cancel">Cancelar suscripción</button>` : ""}</div>
      <div class="bl-uses">${bar(use.masters_month, lim.masters_month, "Masters este mes")}${bar(use.ai_covers_month, lim.ai_covers_month, "Tapas con IA este mes")}
        ${bar(use.used_gb, lim.quota_gb, "Espacio (GB)")}${bar(use.members, lim.max_members, "Integrantes")}</div></section>
    ${st.state === "exempt" ? "" : `
    <h2 style="margin-top:1.4rem">${d.is_admin ? "Elegí el plan de tu banda" : "Planes"}</h2>
    ${d.is_admin ? "" : `<p class="muted">Solo el admin de la banda puede cambiar el plan o pagar.</p>`}
    <div class="plans">${d.plans.map((p) => `
      <article class="plan ${p.highlight ? "hl" : ""} ${cur === p.slug && st.state === "active" ? "mine" : ""}">
        ${p.highlight ? `<span class="plan-tag">El más elegido</span>` : ""}
        <h3>${esc(p.name)}</h3><p class="plan-tag-line">${esc(p.tagline)}</p>
        <p class="plan-price"><b>${fmtARS(p.price_ars)}</b><span>por mes</span></p>
        <ul>${planFeatures(p).map((f) => `<li>${f}</li>`).join("")}</ul>
        ${d.is_admin ? `<button class="btn ${p.highlight ? "primary" : ""}" data-pick="${p.id}" ${cur === p.slug && st.mp_status === "authorized" ? "disabled" : ""}>${cur === p.slug && st.mp_status === "authorized" ? "Tu plan actual" : d.has_subscription && st.mp_status === "authorized" ? "Cambiar a este plan" : st.state === "trial" ? "Elegir y pagar al terminar la prueba" : "Suscribirme"}</button>` : ""}
      </article>`).join("")}</div>
    <p class="small muted">El cobro es mensual y automático con Mercado Pago. Cancelás cuando quieras desde acá y seguís con el servicio hasta que termine el mes pagado. Si un mes no se puede cobrar, tenés unos días de gracia antes de que se corte: tu material nunca se borra.</p>`}
    ${d.payments.length ? `<section class="card"><h2>Pagos</h2><table class="table"><tbody>${d.payments.map((p) => `<tr><td>${fmtDay(p.paid_at)}</td><td>${p.amount ? fmtARS(p.amount) : "—"}</td><td>${p.status === "approved" ? `<span class="chip-st ok">Aprobado</span>` : `<span class="chip-st err">Rechazado</span>`}</td></tr>`).join("")}</tbody></table></section>` : ""}`);
  wireBandHead(band);

  $$("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const plan = d.plans.find((p) => p.id === Number(b.dataset.pick));
    if (!d.mp_enabled) { toast("El cobro online todavía no está activado. Escribinos desde Contacto.", "err"); return openContact(`Quiero suscribir a mi banda "${band.name}" al plan ${plan.name}.`); }
    const changing = d.has_subscription && st.mp_status === "authorized";
    openModal(`<form id="sf" class="stack"><h2>${changing ? "Cambiar" : "Suscribirme al"} plan ${esc(plan.name)}</h2>
      <p class="muted">${fmtARS(plan.price_ars)} por mes${st.state === "trial" ? `. El primer cobro es cuando termine la prueba (${fmtDay(st.trial_ends_at)}).` : changing ? ". El nuevo precio rige desde el próximo cobro." : d.trial_days ? "." : "."}</p>
      ${changing ? "" : `<div class="field"><label for="sf-mail">Email de tu cuenta de Mercado Pago</label><input id="sf-mail" type="email" required value="${esc(d.payer_email)}">
      <p class="small muted" style="margin:.3rem 0 0">Tiene que ser el mail con el que entrás a Mercado Pago, porque vas a autorizar el pago ahí. Podés pagar con tarjeta o con tu dinero en cuenta.</p></div>`}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="sf-c">Cancelar</button><button class="btn primary" id="sf-go">${changing ? "Cambiar de plan" : "Ir a Mercado Pago"}</button></div></form>`, (m) => {
      $("#sf-c", m).addEventListener("click", closeModal);
      $("#sf", m).addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await withBusy($("#sf-go", m), async () => {
          try {
            const r = await api(`/bands/${band.id}/billing/subscribe`, { method: "POST", json: { plan_id: plan.id, payer_email: changing ? d.payer_email : $("#sf-mail", m).value.trim() } });
            if (r.init_point) { location.href = r.init_point; return; }
            closeModal(); toast("Plan cambiado", "ok"); viewPlan(band, nav);
          } catch (e) { toast(e.message, "err"); }
        });
      });
    });
  }));
  const c = $("#bl-cancel");
  if (c) c.addEventListener("click", async () => {
    if (!confirm("¿Cancelar la suscripción? Seguís con el servicio hasta que termine el período ya pagado y después queda en solo lectura.")) return;
    try { await api(`/bands/${band.id}/billing/cancel`, { method: "POST" }); toast("Suscripción cancelada", "ok"); viewPlan(band, nav); } catch (e) { toast(e.message, "err"); }
  });
}
