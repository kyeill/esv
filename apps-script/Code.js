/**
 * Reading Plan data -- the check marks behind https://kyeill.github.io/esv/.
 *
 * Bound to the "Reading Plan" Google Sheet. One tab, safe to edit by hand;
 * columns are found by their header, so they can be moved:
 *
 *   Log   Id | Reading | Date | Saved
 *         One row per reading marked read. Id ties the row to the plan
 *         ("d14" = Day 14, "s:Gen 26" = that supplement); Reading is only for
 *         people looking at the Sheet. Date is the day it was marked read.
 *         Deleting a row un-checks it.
 *
 *   GET                                         -> {ok, done:[{id, date}]}
 *   POST {ops:[{op:"set", id, date, reading}, {op:"del", id}]}
 *                                               -> applies them, answers like GET
 *
 * The page POSTs as text/plain so the browser sends it without a CORS
 * preflight, which Apps Script cannot answer.
 *
 * Deployed with clasp (see the README); runs as Kyle, callable by anyone.
 */

var HEAD = ["Id", "Reading", "Date", "Saved"];
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var ID = /^(d\d{1,3}|s:.{1,80})$/;

// Run once from the editor: asks for permission and builds the tab.
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Log") || ss.insertSheet("Log", 0);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  sh.getRange("C:C").setNumberFormat("@");
  var blank = ss.getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
}

function doGet(e) {
  return json_(read_());
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
    apply_(body.ops || []);
    return json_(read_());
  } finally {
    lock.releaseLock();
  }
}

function read_() {
  var t = table_(sheet_()), done = [], seen = {};
  t.rows.forEach(function (r) {
    var id = String(r[t.col.Id] || "").trim();
    if (!id || seen[id]) return;
    seen[id] = true;
    done.push({ id: id, date: day_(r[t.col.Date]) || null });
  });
  return { ok: true, done: done };
}

function apply_(ops) {
  if (!ops.length) return;
  var sh = sheet_(), t = table_(sh), at = {};
  t.rows.forEach(function (r, i) {
    var id = String(r[t.col.Id] || "").trim();
    (at[id] = at[id] || []).push(i + 2);
  });
  var now = new Date(), doomed = [], appends = [];
  ops.forEach(function (o) {
    var id = String(o.id || "");
    if (!ID.test(id)) return;
    if (o.op === "del") {
      (at[id] || []).forEach(function (row) { doomed.push(row); });
      delete at[id];
      return;
    }
    if (o.op !== "set" || !DATE.test(String(o.date || ""))) return;
    var reading = String(o.reading || "").slice(0, 120);
    if (at[id]) {
      var row = at[id][0];
      sh.getRange(row, t.col.Date + 1).setValue(o.date);
      sh.getRange(row, t.col.Saved + 1).setValue(now);
    } else {
      var line = new Array(t.width).fill("");
      line[t.col.Id] = id;
      line[t.col.Reading] = reading;
      line[t.col.Date] = o.date;
      line[t.col.Saved] = now;
      appends.push(line);
      at[id] = [-1];   // a second set in the same batch must not append again
    }
  });
  if (appends.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, appends.length, t.width).setValues(appends);
    sh.getRange(start, t.col.Saved + 1, appends.length, 1).setNumberFormat("yyyy-mm-dd hh:mm");
  }
  doomed.filter(function (r) { return r > 0; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (r) { sh.deleteRow(r); });
}

/* ---------- helpers ---------- */

function sheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName("Log");
  if (!sh) { setup(); sh = SpreadsheetApp.getActive().getSheetByName("Log"); }
  return sh;
}

// Rows under the header, plus each header's column index. Missing headers are
// added at the right so a hand-edited tab still works.
function table_(sh) {
  var width = Math.max(sh.getLastColumn(), 1);
  var first = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  if (first.length === 1 && first[0] === "") first = [];   // a tab with nothing in it
  var col = {};
  HEAD.forEach(function (h) {
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
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(v || "").trim();
  return DATE.test(s) ? s : "";
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
