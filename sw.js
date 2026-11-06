/* sw.js — รับแจ้งเตือนมือถือของ SUPER APP 1326 (Order) · ไม่เก็บแคชหน้าเว็บ (แอปยังโหลดสดทุกครั้งเหมือนเดิม) */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { data: { title: 'SUPER APP 1326', body: e.data ? e.data.text() : '' } }; }
  var d = p.data || (p.notification ? { title: p.notification.title, body: p.notification.body } : p) || {};
  var kind = d.kind || '';
  var title = d.title || 'SUPER APP 1326';
  var opt = {
    body: d.body || '',
    // iPhone ไม่ส่งเสียงซ้ำถ้า tag เดิม → แจ้งเตือนสำคัญใช้ tag ใหม่ทุกครั้ง (มีเสียงทุกครั้ง)
    tag: (kind === 'new' || kind === 'remind' || kind === 'me' || kind === 'mgr' || kind === 'test') ? (d.tag || 'ord') + '-' + Date.now() : (d.tag || 'ord'),
    renotify: kind !== 'info',
    silent: d.silent === '1',
    icon: 'icon-192.png',
    badge: 'favicon-64.png',
    data: { oid: d.oid || '', kind: kind, app: d.app || '' },
    vibrate: kind === 'new' || kind === 'remind' ? [200, 80, 200, 80, 400] : [120],
    requireInteraction: kind === 'new'
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opt),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: 'order-push', data: d }); }); })
  ]));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var oid = (e.notification.data && e.notification.data.oid) || '', app = (e.notification.data && e.notification.data.app) || '';
  var appId = app === 'break' ? 14 : 0;
  var url = new URL('index.html' + (appId ? '?open=' + appId : oid ? '?order=' + encodeURIComponent(oid) : ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    var hub = cs.filter(function (c) { return c.url.indexOf(self.registration.scope) === 0 && /index\.html|\/$/.test(c.url.split('?')[0]); })[0] || cs[0];
    if (hub) { hub.postMessage(appId ? { type: 'open-app', id: appId } : { type: 'open-order', oid: oid }); return hub.focus(); }
    return self.clients.openWindow(url);
  }));
});
