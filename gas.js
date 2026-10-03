/* =====================================================================
   gas.js — ตัวแปลง google.script.run → เรียก Apps Script ผ่านอินเทอร์เน็ต
   ใส่ไว้ทุกหน้า: <script>window.GAS_APP = 'check';</script><script src="gas.js"></script>
   โค้ดเดิมที่เขียน google.script.run.withSuccessHandler(...).xxx() ใช้ได้เหมือนเดิมทุกอย่าง
   ===================================================================== */
(function () {
  // ⚠️ ใส่ลิงก์ Web app ของโปรเจกต์ SUPER APP (Deploy → Manage deployments → Web app URL ลงท้าย /exec)
  var API_URL = 'https://script.google.com/macros/s/AKfycbwmALqdO95c1UTHKNGhNIAvyDSercHbETyzd3aCivS_nmxgd6pZ5-iB50F0oHAlUwoyOg/exec';

  var TOKEN_KEY = 'system1326_token';
  var APP = window.GAS_APP || 'dash';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  // หมดอายุ/ยังไม่ล็อกอิน → บอกหน้าเมนูหลัก (ถ้าเปิดอยู่ในกรอบ) หรือพากลับไปหน้าล็อกอิน
  function needLogin() {
    setToken('');
    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'sys1326-auth' }, location.origin); return; } catch (e) {}
    }
    if (!/index\.html$|\/$/.test(location.pathname)) location.href = 'index.html';
  }

  // ===== 📴 กันข้อมูลหายตอนเน็ตหลุด =====
  // คำสั่ง "บันทึก" ด้านล่าง ถ้าส่งไม่ออกเพราะไม่มีเน็ต → เก็บไว้ในเครื่อง แล้วส่งให้เองเมื่อเน็ตกลับมา
  var QUEUE_FNS = { check: ['saveSaleData', 'saveFailedData'], shift: ['saveData'] };
  var isNetErr = function (e) { return /Failed to fetch|NetworkError|Load failed|network/i.test(String(e && e.message || e)); };
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function idb(cb) {
    try {
      var req = indexedDB.open('sys1326', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('q', { keyPath: 'id' }); };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function qAdd(item, done) {
    idb(function (db) {
      if (!db) return done(false);
      try { var tx = db.transaction('q', 'readwrite'); tx.objectStore('q').put(item); tx.oncomplete = function () { done(true); }; tx.onerror = function () { done(false); }; }
      catch (e) { done(false); }
    });
  }
  function qAll(cb) {
    idb(function (db) {
      if (!db) return cb([]);
      try { var r = db.transaction('q').objectStore('q').getAll(); r.onsuccess = function () { cb(r.result || []); }; r.onerror = function () { cb([]); }; }
      catch (e) { cb([]); }
    });
  }
  function qDel(id) { idb(function (db) { if (db) try { db.transaction('q', 'readwrite').objectStore('q').delete(id); } catch (e) {} }); }

  function post(app, fn, args) {
    return fetch(API_URL, { method: 'POST', body: JSON.stringify({ app: app, fn: fn, args: args, token: getToken() }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' })
      .then(function (r) { return r.text(); }).then(function (t) { return JSON.parse(t); });
  }
  var flushing = false;
  function flush() {
    if (flushing || (navigator.onLine === false)) return;
    try { var lk = +localStorage.getItem('sys1326_flush') || 0; if (Date.now() - lk < 20000) return; localStorage.setItem('sys1326_flush', String(Date.now())); } catch (e) {}
    flushing = true;
    qAll(function (items) {
      items.sort(function (a, b) { return a.t - b.t; });
      var i = 0;
      (function next() {
        if (i >= items.length) { flushing = false; try { localStorage.removeItem('sys1326_flush'); } catch (e) {} badge(); return; }
        var it = items[i++];
        post(it.app, it.fn, it.args).then(function (res) {
          if (res && res.ok) { qDel(it.id); toastQ('✅ ส่งรายการที่ค้างไว้แล้ว'); }
          else if (res && res.auth) { flushing = false; return badge(); }   // ต้องล็อกอินใหม่ก่อน
          else { qDel(it.id); toastQ('⚠️ ส่งรายการค้างไม่สำเร็จ: ' + ((res && res.error) || '')); }
          setTimeout(next, 300);
        }).catch(function () { flushing = false; try { localStorage.removeItem('sys1326_flush'); } catch (e) {} badge(); });
      })();
    });
  }
  // ป้าย "รอส่ง" มุมล่าง (โผล่เฉพาะตอนมีรายการค้าง)
  function badge() {
    qAll(function (items) {
      var el = document.getElementById('sys-q');
      if (!items.length) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('button'); el.id = 'sys-q'; el.type = 'button';
        el.style.cssText = 'position:fixed;z-index:2147483001;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);border:0;border-radius:100px;padding:9px 16px;background:rgba(28,28,30,.92);color:#FFD600;font:700 13px "IBM Plex Sans Thai",sans-serif;box-shadow:0 10px 24px -10px rgba(0,0,0,.6);cursor:pointer;white-space:nowrap';
        el.onclick = function () { try { localStorage.removeItem('sys1326_flush'); } catch (e) {} flush(); };
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = '📴 รอส่ง ' + items.length + ' รายการ · แตะเพื่อส่งเลย';
    });
  }
  function toastQ(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;z-index:2147483002;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);padding:10px 16px;border-radius:100px;background:rgba(28,28,30,.92);color:#fff;font:600 13px "IBM Plex Sans Thai",sans-serif;box-shadow:0 10px 24px -10px rgba(0,0,0,.6);max-width:92vw';
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  window.addEventListener('online', function () { setTimeout(flush, 800); });
  window.addEventListener('load', function () { badge(); setTimeout(flush, 1500); });
  setInterval(function () { qAll(function (it) { if (it.length) flush(); }); }, 30000);

  function call(fn, args, ok, fail) {
    var queueable = (QUEUE_FNS[APP] || []).indexOf(fn) !== -1;
    if (queueable && args[0] && typeof args[0] === 'object') {
      // เวลาที่กดบันทึกจริง + รหัสกันบันทึกซ้ำ
      if (!args[0].clientId) args[0].clientId = uid();
      if (!args[0].clientTime) args[0].clientTime = new Date().toISOString();
    }
    var body = JSON.stringify({ app: APP, fn: fn, args: args, token: getToken() });
    var tries = 0;
    function go() {
      tries++;
      // text/plain = ไม่ให้เบราว์เซอร์บล็อกการส่งข้ามเว็บ (ไม่มี preflight)
      fetch(API_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          var res;
          try { res = JSON.parse(txt); } catch (e) {
            var hint = /doPost/i.test(txt) ? 'หลังบ้านยังไม่มี API.gs หรือยังไม่ได้ Deploy เป็น New version'
              : /accounts\.google|signin|ServiceLogin/i.test(txt) ? 'Deploy ยังตั้งสิทธิ์ไม่ใช่ "Anyone" (ทุกคน)'
              : 'หลังบ้านตอบกลับไม่ใช่ข้อมูล — เช็ก Deploy (New version + Anyone)';
            throw new Error(hint + ' · ' + txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140));
          }
          if (res.ok) {
            if (fn === 'authenticateUser' && res.data && res.data.token) setToken(res.data.token);
            ok && ok(res.data);
          } else {
            if (res.auth) needLogin();
            var err = new Error(res.error || 'เกิดข้อผิดพลาด');
            if (fail) fail(err); else console.error(err);
          }
        })
        .catch(function (e) {
          if (tries < 2 && /Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))) { setTimeout(go, 800); return; }
          if (queueable && isNetErr(e)) {
            qAdd({ id: args[0].clientId || uid(), app: APP, fn: fn, args: args, t: Date.now() }, function (saved) {
              if (saved) { badge(); ok && ok({ status: 'success', queued: true, message: '📴 เน็ตหลุด — เก็บไว้ในเครื่องแล้ว จะส่งให้เองเมื่อเน็ตกลับมา' }); }
              else { var er = new Error('ไม่มีเน็ต และเก็บข้อมูลไว้ในเครื่องไม่ได้'); fail ? fail(er) : console.error(er); }
            });
            return;
          }
          var err = new Error(/Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))
            ? 'ติดต่อหลังบ้านไม่ได้ (มักเกิดจาก Deploy ยังไม่ใช่ "Anyone" หรือยังไม่ได้กด New version) — ' + (e && e.message) : (e && e.message) || String(e));
          if (fail) fail(err); else console.error(err);
        });
    }
    go();
  }

  function runner(ok, fail) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return runner(f, fail); };
        if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
        if (name === 'withUserObject') return function () { return runner(ok, fail); };
        return function () { call(String(name), Array.prototype.slice.call(arguments), ok, fail); };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: function () { return runner(null, null); }, configurable: true });

  window.SYS1326 = { getToken: getToken, setToken: setToken, needLogin: needLogin, API_URL: API_URL, flush: flush, pending: qAll };

  // แอปที่เปิดอยู่ในกรอบ: ส่งสัญญาณ "ยังใช้งานอยู่" ให้หน้าเมนูหลัก (กันเด้งออกเพราะไม่ได้แตะหน้าเมนู 15 นาที)
  if (window.parent && window.parent !== window) {
    var last = 0;
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        var now = Date.now();
        if (now - last < 20000) return;
        last = now;
        try { window.parent.postMessage({ type: 'sys1326-activity' }, location.origin); } catch (e) {}
      }, { passive: true, capture: true });
    });
  }
})();
