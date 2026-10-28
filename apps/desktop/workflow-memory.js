// sally 本地工作习惯记忆：只保存脱敏后的统计摘要，不保存原始键盘、剪贴板或截图。
const fs = require('fs');
const path = require('path');

let filePath = '';
let data = null;

function blank() {
  return { version: 1, updatedAt: '', days: {}, apps: {}, controls: {}, sequences: {}, fileHints: {} };
}
function ensure() {
  if (data) return data;
  data = blank();
  try { if (filePath && fs.existsSync(filePath)) data = Object.assign(blank(), JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}); } catch (e) {}
  return data;
}
function dayKey(ts) { return new Date(ts || Date.now()).toISOString().slice(0, 10); }
function clean(s, n) { return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 100); }
function bump(obj, key, inc) { if (!key) return; obj[key] = (obj[key] || 0) + (inc || 1); }
function save() {
  if (!filePath || !data) return;
  try {
    data.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {}
}
function record(item) {
  const d = ensure();
  const day = dayKey(item && item.ts);
  const app = clean(item && item.app, 80) || '未知应用';
  const control = item && item.password ? '受保护输入框' : clean(item && item.control, 100);
  const title = clean(item && item.title, 100);
  if (!d.days[day]) d.days[day] = { events: 0, clicks: 0, apps: {}, firstAt: item.ts, lastAt: item.ts };
  const x = d.days[day]; x.events++; x.lastAt = item.ts || Date.now();
  if (item.kind === 'click') x.clicks++;
  bump(x.apps, app); bump(d.apps, app);
  if (control) bump(d.controls, app + ' · ' + control);
  const prev = x.lastApp || '';
  if (prev && prev !== app) bump(d.sequences, prev + ' → ' + app);
  x.lastApp = app;
  if (/\.(mp4|mov|mkv|avi|webm|m4v)$/i.test(title)) bump(d.fileHints, 'video');
  if (/\.(docx?|pdf|xlsx?|csv|pptx?)$/i.test(title)) bump(d.fileHints, 'document');
  // 保留最近 45 天的统计，避免文件无限增长。
  Object.keys(d.days).sort().slice(0, -45).forEach(function (k) { delete d.days[k]; });
  if ((x.events % 12) === 0) save();
}
function init(p) { filePath = p || ''; ensure(); }
function summary(days) {
  const d = ensure(); const keys = Object.keys(d.days).sort().slice(-(Number(days) || 7));
  const apps = Object.keys(d.apps).sort(function (a, b) { return d.apps[b] - d.apps[a]; }).slice(0, 20).map(function (k) { return { name: k, count: d.apps[k] }; });
  const sequences = Object.keys(d.sequences).sort(function (a, b) { return d.sequences[b] - d.sequences[a]; }).slice(0, 20).map(function (k) { return { path: k, count: d.sequences[k] }; });
  return { ok: true, days: keys.map(function (k) { return Object.assign({ day: k }, d.days[k]); }), apps: apps, sequences: sequences, fileHints: d.fileHints, updatedAt: d.updatedAt, path: filePath ? '[本机安全存储]' : '' };
}
module.exports = { init, record, save, summary };
