/* =====================================================================
   🍀 น้องโชค — ผู้ช่วย AI ที่ "เรียนรู้ได้" (หลังบ้าน Apps Script)

   วิธีติดตั้ง (ทำครั้งเดียว) — ดูรายละเอียดใน apps-script/README-NongChok.md
     1) โปรเจกต์ Apps Script ของ SUPER APP → เพิ่มไฟล์ใหม่ชื่อ NongChok.gs → วางโค้ดนี้ทั้งหมด
     2) Project Settings → Script Properties → เพิ่ม ANTHROPIC_API_KEY = (คีย์จาก console.anthropic.com)
     3) ใน API.gs ให้แอป 'chok' เรียกฟังก์ชันเหล่านี้ได้:
          chokChat, chokTeach, chokFeedback, chokListKnowledge, chokDeleteKnowledge
     4) Deploy → Manage deployments → แก้ไข → Version: New version → Deploy

   น้องโชคเรียนรู้ได้ 3 ทาง (ทุกอย่างเก็บในชีต "น้องโชค — ความรู้" สร้างให้อัตโนมัติ)
     • สอนตรงๆ   — แท็บ "สอนน้องโชค" ในแอป
     • จากการคุย  — พิมพ์ "จำไว้นะว่า..." หรือบอกข้อมูลร้าน น้องโชคจะบันทึกเอง (tool: remember)
     • แก้คำตอบ   — กด ✏️ ใต้คำตอบที่ผิด แล้วพิมพ์คำตอบที่ถูก
   ===================================================================== */

var CHOK_MODEL = 'claude-opus-5-5';
var CHOK_API_URL = 'https://api.anthropic.com/v1/messages';
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

var CHOK_TOOLS = [{
  name: 'remember',
  description: 'บันทึกความรู้ใหม่ลงคลังความรู้ถาวรของน้องโชค เพื่อใช้ตอบคำถามในอนาคต ใช้เมื่อพนักงานสอนหรือให้ข้อมูลร้านที่มีประโยชน์ระยะยาว',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'หัวข้อสั้นๆ เช่น "โปรโมชั่น", "ขั้นตอนเคลม", "SAMSUNG"' },
      content: { type: 'string', description: 'ความรู้ที่ต้องจำ เขียนเป็นประโยคสมบูรณ์ อ่านเข้าใจได้เอง' }
    },
    required: ['topic', 'content'],
    additionalProperties: false
  }
}];

/* ===================== ฟังก์ชันที่หน้าเว็บเรียก (app: 'chok') ===================== */

// คุยกับน้องโชค  req = { message, history: [{role:'user'|'assistant', text}], who: {id, name} }
function chokChat(req) {
  req = req || {};
  var message = String(req.message || '').trim();
  if (!message) return { status: 'error', message: 'ยังไม่ได้พิมพ์คำถาม' };
  if (message.length > 4000) message = message.slice(0, 4000);
  var who = chokWho_(req.who);

  var knowledge = chokReadKnowledge_();
  var messages = chokHistory_(req.history);
  var lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === 'user') lastMsg.content += '\n' + message;   // ข้อความก่อนหน้าที่ส่งไม่สำเร็จ
  else messages.push({ role: 'user', content: message });

  var system = [
    { type: 'text', text: CHOK_SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: chokKnowledgeText_(knowledge, message) +
      '\n\nวันนี้: ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd') + ' · คนที่คุยด้วย: ' + (who.name || 'พนักงาน') }
  ];

  var learned = [];
  for (var turn = 0; turn < 4; turn++) {
    var res = chokCallClaude_({ system: system, messages: messages, tools: CHOK_TOOLS });
    if (res.stop_reason === 'refusal') {
      return { status: 'success', reply: 'ขอโทษครับ เรื่องนี้น้องโชคตอบให้ไม่ได้ ลองถามแบบอื่นนะครับ 🙏', learned: learned };
    }
    if (res.stop_reason !== 'tool_use') {
      var reply = chokText_(res.content);
      if (!reply && res.stop_reason === 'max_tokens') reply = 'คำตอบยาวเกินไปครับ ลองถามให้แคบลงหน่อยนะครับ';
      return { status: 'success', reply: reply || '…', learned: learned };
    }
    // น้องโชคขอบันทึกความรู้ → บันทึกลงชีต แล้วส่งผลกลับ
    messages.push({ role: 'assistant', content: res.content });
    var results = [];
    res.content.forEach(function (b) {
      if (b.type !== 'tool_use') return;
      var out;
      try {
        if (b.name !== 'remember') throw new Error('ไม่รู้จักเครื่องมือ ' + b.name);
        var item = chokSave_(b.input && b.input.topic, b.input && b.input.content, 'คุย', who.name);
        learned.push({ topic: item.topic, content: item.content });
        out = { type: 'tool_result', tool_use_id: b.id, content: 'บันทึกแล้ว (#' + item.id + ')' };
      } catch (e) {
        out = { type: 'tool_result', tool_use_id: b.id, content: 'บันทึกไม่สำเร็จ: ' + e.message, is_error: true };
      }
      results.push(out);
    });
    messages.push({ role: 'user', content: results });
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

/* ===================== เรียก Claude API ===================== */

function chokCallClaude_(body) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Script Properties');
  var payload = {
    model: CHOK_MODEL,
    max_tokens: 4096,
    output_config: { effort: 'low' },   // แชทสั้นๆ → เร็วและประหยัด
    fallbacks: 'default',               // ถ้าโมเดลหลักปฏิเสธ ให้โมเดลสำรองตอบแทน
    system: body.system,
    messages: body.messages,
    tools: body.tools
  };
  var opts = {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify(payload)
  };
  for (var attempt = 0; ; attempt++) {
    var r = UrlFetchApp.fetch(CHOK_API_URL, opts), code = r.getResponseCode();
    if (code === 200) return JSON.parse(r.getContentText());
    var retryable = code === 429 || code >= 500;
    if (retryable && attempt < 2) { Utilities.sleep(1500 * (attempt + 1)); continue; }
    var msg = '';
    try { msg = JSON.parse(r.getContentText()).error.message; } catch (e) { msg = r.getContentText().slice(0, 200); }
    if (code === 429 || code === 529) throw new Error('น้องโชคมีคนคุยเยอะ ลองใหม่อีกครั้งนะครับ');
    throw new Error('น้องโชคตอบไม่ได้ (' + code + '): ' + msg);
  }
}

function chokText_(content) {
  return (content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('\n').trim();
}

// ประวัติแชทจากหน้าเว็บ (ข้อความล้วน) → ต้องเริ่มด้วย user และสลับ user/assistant
function chokHistory_(history) {
  var out = [];
  (Array.isArray(history) ? history : []).slice(-12).forEach(function (h) {
    var role = h && h.role === 'assistant' ? 'assistant' : 'user';
    var text = String((h && h.text) || '').trim().slice(0, 4000);
    if (!text) return;
    if (!out.length && role !== 'user') return;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + text;
    else out.push({ role: role, content: text });
  });
  return out;
}

function chokWho_(w) {
  w = w || {};
  return { id: String(w.id || ''), name: String(w.name || '').slice(0, 40) };
}
