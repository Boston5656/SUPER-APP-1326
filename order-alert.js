/* =====================================================================
   order-alert.js — 🔔 ตัวเตือน Order (ใส่ในหน้าเมนูหลัก index.html + order.html)
   - เช็ก Order ใหม่ทุก 15 วิ ตอนเปิดแอปอยู่ → เสียง + พูด + แถบแจ้งเตือนบนจอ
   - เปิดแจ้งเตือนมือถือ (Web Push ผ่าน Firebase) ต่อเครื่อง
   ถ้าเปิดอยู่ในกรอบของหน้าเมนูหลัก → ใช้ตัวของหน้าเมนูหลัก (ไม่เช็กซ้ำ)
   ===================================================================== */
(function () {
  try { if (window.parent !== window && window.parent.OrderAlert && window.parent.OrderAlert.isHost) { window.OrderAlert = window.parent.OrderAlert; return; } } catch (e) {}

  var FB_VER = '10.12.2';
  var POLL_MS = 15000;
  var S = { exp: {}, skew: 0, user: null, ver: '', list: null, cfg: null, timer: 0, subs: [], audio: null, unlocked: false, pending: '', busy: false, started: false };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function sessUser() { try { return JSON.parse(localStorage.getItem('system1326_session')).user || null; } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function post(fn, args) {
    var url = window.SYS1326 && SYS1326.API_URL, tok = window.SYS1326 && SYS1326.getToken();
    if (!url || !tok) return Promise.reject(new Error('ยังไม่ได้เข้าสู่ระบบ'));
    return fetch(url, { method: 'POST', body: JSON.stringify({ app: 'order', fn: fn, args: args || [], token: tok }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('หลังบ้านตอบผิดปกติ'); }
        if (!j.ok) { if (j.auth) stop(); throw new Error(j.error || 'ผิดพลาด'); }
        return j.data;
      });
  }

  // ---------------- 🔊 เสียง ----------------
  function ctx() {
    if (!S.audio) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; S.audio = new A(); }
    return S.audio;
  }
  function unlock() {
    if (S.unlocked) return;
    try { var c = ctx(); if (c && c.state === 'suspended') c.resume(); var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    try { if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
    S.unlocked = true; emit();
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
  function soundOn() { return LS.get('ord_sound', 'on') !== 'off'; }
  function setSound(on) { LS.set('ord_sound', on ? 'on' : 'off'); emit(); }
  function tone(kind) {
    var c = ctx(); if (!c) return;
    try { if (c.state === 'suspended') c.resume(); } catch (e) {}
    var seq = kind === 'new' ? [[880, 0, .16], [1175, .18, .16], [1568, .36, .32], [880, .8, .16], [1175, .98, .16], [1568, 1.16, .4]]
      : kind === 'warn' ? [[660, 0, .22], [520, .26, .3]] : [[988, 0, .12], [1319, .14, .22]];
    var t0 = c.currentTime + .02;
    seq.forEach(function (n) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t0 + n[1]); g.gain.exponentialRampToValueAtTime(.35, t0 + n[1] + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + n[2]);
      o.connect(g); g.connect(c.destination); o.start(t0 + n[1]); o.stop(t0 + n[1] + n[2] + .05);
    });
  }
  function say(text) {
    try {
      if (!window.speechSynthesis || !text) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text); u.lang = 'th-TH'; u.rate = 1.02; u.pitch = 1.05;
      var v = speechSynthesis.getVoices().filter(function (x) { return /^th/i.test(x.lang); })[0]; if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function phrase() { var s = (S.cfg && S.cfg.cfg && S.cfg.cfg.sound) || { mode: 'fun', fun: 'ORDER มาแล้วพี่น้อง มาเด้อสู', polite: 'มีออเดอร์ใหม่ค่ะ', sayModel: true }; return s; }
  function alertNew(o, title, say2) {
    var s = phrase(), line = [o.brand, o.model, o.color, o.cap].filter(Boolean).join(' ');
    banner(title || ('🔥 ' + (s.mode === 'polite' ? s.polite : s.fun)), line + (o.qty > 1 ? ' ×' + o.qty : '') + ' · ' + (o.owner || ''), o.no, 'new');
    buzz([200, 80, 200, 80, 400]);
    if (!soundOn()) return;
    tone('new');
    setTimeout(function () { say((s.mode === 'polite' ? s.polite : s.fun) + (say2 ? ' ' + say2 : '') + (s.sayModel ? ' ' + o.brand + ' ' + o.model : '')); }, 1500);
  }
  function alertMine(title, body, no, warn) {
    banner(title, body, no, warn ? 'warn' : 'me');
    buzz(warn ? [160, 60, 160] : [90]);
    if (soundOn()) { tone(warn ? 'warn' : 'me'); }
  }

  // ---------------- แถบแจ้งเตือนบนจอ ----------------
  function css() {
    if (document.getElementById('oa-css')) return;
    var st = document.createElement('style'); st.id = 'oa-css';
    st.textContent = '#oa-ban{position:fixed;z-index:2147483600;left:50%;top:calc(10px + env(safe-area-inset-top));width:min(560px,calc(100vw - 20px));transform:translate(-50%,-140%);transition:transform .6s cubic-bezier(.34,1.4,.64,1);font-family:"IBM Plex Sans Thai",-apple-system,sans-serif;-webkit-tap-highlight-color:transparent}' +
      '#oa-ban.on{transform:translate(-50%,0)}#oa-ban .b{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:24px;background:rgba(28,28,30,.94);color:#fff;box-shadow:0 18px 40px -14px rgba(0,0,0,.7);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);cursor:pointer}' +
      '#oa-ban .i{width:42px;height:42px;border-radius:14px;background:#FFD600;color:#1C1C1E;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}' +
      '#oa-ban.new .i{animation:oaPulse 1s ease-in-out infinite}#oa-ban.warn .i{background:#FF9F0A}' +
      '#oa-ban .t{flex:1;min-width:0}#oa-ban .t b{display:block;font:700 15px Kanit,"IBM Plex Sans Thai",sans-serif;color:#FFD600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#oa-ban .t small{display:block;font-size:12.5px;font-weight:600;color:#E5E5EA;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
      '#oa-ban .go{border:0;border-radius:100px;padding:9px 13px;background:#FFD600;color:#1C1C1E;font:800 12.5px "IBM Plex Sans Thai",sans-serif;flex-shrink:0}' +
      '@keyframes oaPulse{50%{transform:scale(1.12) rotate(-6deg)}}' +
      '#oa-sh{position:fixed;inset:0;z-index:2147483500;display:flex;align-items:flex-end;justify-content:center;font-family:"IBM Plex Sans Thai",-apple-system,sans-serif;visibility:hidden;transition:visibility 0s linear .45s}#oa-sh.on{visibility:visible;transition:none}' +
      '#oa-sh .bd{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;transition:opacity .4s}#oa-sh.on .bd{opacity:1}' +
      '#oa-sh .bx{position:relative;width:min(520px,100%);max-height:92vh;overflow:auto;background:#F7F7F9;color:#1C1C1E;border-radius:30px 30px 0 0;padding:12px 18px calc(20px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .55s cubic-bezier(.32,.72,0,1)}#oa-sh.on .bx{transform:none}' +
      '@media(min-width:700px){#oa-sh{align-items:center}#oa-sh .bx{border-radius:30px}}' +
      '#oa-sh h3{margin:6px 0 2px;font:800 20px Kanit,sans-serif}#oa-sh p{margin:0 0 12px;font-size:13px;color:#6E6E73;font-weight:600;line-height:1.5}' +
      '#oa-sh .row{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border-radius:18px;padding:12px 14px;margin-bottom:8px;font-weight:700;font-size:14px}#oa-sh .row small{display:block;font-weight:600;font-size:11.5px;color:#8E8E93}' +
      '#oa-sh select{border:0;border-radius:12px;background:#F2F2F7;padding:9px 10px;font:700 13.5px "IBM Plex Sans Thai",sans-serif;max-width:52%}' +
      '#oa-sh .sw{width:52px;height:32px;border-radius:100px;background:#E5E5EA;position:relative;border:0;flex-shrink:0;transition:background .25s}#oa-sh .sw::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:transform .35s cubic-bezier(.34,1.56,.64,1)}#oa-sh .sw.on{background:#30D158}#oa-sh .sw.on::after{transform:translateX(20px)}' +
      '#oa-sh .btn{width:100%;border:0;border-radius:16px;height:52px;font:800 15px "IBM Plex Sans Thai",sans-serif;margin-top:8px;background:linear-gradient(180deg,#FFE033,#FFD600);color:#1C1C1E}#oa-sh .btn.gr{background:#E9E9EE}#oa-sh .btn:disabled{opacity:.5}' +
      '#oa-sh .st{border-radius:16px;padding:12px 14px;font-size:13px;font-weight:700;line-height:1.5;margin-bottom:10px}#oa-sh .st.ok{background:#E3F9E9;color:#1E7B34}#oa-sh .st.no{background:#FFF1D6;color:#8A5300}#oa-sh .st.bad{background:#FFE5E3;color:#B3261E}' +
      '#oa-sh ol{margin:6px 0 0;padding-left:20px;font-size:12.5px;font-weight:600;color:#3A3A3C;line-height:1.6}';
    (document.head || document.body).appendChild(st);
  }
  var banTimer = 0;
  function banner(title, body, no, cls) {
    css();
    var el = document.getElementById('oa-ban');
    if (!el) { el = document.createElement('div'); el.id = 'oa-ban'; document.body.appendChild(el); }
    el.className = cls || '';
    el.innerHTML = '<div class="b"><span class="i">' + (cls === 'new' ? '🔥' : cls === 'warn' ? '↩️' : '🔔') + '</span><span class="t"><b>' + esc(title) + '</b><small>' + esc(body) + '</small></span>' + (no ? '<button class="go">เปิด ›</button>' : '') + '</div>';
    el.onclick = function () { el.classList.remove('on'); if (no) openOrder(no); };
    requestAnimationFrame(function () { el.classList.add('on'); });
    clearTimeout(banTimer); banTimer = setTimeout(function () { el.classList.remove('on'); }, cls === 'new' ? 9000 : 6000);
  }
  // เปิดหน้า Order ไปที่ใบนั้น (หน้าเมนูหลักมี openOrderApp · ถ้าอยู่หน้า order.html เองก็เปิดเลย)
  function openOrder(no) {
    S.pending = no || '';
    if (typeof window.openOrderApp === 'function') { window.openOrderApp(no); return; }
    if (typeof window.showOrder === 'function') { window.showOrder(no); S.pending = ''; }
  }
  function takePending() { var p = S.pending; S.pending = ''; return p; }

  // ---------------- 🔄 เช็กคิว ----------------
  function emit() { var st = state(); S.subs.slice().forEach(function (f) { try { f(st); } catch (e) {} }); hubBadge(); }
  function state() { return { list: S.list, ver: S.ver, cfg: S.cfg, unlocked: S.unlocked, sound: soundOn(), user: S.user }; }
  function subscribe(f) { S.subs.push(f); if (S.list) try { f(state()); } catch (e) {} return function () { S.subs = S.subs.filter(function (x) { return x !== f; }); }; }
  function hubBadge() {
    var b = document.getElementById('badge-13'); if (!b || !S.list) return;
    var me = S.user || {}, n = S.list.filter(function (o) { return me.role === 'PC' ? (o.ownerAcct === me.acct && o.status === 'back') : o.status === 'new'; }).length;
    b.textContent = n || ''; b.className = 'app-badge' + (n ? ' on warn' : '');
  }
  function diff(prev, next) {
    if (!prev) return;
    var me = S.user || {}, pm = {};
    prev.forEach(function (o) { pm[o.no] = o; });
    next.forEach(function (o) {
      var p = pm[o.no];
      if (!p) {
        if (o.status !== 'new' || me.role === 'PC' || o.ownerAcct === me.acct || myLevel() === 'off') return;
        var as = o.assign;
        if (as && !expired(o)) { if (as.acct === me.acct) alertNew(o, '🎯 ' + String(o.owner || '').split(' · ')[0] + ' เลือกคุณรับเคส! กดรับใน ' + (as.mins || 3) + ' นาที', 'สำหรับ ' + (me.nick || '')); }
        else alertNew(o);
        return;
      }
      var line = [o.brand, o.model, o.color, o.cap].filter(Boolean).join(' ');
      if (o.ownerAcct === me.acct && p.status !== o.status) {
        if (o.status === 'back') alertMine('↩️ ' + ((o.back && o.back.reason) || 'ส่งกลับ PC'), line + (o.phone ? ' · ' + o.phone : '') + ' · จาก ' + (o.staff || ''), o.no, true);
        else if (o.status === 'picked' && p.status !== 'parked') alertMine('📦 เครื่องมาแล้ว — ทำ Check List ได้เลย', line + ' · ' + (o.staff || ''), o.no);
        else if (o.status === 'claimed' && p.status === 'new') alertMine('🙋 ' + o.staff + ' รับเคสแล้ว', line, o.no);
      }
      if (o.ownerAcct === me.acct && o.status === 'claimed' && o.work && p.work && o.work.at !== p.work.at && o.staffAcct !== me.acct) alertMine((o.staff || '') + ': ' + workText(o.work), line, o.no);
      if (o.staffAcct === me.acct && p.staffAcct !== me.acct && p.staffAcct) alertMine('🔁 ' + (p.staff || '') + ' ส่งเคสต่อให้คุณ', line, o.no);
      if (o.staffAcct === me.acct && p.status === 'back' && o.status !== 'back') alertMine('✍️ PC แก้ข้อมูลแล้ว ทำต่อได้เลย', line + (o.phone ? ' · ' + o.phone : ''), o.no);
    });
  }
  function workText(w) {
    var L = { store: '📦 เบิกในร้าน', branch: '🚗 ไปเบิกต่างสาขา', transfer: '📲 ย้ายข้อมูล', wait: '⏳ รอลูกค้า / เอกสาร' };
    return (L[w.kind] || '') + (w.text ? ' ' + w.text : '') + (w.mins ? ' · ~' + w.mins + ' นาที' : '');
  }
  function setQueue(q, quiet) {
    if (!q || !q.list) return;
    if (q.now) S.skew = q.now - Date.now();
    var first = !S.list;
    if (!quiet) diff(S.list, q.list);
    S.list = q.list; S.ver = q.ver || S.ver; S.now = q.now;
    if (first) S.list.forEach(function (o) { if (o.assign && expired(o)) S.exp[o.no] = 1; });   // เปิดแอปมาเจอที่หมดเวลาไปแล้ว ไม่ต้องร้อง
    emit();
  }
  // 🎯 จองให้คนที่ PC เลือก · หมดเวลา = สละสิทธิ์ → เด้งเรียกคนอื่น (นับเวลาในเครื่อง ไม่ต้องรอหลังบ้าน)
  function myLevel() { return (S.cfg && S.cfg.me && S.cfg.me.level) || ''; }
  function expired(o) { return o.assign && Date.now() + (S.skew || 0) >= o.assign.until; }
  setInterval(function () {
    if (!S.started || !S.list) return;
    var me = S.user || {};
    if (me.role === 'PC' || myLevel() === 'off') return;
    S.list.forEach(function (o) {
      if (o.status !== 'new' || !o.assign || S.exp[o.no] || !expired(o)) return;
      S.exp[o.no] = 1;
      if (o.assign.acct === me.acct || o.ownerAcct === me.acct) { emit(); return; }
      alertNew(o, '⏰ ' + o.assign.nick + ' ไม่ได้รับใน ' + (o.assign.mins || 3) + ' นาที — ใครว่างรับได้เลย');
      emit();
    });
  }, 1000);
  function tick() {
    clearTimeout(S.timer);
    if (!S.started) return;
    if (document.hidden || S.busy) { S.timer = setTimeout(tick, POLL_MS); return; }
    S.busy = true;
    post('poll', [S.list ? S.ver : '']).then(function (r) {
      S.busy = false;
      if (r && !r.same) setQueue(r, !S.list);
    }).catch(function () { S.busy = false; }).then(function () { S.timer = setTimeout(tick, POLL_MS); });
  }
  function refresh() { S.ver = S.list ? S.ver : ''; clearTimeout(S.timer); S.busy = false; tick(); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.started) refresh(); });

  function start() {
    var u = sessUser(); if (!u || !u.acct) return;
    S.user = { acct: u.acct, role: u.role, brand: u.brand || '', name: u.nick || u.name || '' };
    if (S.started) return;
    S.started = true;
    post('getConfig').then(function (c) { S.cfg = c; if (c && c.me) S.user.nick = c.me.nick; emit(); maybePrompt(); }).catch(function () {});
    tick();
  }
  function stop() { S.started = false; clearTimeout(S.timer); S.list = null; S.ver = ''; S.cfg = null; emit(); }

  // SW → มีแจ้งเตือนเข้ามา (ตอนเปิดแอปอยู่) = เช็กคิวทันที · กดแจ้งเตือน = เปิดใบนั้น
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'order-push') refresh();
    if (d.type === 'open-order') openOrder(d.oid);
  });

  // ---------------- 🔔 แจ้งเตือนมือถือ (Web Push) ----------------
  function isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function pushSupport() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
      return isIOS() && !standalone() ? 'iPhone ต้องเปิดแอปจากไอคอนบนหน้าจอโฮม (กด แชร์ › เพิ่มไปยังหน้าจอโฮม) และ iOS 16.4 ขึ้นไป' : 'เครื่อง / เบราว์เซอร์นี้ไม่รองรับแจ้งเตือน';
    return '';
  }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('โหลดตัวแจ้งเตือนไม่สำเร็จ — เช็กเน็ต')); }; document.head.appendChild(s); }); }
  function deviceName() { var ua = navigator.userAgent; return (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? ((ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1] || 'Android') : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'อุปกรณ์') + (standalone() ? ' · แอป' : ' · เบราว์เซอร์'); }
  function enablePush(shiftName) {
    var sup = pushSupport(); if (sup) return Promise.reject(new Error(sup));
    // ต้องขออนุญาตทันทีที่กดปุ่ม (iPhone บังคับ)
    var perm = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    return Promise.resolve(perm).then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'เครื่องนี้ปิดการแจ้งเตือนของแอปไว้ — เปิดได้ที่ ตั้งค่า › การแจ้งเตือน › SUPER APP' : 'ยังไม่ได้กดอนุญาต');
      return (S.cfg ? Promise.resolve(S.cfg) : post('getConfig').then(function (c) { S.cfg = c; return c; }));
    }).then(function (c) {
      var web = c && c.push && c.push.web;
      if (!web || !web.vapidKey) throw new Error('ผู้จัดการยังไม่ได้ตั้งค่า Firebase ในแอป Order (⚙️ › แจ้งเตือน)');
      return navigator.serviceWorker.register('sw.js', { scope: './' }).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        return loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app-compat.js')
          .then(function () { return loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-messaging-compat.js'); })
          .then(function () {
            var app = firebase.apps.length ? firebase.app() : firebase.initializeApp({ apiKey: web.apiKey, authDomain: web.authDomain, projectId: web.projectId, storageBucket: web.storageBucket, messagingSenderId: web.messagingSenderId, appId: web.appId });
            return firebase.messaging(app).getToken({ vapidKey: web.vapidKey, serviceWorkerRegistration: reg });
          });
      });
    }).then(function (token) {
      if (!token) throw new Error('ขอรหัสแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง');
      LS.set('ord_push_token', token);
      return post('pushRegister', [{ token: token, device: deviceName(), shiftName: shiftName == null ? null : shiftName }]);
    });
  }
  function pushState() {
    if (pushSupport()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.permission === 'granted' && LS.get('ord_push_token', '') ? 'on' : 'off';
  }
  function maybePrompt() {
    if (!S.cfg || !S.cfg.push || !S.cfg.push.ready) return;
    if (pushState() !== 'off' || LS.get('ord_push_ask', '') === new Date().toDateString()) return;
    LS.set('ord_push_ask', new Date().toDateString());
    setTimeout(function () { openSetup(true); }, 1500);
  }

  // แผ่นตั้งค่าแจ้งเตือนของเครื่องนี้ (อยู่ในหน้าบนสุดเสมอ — ปุ่มต้องกดในหน้านี้ iPhone ถึงยอมให้ขออนุญาต)
  function openSetup(first) {
    css();
    var el = document.getElementById('oa-sh');
    if (!el) { el = document.createElement('div'); el.id = 'oa-sh'; document.body.appendChild(el); }
    var c = S.cfg || {}, names = c.shiftNames || [], me = S.user || {}, st = pushState();
    var sel = LS.get('ord_shift_name', '');
    var stHtml = st === 'on' ? '<div class="st ok">✅ เครื่องนี้รับแจ้งเตือน Order แล้ว</div>'
      : st === 'denied' ? '<div class="st bad">⛔ เครื่องนี้ปิดการแจ้งเตือนของแอปไว้ — เปิดได้ที่ ตั้งค่าเครื่อง › การแจ้งเตือน › SUPER APP แล้วกลับมากดอีกครั้ง</div>'
      : st === 'unsupported' ? '<div class="st bad">' + esc(pushSupport()) + '</div>'
      : !(c.push && c.push.ready) ? '<div class="st no">ผู้จัดการยังไม่ได้ตั้งค่าแจ้งเตือนมือถือ — ตอนนี้แจ้งเตือนได้เฉพาะตอนเปิดแอปค้างไว้</div>'
      : '<div class="st no">ยังไม่ได้เปิดแจ้งเตือนบนเครื่องนี้</div>';
    el.innerHTML = '<div class="bd"></div><div class="bx"><div style="width:40px;height:5px;border-radius:3px;background:#D1D1D6;margin:0 auto 8px"></div>' +
      '<h3>🔔 แจ้งเตือน Order</h3><p>' + (me.role === 'PC' ? 'เด้งเมื่อพนักงานรับเคส / เบิกเครื่องแล้ว / ส่งกลับให้แก้ข้อมูล' : 'เด้งเมื่อมี Order ใหม่ · คนอื่นรับเคสแล้ว · เคสถูกส่งต่อให้คุณ') + '</p>' + stHtml +
      (me.role !== 'PC' && names.length ? '<div class="row"><span>ชื่อฉันในตารางกะ<small>วันหยุด / ลา = ไม่ปลุก</small></span><select id="oa-shift"><option value="">— ไม่ระบุ —</option>' + names.filter(function (n) { return n.group !== 'PC'; }).map(function (n) { return '<option value="' + esc(n.header) + '"' + (n.header === sel ? ' selected' : '') + '>' + esc(n.name) + '</option>'; }).join('') + '</select></div>' : '') +
      '<div class="row"><span>เสียง + พูดในแอป<small>ตอนเปิดแอปค้างไว้ (' + ((c.cfg && c.cfg.sound && c.cfg.sound.mode) === 'polite' ? 'โหมดสุภาพ' : 'โหมดฮา') + ')</small></span><button class="sw' + (soundOn() ? ' on' : '') + '" id="oa-snd" aria-label="เสียง"></button></div>' +
      (st !== 'unsupported' && st !== 'denied' && c.push && c.push.ready ? '<button class="btn" id="oa-en">' + (st === 'on' ? '🔄 ลงทะเบียนเครื่องนี้ใหม่' : '🔔 เปิดแจ้งเตือนบนเครื่องนี้') + '</button>' : '') +
      (st === 'on' ? '<button class="btn gr" id="oa-test">ส่งแจ้งเตือนทดสอบ</button>' : '') +
      '<button class="btn gr" id="oa-sound">🔊 ลองฟังเสียง</button>' +
      '<button class="btn gr" id="oa-x">' + (first ? 'ไว้ทีหลัง' : 'ปิด') + '</button>' +
      (isIOS() ? '<ol><li>iPhone: ถ้าเปิดโหมดโฟกัส / ห้ามรบกวน ให้อนุญาต SUPER APP ด้วย</li><li>ลบไอคอนแล้วติดตั้งใหม่ = ต้องกดเปิดแจ้งเตือนอีกครั้ง</li></ol>' : '') + '</div>';
    var close = function () { el.classList.remove('on'); };
    el.querySelector('.bd').onclick = close; el.querySelector('#oa-x').onclick = close;
    el.querySelector('#oa-snd').onclick = function () { setSound(!soundOn()); this.classList.toggle('on', soundOn()); };
    el.querySelector('#oa-sound').onclick = function () { unlock(); var s = phrase(); tone('new'); setTimeout(function () { say((s.mode === 'polite' ? s.polite : s.fun) + ' SAMSUNG Galaxy A56'); }, 1500); };
    var sh = el.querySelector('#oa-shift');
    if (sh) sh.onchange = function () { LS.set('ord_shift_name', sh.value); if (pushState() === 'on') post('pushRegister', [{ token: LS.get('ord_push_token', ''), device: deviceName(), shiftName: sh.value }]).catch(function () {}); };
    var en = el.querySelector('#oa-en');
    if (en) en.onclick = function () {
      en.disabled = true; en.textContent = 'กำลังเปิด…';
      enablePush(sh ? sh.value : null).then(function () { openSetup(); banner('✅ เปิดแจ้งเตือนแล้ว', 'เครื่องนี้จะเด้งเมื่อมี Order', '', 'me'); })
        .catch(function (e) { en.disabled = false; en.textContent = '🔔 ลองอีกครั้ง'; var b = el.querySelector('.st'); if (b) { b.className = 'st bad'; b.textContent = '⚠️ ' + e.message; } });
    };
    var ts = el.querySelector('#oa-test');
    if (ts) ts.onclick = function () { ts.disabled = true; post('pushTest').then(function (r) { ts.disabled = false; ts.textContent = r.sent ? '✅ ส่งแล้ว ' + r.sent + ' เครื่อง (ล็อกจอแล้วรอดู)' : '⚠️ ส่งไม่ได้: ' + (r.err || 'ไม่พบเครื่อง'); }).catch(function (e) { ts.disabled = false; ts.textContent = '⚠️ ' + e.message; }); };
    requestAnimationFrame(function () { el.classList.add('on'); });
  }

  window.OrderAlert = {
    isHost: true, state: state, start: start, stop: stop, subscribe: subscribe, setQueue: setQueue, refresh: refresh, post: post,
    open: openOrder, unlock: unlock, soundOn: soundOn, setSound: setSound, openSetup: openSetup, pushState: pushState, takePending: takePending,
    test: function () { unlock(); alertNew({ brand: 'SAMSUNG', model: 'Galaxy A56', color: 'ดำ', cap: '256GB', qty: 1, owner: 'ทดสอบ', no: '' }); },
    get cfg() { return S.cfg; }, setCfg: function (c) { S.cfg = c; emit(); }, get user() { return S.user; }
  };
})();
