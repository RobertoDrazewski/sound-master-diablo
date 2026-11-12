"use strict";
/* Idiomas: español (base), português e inglés.
   El texto de la app está escrito en español; en los otros idiomas se traduce al aparecer en pantalla
   con un diccionario (frases exactas y frases con datos variables como "{0} temas").
   Cambiar de idioma recarga la página para que fechas, números y todo lo demás queden del mismo idioma. */
(function () {
  const LANGS = { es: "Español", pt: "Português", en: "English" };
  const LOCALES = { es: "es-AR", pt: "pt-BR", en: "en-GB" };
  const OG = { es: "es_AR", pt: "pt_BR", en: "en_GB" };
  const V = (document.currentScript && document.currentScript.src.split("?v=")[1]) || "";

  let lang = "es";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    const saved = localStorage.getItem("dm_lang");
    const nav = (navigator.language || "es").slice(0, 2).toLowerCase();
    lang = LANGS[q] ? q : LANGS[saved] ? saved : LANGS[nav] ? nav : "es";
    if (LANGS[q]) localStorage.setItem("dm_lang", q);
  } catch { /* sin almacenamiento: queda el idioma del navegador */ }
  try { const nav = (navigator.language || "es").slice(0, 2).toLowerCase(); if (!lang || !LANGS[lang]) lang = LANGS[nav] ? nav : "es"; } catch { lang = "es"; }

  const I18N = { lang, loc: LOCALES[lang], langs: LANGS, dict: null };
  window.I18N = I18N;
  document.documentElement.lang = lang;

  /* ---------- selector ---------- */
  const globe = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z"/></svg>';
  I18N.switcher = (cls = "") => `<div class="lang ${cls}" translate="no" data-lang-box>
    <button type="button" class="lang-btn" data-lang-open aria-haspopup="true" aria-expanded="false" aria-label="${I18N.t("Idioma")}">${globe}<span>${lang.toUpperCase()}</span></button>
    <ul class="lang-menu" role="menu" hidden>${Object.keys(LANGS).map((k) =>
      `<li role="none"><button type="button" role="menuitemradio" data-lang="${k}" aria-checked="${k === lang}" ${k === lang ? 'class="on"' : ""}><b>${k.toUpperCase()}</b> ${LANGS[k]}</button></li>`).join("")}</ul></div>`;
  I18N.inline = () => `<span class="lang-inline" translate="no">${Object.keys(LANGS).map((k) =>
    `<button type="button" data-lang="${k}" ${k === lang ? 'aria-current="true"' : ""}>${LANGS[k]}</button>`).join("")}</span>`;
  I18N.set = (k) => {
    if (!LANGS[k] || k === lang) return;
    try { localStorage.setItem("dm_lang", k); } catch { /* sin almacenamiento */ }
    try { const u = new URL(location.href); u.searchParams.delete("lang"); history.replaceState(null, "", u); } catch { /* nada */ }
    location.reload();
  };
  const closeMenus = (except) => document.querySelectorAll("[data-lang-box]").forEach((b) => {
    if (b === except) return;
    const m = b.querySelector(".lang-menu"); if (m) m.hidden = true;
    const o = b.querySelector("[data-lang-open]"); if (o) o.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("click", (e) => {
    const pick = e.target.closest && e.target.closest("[data-lang]");
    if (pick) { e.preventDefault(); I18N.set(pick.dataset.lang); return; }
    const open = e.target.closest && e.target.closest("[data-lang-open]");
    if (open) {
      const box = open.closest("[data-lang-box]"), m = box.querySelector(".lang-menu");
      closeMenus(box); m.hidden = !m.hidden; open.setAttribute("aria-expanded", String(!m.hidden));
      return;
    }
    closeMenus(null);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(null); });

  /* ---------- traducción ---------- */
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  let exact = null, pats = [], subs = [];
  const cache = new Map();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function build(d) {
    exact = new Map(); pats = []; subs = [];
    for (const k in d) {
      if (/\{\d+\}/.test(k)) {
        const parts = k.split(/\{\d+\}/);
        const lits = parts.join("").replace(/[\s\p{P}]/gu, "").length;
        if (lits < 2) continue;
        const re = new RegExp("^" + parts.map(esc).join("(.+?)") + "$", "s");
        // con pocas letras fijas ("{0} de {1}") solo se aplica si los datos llevan números, para no tocar nombres de bandas o temas
        pats.push({ re, to: d[k], n: lits, nums: lits < 5 });
      } else {
        exact.set(k, d[k]);
        if (k.length >= 5) subs.push(k);
      }
    }
    pats.sort((a, b) => b.n - a.n);
    subs.sort((a, b) => b.length - a.length);
  }
  const fill = (to, m) => to.replace(/\{(\d+)\}/g, (_, i) => (m[Number(i) + 1] != null ? tr(m[Number(i) + 1], true) : ""));
  function tr(text, inner) {
    if (!exact || !text) return text;
    const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0];
    const core = norm(text);
    if (!core || !/[A-Za-zÁÉÍÓÚÜáéíóúüñÑ¿¡]/.test(core)) return text;
    let r = cache.get(core);
    if (r === undefined) {
      r = exact.get(core);
      if (r === undefined) for (const p of pats) { const m = core.match(p.re); if (m && (!p.nums || m.slice(1).every((x) => /\d/.test(x)))) { r = fill(p.to, m); break; } }
      if (r === undefined && !inner) {
        // frases armadas con varias piezas: se traducen las partes conocidas
        let out = core, hit = false;
        for (const s of subs) {
          const i = out.indexOf(s);
          if (i < 0) continue;
          if (s.length >= 14) { out = out.split(s).join(exact.get(s)); hit = true; continue; }
          // piezas cortas: solo al principio o al final del texto y en palabra entera
          const atStart = i === 0 && !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(out[s.length] || " ");
          const j = out.lastIndexOf(s), atEnd = j + s.length === out.length && !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(out[j - 1] || " ");
          if (atStart) { out = exact.get(s) + out.slice(s.length); hit = true; }
          else if (atEnd) { out = out.slice(0, j) + exact.get(s); hit = true; }
        }
        r = hit ? out : null;
      }
      if (r === undefined) r = null;
      if (!inner || r !== null) cache.set(core, r);
    }
    return r == null ? text : lead + r + tail;
  }
  I18N.t = (s) => (exact ? tr(s) : s);

  const ATTRS = ["placeholder", "title", "aria-label", "alt", "aria-description"];
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT)$/;
  function skipEl(el) { return !el || (el.nodeType === 1 && (SKIP.test(el.tagName) || el.closest("[translate=no]"))); }
  const skipAttrEl = (el) => !el || el.closest("[translate=no]");
  function doText(n) {
    if (n.__i18n === n.data) return;
    const p = n.parentNode; if (!p || skipEl(p)) return;
    const o = tr(n.data);
    if (o !== n.data) n.data = o;
    n.__i18n = n.data;
  }
  function doAttrs(el) {
    if (el.nodeType !== 1 || skipAttrEl(el)) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a), o = tr(v);
      if (o !== v) el.setAttribute(a, o);
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/.test(el.type) && el.value) { const o = tr(el.value); if (o !== el.value) el.value = o; }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    if (skipEl(root)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) doText(n); else doAttrs(n);
    }
  }
  function head() {
    const t = tr(document.title); if (t !== document.title) document.title = t;
    document.querySelectorAll('meta[name="description"],meta[property^="og:"][content],meta[name="twitter:description"],meta[name="twitter:title"]').forEach((m) => {
      const v = m.getAttribute("content"); if (!v) return;
      if (m.getAttribute("property") === "og:locale") { m.setAttribute("content", OG[lang]); return; }
      const o = tr(v); if (o !== v) m.setAttribute("content", o);
    });
  }
  function start() {
    head();
    walk(document.documentElement);
    new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === "childList") r.addedNodes.forEach((n) => walk(n));
        else if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") doAttrs(r.target);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    // avisos del navegador
    ["alert", "confirm", "prompt"].forEach((f) => {
      const o = window[f].bind(window);
      window[f] = (m, ...r) => o(typeof m === "string" ? m.split("\n").map((l) => tr(l)).join("\n") : m, ...r);
    });
  }
  I18N.ready = () => {
    if (lang === "es" || !window.I18N_DICT) return;
    I18N.dict = window.I18N_DICT;
    build(I18N.dict);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  };
  I18N.ready();
  if (lang !== "es" && !window.I18N_DICT) {
    // el diccionario se pide con el resto de los scripts (ver index.html); si faltara, la app sigue en español
    document.write('<script src="/i18n-' + lang + '.js?v=' + V + '"><\/script>');
  }
})();
