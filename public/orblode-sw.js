// Orblode's service worker: shows the notices orblode-svc pushes and opens what they point at. It
// caches nothing and does nothing offline.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function orblodeWindows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

self.addEventListener("push", (event) => {
  let notice = null;
  try {
    notice = event.data ? event.data.json() : null;
  } catch {
    notice = null;
  }
  if (!notice || !notice.title) return;
  event.waitUntil(
    (async () => {
      // A visible Orblode tab toasts it already; browsers don't ask for a notification then.
      if ((await orblodeWindows()).some((w) => w.visibilityState === "visible")) return;
      await self.registration.showNotification(notice.title, {
        body: notice.body || "",
        tag: notice.id,
        icon: "/apple-icon.png",
        data: { link: notice.link || "/globe" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || "/globe", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const tab = (await orblodeWindows())[0];
      if (tab) {
        try {
          await tab.focus();
          await tab.navigate(target.href);
          return;
        } catch {
          // An uncontrolled tab can't be navigated from here; open a new one.
        }
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
