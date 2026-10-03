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

  function call(fn, args, ok, fail) {
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

  window.SYS1326 = { getToken: getToken, setToken: setToken, needLogin: needLogin, API_URL: API_URL };

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
