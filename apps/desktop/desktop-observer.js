// sally 桌面行为观察器（Windows）
// 默认只采集动作级上下文：活动窗口、焦点控件、可识别的鼠标点击。
// 不读取键盘字符、不读取剪贴板原文、不保存截图；密码控件和值字段自动脱敏。
const { spawn } = require('child_process');

let child = null;
let enabled = false;
let paused = false;
let buffer = '';
let last = null;
let listeners = [];

function safeText(s) {
  let x = String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  x = x.replace(/(?:password|passwd|pwd|验证码|校验码|token|secret|api[_ -]?key)\s*[:：=]?\s*[^ ]+/ig, '$1:[已隐藏]');
  x = x.replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[已隐藏]');
  x = x.replace(/\b\d{6,}\b/g, '[已隐藏]');
  return x.slice(0, 120);
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const app = safeText(raw.app);
  const title = safeText(raw.title);
  const control = safeText(raw.control);
  const kind = safeText(raw.kind || 'context');
  if (!app && !title && !control) return null;
  return {
    ts: Date.now(),
    kind,
    app: app || '未知应用',
    title: title || '',
    control: control || '',
    controlType: safeText(raw.controlType),
    automationId: safeText(raw.automationId),
    password: !!raw.password,
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : null,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : null
  };
}

function emit(raw) {
  if (!enabled || paused) return;
  const item = normalize(raw);
  if (!item) return;
  const sig = JSON.stringify([item.kind, item.app, item.title, item.control, item.controlType, item.automationId, item.x, item.y]);
  if (sig === last) return;
  last = sig;
  listeners.slice().forEach(function (fn) { try { fn(item); } catch (e) {} });
}

const PS = String.raw`
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Automation;
public static class SallyDesk {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  public static string WindowTitle() { var h=GetForegroundWindow(); var b=new StringBuilder(512); GetWindowText(h,b,b.Capacity); return b.ToString(); }
  public static string ProcessName() { try { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return System.Diagnostics.Process.GetProcessById((int)p).ProcessName; } catch { return ""; } }
  public static bool LeftDown() { return (GetAsyncKeyState(1) & 0x8000) != 0; }
  public static POINT Cursor() { POINT p; GetCursorPos(out p); return p; }
  public static string FocusJson() {
    try {
      var e=AutomationElement.FocusedElement; if(e==null) return "{}";
      var name=e.Current.Name; var aid=e.Current.AutomationId; var ct=e.Current.ControlType == null ? "" : e.Current.ControlType.ProgrammaticName;
      var pw=false; try { pw=(bool)e.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty); } catch {}
      return "{\"control\":" + Q(name) + ",\"automationId\":" + Q(aid) + ",\"controlType\":" + Q(ct) + ",\"password\":" + (pw ? "true" : "false") + "}";
    } catch { return "{}"; }
  }
  public static string PointJson(int x,int y) {
    try {
      var e=AutomationElement.FromPoint(new Point(x,y)); if(e==null) return "{}";
      var name=e.Current.Name; var aid=e.Current.AutomationId; var ct=e.Current.ControlType == null ? "" : e.Current.ControlType.ProgrammaticName;
      var pw=false; try { pw=(bool)e.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty); } catch {}
      return "{\"control\":" + Q(name) + ",\"automationId\":" + Q(aid) + ",\"controlType\":" + Q(ct) + ",\"password\":" + (pw ? "true" : "false") + "}";
    } catch { return "{}"; }
  }
  static string Q(string x) { if(x==null) x=""; return "\"" + x.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","").Replace("\n"," ") + "\""; }
}
"@ -ReferencedAssemblies UIAutomationClient,UIAutomationTypes,WindowsBase
$prevApp=''; $prevTitle=''; $prevFocus=''; $prevDown=$false
while ($true) {
  try {
    $app=[SallyDesk]::ProcessName(); $title=[SallyDesk]::WindowTitle(); $f=[SallyDesk]::FocusJson();
    if ($app -ne $prevApp -or $title -ne $prevTitle -or $f -ne $prevFocus) {
      $o=[ordered]@{kind='context';app=$app;title=$title}; $fo=$f | ConvertFrom-Json; if($fo){$o.control=$fo.control;$o.automationId=$fo.automationId;$o.controlType=$fo.controlType;$o.password=$fo.password}; $o | ConvertTo-Json -Compress; $prevApp=$app; $prevTitle=$title; $prevFocus=$f;
    }
    $down=[SallyDesk]::LeftDown(); if($down -and -not $prevDown){$p=[SallyDesk]::Cursor();$f=[SallyDesk]::PointJson($p.X,$p.Y);$fo=$f|ConvertFrom-Json;$o=[ordered]@{kind='click';app=$app;title=$title;x=$p.X;y=$p.Y};if($fo){$o.control=$fo.control;$o.automationId=$fo.automationId;$o.controlType=$fo.controlType;$o.password=$fo.password};$o|ConvertTo-Json -Compress};$prevDown=$down;
  } catch { }
  Start-Sleep -Milliseconds 420
}
`;

function start() {
  if (process.platform !== 'win32') return;
  if (child) return;
  enabled = true;
  child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', function (chunk) {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
    lines.forEach(function (line) { try { emit(JSON.parse(line)); } catch (e) {} });
  });
  child.on('error', function () { child = null; enabled = false; });
  child.on('exit', function () { child = null; enabled = false; });
}

function stop() {
  enabled = false;
  if (child) { try { child.kill(); } catch (e) {} child = null; }
  buffer = ''; last = null;
}

module.exports = {
  start,
  stop,
  pause: function (v) { paused = !!v; return paused; },
  isPaused: function () { return paused; },
  isRunning: function () { return !!child && enabled; },
  on: function (fn) { if (typeof fn === 'function') listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
};
