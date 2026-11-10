/**
 * Reading Plan data -- the notes and sermons behind https://kyeill.github.io/esv/.
 *
 * Bound to the "Reading Plan" Google Sheet. Tabs are safe to edit by hand;
 * columns are found by their header, so they can be moved:
 *
 *   Notes    Id | Passage | Kind | Ref | Text | Written | Updated
 *            One row per verse or note. Passage ties it to the plan ("d14" =
 *            Day 14, "s:Gen 26" = that optional reading). Kind is verse or note.
 *            Ref is the verse or passage it names; Written is the day it was
 *            written (yyyy-mm-dd).
 *   Sermons  Id | Date | Series | Title | Pastor | Verses | Summary | Sections | Updated
 *            One row per sermon. Verses decides which passages it shows on.
 *            Sections is a JSON list of {title, points:[...]}.
 *   Log      The old check marks (no longer used by the app; left as it was).
 *
 * Every call needs the passphrase: GET ?key=..., POST {key, ...}. Only a hash
 * of it is kept, in the script property PASS_HASH. If PASS_HASH is missing,
 * the first POST with {claim: "<passphrase>"} sets it. To reset a forgotten
 * passphrase, delete PASS_HASH (Project Settings > Script Properties); the
 * app then asks for a new one.
 *
 *   GET                  -> {ok, notes:[...], sermons:[...]}
 *   POST {key, ops:[{op:"note", note}, {op:"delnote", id},
 *                   {op:"sermon", sermon}, {op:"delsermon", id}]}
 *                        -> applies them, answers like GET
 *   wrong or missing key -> {ok:false, error:"no-passphrase" | "wrong-passphrase"}
 *
 * The page POSTs as text/plain so the browser sends it without a CORS
 * preflight, which Apps Script cannot answer.
 *
 * Deployed with clasp (see the README); runs as Kyle, callable by anyone who
 * has the passphrase.
 */

var NOTE_HEAD = ["Id", "Passage", "Kind", "Ref", "Text", "Written", "Updated"];
var SERMON_HEAD = ["Id", "Date", "Series", "Title", "Pastor", "Verses", "Summary", "Sections", "Updated"];
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var PASSAGE = /^(d\d{1,3}|s:.{1,80})$/;
var ID = /^[A-Za-z0-9_-]{4,40}$/;

// Run once from the editor: asks for permission and builds the tabs.
function setup() {
  var ss = SpreadsheetApp.getActive();
  tab_(ss, "Notes", NOTE_HEAD).getRange("F:F").setNumberFormat("@");
  tab_(ss, "Sermons", SERMON_HEAD).getRange("B:B").setNumberFormat("@");
}

function doGet(e) {
  var key = (e && e.parameter && e.parameter.key) || "";
  return json_(guard_(key) || read_());
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json_({ ok: false, error: "body is not JSON" });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var props = PropertiesService.getScriptProperties();
    if (body.claim && !props.getProperty("PASS_HASH")) {
      var pass = String(body.claim);
      if (pass.length < 6) return json_({ ok: false, error: "passphrase too short" });
      props.setProperty("PASS_HASH", hash_(pass));
      body.key = pass;
    }
    var bad = guard_(body.key);
    if (bad) return json_(bad);
    apply_(body.ops || []);
    return json_(read_());
  } finally {
    lock.releaseLock();
  }
}

/* ---------- passphrase ---------- */

function guard_(key) {
  var want = PropertiesService.getScriptProperties().getProperty("PASS_HASH");
  if (!want) return { ok: false, error: "no-passphrase" };
  if (!key || hash_(String(key)) !== want) return { ok: false, error: "wrong-passphrase" };
  return null;
}

function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "reading-plan:" + s, Utilities.Charset.UTF_8));
}

/* ---------- reading ---------- */

function read_() {
  var ss = SpreadsheetApp.getActive(), notes = [], sermons = [];
  var t = table_(tab_(ss, "Notes", NOTE_HEAD), NOTE_HEAD);
  t.rows.forEach(function (r) {
    var id = String(r[t.col.Id] || "").trim();
    if (!id) return;
    notes.push({
      id: id, passage: String(r[t.col.Passage] || "").trim(),
      kind: String(r[t.col.Kind] || "note").trim().toLowerCase() === "verse" ? "verse" : "note",
      ref: String(r[t.col.Ref] || ""), text: String(r[t.col.Text] || ""),
      written: day_(r[t.col.Written]) || null
    });
  });
  var s = table_(tab_(ss, "Sermons", SERMON_HEAD), SERMON_HEAD);
  s.rows.forEach(function (r) {
    var id = String(r[s.col.Id] || "").trim();
    if (!id) return;
    var sections = [];
    try { sections = JSON.parse(String(r[s.col.Sections] || "[]")) || []; } catch (err) { sections = []; }
    sermons.push({
      id: id, date: day_(r[s.col.Date]) || null, series: String(r[s.col.Series] || ""),
      title: String(r[s.col.Title] || ""), pastor: String(r[s.col.Pastor] || ""),
      verses: String(r[s.col.Verses] || ""), summary: String(r[s.col.Summary] || ""),
      sections: sections
    });
  });
  return { ok: true, notes: notes, sermons: sermons };
}

/* ---------- writing ---------- */

function apply_(ops) {
  if (!ops.length) return;
  var ss = SpreadsheetApp.getActive();
  var notes = tab_(ss, "Notes", NOTE_HEAD), sermons = tab_(ss, "Sermons", SERMON_HEAD);
  ops.forEach(function (o) {
    if (o.op === "note") {
      var n = o.note || {};
      if (!ID.test(String(n.id || "")) || !PASSAGE.test(String(n.passage || ""))) return;
      upsert_(notes, NOTE_HEAD, n.id, {
        Passage: n.passage, Kind: n.kind === "verse" ? "verse" : "note",
        Ref: String(n.ref || "").slice(0, 200), Text: String(n.text || "").slice(0, 20000),
        Written: DATE.test(String(n.written || "")) ? n.written : ""
      });
    } else if (o.op === "sermon") {
      var m = o.sermon || {};
      if (!ID.test(String(m.id || ""))) return;
      upsert_(sermons, SERMON_HEAD, m.id, {
        Date: DATE.test(String(m.date || "")) ? m.date : "", Series: String(m.series || "").slice(0, 200),
        Title: String(m.title || "").slice(0, 300), Pastor: String(m.pastor || "").slice(0, 200),
        Verses: String(m.verses || "").slice(0, 300), Summary: String(m.summary || "").slice(0, 20000),
        Sections: JSON.stringify(Array.isArray(m.sections) ? m.sections : []).slice(0, 45000)
      });
    } else if (o.op === "delnote") {
      remove_(notes, NOTE_HEAD, o.id);
    } else if (o.op === "delsermon") {
      remove_(sermons, SERMON_HEAD, o.id);
    }
  });
}

// Write the row whose Id is id, or append it; only the named columns change.
// The row is formatted as plain text first, so Sheets keeps everything exactly
// as typed: otherwise "2026-11-08" turns into a date (and comes back a day off
// in another time zone), "3/4" into a date, and a note starting with "=" or "+"
// into a formula. Updated is written as text too ("yyyy-mm-dd hh:mm").
function upsert_(sh, head, id, values) {
  values.Updated = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm");
  var t = table_(sh, head), row = -1;
  for (var i = 0; i < t.rows.length; i++) if (String(t.rows[i][t.col.Id]).trim() === id) { row = i + 2; break; }
  if (row < 0) row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, t.width).setNumberFormat("@");
  values.Id = id;
  // Text starting with "=" would still run as a formula, even in a plain-text
  // cell; a leading apostrophe makes Sheets keep it as text (and hides itself).
  Object.keys(values).forEach(function (k) {
    var v = String(values[k] == null ? "" : values[k]);
    sh.getRange(row, t.col[k] + 1).setValue(v.charAt(0) === "=" ? "'" + v : v);
  });
}

function remove_(sh, head, id) {
  var t = table_(sh, head);
  for (var i = t.rows.length - 1; i >= 0; i--) if (String(t.rows[i][t.col.Id]).trim() === String(id)) sh.deleteRow(i + 2);
}

/* ---------- helpers ---------- */

function tab_(ss, name, head) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

// Rows under the header, plus each header's column index. Missing headers are
// added at the right so a hand-edited tab still works.
function table_(sh, head) {
  var width = Math.max(sh.getLastColumn(), 1);
  var first = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  if (first.length === 1 && first[0] === "") first = [];
  var col = {};
  head.forEach(function (h) {
    var i = first.indexOf(h);
    if (i < 0) {
      i = first.length;
      first.push(h);
      sh.getRange(1, i + 1).setValue(h).setFontWeight("bold");
    }
    col[h] = i;
  });
  width = first.length;
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];
  return { col: col, rows: rows, width: width };
}

function day_(v) {
  // a date typed into the Sheet by hand: read it in the Sheet's own time zone
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "yyyy-MM-dd");
  var s = String(v || "").trim();
  return DATE.test(s) ? s : "";
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
