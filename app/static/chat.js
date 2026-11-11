/* Chat con "Diablo", el ingeniero de audio. La seguridad real vive en el servidor (app/chat.py);
   acá solo se arma la conversación. Se carga antes que app.js. */
"use strict";

const CHAT = { open: false, history: [], busy: false, mounted: false };

function chatSave() { try { sessionStorage.setItem("dm.chat", JSON.stringify(CHAT.history.slice(-16))); } catch { /* sin storage */ } }
function chatLoad() { try { CHAT.history = JSON.parse(sessionStorage.getItem("dm.chat") || "[]"); } catch { CHAT.history = []; } }

async function chatMount() {
  if (CHAT.mounted) return;
  const cfg = await loadPublicConfig();
  if (!cfg.chat) return;
  CHAT.mounted = true;
  chatLoad();
  const root = document.createElement("div");
  root.id = "chat";
  root.innerHTML = `
    <button type="button" class="chat-fab" id="chat-fab" aria-label="Hablar con el ingeniero de audio" aria-expanded="false">
      <img src="/logo-mark.png" alt=""><span>Preguntale al ingeniero</span></button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-label="Chat con el ingeniero de audio" hidden>
      <header><img src="/logo-mark.png" alt=""><div class="grow"><strong>Diablo</strong><span>Ingeniero de audio · responde al instante</span></div>
        <button type="button" class="icon-btn" id="chat-x" aria-label="Cerrar el chat">✕</button></header>
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <div class="chat-sugg" id="chat-sugg"></div>
      <form id="chat-form" autocomplete="off">
        <input id="chat-in" type="text" maxlength="700" placeholder="Preguntá sobre mezcla, master, volumen…" aria-label="Tu pregunta">
        <button class="btn primary" id="chat-send" aria-label="Enviar">${ic("right")}</button>
      </form>
      <footer><button type="button" id="chat-plans">Ver planes</button><span>·</span><button type="button" id="chat-contact">Escribinos</button></footer>
    </section>`;
  document.body.appendChild(root);
  $("#chat-fab").addEventListener("click", () => chatToggle());
  $("#chat-x").addEventListener("click", () => chatToggle(false));
  $("#chat-plans").addEventListener("click", () => { chatToggle(false); openPlans(); });
  $("#chat-contact").addEventListener("click", () => { chatToggle(false); openContact(); });
  $("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); const i = $("#chat-in"); const v = i.value.trim(); if (v) { i.value = ""; chatAsk(v); } });
  $("#chat-sugg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) chatAsk(b.textContent); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && CHAT.open && !document.querySelector("dialog[open]")) chatToggle(false); });
  chatPaint();
  chatUpdateVisibility();
}

function chatUpdateVisibility() {
  const r = $("#chat");
  if (!r) return;
  // el super admin no usa la parte musical: sin chat en su panel
  r.hidden = !!(state.me && state.me.is_super);
}

function chatToggle(force) {
  CHAT.open = force === undefined ? !CHAT.open : force;
  $("#chat-panel").hidden = !CHAT.open;
  $("#chat-fab").setAttribute("aria-expanded", String(CHAT.open));
  $("#chat").classList.toggle("open", CHAT.open);
  if (CHAT.open) { chatPaint(); setTimeout(() => $("#chat-in").focus(), 50); }
}

function chatPaint() {
  const log = $("#chat-log");
  if (!log) return;
  const hello = `¡Hola! Soy Diablo, el ingeniero de audio de la casa. Preguntame lo que quieras de mezcla, master, volumen, ecualización o de cómo funciona la plataforma.`;
  const msgs = CHAT.history.length ? CHAT.history : [{ role: "assistant", content: hello, hello: true }];
  log.innerHTML = msgs.map((m) => `<div class="cm ${m.role}">${esc(m.content).replace(/\n/g, "<br>")}</div>`).join("")
    + (CHAT.busy ? `<div class="cm assistant typing"><i></i><i></i><i></i></div>` : "");
  log.scrollTop = log.scrollHeight;
  const s = $("#chat-sugg");
  s.hidden = CHAT.history.length > 0;
  s.innerHTML = CHAT.history.length ? "" : ["¿Cómo funciona el master?", "¿Qué volumen conviene para Spotify?", "Mi batería tapa a las guitarras", "¿Cuánto cuesta?"].map((t) => `<button type="button">${t}</button>`).join("");
}

async function chatAsk(text) {
  if (CHAT.busy) return;
  CHAT.history.push({ role: "user", content: text });
  CHAT.busy = true; chatPaint();
  try {
    const hist = CHAT.history.slice(0, -1).slice(-10).map(({ role, content }) => ({ role, content }));
    const r = await api("/chat", { method: "POST", json: { message: text, history: hist } });
    CHAT.history.push({ role: "assistant", content: r.reply });
  } catch (e) {
    CHAT.history.push({ role: "assistant", content: e.status === 0 ? "Parece que no hay conexión. Probá de nuevo en un momento." : "No pude responder ahora. Probá de nuevo en un momento." });
  }
  CHAT.busy = false; chatSave(); chatPaint();
}
