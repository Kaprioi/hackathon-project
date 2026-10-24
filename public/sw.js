// CareNest's service worker: shows phone notifications ("Possible fall at Mum's,
// 3:42 pm") even when the family page isn't open, and opens the family page when
// one is tapped. The words come ready-made from the server (api/notify.ts).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "CareNest", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "carenest",
      renotify: true,
      // A possible fall stays on screen until someone taps or dismisses it.
      requireInteraction: Boolean(data.urgent),
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Use a family page that is already open, if there is one.
      const open = windows.find((w) => new URL(w.url).pathname === url.pathname);
      if (open) return open.focus();
      return self.clients.openWindow(url.href);
    }),
  );
});
