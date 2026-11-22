// Service worker de la app Visor HILAM: funciona sin conexión (guarda la app) y recibe los visores compartidos.
const CACHE = "hilam-v1.1.1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "privacidad.html", "marcador.html", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function db() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open("hilam", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("files", { keyPath: "id" }); r.result.createObjectStore("inbox", { keyPath: "id" }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function toInbox(item) {
  const d = await db();
  await new Promise((ok, ko) => { const t = d.transaction("inbox", "readwrite"); t.objectStore("inbox").put(item); t.oncomplete = ok; t.onerror = () => ko(t.error); });
}

// «Compartir» desde otra app (Web Share Target): llega como POST multipart a share-target
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.getAll("file").find((f) => f && typeof f.text === "function");
    if (!file) await toInbox({ id: "share", at: Date.now(), error: "No llegó ningún archivo. Comparte el archivo .html del visor (no un enlace)." });
    else await toInbox({ id: "share", at: Date.now(), name: file.name || "visor.html", html: await file.text() });
  } catch (err) {
    await toInbox({ id: "share", at: Date.now(), error: "No se pudo recibir el archivo: " + err });
  }
  return Response.redirect("./?share=1", 303);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) { e.respondWith(receiveShare(e.request)); return; }
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // la app: primero lo guardado (abre sin conexión) y se actualiza por detrás
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
