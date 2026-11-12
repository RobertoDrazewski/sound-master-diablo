/* Service worker mínimo: permite instalar la app y abrir el esqueleto sin conexión.
   Nunca guarda audio ni respuestas de la API. */
const CACHE = "dm-shell-v1";
const SHELL = ["/", "/style.css", "/app.js", "/logo-login.png", "/favicon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || !SHELL.includes(url.pathname)) return;
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});

/* Avisos en el celular: llegan aunque la app esté cerrada y ponen el número en el ícono */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  const tareas = [self.registration.showNotification(d.title || "Diablo Master Mix", {
    body: d.body || "", icon: "/icon-192.png", badge: "/favicon-96.png", tag: d.tag || undefined, data: { link: d.link || "" },
  })];
  const nav = self.navigator;
  if (typeof d.badge === "number" && nav && nav.setAppBadge) {
    tareas.push((d.badge > 0 ? nav.setAppBadge(d.badge) : nav.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(tareas));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || "";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs[0];
    if (c) { if (link) c.postMessage({ type: "go", link }); return c.focus(); }
    return self.clients.openWindow("/" + (link.startsWith("#") ? link : ""));
  }));
});
