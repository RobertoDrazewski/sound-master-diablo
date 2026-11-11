/* Estudio de master: elegir estilo o referencia, ajustar con explicaciones, ver qué hizo el master y comparar a igual volumen.
   Se carga antes que app.js (usa api, toast, esc, $, $$, openModal, state, pref... en tiempo de ejecución). */
"use strict";

const ST_FAMILIES = ["Rock", "Punk y alternativo", "Metal", "Pop", "Funk soul y R&B", "Jazz", "Reggae y ska", "Latino", "Blues folk y country", "Hip hop y electrónica", "Otros"];
const stNum = (n, d = 1) => Number(n).toFixed(d).replace(".", ",");
const stDb = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + stNum(Math.abs(n), 1) + " dB";

function genreFamilies(genres) {
  const map = new Map();
  for (const g of genres) {
    const f = g.family || "Otros";
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(g);
  }
  return [...map.entries()].sort((a, b) => (ST_FAMILIES.indexOf(a[0]) + 100) % 100 - (ST_FAMILIES.indexOf(b[0]) + 100) % 100);
}
function genreOptions(genres, sel) {
  return genreFamilies(genres).map(([f, list]) =>
    `<optgroup label="${esc(f)}">${list.map((g) => `<option value="${g.id}" ${g.id === sel ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</optgroup>`).join("");
}
function defaultGenreId(genres) {
  const saved = Number(pref.get("style"));
  if (genres.some((g) => g.id === saved)) return saved;
  return (genres.find((g) => g.name === "rock") || genres[0] || {}).id;
}
function recipeText(g) {
  if (!g) return "";
  const comp = g.comp == null ? "" : g.comp < 0.3 ? "compresión suave" : g.comp < 0.6 ? "compresión media" : "compresión firme";
  const w = g.width == null ? "" : g.width < 0.95 ? "imagen más compacta" : g.width > 1.1 ? "imagen amplia" : "imagen estéreo natural";
  return [`volumen ${stNum(g.target_lufs)} LUFS`, comp, w].filter(Boolean).join(" · ");
}

/* ---------------------------------------------------------------- biblioteca de referencias */
async function refLibrary(box, { bandId, genres, selected, onPick, manage }) {
  let refs = [];
  const load = async () => { refs = await api("/references"); };
  const paint = () => {
    const mineScope = (r) => (bandId == null ? r.scope === "global" : r.scope === "band" && r.band_id === bandId);
    const own = refs.filter(mineScope), shared = refs.filter((r) => !mineScope(r));
    const row = (r) => `
      <li class="ref-row ${selected.id === r.id ? "on" : ""}">
        ${onPick ? `<button type="button" class="ref-pick" data-pick="${r.id}" aria-pressed="${selected.id === r.id}">
          <span class="ref-dot"></span><span class="grow"><strong>${esc(r.name)}</strong>
          <span class="muted small">${esc(r.genre)}${r.lufs != null ? " · " + stNum(r.lufs) + " LUFS" : ""}${r.scope === "global" ? " · de Diablo Master" : ""}</span></span></button>`
          : `<div class="grow"><strong>${esc(r.name)}</strong> <span class="muted small">${esc(r.genre)}${r.lufs != null ? " · " + stNum(r.lufs) + " LUFS" : ""}</span></div>`}
        ${r.mine || (state.me && state.me.is_super) ? `<button type="button" class="icon-btn" data-del="${r.id}" aria-label="Borrar la referencia ${esc(r.name)}" title="Borrar">${ic("trash")}</button>` : ""}
      </li>`;
    $("#rl-own", box).innerHTML = own.length ? own.map(row).join("")
      : `<li class="muted small ref-empty">${bandId == null ? "Todavía no cargaste referencias globales." : "Todavía no subiste referencias. Subí un tema que te guste cómo suena y usalo de modelo."}</li>`;
    const sh = $("#rl-shared", box);
    if (sh) { sh.hidden = !shared.length; $("ul", sh).innerHTML = shared.map(row).join(""); }
  };
  box.innerHTML = `
    <div class="ref-lib">
      <h4 class="st-sub">${bandId == null ? "Referencias globales" : "Tus referencias"}</h4>
      <ul class="ref-list" id="rl-own"><li class="muted small">Cargando…</li></ul>
      ${bandId != null ? `<div id="rl-shared" hidden><h4 class="st-sub">Referencias de Diablo Master</h4><ul class="ref-list"></ul></div>` : ""}
      <form class="ref-up" id="rl-form">
        <h4 class="st-sub">Subir una referencia</h4>
        <div class="ref-up-grid">
          <div class="field"><label for="rl-name">Nombre</label><input id="rl-name" type="text" maxlength="120" placeholder="Ej: Back in Black — AC/DC" required></div>
          <div class="field"><label for="rl-genre">Género</label><select id="rl-genre">${genreOptions(genres, defaultGenreId(genres))}</select></div>
        </div>
        <div class="field"><label for="rl-file">Archivo de audio</label><input id="rl-file" type="file" accept="audio/*,.wav,.flac,.mp3,.m4a,.aif,.aiff,.ogg" required></div>
        <p class="small muted">Se guarda solo un fragmento de 90 segundos del centro del tema para medir su sonido. No se puede escuchar ni descargar después, y solo la ve tu banda.</p>
        <button class="btn" id="rl-send">${ic("upload")} Subir referencia</button>
      </form>
    </div>`;
  try { await load(); paint(); } catch (e) { $("#rl-own", box).innerHTML = `<li class="status error">${esc(e.message)}</li>`; }
  box.addEventListener("click", async (ev) => {
    const pick = ev.target.closest("[data-pick]");
    if (pick && onPick) { const r = refs.find((x) => x.id === Number(pick.dataset.pick)); selected.id = r.id; onPick(r); paint(); return; }
    const del = ev.target.closest("[data-del]");
    if (del) {
      const r = refs.find((x) => x.id === Number(del.dataset.del));
      if (!confirm(`¿Borrar la referencia "${r.name}"?`)) return;
      try {
        await api(`/references/${r.id}`, { method: "DELETE" });
        if (selected.id === r.id) { selected.id = null; onPick && onPick(null); }
        await load(); paint(); toast("Referencia borrada", "ok");
      } catch (e) { toast(e.message, "err"); }
    }
  });
  $("#rl-form", box).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = $("#rl-file", box).files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("name", $("#rl-name", box).value.trim());
    fd.append("genre_id", $("#rl-genre", box).value);
    if (bandId != null) fd.append("band_id", bandId);
    fd.append("file", f);
    await withBusy($("#rl-send", box), async () => {
      try {
        const r = await api("/references", { method: "POST", form: fd });
        await load();
        if (onPick) { selected.id = r.id; onPick(refs.find((x) => x.id === r.id)); }
        paint();
        $("#rl-form", box).reset();
        toast("Referencia cargada", "ok");
      } catch (e) { toast(e.message, "err"); }
    });
  });
}

/* ---------------------------------------------------------------- el estudio */
const ST_TONE = [
  ["bass", "Graves", "40–120 Hz", "La pegada del bombo y el bajo. De más, el tema se embarra y suena menos fuerte."],
  ["body", "Cuerpo", "120–500 Hz", "Calidez y cuerpo de guitarras y voces. De más, suena tapado."],
  ["presence", "Presencia", "1–5 kHz", "Voces y guitarras que se escuchan al frente. De más, se vuelve áspero."],
  ["air", "Aire", "8–16 kHz", "Brillo, platillos y apertura. De más, aparecen silbidos en las eses."],
];

/* Monta el estudio dentro de `box`. Devuelve { options(), valid() }. */
function studioMount(box, cfg) {
  const { genres, bandId, stems = [], hint = "" } = cfg;
  const S = {
    how: cfg.reference ? "ref" : "genre",
    genre_id: defaultGenreId(genres),
    ref: { id: null },
    lufsTouched: false, lufs: -11,
    strengthTouched: false, strength: 0.55,
    power: 1, width: 1,
    tone: { bass: 0, body: 0, presence: 0, air: 0 },
    auto_balance: true, drums_db: 0, bass_db: 0, voice_db: 0,
    gains: {},
    family: null,
  };
  const gen = () => genres.find((g) => g.id === S.genre_id);
  S.family = (gen() || {}).family || genreFamilies(genres)[0][0];

  const slider = (id, label, min, max, step, val, fmt, help, extra = "") => `
    <div class="st-ctl" data-ctl="${id}">
      <div class="st-ctl-top"><label for="st-${id}">${label}</label><output id="st-${id}-o">${fmt(val)}</output></div>
      <input type="range" id="st-${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${extra}>
      ${help ? `<p class="st-help">${help}</p>` : ""}
    </div>`;

  box.innerHTML = `
    <div class="studio">
      <div class="st-block">
        <div class="st-title"><span class="st-n">1</span><div><h3>¿Cómo querés que suene?</h3>
          <p class="muted small">${esc(hint) || "Elegí un estilo (el master aprende su sonido típico) o una referencia: un tema que te guste, para que el tuyo se le parezca."}</p></div></div>
        <div class="st-tabs" role="tablist">
          <button type="button" role="tab" id="st-tab-genre" data-how="genre">Por estilo<span>Más de 70 géneros</span></button>
          <button type="button" role="tab" id="st-tab-ref" data-how="ref">Por referencia<span>Que suene como otro tema</span></button>
        </div>
        <div id="st-pane-genre">
          <div class="st-fam" id="st-fam" role="group" aria-label="Familias de géneros"></div>
          <div class="st-genres" id="st-genres"></div>
          <div class="st-recipe" id="st-recipe" aria-live="polite"></div>
        </div>
        <div id="st-pane-ref" hidden>
          <div class="st-note">Con una referencia el master copia el <b>balance de graves, medios y agudos</b>, el <b>volumen</b> y el <b>ancho estéreo</b> de ese tema. Elegí una que suene como querés que suene tu banda.</div>
          <div id="st-reflib"></div>
        </div>
      </div>

      <div class="st-block">
        <div class="st-title"><span class="st-n">2</span><div><h3>Ajustá a tu gusto</h3>
          <p class="muted small">Todo viene resuelto solo según el estilo. Tocá solo lo que quieras cambiar: cada control te explica qué hace.</p></div>
          <button type="button" class="btn ghost small" id="st-reset">Restablecer</button></div>

        <div class="st-grid">
          <div class="st-card">
            <h4>${ic("volume")} Volumen y potencia</h4>
            ${slider("lufs", "Volumen final", -16, -7, 0.5, S.lufs, (v) => `${stNum(v)} LUFS`,
              `Cuánto suena de fuerte. <b>−14</b> es el nivel de Spotify y YouTube; <b>−10</b> o más es "pegado a la pared". Más fuerte no es mejor: se pierde pegada.`)}
            <div class="st-chips" id="st-lufs-chips">
              <button type="button" data-l="-14">Streaming −14</button><button type="button" data-l="-11">Rock moderno −11</button>
              <button type="button" data-l="-9">Muy fuerte −9</button><button type="button" data-l="auto">Del estilo</button></div>
            ${slider("power", "Potencia", 0, 1.5, 0.05, S.power, (v) => (v < 0.3 ? "Muy suave" : v < 0.8 ? "Suave" : v < 1.2 ? "Del estilo" : "Aplastado"),
              `Es la compresión: pega los instrumentos entre sí y sube el volumen sin picos. Poca = natural y con aire; mucha = compacto y agresivo.`)}
          </div>

          <div class="st-card">
            <h4>${ic("sliders")} Tono (ecualización)</h4>
            ${slider("strength", "Cuánto se acerca al sonido del estilo", 0, 1, 0.05, S.strength, (v) => `${Math.round(v * 100)}%`,
              `Con 0% no se toca el tono de tu mezcla. Con 100% se corrige todo hasta el sonido objetivo. 40–70% suele sonar natural.`)}
            ${ST_TONE.map(([k, l, r, h]) => slider("t-" + k, `${l} <small>${r}</small>`, -4, 4, 0.5, 0, stDb, h)).join("")}
          </div>

          <div class="st-card">
            <h4>${ic("users")} Equilibrio de instrumentos</h4>
            <label class="check st-auto"><input type="checkbox" id="st-auto" checked> Equilibrar automáticamente</label>
            <p class="st-help">Si la batería tapa a la guitarra, el bajo o la voz, el master la baja solo. Si el bajo no se escucha, lo sube. Los sliders de abajo se suman a eso.</p>
            ${slider("drums", "Batería", -8, 6, 0.5, 0, stDb, "Bombo, redoblante y platillos.")}
            ${slider("bass", "Bajo", -8, 6, 0.5, 0, stDb, "La nota grave que sostiene al grupo.")}
            ${slider("voice", "Voces y guitarras", -8, 6, 0.5, 0, stDb, "Lo melódico: lo que canta y lo que riffea.")}
            <div id="st-stems"></div>
          </div>

          <div class="st-card">
            <h4>${ic("headphones")} Ancho estéreo</h4>
            ${slider("width", "Ancho", 0.5, 1.6, 0.05, S.width, (v) => (v < 0.9 ? "Más angosto" : v < 1.1 ? "Original" : "Más ancho"),
              `Qué tan abierta se siente la mezcla entre izquierda y derecha. Más ancho = más "grande", pero demasiado pierde fuerza en el celular. Los graves siempre quedan al centro.`)}
          </div>
        </div>
      </div>
    </div>`;

  const $s = (id) => $("#st-" + id, box);
  const paintFamilies = () => {
    const fams = genreFamilies(genres);
    $("#st-fam", box).innerHTML = fams.map(([f]) => `<button type="button" class="${f === S.family ? "on" : ""}" data-fam="${esc(f)}">${esc(f)}</button>`).join("");
    const list = (fams.find(([f]) => f === S.family) || fams[0])[1];
    $("#st-genres", box).innerHTML = list.map((g) =>
      `<button type="button" class="${g.id === S.genre_id ? "on" : ""}" data-gid="${g.id}" aria-pressed="${g.id === S.genre_id}">${esc(g.name)}</button>`).join("");
    const g = gen();
    $("#st-recipe", box).innerHTML = g
      ? `<strong>${esc(g.name)}</strong><p>${esc(g.desc || "")}</p><span class="muted small">${esc(recipeText(g))}</span>` : "";
  };
  const paintHow = () => {
    $("#st-pane-genre", box).hidden = S.how !== "genre";
    $("#st-pane-ref", box).hidden = S.how !== "ref";
    $("#st-tab-genre", box).classList.toggle("on", S.how === "genre");
    $("#st-tab-ref", box).classList.toggle("on", S.how === "ref");
    $("#st-tab-genre", box).setAttribute("aria-selected", S.how === "genre");
    $("#st-tab-ref", box).setAttribute("aria-selected", S.how === "ref");
    const ref = S.how === "ref";
    const lu = $s("lufs"); lu.disabled = ref;
    $$(".st-chips button", box).forEach((b) => (b.disabled = ref));
    $('[data-ctl="lufs"] .st-help', box).innerHTML = ref
      ? "Con una referencia, el volumen se toma de ella."
      : `Cuánto suena de fuerte. <b>−14</b> es el nivel de Spotify y YouTube; <b>−10</b> o más es "pegado a la pared". Más fuerte no es mejor: se pierde pegada.`;
    if (ref && !S.refLoaded) { S.refLoaded = true; refLibrary($("#st-reflib", box), { bandId, genres, selected: S.ref, onPick: () => cfg.onChange && cfg.onChange() }); }
  };
  const syncLufs = () => {
    if (!S.lufsTouched && gen()) S.lufs = gen().target_lufs;
    $s("lufs").value = S.lufs;
    $s("lufs-o").textContent = `${stNum(S.lufs)} LUFS`;
  };
  const fmts = {
    lufs: (v) => `${stNum(v)} LUFS`, power: (v) => (v < 0.3 ? "Muy suave" : v < 0.8 ? "Suave" : v < 1.2 ? "Del estilo" : "Aplastado"),
    strength: (v) => `${Math.round(v * 100)}%`, width: (v) => (v < 0.9 ? "Más angosto" : v < 1.1 ? "Original" : "Más ancho"),
  };
  const bind = (id, fn, fmt) => {
    $s(id).addEventListener("input", (e) => {
      const v = Number(e.target.value);
      $s(id + "-o").textContent = (fmt || stDb)(v);
      fn(v);
      cfg.onChange && cfg.onChange();
    });
  };
  bind("lufs", (v) => { S.lufs = v; S.lufsTouched = true; }, fmts.lufs);
  bind("power", (v) => { S.power = v; }, fmts.power);
  bind("strength", (v) => { S.strength = v; S.strengthTouched = true; }, fmts.strength);
  bind("width", (v) => { S.width = v; }, fmts.width);
  ST_TONE.forEach(([k]) => bind("t-" + k, (v) => { S.tone[k] = v; }));
  bind("drums", (v) => { S.drums_db = v; });
  bind("bass", (v) => { S.bass_db = v; });
  bind("voice", (v) => { S.voice_db = v; });
  $s("auto").addEventListener("change", (e) => { S.auto_balance = e.target.checked; cfg.onChange && cfg.onChange(); });

  // pistas separadas: un fader por pista
  if (stems.length) {
    $("#st-stems", box).innerHTML = `<h5 class="st-sub">Mezcla de pistas</h5><p class="st-help">Este tema tiene pistas separadas: subí o bajá cada una antes del master.</p>` +
      stems.map((v) => `<div class="st-ctl"><div class="st-ctl-top"><label for="sg-${v.id}">${esc(v.label || "Pista " + v.id)}</label><output id="sg-${v.id}-o">0,0 dB</output></div>
        <input type="range" id="sg-${v.id}" min="-12" max="6" step="0.5" value="0" data-stem="${v.id}"></div>`).join("");
    $$("[data-stem]", box).forEach((el) => el.addEventListener("input", () => {
      const v = Number(el.value);
      S.gains[el.dataset.stem] = v;
      $("#sg-" + el.dataset.stem + "-o", box).textContent = stDb(v);
      cfg.onChange && cfg.onChange();
    }));
  }

  box.addEventListener("click", (ev) => {
    const how = ev.target.closest("[data-how]");
    if (how) { S.how = how.dataset.how; paintHow(); cfg.onChange && cfg.onChange(); return; }
    const fam = ev.target.closest("[data-fam]");
    if (fam) { S.family = fam.dataset.fam; paintFamilies(); return; }
    const g = ev.target.closest("[data-gid]");
    if (g) { S.genre_id = Number(g.dataset.gid); pref.set("style", S.genre_id); syncLufs(); paintFamilies(); cfg.onChange && cfg.onChange(); return; }
    const chip = ev.target.closest("#st-lufs-chips button");
    if (chip) {
      if (chip.dataset.l === "auto") { S.lufsTouched = false; syncLufs(); }
      else { S.lufs = Number(chip.dataset.l); S.lufsTouched = true; syncLufs(); }
      cfg.onChange && cfg.onChange();
    }
    if (ev.target.closest("#st-reset")) reset();
  });
  const reset = () => {
    S.lufsTouched = false; S.strengthTouched = false; S.strength = 0.55; S.power = 1; S.width = 1;
    S.tone = { bass: 0, body: 0, presence: 0, air: 0 }; S.auto_balance = true; S.drums_db = S.bass_db = S.voice_db = 0; S.gains = {};
    const set = (id, v, f) => { $s(id).value = v; $s(id + "-o").textContent = f(v); };
    syncLufs(); set("power", 1, fmts.power); set("strength", 0.55, fmts.strength); set("width", 1, fmts.width);
    ST_TONE.forEach(([k]) => set("t-" + k, 0, stDb));
    set("drums", 0, stDb); set("bass", 0, stDb); set("voice", 0, stDb);
    $s("auto").checked = true;
    $$("[data-stem]", box).forEach((el) => { el.value = 0; $("#sg-" + el.dataset.stem + "-o", box).textContent = stDb(0); });
    toast("Ajustes restablecidos");
    cfg.onChange && cfg.onChange();
  };

  $("#st-tab-genre", box).addEventListener("keydown", () => {});
  syncLufs(); paintFamilies(); paintHow();

  return {
    valid: () => S.how === "genre" || !!S.ref.id,
    how: () => S.how,
    options() {
      const o = {
        auto_balance: S.auto_balance, power: S.power, width: S.width, tone: { ...S.tone },
        drums_db: S.drums_db, bass_db: S.bass_db, voice_db: S.voice_db,
      };
      if (S.how === "ref") o.reference_id = S.ref.id; else { o.genre_id = S.genre_id; if (S.lufsTouched) o.lufs = S.lufs; }
      if (S.how === "ref") o.genre_id = null;
      if (S.strengthTouched) o.strength = S.strength;
      if (Object.keys(S.gains).length) o.stem_gains = { ...S.gains };
      return o;
    },
  };
}

/* ---------------------------------------------------------------- modal "Estudio de master" de un tema */
async function openMasterModal(trackId) {
  const track = state.tracks.get(trackId);
  if (!track) return;
  let genres;
  try { genres = await getGenres(); } catch (e) { return toast(e.message, "err"); }
  const stems = track.versions.filter((v) => v.kind === "stem" && v.status === "ready");
  const hasMix = track.versions.some((v) => v.kind === "mix" && v.status === "ready");
  const sourceNote = hasMix ? "Se masteriza la mezcla del tema." : stems.length ? "Se suman las pistas separadas y se masteriza el resultado." : "Se masteriza el ensayo completo.";
  let studio;
  openModal(`
    <div class="st-modal">
      <div class="st-modal-head"><h2>Estudio de master · ${esc(track.title)}</h2>
        <button type="button" class="icon-btn" id="st-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small" style="margin:0 0 .8rem">${esc(sourceNote)} Se crea una versión nueva: la original no se toca. Después podés ver qué hizo y compararla a igual volumen.</p>
      <div id="st-host"></div>
      <div class="st-foot"><button type="button" class="btn" id="st-cancel">Cancelar</button>
        <button type="button" class="btn primary big" id="st-go">${ic("sliders")} Masterizar</button></div>
    </div>`, (m) => {
    m.classList.add("wide");
    studio = studioMount($("#st-host", m), { genres, bandId: track.band_id ?? state.bandId, stems,
      onChange: () => { $("#st-go", m).disabled = !studio.valid(); } });
    $("#st-x", m).addEventListener("click", closeModal);
    $("#st-cancel", m).addEventListener("click", closeModal);
    $("#st-go", m).addEventListener("click", async (ev) => {
      if (!studio.valid()) return toast("Elegí una referencia o cambiá a “Por estilo”.", "err");
      await withBusy(ev.currentTarget, async () => {
        try {
          await api(`/tracks/${trackId}/master`, { method: "POST", json: studio.options() });
          closeModal();
          toast("Masterizando. En un minuto aparece la versión master en el tema.", "ok");
          if (state.refresh) await state.refresh();
        } catch (e) { toast(e.message, "err"); }
      });
    });
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}

/* ---------------------------------------------------------------- informe: qué hizo el master */
function eqChart(bands) {
  const hz = bands.hz, W = 560, H = 190, pl = 34, pr = 10, pt = 10, pb = 24;
  const x = (f) => pl + ((Math.log10(f) - Math.log10(30)) / (Math.log10(18000) - Math.log10(30))) * (W - pl - pr);
  const all = [...bands.before, ...bands.after];
  const mid = (Math.max(...all) + Math.min(...all)) / 2, span = Math.max(14, Math.max(...all) - Math.min(...all) + 4);
  const y = (v) => pt + (1 - (v - (mid - span / 2)) / span) * (H - pt - pb);
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(hz[i]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const grid = [50, 100, 250, 500, 1000, 2500, 5000, 10000].map((f) =>
    `<line x1="${x(f)}" x2="${x(f)}" y1="${pt}" y2="${H - pb}" class="g"/><text x="${x(f)}" y="${H - 8}" text-anchor="middle">${f >= 1000 ? f / 1000 + "k" : f}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="eq-svg" role="img" aria-label="Curva de tono antes y después del master">
    ${grid}
    <path d="${line(bands.before)}" class="before"/><path d="${line(bands.after)}" class="after"/>
    <text x="${pl + 4}" y="${pt + 11}" class="lg b">Antes</text><text x="${pl + 48}" y="${pt + 11}" class="lg a">Después</text></svg>`;
}

function metricRow(label, before, after, unit, help) {
  const d = after - before;
  return `<div class="mt-row"><span class="mt-l">${label}${help ? `<small>${help}</small>` : ""}</span>
    <span class="mt-v"><b>${stNum(before)}</b> → <b class="af">${stNum(after)}</b> ${unit} <i class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "+" : ""}${stNum(d)}</i></span></div>`;
}

async function openMasterReport(versionId, title) {
  let r;
  try { r = await api(`/versions/${versionId}/master-report`); }
  catch (e) { return toast(e.message === "Este master no tiene informe" ? "Este master es anterior al informe: volvé a masterizar para ver el detalle." : e.message, "err"); }
  const trackId = (() => { for (const [id, t] of state.tracks || []) if (t.versions.some((v) => v.id === versionId)) return id; return null; })();
  const gain = r.gain_db;
  const plr = (r.plr_before != null && r.plr_after != null) ? metricRow("Dinámica (PLR)", r.plr_before, r.plr_after, "dB", "Distancia entre el promedio y el pico: más chico = más compacto") : "";
  openModal(`
    <div class="st-modal">
      <div class="st-modal-head"><h2>Qué hizo el master</h2><button type="button" class="icon-btn" id="rp-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small" style="margin:0 0 1rem">${esc(title || "")}${r.genre ? ` · estilo <b>${esc(r.genre)}</b>` : ""}${r.reference ? ` · referencia <b>${esc(r.reference)}</b>` : ""}</p>
      <div class="rp-metrics">
        ${metricRow("Volumen", r.before.lufs, r.after.lufs, "LUFS", `Objetivo ${stNum(r.target_lufs)}${r.target_reached ? "" : " (no se llegó sin romper los picos)"}`)}
        ${metricRow("Pico máximo", r.before.peak, r.after.peak, "dBTP", "Quedó bajo −1 dB para que no distorsione al convertir a MP3")}
        ${plr}
        ${metricRow("Ancho estéreo", r.before.width_db, r.after.width_db, "dB", "Qué tan abierta está la mezcla")}
      </div>
      <h3 class="st-sub">Cómo cambió el tono</h3>
      ${r.bands ? eqChart(r.bands) : ""}
      <h3 class="st-sub">Paso a paso, en palabras</h3>
      <ol class="rp-notes">${(r.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ol>
      ${r.balance ? `<p class="small muted">Ajuste de balance aplicado: batería ${stDb(r.balance.drums ?? 0)} · bajo ${stDb(r.balance.bass ?? 0)} · voces y guitarras ${stDb(r.balance.voice ?? 0)}.</p>` : ""}
      <div class="st-foot">
        ${trackId ? `<button type="button" class="btn primary big" id="rp-ab">${ic("headphones")} Comparar con el original a igual volumen</button>` : ""}
        <button type="button" class="btn" id="rp-close">Cerrar</button>
      </div>
    </div>`, (m) => {
    m.classList.add("wide");
    $("#rp-x", m).addEventListener("click", closeModal);
    $("#rp-close", m).addEventListener("click", closeModal);
    const ab = $("#rp-ab", m);
    if (ab) ab.addEventListener("click", () => openCompare(trackId, versionId, r));
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}

/* ---------------------------------------------------------------- comparar A/B a igual volumen */
async function openCompare(trackId, masterId, report) {
  const t = state.tracks.get(trackId);
  const src = t && primarySource(t);
  if (!src) return toast("No hay audio original para comparar.", "err");
  stopPlayer();
  let urlA, urlB;
  try { [urlA, urlB] = (await Promise.all([api(`/versions/${src.id}/link?fmt=preview`), api(`/versions/${masterId}/link?fmt=preview`)])).map((x) => x.url); }
  catch (e) { return toast(e.message, "err"); }
  const la = report.before.lufs, lb = report.after.lufs;
  const diff = lb - la; // dB que el master está más fuerte
  openModal(`
    <div class="st-modal cmp">
      <div class="st-modal-head"><h2>Comparar a igual volumen</h2><button type="button" class="icon-btn" id="cp-x" aria-label="Cerrar">✕</button></div>
      <p class="muted small">Lo más fuerte siempre suena “mejor”. Por eso igualamos el volumen: así escuchás solo la diferencia de tono, equilibrio y pegada. Cambiá entre A y B mientras suena.</p>
      <div class="cp-switch" role="group" aria-label="Qué versión escuchar">
        <button type="button" class="cp-btn on" data-v="a"><b>A</b><span>Original</span><small>${stNum(la)} LUFS</small></button>
        <button type="button" class="cp-btn" data-v="b"><b>B</b><span>Master</span><small>${stNum(lb)} LUFS</small></button>
      </div>
      <div class="cp-bar"><button type="button" class="pl-btn main" id="cp-play" aria-label="Reproducir">${plIcon("play")}</button>
        <span class="pl-time" id="cp-cur">0:00</span>
        <input type="range" id="cp-seek" min="0" max="1000" value="0" aria-label="Posición">
        <span class="pl-time" id="cp-dur">0:00</span></div>
      <label class="check"><input type="checkbox" id="cp-match" checked> Igualar el volumen (el master es ${stNum(Math.abs(diff))} dB ${diff >= 0 ? "más fuerte" : "más suave"})</label>
      <p class="small muted">Atajos: <kbd>A</kbd> / <kbd>B</kbd> cambian de versión, <kbd>espacio</kbd> reproduce.</p>
      <audio id="cp-a" preload="auto" src="${esc(urlA)}"></audio><audio id="cp-b" preload="auto" src="${esc(urlB)}"></audio>
    </div>`, (m) => {
    m.classList.add("wide");
    const A = $("#cp-a", m), B = $("#cp-b", m), seek = $("#cp-seek", m);
    let cur = "a", seeking = false;
    const apply = () => {
      const match = $("#cp-match", m).checked;
      // volume de <audio> solo baja: el más fuerte se atenúa hasta igualar al más suave
      const gA = match && la > lb ? Math.pow(10, (lb - la) / 20) : 1;
      const gB = match && lb > la ? Math.pow(10, (la - lb) / 20) : 1;
      A.volume = cur === "a" ? gA : 0; B.volume = cur === "b" ? gB : 0;
      $$(".cp-btn", m).forEach((b) => b.classList.toggle("on", b.dataset.v === cur));
    };
    const sync = () => { if (Math.abs(A.currentTime - B.currentTime) > 0.08) (cur === "a" ? B : A).currentTime = (cur === "a" ? A : B).currentTime; };
    const show = () => {
      const a = cur === "a" ? A : B, d = a.duration || 0;
      $("#cp-cur", m).textContent = plFmt(a.currentTime); $("#cp-dur", m).textContent = plFmt(d);
      if (!seeking && d) seek.value = (a.currentTime / d) * 1000;
      $("#cp-play", m).innerHTML = plIcon(A.paused ? "play" : "pause");
    };
    const toggle = () => { if (A.paused) { sync(); A.play(); B.play(); } else { A.pause(); B.pause(); } show(); };
    const pick = (v) => { cur = v; apply(); };
    [A, B].forEach((a) => ["timeupdate", "play", "pause", "loadedmetadata"].forEach((n) => a.addEventListener(n, () => { sync(); show(); })));
    $("#cp-play", m).addEventListener("click", toggle);
    $$(".cp-btn", m).forEach((b) => b.addEventListener("click", () => pick(b.dataset.v)));
    $("#cp-match", m).addEventListener("change", apply);
    seek.addEventListener("input", () => { seeking = true; const d = A.duration || 0; A.currentTime = B.currentTime = (seek.value / 1000) * d; });
    seek.addEventListener("change", () => { seeking = false; });
    const key = (ev) => {
      if (!m.open) return document.removeEventListener("keydown", key);
      if (ev.target.tagName === "INPUT" && ev.target.type !== "range" && ev.target.type !== "checkbox") return;
      if (ev.key === "a" || ev.key === "A") pick("a"); else if (ev.key === "b" || ev.key === "B") pick("b");
      else if (ev.key === " " && ev.target.tagName !== "BUTTON") { ev.preventDefault(); toggle(); }
    };
    document.addEventListener("keydown", key);
    m.addEventListener("close", () => { A.pause(); B.pause(); document.removeEventListener("keydown", key); }, { once: true });
    $("#cp-x", m).addEventListener("click", closeModal);
    apply();
  });
  $("#modal").addEventListener("close", () => $("#modal").classList.remove("wide"), { once: true });
}
