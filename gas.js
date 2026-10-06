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
  function swrClear() { try { Object.keys(localStorage).forEach(function (x) { if (x.indexOf('swr1:') === 0) localStorage.removeItem(x); }); } catch (e) {} }
  function needLogin() {
    setToken(''); swrClear();
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

  // ===== ⚡ โชว์ข้อมูลล่าสุดในเครื่องทันที แล้วค่อยอัปเดตตามหลัง =====
  // เฉพาะคำสั่ง "อ่าน" เท่านั้น (ไม่มีคำสั่งบันทึก/แก้/ลบในนี้)
  var SWR_FNS = {
    dash:  ['getDashboardData', 'getRankingData', 'getHubBadges'],
    check: ['getDashboardData', 'getStoreGoal', 'getLeaderboard', 'getCheckSettings', 'getTodaySales', 'getSerialIndex'],
    shift: ['getMonthData', 'getReportSummary'],
    stock: ['getBrandList', 'getPromotions']
  };
  var SWR_MAX_AGE = 12 * 3600 * 1000;
  function who() {
    try {
      var b = getToken().split('.')[0].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, ''); while (b.length % 4) b += '=';
      var j = JSON.parse(decodeURIComponent(escape(atob(b))));
      return (j.role || '') + ':' + (j.id || '');
    } catch (e) { return ''; }
  }
  function swrKey(fn, args) { var w = who(); return w ? 'swr1:' + APP + ':' + fn + ':' + w + ':' + JSON.stringify(args) : ''; }
  function swrGet(k) {
    try { var o = JSON.parse(localStorage.getItem(k) || 'null'); if (o && Date.now() - o.t < SWR_MAX_AGE) return o; } catch (e) {}
    return null;
  }
  function swrPut(k, txt) {
    try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d: txt })); }
    catch (e) {   // เครื่องเต็ม → ล้างของเก่าทิ้งแล้วลองใหม่
      try { Object.keys(localStorage).forEach(function (x) { if (x.indexOf('swr1:') === 0) localStorage.removeItem(x); }); localStorage.setItem(k, JSON.stringify({ t: Date.now(), d: txt })); } catch (e2) {}
    }
  }
  // ป้ายเล็กมุมล่าง "กำลังอัปเดต…" ระหว่างโชว์ข้อมูลเก่า
  var swrBusy = 0;
  function swrPill(delta, t) {
    swrBusy = Math.max(0, swrBusy + delta);
    var el = document.getElementById('sys-swr');
    if (!swrBusy) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'sys-swr';
      el.style.cssText = 'position:fixed;z-index:2147483000;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));padding:7px 12px;border-radius:100px;background:rgba(28,28,30,.86);color:#FFD600;font:600 11px "IBM Plex Sans Thai",sans-serif;box-shadow:0 8px 20px -10px rgba(0,0,0,.6);pointer-events:none';
      (document.body || document.documentElement).appendChild(el);
    }
    if (t) {
      var m = Math.max(0, Math.round((Date.now() - t) / 60000));
      el.textContent = '⏳ กำลังอัปเดต · ข้อมูลเมื่อ ' + (m < 1 ? 'เมื่อกี้' : m < 60 ? m + ' นาทีก่อน' : Math.floor(m / 60) + ' ชม.ก่อน');
    }
  }

  // อัปเดตไม่สำเร็จ → บอกให้ชัดว่ากำลังดูข้อมูลเก่า (แตะเพื่อลองใหม่)
  function swrWarn(t) {
    var el = document.getElementById('sys-swr-warn');
    if (!el) {
      el = document.createElement('button'); el.id = 'sys-swr-warn'; el.type = 'button';
      el.style.cssText = 'position:fixed;z-index:2147483001;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));border:0;border-radius:100px;padding:9px 16px;background:#FF453A;color:#fff;font:700 12px "IBM Plex Sans Thai",sans-serif;box-shadow:0 10px 24px -10px rgba(0,0,0,.6);cursor:pointer;max-width:92vw';
      el.onclick = function () { location.reload(); };
      (document.body || document.documentElement).appendChild(el);
    }
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    el.textContent = '⚠️ ต่อหลังบ้านไม่ได้ · กำลังดูข้อมูลเมื่อ ' + (m < 1 ? 'เมื่อกี้' : m < 60 ? m + ' นาทีก่อน' : Math.floor(m / 60) + ' ชม.ก่อน') + ' · แตะลองใหม่';
  }
  function swrOkClear() { var el = document.getElementById('sys-swr-warn'); if (el) el.remove(); }

  function call(fn, args, ok, fail) {
    var swrK = (SWR_FNS[APP] || []).indexOf(fn) !== -1 ? swrKey(fn, args) : '';
    var cached = swrK ? swrGet(swrK) : null;
    if (cached) {
      var shown = false;
      try { var cd = JSON.parse(cached.d), okFirst = ok; setTimeout(function () { okFirst && okFirst(cd); }, 0); shown = true; } catch (e) { cached = null; }
      if (shown) {
        swrPill(1, cached.t);
        var ok0 = ok, fail0 = fail, fin = false;
        var end = function () { if (!fin) { fin = true; swrPill(-1); } };
        ok = function (d) {
          end();
          var txt = ''; try { txt = JSON.stringify(d); } catch (e) {}
          if (txt && txt === cached.d) return;   // ไม่มีอะไรเปลี่ยน → ไม่ต้องวาดใหม่
          ok0 && ok0(d);
        };
        fail = function (e) { end(); console.warn('อัปเดตไม่สำเร็จ ใช้ข้อมูลในเครื่องไปก่อน', e); swrWarn(cached.t); };
        setTimeout(end, 90000);
      }
    }
    var queueable = (QUEUE_FNS[APP] || []).indexOf(fn) !== -1;
    if (queueable && args[0] && typeof args[0] === 'object') {
      // เวลาที่กดบันทึกจริง + รหัสกันบันทึกซ้ำ
      if (!args[0].clientId) args[0].clientId = uid();
      if (!args[0].clientTime) args[0].clientTime = new Date().toISOString();
    }
    var body = JSON.stringify({ app: APP, fn: fn, args: args, token: getToken() });
    var tries = 0;
    // คำสั่งลบ/แก้ตามแถว ห้ามส่งซ้ำอัตโนมัติ (กันลบ/แก้ผิดแถว)
    var retryable = !/^(delete|update)[A-Z]|Record$/.test(fn);
    function go() {
      tries++;
      slot(function (done) {
      // text/plain = ไม่ให้เบราว์เซอร์บล็อกการส่งข้ามเว็บ (ไม่มี preflight)
      fetch(API_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' })
        .then(function (r) { done(); return r.text(); }, function (e) { done(); throw e; })
        .then(function (txt) {
          var res;
          try { res = JSON.parse(txt); } catch (e) {
            if (/doPost/i.test(txt)) throw new Error('หลังบ้านยังไม่มี API.gs หรือยังไม่ได้ Deploy เป็น New version');
            if (/accounts\.google|signin|ServiceLogin/i.test(txt)) throw new Error('Deploy ยังตั้งสิทธิ์ไม่ใช่ "Anyone" (ทุกคน)');
            // หน้า error ของ Google (คนใช้พร้อมกันเยอะ / Google ไม่ว่าง) → รอแป๊บแล้วลองใหม่เอง
            var busy = new Error('Google ไม่ว่างชั่วคราว (ใช้งานพร้อมกันเยอะ) — กด ↻ ลองใหม่อีกครั้งนะครับ');
            busy.gBusy = true; throw busy;
          }
          if (res.ok) {
            if (fn === 'authenticateUser' && res.data && res.data.token) setToken(res.data.token);
            if (swrK && res.data && !res.data.error && res.data.status !== 'error') { try { swrPut(swrK, JSON.stringify(res.data)); } catch (e) {} swrOkClear(); }
            ok && ok(res.data);
          } else {
            if (res.auth) needLogin();
            var err = new Error(res.error || 'เกิดข้อผิดพลาด');
            if (fail) fail(err); else console.error(err);
          }
        })
        .catch(function (e) {
          // คำสั่งอ่าน: ลองใหม่แค่ 1 ครั้ง — ส่งซ้ำรัวๆ จะยิ่งเพิ่มคิวให้ Google
          // บันทึกขาย/งานไม่ผ่าน: มีรหัสกันซ้ำที่หลังบ้าน → ลองได้ 4 ครั้ง (3, 7, 12 วิ) ไม่เข้าชีตซ้ำ
          var transient = (e && e.gBusy) || isNetErr(e);
          var maxTries = queueable ? 4 : 2;
          if (transient && retryable && tries < maxTries) { setTimeout(go, (queueable ? [0, 3000, 7000, 12000][tries] : 3000) + Math.random() * 1500); return; }
          if (queueable && transient) {
            qAdd({ id: args[0].clientId || uid(), app: APP, fn: fn, args: args, t: Date.now() }, function (saved) {
              if (saved) { badge(); ok && ok({ status: 'success', queued: true, message: '📴 ส่งไม่ออกตอนนี้ (เน็ตหรือ Google ไม่ว่าง) — เก็บไว้ในเครื่องแล้ว ระบบจะส่งให้เอง ห้ามกดบันทึกซ้ำ' }); }
              else { var er = new Error('ไม่มีเน็ต และเก็บข้อมูลไว้ในเครื่องไม่ได้'); fail ? fail(er) : console.error(er); }
            });
            return;
          }
          var err = new Error(/Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))
            ? 'เชื่อมต่อหลังบ้านไม่ได้ชั่วคราว (เน็ตสะดุด หรือ Google ไม่ว่าง) — กด ↻ ลองใหม่อีกครั้งนะครับ' : (e && e.message) || String(e));
          if (fail) fail(err); else console.error(err);
        });
      });
    }
    go();
  }

  // ส่งพร้อมกันได้ไม่เกิน 3 คำขอต่อหน้า ที่เหลือต่อคิว (Google จำกัดจำนวนที่รันพร้อมกัน)
  var MAX_INFLIGHT = 3, inflight = 0, waiting = [];
  function slot(run) {
    var start = function () {
      inflight++;
      var released = false;
      run(function () { if (released) return; released = true; inflight--; if (waiting.length) waiting.shift()(); });
    };
    if (inflight < MAX_INFLIGHT) start(); else waiting.push(start);
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

  window.SYS1326 = { clearCache: swrClear, getToken: getToken, setToken: setToken, needLogin: needLogin, API_URL: API_URL, flush: flush, pending: qAll };

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
