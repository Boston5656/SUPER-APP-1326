/* =====================================================================
   🍀 น้องโชค — ผู้ช่วย AI ที่ "เรียนรู้ได้" (หลังบ้าน Apps Script)

   วิธีติดตั้ง (ทำครั้งเดียว) — ดูรายละเอียดใน apps-script/README-NongChok.md
     1) โปรเจกต์ Apps Script ของ SUPER APP → เพิ่มไฟล์ใหม่ชื่อ NongChok.gs → วางโค้ดนี้ทั้งหมด
     2) ใช้ Gemini (ฟรี) — คีย์ Gemini เดิมใน Script Properties ใช้ต่อได้เลย
        (ชื่อ GEMINI_API_KEY หรือชื่ออื่นที่มีคำว่า GEMINI · ถ้ายังไม่มี สร้างฟรีที่ aistudio.google.com)
     3) ใน API.gs ให้แอป 'chok' เรียกฟังก์ชันเหล่านี้ได้:
          chokChat, chokTeach, chokFeedback, chokListKnowledge, chokDeleteKnowledge
     4) Deploy → Manage deployments → แก้ไข → Version: New version → Deploy

   น้องโชคเรียนรู้ได้ 3 ทาง (ทุกอย่างเก็บในชีต "น้องโชค — ความรู้" สร้างให้อัตโนมัติ)
     • สอนตรงๆ   — แท็บ "สอนน้องโชค" ในแอป
     • จากการคุย  — พิมพ์ "จำไว้นะว่า..." หรือบอกข้อมูลร้าน น้องโชคจะบันทึกเอง (tool: remember)
     • แก้คำตอบ   — กด ✏️ ใต้คำตอบที่ผิด แล้วพิมพ์คำตอบที่ถูก
   ===================================================================== */

var CHOK_MODEL = 'gemini-2.5-flash';   // รุ่นฟรี · เปลี่ยนได้ด้วย Script Property GEMINI_MODEL
var CHOK_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
var CHOK_ADMIN_ID = '15628';
var CHOK_MAX_KNOWLEDGE_CHARS = 60000;   // ความรู้เกินนี้ → เลือกเฉพาะเรื่องที่เกี่ยวกับคำถาม
var CHOK_HEADERS = ['ID', 'เวลา', 'หัวข้อ', 'ความรู้', 'ที่มา', 'ผู้สอน'];

var CHOK_SYSTEM = [
  'คุณคือ "น้องโชค" ผู้ช่วย AI ประจำร้าน BN Future Park Rangsit 2.2 (สาขา 1326) ร้านขายมือถือ แท็บเล็ต และอุปกรณ์',
  'ผู้ใช้คือพนักงานในร้าน คุยภาษาไทยแบบเป็นกันเอง สุภาพ กระชับ ใช้ "ครับ" ตอบให้ตรงคำถาม อ่านง่ายบนมือถือ',
  '',
  'ความรู้ของร้าน:',
  '- ใช้ "ความรู้ที่พี่ๆ สอนไว้" ด้านล่างเป็นหลัก ถ้าขัดกับความรู้ทั่วไป ให้เชื่อสิ่งที่พี่ๆ สอน (รายการใหม่กว่าสำคัญกว่า)',
  '- ถ้าไม่รู้หรือไม่มีข้อมูล ให้บอกตรงๆ ว่ายังไม่รู้ และชวนให้สอน — ห้ามเดาราคา โปรโมชั่น หรือนโยบายร้าน',
  '',
  'การเรียนรู้ (tool: remember):',
  '- เมื่อพนักงานบอกข้อมูลที่ควรจำไว้ใช้ครั้งหน้า เช่น ขั้นตอนงาน กฎร้าน ข้อมูลสินค้า โปรโมชั่น เทคนิคการขาย หรือขอให้ "จำไว้" ให้เรียก remember',
  '- บันทึกเป็นประโยคที่อ่านเข้าใจได้เองโดยไม่ต้องดูบทสนทนา ใส่ช่วงเวลาที่ใช้ได้ถ้ามี (เช่น โปรถึงสิ้นเดือน)',
  '- ไม่ต้องบันทึก: คำทักทาย คำถามทั่วไป เรื่องที่รู้อยู่แล้ว ข้อมูลส่วนตัวของลูกค้า (เบอร์โทร เลขบัตร ที่อยู่) รหัสผ่าน',
  '- ถ้าสิ่งที่บอกมาขัดกับความรู้เดิม ให้บันทึกข้อมูลใหม่ แล้วบอกพนักงานว่าอัปเดตแล้ว',
  '- หลังบันทึก ให้บอกสั้นๆ ว่าจำอะไรไว้'
].join('\n');

var CHOK_TOOLS = [{ functionDeclarations: [{
  name: 'remember',
  description: 'บันทึกความรู้ใหม่ลงคลังความรู้ถาวรของน้องโชค เพื่อใช้ตอบคำถามในอนาคต ใช้เมื่อพนักงานสอนหรือให้ข้อมูลร้านที่มีประโยชน์ระยะยาว',
  parameters: {
    type: 'OBJECT',
    properties: {
      topic: { type: 'STRING', description: 'หัวข้อสั้นๆ เช่น "โปรโมชั่น", "ขั้นตอนเคลม", "SAMSUNG"' },
      content: { type: 'STRING', description: 'ความรู้ที่ต้องจำ เขียนเป็นประโยคสมบูรณ์ อ่านเข้าใจได้เอง' }
    },
    required: ['topic', 'content']
  }
}] }];

/* ===================== ฟังก์ชันที่หน้าเว็บเรียก (app: 'chok') ===================== */

// คุยกับน้องโชค  req = { message, history: [{role:'user'|'assistant', text}], who: {id, name} }
function chokChat(req) {
  req = req || {};
  var message = String(req.message || '').trim();
  if (!message) return { status: 'error', message: 'ยังไม่ได้พิมพ์คำถาม' };
  if (message.length > 4000) message = message.slice(0, 4000);
  var who = chokWho_(req.who);

  var knowledge = chokReadKnowledge_();
  var contents = chokHistory_(req.history);
  var lastMsg = contents[contents.length - 1];
  if (lastMsg && lastMsg.role === 'user') lastMsg.parts[0].text += '\n' + message;   // ข้อความก่อนหน้าที่ส่งไม่สำเร็จ
  else contents.push({ role: 'user', parts: [{ text: message }] });

  var system = CHOK_SYSTEM + '\n\n' + chokKnowledgeText_(knowledge, message) +
    '\n\nวันนี้: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd') + ' · คนที่คุยด้วย: ' + (who.name || 'พนักงาน');

  var learned = [];
  for (var turn = 0; turn < 4; turn++) {
    var res = chokCallGemini_({ system: system, contents: contents });
    var cand = (res.candidates || [])[0];
    if (!cand || !cand.content || !cand.content.parts) {
      var why = cand && cand.finishReason;
      if (why === 'MAX_TOKENS') return { status: 'success', reply: 'คำตอบยาวเกินไปครับ ลองถามให้แคบลงหน่อยนะครับ', learned: learned };
      return { status: 'success', reply: 'ขอโทษครับ เรื่องนี้น้องโชคตอบให้ไม่ได้ ลองถามแบบอื่นนะครับ 🙏', learned: learned };
    }
    var calls = cand.content.parts.filter(function (p) { return p.functionCall; });
    if (!calls.length) {
      return { status: 'success', reply: chokText_(cand.content.parts) || '…', learned: learned };
    }
    // น้องโชคขอบันทึกความรู้ → บันทึกลงชีต แล้วส่งผลกลับ
    contents.push(cand.content);
    var results = calls.map(function (p) {
      var fc = p.functionCall, args = fc.args || {}, out;
      try {
        if (fc.name !== 'remember') throw new Error('ไม่รู้จักเครื่องมือ ' + fc.name);
        var item = chokSave_(args.topic, args.content, 'คุย', who.name);
        learned.push({ topic: item.topic, content: item.content });
        out = { result: 'บันทึกแล้ว (#' + item.id + ')' };
      } catch (e) {
        out = { error: 'บันทึกไม่สำเร็จ: ' + e.message };
      }
      return { functionResponse: { name: fc.name, response: out } };
    });
    contents.push({ role: 'user', parts: results });
  }
  return { status: 'success', reply: 'บันทึกไว้แล้วครับ ✅', learned: learned };
}

// สอนตรงๆ  req = { topic, content, who }
function chokTeach(req) {
  req = req || {};
  var item = chokSave_(req.topic, req.content, 'สอน', chokWho_(req.who).name);
  return { status: 'success', item: item };
}

// แก้คำตอบที่ผิด  req = { question, answer, correction, who }
function chokFeedback(req) {
  req = req || {};
  var correction = String(req.correction || '').trim();
  if (!correction) return { status: 'error', message: 'ยังไม่ได้พิมพ์คำตอบที่ถูก' };
  var q = String(req.question || '').trim().slice(0, 300);
  var item = chokSave_('แก้คำตอบ', (q ? 'ถ้ามีคนถามว่า "' + q + '" → ' : '') + correction, 'แก้คำตอบ', chokWho_(req.who).name);
  return { status: 'success', item: item };
}

function chokListKnowledge() {
  return { status: 'success', items: chokReadKnowledge_().reverse() };
}

// ลบความรู้ (เฉพาะผู้จัดการ)  req = { id, who }
function chokDeleteKnowledge(req) {
  req = req || {};
  if (chokWho_(req.who).id !== CHOK_ADMIN_ID) return { status: 'error', message: 'ลบได้เฉพาะผู้จัดการครับ' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = chokSheet_(), last = sh.getLastRow();
    if (last < 2) return { status: 'error', message: 'ไม่พบรายการ' };
    var ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(req.id)) { sh.deleteRow(i + 2); return { status: 'success' }; }
    }
    return { status: 'error', message: 'ไม่พบรายการ' };
  } finally { lock.releaseLock(); }
}

/* ===================== คลังความรู้ (Google Sheet) ===================== */

function chokSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('NONGCHOK_SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('น้องโชค — ความรู้');
    props.setProperty('NONGCHOK_SHEET_ID', ss.getId());
  }
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(CHOK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CHOK_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function chokReadKnowledge_() {
  var sh = chokSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, CHOK_HEADERS.length).getValues()
    .filter(function (r) { return String(r[3]).trim(); })
    .map(function (r) {
      return {
        id: String(r[0]),
        time: r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Bangkok', 'yyyy-MM-dd HH:mm') : String(r[1]),
        topic: String(r[2]), content: String(r[3]), source: String(r[4]), by: String(r[5])
      };
    });
}

function chokSave_(topic, content, source, by) {
  topic = String(topic || '').trim().slice(0, 80) || 'ทั่วไป';
  content = String(content || '').trim().slice(0, 2000);
  if (!content) throw new Error('ยังไม่ได้ใส่ความรู้');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var item = { id: Utilities.getUuid().slice(0, 8), time: new Date(), topic: topic, content: content, source: source, by: by || '' };
    chokSheet_().appendRow([item.id, item.time, item.topic, item.content, item.source, item.by]);
    item.time = Utilities.formatDate(item.time, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
    return item;
  } finally { lock.releaseLock(); }
}

// ความรู้ทั้งหมด (เก่า → ใหม่) ถ้ายาวเกิน เลือกเรื่องที่ใกล้เคียงคำถามที่สุด + รายการล่าสุด
function chokKnowledgeText_(items, question) {
  var line = function (k) { return '- [' + k.topic + '] ' + k.content + ' (' + k.time + ')'; };
  var all = items.map(line), total = all.join('\n').length;
  var picked = items;
  if (total > CHOK_MAX_KNOWLEDGE_CHARS) {
    var qg = chokBigrams_(question);
    var scored = items.map(function (k, i) {
      var g = chokBigrams_(k.topic + ' ' + k.content), hit = 0;
      Object.keys(qg).forEach(function (x) { if (g[x]) hit++; });
      return { i: i, s: hit + i / items.length };   // เสมอกัน → ใหม่กว่าชนะ
    }).sort(function (a, b) { return b.s - a.s; });
    var keep = {}, size = 0;
    for (var j = 0; j < scored.length; j++) {
      var len = all[scored[j].i].length + 1;
      if (size + len > CHOK_MAX_KNOWLEDGE_CHARS) continue;
      keep[scored[j].i] = true; size += len;
    }
    picked = items.filter(function (_, i) { return keep[i]; });
  }
  if (!picked.length) return 'ความรู้ที่พี่ๆ สอนไว้: (ยังไม่มี — ชวนพี่ๆ สอนได้เลย)';
  return 'ความรู้ที่พี่ๆ สอนไว้ (เรียงจากเก่าไปใหม่):\n' + picked.map(line).join('\n');
}

function chokBigrams_(s) {
  s = String(s || '').toLowerCase().replace(/\s+/g, '');
  var out = {};
  for (var i = 0; i < s.length - 1; i++) out[s.substr(i, 2)] = true;
  return out;
}

/* ===================== เรียก Gemini API (ฟรี) ===================== */

// ใช้คีย์ Gemini ที่มีอยู่แล้วใน Script Properties (GEMINI_API_KEY หรือชื่ออื่นที่มีคำว่า GEMINI)
function chokGeminiKey_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  if (all.GEMINI_API_KEY) return all.GEMINI_API_KEY;
  var name = Object.keys(all).filter(function (k) { return /GEMINI/i.test(k) && !/MODEL/i.test(k) && all[k]; })[0];
  if (name) return all[name];
  throw new Error('ไม่พบคีย์ Gemini ใน Script Properties (ตั้งชื่อ GEMINI_API_KEY)');
}

function chokCallGemini_(body) {
  var model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || CHOK_MODEL;
  var payload = {
    systemInstruction: { parts: [{ text: body.system }] },
    contents: body.contents,
    tools: CHOK_TOOLS,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
  };
  var opts = {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': chokGeminiKey_() },
    payload: JSON.stringify(payload)
  };
  var url = CHOK_API_BASE + encodeURIComponent(model) + ':generateContent';
  for (var attempt = 0; ; attempt++) {
    var r = UrlFetchApp.fetch(url, opts), code = r.getResponseCode();
    if (code === 200) return JSON.parse(r.getContentText());
    var retryable = code === 429 || code >= 500;
    if (retryable && attempt < 2) { Utilities.sleep(2000 * (attempt + 1)); continue; }
    var msg = '';
    try { msg = JSON.parse(r.getContentText()).error.message; } catch (e) { msg = r.getContentText().slice(0, 200); }
    if (code === 429) throw new Error('ใช้น้องโชคเกินโควตาฟรีชั่วคราว รอสักครู่แล้วลองใหม่นะครับ');
    if (code === 503) throw new Error('Gemini ไม่ว่างชั่วคราว ลองใหม่อีกครั้งนะครับ');
    throw new Error('น้องโชคตอบไม่ได้ (' + code + '): ' + msg);
  }
}

function chokText_(parts) {
  return (parts || []).filter(function (p) { return p.text && !p.thought; })
    .map(function (p) { return p.text; }).join('').trim();
}

// ประวัติแชทจากหน้าเว็บ (ข้อความล้วน) → รูปแบบ Gemini ต้องเริ่มด้วย user และสลับ user/model
function chokHistory_(history) {
  var out = [];
  (Array.isArray(history) ? history : []).slice(-12).forEach(function (h) {
    var role = h && h.role === 'assistant' ? 'model' : 'user';
    var text = String((h && h.text) || '').trim().slice(0, 4000);
    if (!text) return;
    if (!out.length && role !== 'user') return;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts[0].text += '\n' + text;
    else out.push({ role: role, parts: [{ text: text }] });
  });
  return out;
}

function chokWho_(w) {
  w = w || {};
  return { id: String(w.id || ''), name: String(w.name || '').slice(0, 40) };
}
