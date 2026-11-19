/* Scripts de REAPER: pestaña dentro de Conectar REAPER, con descarga, instructivo y valoraciones */

const RS_SCRIPTS = [
  { key: "diagnostico", icon: "search", stage: "Primero", title: "Diagnóstico del proyecto",
    file: "/reaper/scripts/01_DiabloMaster_Diagnostico.lua", name: "01_DiabloMaster_Diagnostico.lua",
    what: "Revisa el proyecto sin cambiar nada y te dice qué corregir: pistas saturadas al grabar o muy bajas, pistas sin nombre, mutes o solos olvidados, audios que faltan y limitadores en el Master.",
    when: "Siempre, antes de empezar." },
  { key: "sincronizar", icon: "target", stage: "Opcional", title: "Sincronizar pistas",
    file: "/reaper/scripts/02_DiabloMaster_Sincronizar_Pistas.lua", name: "02_DiabloMaster_Sincronizar_Pistas.lua",
    what: "Compara cada pista con la batería (o con la pista que tengas seleccionada) y corrige cuánto está adelantada o atrasada, con precisión de 1 milisegundo. Te muestra el resultado antes de mover nada.",
    when: "Solo si grabaron por separado (cada uno en su casa o con celulares) y las pistas quedaron corridas. Si grabaron juntos en la misma placa, ya están sincronizadas." },
  { key: "tempo", icon: "metronome", stage: "Opcional", title: "Ajustar al tempo",
    file: "/reaper/scripts/03_DiabloMaster_Ajustar_Tempo.lua", name: "03_DiabloMaster_Ajustar_Tempo.lua",
    what: "Detecta los golpes de la pista que manda y los acerca a la grilla con stretch markers: un 70% por defecto, para corregir lo que se escapa sin perder el groove. Corrige igual a todas las pistas seleccionadas, así los micrófonos de la batería no se desfasan entre sí.",
    when: "Solo si grabaron con metrónomo y el tempo del proyecto es el del tema. Seleccioná primero la pista que manda (la batería o el bombo) y después las demás." },
  { key: "premezcla", icon: "sliders", stage: "Después de grabar", title: "Pre-mezcla",
    file: "/reaper/scripts/04_DiabloMaster_PreMezcla.lua", name: "04_DiabloMaster_PreMezcla.lua",
    what: "Nivela cada pista a -12 dBFS de pico, pone volumen y paneo de partida según el instrumento (si hay dos guitarras, las abre a los costados), recorta el silencio del principio y del final con micro-fades y apaga limitadores sueltos en las pistas.",
    when: "Antes de ajustar la mezcla a tu gusto. Poné el instrumento en el nombre de cada pista: Batería, Bajo, Guitarra, Voz o Teclado." },
  { key: "export", icon: "disc", stage: "Antes de subir", title: "Preparar export",
    file: "/reaper/scripts/05_DiabloMaster_Preparar_Export.lua", name: "05_DiabloMaster_Preparar_Export.lua",
    what: "Deja el render en WAV 24 bit sin normalizar, te ofrece apagar el limitador del Master y mide la mezcla: si los picos pasan de -3 dBFS, baja el Master para dejar el margen ideal para masterizar.",
    when: "Cuando la mezcla te gusta y la vas a subir." },
  { key: "subir", icon: "upload", stage: "Al final", title: "Subir a Diablo Master",
    file: "/reaper/DiabloMaster_subir.lua", name: "06_DiabloMaster_Subir.lua",
    what: "Renderiza la canción o las pistas por separado y las sube a tu banda, en Ensayos, Producción o Master. Es el mismo script de la pestaña Conectar y subir.",
    when: "Último paso. La primera vez te pide la dirección de la web y tu clave personal." },
];

function reaperTabs(active) {
  return `<nav class="rs-tabs" aria-label="Secciones de REAPER">
    <a href="#/reaper" class="${active === "connect" ? "on" : ""}" ${active === "connect" ? 'aria-current="page"' : ""}>${ic("upload")}<span>Conectar y subir</span></a>
    <a href="#/reaper/scripts" class="${active === "scripts" ? "on" : ""}" ${active === "scripts" ? 'aria-current="page"' : ""}>${ic("sliders")}<span>Scripts de REAPER</span></a>
  </nav>`;
}

function rsStars(avg) {
  const full = Math.round(avg);
  return `<span class="rs-stars" aria-hidden="true">${"★".repeat(full)}<i>${"★".repeat(5 - full)}</i></span>`;
}

function rsDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}

async function viewReaperScripts(nav) {
  let data = { scripts: {}, can_moderate: false };
  try { data = await api("/reaper/scripts/reviews"); } catch { /* sin valoraciones igual se muestran los scripts */ }
  if (nav !== state.nav) return;

  const card = (s) => {
    const r = data.scripts[s.key] || { avg: 0, count: 0, reviews: [], mine: null };
    const comments = r.reviews.filter((x) => x.comment);
    return `<article class="rs-card" data-k="${s.key}">
      <div class="rs-ico">${ic(s.icon)}</div>
      <div class="rs-body">
        <span class="rs-stage">${esc(s.stage)}</span>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.what)}</p>
        <p class="rs-when"><strong>Cuándo usarlo:</strong> ${esc(s.when)}</p>
        <div class="rs-actions">
          <a class="btn small" href="${s.file}" download="${s.name}">${ic("download")} Descargar</a>
          <button type="button" class="btn small ghost rs-rate">${r.mine ? "Editar mi valoración" : "Valorar"}</button>
          <span class="rs-score">${r.count ? `${rsStars(r.avg)} <b>${String(r.avg).replace(".", ",")}</b> <span class="muted">(${r.count})</span>` : `<span class="muted">Sin valoraciones todavía</span>`}</span>
        </div>
        <form class="rs-form" hidden>
          <div class="rs-pick" role="radiogroup" aria-label="Tu valoración">${[1, 2, 3, 4, 5].map((n) =>
            `<button type="button" role="radio" data-n="${n}" aria-checked="${r.mine && r.mine.rating === n ? "true" : "false"}" aria-label="${n} de 5">★</button>`).join("")}</div>
          <textarea name="c" rows="3" maxlength="1000" placeholder="Contanos cómo te fue o qué mejorarías (opcional)">${esc(r.mine ? r.mine.comment : "")}</textarea>
          <div class="row">
            <button class="btn small primary" type="submit">Guardar valoración</button>
            ${r.mine ? `<button class="btn small ghost rs-del-mine" type="button">Borrar mi valoración</button>` : ""}
          </div>
        </form>
        ${comments.length ? `<details class="rs-comments"><summary>Comentarios (${comments.length})</summary><ul>${comments.map((c) =>
          `<li><div class="rs-c-head"><b>${esc(c.name)}</b> ${rsStars(c.rating)} <span class="muted small">${esc(rsDate(c.date))}</span>
            ${data.can_moderate || c.mine ? `<button type="button" class="rs-del" data-id="${c.id}" aria-label="Borrar comentario" title="Borrar">${ic("trash")}</button>` : ""}</div>
            <p>${esc(c.comment)}</p></li>`).join("")}</ul></details>` : ""}
      </div>
    </article>`;
  };

  setApp(`
    <div class="page-head rp-head"><img class="rp-logo" src="/reaper/reaper-logo.png" width="64" height="64" alt="REAPER"><div class="grow"><p class="muted small" style="margin:0">Para quien graba y mezcla en REAPER</p>
      <h1 style="margin:0">Scripts de REAPER</h1>
      <p class="lead" style="margin-top:.4rem">Arreglan el proyecto antes del render: volúmenes parejos, pistas en tiempo y una mezcla con el margen justo. Así el master de Diablo Master sale mucho mejor, aunque no sepas mezclar.</p></div></div>
    ${reaperTabs("scripts")}

    <section class="card rs-get">
      <div class="rs-ico">${ic("download")}</div>
      <div class="grow">
        <h2 style="margin:0">Bajalos todos juntos</h2>
        <p class="muted" style="margin:.3rem 0 .8rem">Una carpeta con los seis scripts y un instructivo. Dentro de REAPER aparecen ordenados del 01 al 06, en el orden en que se usan.</p>
        <a class="btn primary" href="/reaper/scripts.zip" download="DiabloMaster_Scripts_REAPER.zip">${ic("download")} Descargar todos (.zip)</a>
      </div>
    </section>

    <section class="card"><h2>Cómo cargarlos en REAPER</h2>
      <ol class="steps">
        <li><strong>Descomprimí la carpeta en Documentos</strong> y no la borres: REAPER lee los scripts desde ahí cada vez.</li>
        <li><strong>Abrí la lista de acciones:</strong> en REAPER, menú <em>Actions</em> y después <em>Show action list…</em></li>
        <li><strong>Cargalos:</strong> abajo tocá <em>New action…</em> y elegí <em>Load ReaScript…</em>. Entrá a la carpeta y elegí los archivos <code>.lua</code>. Podés seleccionarlos todos juntos manteniendo apretado Cmd (Mac) o Ctrl (Windows).</li>
        <li><strong>Para usar uno:</strong> escribí <code>DiabloMaster</code> en el casillero <em>Filter</em>, elegí el script y tocá <em>Run</em>. Si lo usás seguido, con <em>Add…</em> le asignás una tecla.</li>
        <li><strong>Todo se deshace</strong> con Ctrl+Z (Windows) o Cmd+Z (Mac). Cada script te avisa qué va a hacer antes de cambiar algo.</li>
      </ol>
      <p class="muted small" style="margin:.6rem 0 0">Si ya tenías cargado el script para subir, no hace falta cargarlo de nuevo. Los mensajes de los scripts están en castellano.</p>
    </section>

    <section class="rs-list" aria-label="Scripts en orden de uso">${RS_SCRIPTS.map(card).join("")}</section>

    <p class="rp-attr"><img src="/reaper/reaper-logo.png" width="22" height="22" alt=""><span>REAPER es una marca registrada de Cockos Incorporated, usada con permiso.</span></p>`);

  const reload = () => { if (nav === state.nav) viewReaperScripts(nav); };

  $$(".rs-card").forEach((el) => {
    const key = el.dataset.k;
    const form = $(".rs-form", el);
    let pick = (data.scripts[key] && data.scripts[key].mine) ? data.scripts[key].mine.rating : 0;
    const paint = () => $$(".rs-pick button", el).forEach((b) => {
      const n = Number(b.dataset.n);
      b.classList.toggle("on", n <= pick);
      b.setAttribute("aria-checked", n === pick ? "true" : "false");
    });
    paint();
    $(".rs-rate", el).addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) $("textarea", form).focus(); });
    $$(".rs-pick button", el).forEach((b) => b.addEventListener("click", () => { pick = Number(b.dataset.n); paint(); }));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!pick) return toast("Elegí de 1 a 5 estrellas", "err");
      await withBusy(ev.submitter || $("button[type=submit]", form), async () => {
        try {
          await api(`/reaper/scripts/${key}/review`, { method: "POST", json: { rating: pick, comment: form.c.value.trim() } });
          toast("Gracias: tu valoración quedó guardada");
          reload();
        } catch (e) { toast(e.message, "err"); }
      });
    });
    const delMine = $(".rs-del-mine", el);
    if (delMine) delMine.addEventListener("click", async () => {
      const mine = (data.scripts[key].reviews || []).find((x) => x.mine);
      if (!mine) return;
      try { await api(`/reaper/scripts/reviews/${mine.id}`, { method: "DELETE" }); toast("Valoración borrada"); reload(); }
      catch (e) { toast(e.message, "err"); }
    });
  });
  $$(".rs-del").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(window.I18N && I18N.t ? I18N.t("¿Borrar este comentario?") : "¿Borrar este comentario?")) return;
    try { await api(`/reaper/scripts/reviews/${b.dataset.id}`, { method: "DELETE" }); toast("Comentario borrado"); reload(); }
    catch (e) { toast(e.message, "err"); }
  }));
}
