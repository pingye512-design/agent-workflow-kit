// RB小仁同学 桌面宠物 · Electron 主进程
// 特性：无边框透明 + 始终置顶 + 托盘菜单（桌面快捷方式只在托盘菜单里手动建，启动不再自动建）
//       + 自动版本升级（内容变了提醒并刷新页面；外壳升级一键自更新，不用反复下载）
const { app, BrowserWindow, screen, Tray, Menu, shell, nativeImage, dialog, ipcMain, globalShortcut, session, powerMonitor, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, exec, spawn } = require('child_process');
const desktopObserver = require('./desktop-observer');
const workflowMemory = require('./workflow-memory');
const config = require('./config');

const MY_VER = (function () { try { return require('./package.json').version || '0.0.0'; } catch (e) { return '0.0.0'; } })();
const BASE = (function () {
  const u = new URL(config.appUrl);
  u.searchParams.set('sally', 'client');
  u.searchParams.set('pet', '1');
  u.searchParams.set('v', MY_VER);
  return u.toString();
})();
const VERSION_URL = config.versionUrl;
const ZIP_URL = config.updateZipUrl;
const ICON_PNG = path.join(__dirname, 'icon.png');
const ICON_ICO = path.join(__dirname, 'icon.ico');
// 站内窗口：公司系统那几页在桌面端直接开窗（可拖到桌面任意位置、共用登录态），不再跳浏览器。
// 单独成文件 + try/catch —— 这个文件坏了宠物照常用，只是退回"用浏览器打开"。
let INNER = null;
try { INNER = require('./inner-window.js'); }
catch (e) { try { console.log('[sally] inner-window not loaded: ' + e.message); } catch (x) {} }

let win = null;
let tray = null;
let quitting = false;
let lastContent = '';
let updateTimer = null;
let expanded = false;      // false = 只显示"人"（立在桌面）；true = 展开聊天
let wanderOn = true;       // 桌面漫游
let wanderBusy = false;
let savedBounds = null;    // 全屏前的窗口位置/尺寸（退出全屏时还原）
let desktopWatchOn = true;
const SIZE_PET = { w: 120, h: 268 };     // 收起态：顶部按钮行 + 互动条 + 角色（互动条不再压在角色身上）
const SIZE_CHAT = { w: 400, h: 640 };    // 展开态：聊天

function createWindow() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: SIZE_PET.w, height: SIZE_PET.h,
    x: Math.max(0, area.width - SIZE_PET.w - 40),
    y: Math.max(0, area.height - SIZE_PET.h - 40),
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    // 🔴🔴 2026-09-19 修正（1.7.0 那版 thickFrame:false 是错的，sally 反馈"背景更大更黑"就是它造成的）：
    //    ① thickFrame 必须保持默认 true。设成 false 会让 Windows 放弃 DWM 逐像素 alpha，
    //       整个窗口退化成"不透明黑底" —— 于是桌面上的灵宠后面出现一块又大又黑的面板。
    //       （Electron 官方 issue #40456 也说明：透明窗下 thickFrame 本就不生效，不该去动它）
    //    ② 真正决定"有没有那圈线框"的是 resizable：Electron 只在可缩放时才加 WS_THICKFRAME。
    //       官方文档明确写："透明窗口不可调整大小；设 resizable:true 可能让透明窗在某些平台停止工作"。
    //       所以 resizable:false → 没有 WM_SIZEBOX → 没有 WS_THICKFRAME → 无边框 + 透明正常，一次解决两个问题。
    //    ③ 程序内改尺寸完全不受影响：收起/展开/全屏/漫游都走 setBounds()，它和 resizable 无关。
    resizable: false, maximizable: false, fullscreenable: true,
    // 🔴 minWidth/minHeight 必须 ≤ SIZE_PET！否则 setBounds 会被 Electron 强制撑大，
    //    窗口一旦比角色大，贴在窗口角上的按钮就和角色"分家"了（实测踩过：132×226 被撑成 200×300）
    minWidth: 96, minHeight: 160,
    alwaysOnTop: true, title: 'RB小仁同学', icon: ICON_ICO,
    webPreferences: { contextIsolation: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(BASE);
  // window.open / target=_blank：站内页面开"站内窗口"，站外一律丢给系统浏览器。
  // （以前全丢浏览器，于是点「排班/考勤」会跳出一个带地址栏的网页——正是反馈的那个问题）
  try {
    win.webContents.setWindowOpenHandler(function (arg) {
      const u = String((arg && arg.url) || '');
      try {
        if (INNER && INNER.isInternal(u)) { INNER.open(win, u, ICON_ICO); return { action: 'deny' }; }
      } catch (e) {}
      try { shell.openExternal(u); } catch (e) {}
      return { action: 'deny' };
    });
  } catch (e) {}
  win.webContents.on('did-finish-load', function(){
    try {
      if (new URL(win.webContents.getURL()).origin === config.appOrigin) {
        win.webContents.executeJavaScript(require('fs').readFileSync(path.join(__dirname,'ui-brand.js'),'utf8')).catch(function(){});
      }
    } catch (e) {}
  });
  win.on('closed', () => { win = null; });
  // 页面加载完把当前"主人在不在"的状态同步过去（比如启动时就已经锁屏了）
  win.webContents.on('did-finish-load', function () {
    try { win.webContents.executeJavaScript('window.__sallyAwaySet && window.__sallyAwaySet(' + (awayNow ? 'true' : 'false') + ')').catch(function () {}); } catch (e) {}
  });
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (win) win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="background:#0f1730;color:#e6ecff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
      '<div><div style="font-size:40px">🎐</div><div style="margin-top:10px">连不上服务器</div>' +
      '<div style="font-size:12px;color:#9db0e6;margin-top:8px">请检查网络后重启 RB小仁同学</div></div></body>'));
  });
}

// 展开/收起：窗口跟着变大变小（保持右下角锚点）
function applySize(isExp) {
  expanded = !!isExp;
  if (!win || win.isDestroyed()) return;
  const s = expanded ? SIZE_CHAT : SIZE_PET;
  const b = win.getBounds();
  let a;
  try {
    a = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea;
  } catch (e) {
    const z = screen.getPrimaryDisplay().workAreaSize;
    a = { x: 0, y: 0, width: z.width, height: z.height };
  }
  // 保持"右下角"锚点，同时保证整窗落在当前屏幕内（换尺寸不会把角色挤出屏幕）
  let x = b.x + b.width - s.w, y = b.y + b.height - s.h;
  x = Math.max(a.x, Math.min(a.x + a.width - s.w, x));
  y = Math.max(a.y, Math.min(a.y + a.height - s.h, y));
  try { win.setBounds({ x: Math.round(x), y: Math.round(y), width: s.w, height: s.h }); } catch (e) {}
}

// 桌面漫游：收起态下偶尔自己溜达一小段（平滑移动）
// 桌面漫游：在**整个屏幕**范围内随机溜达（原来只在原位附近小范围挪，看着像没动）
function wander() {
  if (!wanderOn || expanded || wanderBusy || !win || win.isDestroyed()) return;
  const b = win.getBounds();
  let a;
  try { a = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea; }
  catch (e) { const z = screen.getPrimaryDisplay().workAreaSize; a = { x: 0, y: 0, width: z.width, height: z.height }; }
  const minX = a.x + 8, minY = a.y + 8;
  const maxX = Math.max(minX, a.x + a.width - b.width - 8);
  const maxY = Math.max(minY, a.y + a.height - b.height - 8);
  let nx, ny;
  if (Math.random() < 0.35) {
    // 小挪一步：像自己在原地活动一下
    nx = Math.max(minX, Math.min(maxX, b.x + (Math.random() * 220 - 110)));
    ny = Math.max(minY, Math.min(maxY, b.y + (Math.random() * 120 - 60)));
  } else {
    // 大范围溜达：整块桌面随机挑个落点
    nx = minX + Math.random() * (maxX - minX);
    ny = minY + Math.random() * (maxY - minY);
  }
  nx = Math.round(nx); ny = Math.round(ny);
  if (Math.abs(nx - b.x) < 14 && Math.abs(ny - b.y) < 14) return;
  wanderBusy = true;
  const sx = b.x, sy = b.y;
  const dist = Math.sqrt((nx - sx) * (nx - sx) + (ny - sy) * (ny - sy));
  // 距离越远帧数越多 → 速度大致恒定，不会"瞬移"
  const steps = Math.max(18, Math.min(96, Math.round(dist / 9)));
  setWalking(true);   // 让页面播放"动漫式走路"动画（上下颠 + 左右摆）
  let i = 0;
  const t = setInterval(function () {
    i++;
    if (i >= steps || !win || win.isDestroyed() || expanded) { clearInterval(t); wanderBusy = false; setWalking(false); return; }
    const e = i / steps;
    const ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
    try { win.setPosition(Math.round(sx + (nx - sx) * ease), Math.round(sy + (ny - sy) * ease)); } catch (x) {}
  }, 26);
}
// 告诉页面"在走路/停下了" → 播放或停止走路动画
function setWalking(on) {
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript('window.__sallyWalk && window.__sallyWalk(' + (on ? 'true' : 'false') + ')').catch(function () {});
    }
  } catch (e) {}
}
// ---------- 出场：像 QQ 宠物那样"从屏幕外走进来"，走到自己的位置再打招呼 ----------
function entranceWalk() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  let a;
  try { a = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea; }
  catch (e) { const z = screen.getPrimaryDisplay().workAreaSize; a = { x: 0, y: 0, width: z.width, height: z.height }; }
  const homeX = b.x, homeY = b.y;
  const fromLeft = homeX > (a.x + a.width / 2);          // 从离自己远的那一侧走进来
  const startX = fromLeft ? (a.x - b.width - 4) : (a.x + a.width + 4);
  const startY = Math.min(homeY, a.y + a.height - b.height - 8);
  try { win.setPosition(Math.round(startX), Math.round(startY)); } catch (e) { return; }
  const dist = Math.abs(homeX - startX);
  const steps = Math.max(26, Math.min(130, Math.round(dist / 12)));
  setWalking(true);
  let i = 0;
  const t = setInterval(function () {
    i++;
    if (i >= steps || !win || win.isDestroyed() || expanded) {
      clearInterval(t);
      try { win.setPosition(homeX, homeY); } catch (e) {}
      setWalking(false);
      setTimeout(function () {   // 站定后再"元气登场"打招呼
        try {
          if (win && !win.isDestroyed()) win.webContents.executeJavaScript('window.__sallyArrive && window.__sallyArrive()').catch(function () {});
        } catch (e) {}
      }, 320);
      return;
    }
    const e = i / steps;
    const ease = 1 - Math.pow(1 - e, 2);                 // 减速停下，像真的走到位
    try { win.setPosition(Math.round(startX + (homeX - startX) * ease), Math.round(startY + (homeY - startY) * ease)); } catch (x) {}
  }, 22);
}
// ---------- 主人是否离开（看家模式）----------
// 两条判据：① 系统空闲时长（超过 5 分钟没动键鼠）；② 锁屏 / 休眠事件（最准）
const AWAY_IDLE_SEC = 300;
let awayNow = false, awayTimer = null;
function pushAway(v) {
  const on = !!v;
  if (on === awayNow) return;
  awayNow = on;
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript('window.__sallyAwaySet && window.__sallyAwaySet(' + (on ? 'true' : 'false') + ')').catch(function () {});
    }
  } catch (e) {}
  try { if (tray) tray.setToolTip(on ? 'RB小仁同学 · 主人外出中（我在看家 🏠）' : 'RB小仁同学 · 点我显示/隐藏'); } catch (e) {}
  console.log('[sally] away=' + on);
}
function startAwayWatch() {
  awayTimer = setInterval(function () {
    let idle = 0;
    try { idle = powerMonitor.getSystemIdleTime(); } catch (e) { return; }
    pushAway(idle >= AWAY_IDLE_SEC);
  }, 20000);
  try {
    powerMonitor.on('lock-screen', function () { pushAway(true); });
    powerMonitor.on('unlock-screen', function () { pushAway(false); });
    powerMonitor.on('suspend', function () { pushAway(true); });
    powerMonitor.on('resume', function () { pushAway(false); });
  } catch (e) {}
}
// ---------- 打开本机软件（开始菜单查找 → 内置命令 → 协议） ----------
function findStartMenuApp(name) {
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs')
  ];
  const want = String(name || '').toLowerCase().replace(/\s+/g, '');
  const hits = [];
  function walk(dir, depth) {
    if (depth > 5 || hits.length > 40) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.(lnk|url|exe)$/i.test(e.name)) continue;
      const base = e.name.replace(/\.(lnk|url|exe)$/i, '');
      const flat = base.toLowerCase().replace(/\s+/g, '');
      if (flat === want) hits.unshift({ p: p, base: base });
      else if (flat.indexOf(want) >= 0 || want.indexOf(flat) >= 0) hits.push({ p: p, base: base });
    }
  }
  roots.forEach(function (r) { walk(r, 0); });
  return hits;
}
const BUILTIN = {
  notepad: 'notepad.exe', calc: 'calc.exe', mspaint: 'mspaint.exe',
  explorer: 'explorer.exe', taskmgr: 'taskmgr.exe', wt: 'wt.exe', cmd: 'cmd.exe'
};
function openApp(name, proto, builtin) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: '没说要打开什么' };
  // 1) 内置系统程序
  if (builtin && BUILTIN[builtin]) {
    try { spawn(BUILTIN[builtin], [], { detached: true, stdio: 'ignore' }).unref(); return { ok: true, how: 'builtin', name: n }; } catch (e) {}
    try { shell.openExternal('ms-' + builtin + ':'); return { ok: true, how: 'uri', name: n }; } catch (e) {}
  }
  // 2) 协议（微信/钉钉/飞书等，已装的会直接拉起）
  if (proto) {
    try { shell.openExternal(proto); return { ok: true, how: 'proto', name: n }; } catch (e) {}
  }
  // 3) 开始菜单找
  const hits = findStartMenuApp(n);
  if (hits.length) {
    shell.openPath(hits[0].p).then(function (err) {
      if (err) console.log('[sally] openPath err ' + err);
    });
    return { ok: true, how: 'startmenu', name: hits[0].base, path: hits[0].p };
  }
  // 4) 协议兜底再试一次
  if (proto) { try { shell.openExternal(proto); return { ok: true, how: 'proto2', name: n }; } catch (e) {} }
  return { ok: false, error: '没找到「' + n + '」，可能没装，或名字不一样（可以试试开始菜单里的全名）' };
}
ipcMain.handle('sally:open-app', function (e, arg) {
  try { return openApp(arg && arg.name, arg && arg.proto, arg && arg.builtin); }
  catch (err) { return { ok: false, error: String(err && err.message) }; }
});
// 站内窗口：客户端点侧边栏「公司系统」时走这里（不再 sallyPet.openUrl 丢浏览器）
ipcMain.handle('sally:open-inner', function (e, arg) {
  const u = String((arg && arg.url) || '');
  try {
    if (!INNER) { shell.openExternal(u); return { ok: true, external: true, fallback: 'no-inner-module' }; }
    return INNER.openOrExternal(win, u, ICON_ICO);
  } catch (err) {
    try { shell.openExternal(u); } catch (x) {}
    return { ok: false, error: String(err && err.message) };
  }
});
ipcMain.handle('sally:open-path', function (e, p) {
  try { return shell.openPath(String(p || '')).then(function (r) { return { ok: !r, error: r }; }); }
  catch (err) { return { ok: false, error: String(err && err.message) }; }
});
// ---------- 拖拽 / 粘贴进来的文件：读内容 ----------
// ⚠️ 路径用 preload 里的 webUtils.getPathForFile 同步取（File 不能过 IPC），这里只按路径读内容
ipcMain.handle('sally:file-read', function (e, arg) {
  const p = String((arg && arg.path) || '');
  if (!p) return { ok: false, error: 'no-path' };
  return new Promise(function (resolve) {
    fs.readFile(p, function (err, buf) {
      if (err) return resolve({ ok: false, error: String(err.message || err) });
      const name = path.basename(p);
      const ext = path.extname(p).toLowerCase();
      const isImg = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(ext);
      const isTxt = /\.(txt|csv|md|json|log|xml|html?|ya?ml)$/.test(ext);
      const out = { ok: true, name: name, path: p, size: buf.length };
      if (isImg) {
        const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
        out.kind = 'image'; out.dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
      } else if (isTxt) {
        out.kind = 'text'; out.text = buf.toString('utf8').slice(0, 20000);
      } else {
        // 其它类型（xlsx/pdf/docx…）不带内容，只带路径 —— 交给桌面指令去「打印/打开」
        out.kind = 'file';
      }
      resolve(out);
    });
  });
});
ipcMain.on('sally:expand', function (e, v) { applySize(v); });
// ---- 可靠的拖动：用屏幕光标位置移动窗口（比 -webkit-app-region 稳）----
let dragOff = null;
ipcMain.on('sally:drag-begin', function () {
  if (!win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint(), b = win.getBounds();
  dragOff = { dx: p.x - b.x, dy: p.y - b.y };
});
ipcMain.on('sally:drag-move', function () {
  if (!dragOff || !win || win.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  // 🔴 拖动越界保护：至少留 44px 在当前屏幕内，避免拖出去"拉不回来"
  let a = null;
  try { a = screen.getDisplayNearestPoint(p).workArea; } catch (e) { a = null; }
  let nx = p.x - dragOff.dx, ny = p.y - dragOff.dy;
  if (a) {
    const keep = 44;
    nx = Math.max(a.x - b.width + keep, Math.min(a.x + a.width - keep, nx));
    ny = Math.max(a.y, Math.min(a.y + a.height - keep, ny));
  }
  try { win.setPosition(nx, ny); } catch (e) {}
});
ipcMain.on('sally:drag-end', function () { dragOff = null; });
// ---- 隐藏 / 找回 ----
ipcMain.on('sally:hide', function () {
  if (!win || win.isDestroyed()) return;
  win.hide();
  if (tray) { try { tray.displayBalloon({ title: 'RB小仁同学', content: '我先躲起来啦～按 Ctrl+Alt+S 或点托盘图标就能把我叫回来 🎐' }); } catch (e) {} }
});
ipcMain.handle('sally:show', function () { if (win && !win.isDestroyed()) { win.show(); win.focus(); } return true; });
// ---- 给飞书某人发消息（本机 lark-cli）----
// 注意：Node 22 禁止无 shell 直接 spawn .cmd（EINVAL）；而 shell:true 又会把中文参数拆散。
// 所以自己拼引号 + exec 走 cmd.exe。已实测：内部同事 ✅，外部（跨租户）联系人会被飞书策略拒 230027。
const LARK_CLI = process.env.SALLY_LARK_CLI || path.join(process.env.USERPROFILE || '', '.workbuddy', 'binaries', 'node', 'versions', '22.22.2', 'lark-cli.cmd');
function larkQ(a) { return '"' + String(a).replace(/"/g, '""').replace(/%/g, '%%') + '"'; }
function larkRun(args, cb) {
  const line = '"' + LARK_CLI + '" ' + args.map(larkQ).join(' ');
  exec(line, { timeout: 40000, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, function (e, o, er) {
    let j = null;
    try { j = JSON.parse(String(o || '')); } catch (x) { try { j = JSON.parse(String(er || '')); } catch (y) {} }
    cb(e && !j ? e : null, j, String(o || ''), String(er || ''));
  });
}
// ---------- 负责人状态：从审批 + 日程算出当前是否在岗 ----------
// 数据源：本机 lark-cli（已授权 approval:instance:read）查「我发起的」审批单
// 输出：{ ok, status: in|leave|trip|out|meeting, text, until, days, dest }
const BOSS_CFG = {
  meetings: [{ day: 2, start: '14:00', end: '15:40', title: '周例会' }],   // 每周二 14:00~15:40（1 小时多，留点余量）
  kinds: [
    { type: 'leave', words: ['请假', '休假', '年假', '病假', '事假', '调休', '婚假', '产假', '陪产假', '丧假'] },
    { type: 'trip',  words: ['出差'] },
    { type: 'out',   words: ['外出', '公出', '拜访'] }
  ]
};
function cnToDate(s, isEnd) {
  // ⚠️ 时间部分必须是**可选**的！飞书真实数据常是「2026年09月19日 下午」这种只给半天、不带具体时刻的，
  //    写成必填 `(\d{1,2}):` 会导致整个正则匹配失败 → 所有"上午/下午"的单子都被忽略（实测踩过）
  const m = String(s || '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(上午|下午|中午)?\s*(?:(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  let hh, mm = 0;
  if (m[5]) { hh = +m[5]; mm = +(m[6] || 0); }
  else if (m[4] === '上午') hh = 9;
  else if (m[4] === '中午') hh = 12;
  else if (m[4] === '下午') hh = isEnd ? 18 : 14;
  else hh = isEnd ? 18 : 9;
  d.setHours(hh, mm, 0, 0);
  return d;
}
function bossKindOf(name) {
  const n = String(name || '');
  for (let i = 0; i < BOSS_CFG.kinds.length; i++) {
    const k = BOSS_CFG.kinds[i];
    for (let j = 0; j < k.words.length; j++) if (n.indexOf(k.words[j]) >= 0) return k.type;
  }
  return '';
}
function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
function fmtHM(d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function dayDiff(a, b) {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((y - x) / 86400000);
}
function bossCompute(instances, now) {
  now = now || new Date();
  // ① 例会优先（每周固定时段）
  for (let i = 0; i < BOSS_CFG.meetings.length; i++) {
    const m = BOSS_CFG.meetings[i];
    if (now.getDay() !== m.day) continue;
    const sp = String(m.start).split(':'), ep = String(m.end).split(':');
    const s = new Date(now); s.setHours(+sp[0], +(sp[1] || 0), 0, 0);
    const e = new Date(now); e.setHours(+ep[0], +(ep[1] || 0), 0, 0);
    if (now >= s && now <= e) {
      return { ok: true, status: 'meeting', title: m.title || '例会', until: fmtHM(e),
        text: '主人正在开' + (m.title || '例会') + '呢，大概 ' + fmtHM(e) + ' 结束～ 有事请留言，我记下来' };
    }
  }
  // ② 请假 / 出差 / 外出（只认「已通过」status===2）
  let hit = null;
  for (let i = 0; i < (instances || []).length; i++) {
    const it = instances[i];
    if (it.instance_status !== 2) continue;
    const kind = bossKindOf(it.definition_name);
    if (!kind) continue;
    const sums = {};
    (it.summaries || []).forEach(function (s) { sums[s.key] = s.value; });
    const s0 = cnToDate(sums['开始时间'] || sums['开始日期'], false);
    const e0 = cnToDate(sums['结束时间'] || sums['结束日期'], true);
    if (!s0 || !e0) continue;
    if (now >= s0 && now <= e0) {
      const rawDays = parseFloat(sums['时长'] || sums['外出时长'] || sums['请假时长'] || 0);
      hit = { kind: kind, start: s0, end: e0, days: rawDays, dest: sums['目的地'] || '', reason: sums['外出事由'] || sums['请假事由'] || sums['出差事由'] || '' };
      break;
    }
  }
  if (!hit) return { ok: true, status: 'in', text: '' };
  const backToday = dayDiff(now, hit.end) === 0;
  const backTomorrow = dayDiff(now, hit.end) === 1;
  const left = Math.max(1, dayDiff(now, hit.end) + 1);              // 含今天还剩几天
  const total = hit.days > 0 ? hit.days : left;                     // 审批单上填的总天数
  let text = '';
  if (hit.kind === 'leave') {
    if (backToday) text = '主人今天请假了，晚一点才回来哦～ 有事跟我说，我帮你记下来';
    else if (backTomorrow) text = '主人今天请假了，明天才会回来哦～ 有事跟我说，我帮你记下来';
    else text = '主人请假 ' + total + ' 天（到 ' + fmtMD(hit.end) + '），有事跟我说，我帮你记下来';
  } else if (hit.kind === 'trip') {
    const d = hit.dest ? String(hit.dest).split('/').filter(Boolean).pop() : '';
    text = '主人出差中' + (d ? ('（' + d + '）') : '') + (total > 1 ? ('，共 ' + total + ' 天') : '') +
           '，' + fmtMD(hit.end) + ' 回来～ 有事跟我说，我帮你转达';
  } else {
    text = '主人外出了' + (hit.reason ? ('（' + hit.reason + '）') : '') + '，大概 ' + fmtHM(hit.end) + ' 回来哦～';
  }
  return { ok: true, status: hit.kind, kind: hit.kind, days: left, until: fmtMD(hit.end), dest: hit.dest, text: text };
}
function fetchBossStatus(cb) {
  larkRun(['approval', 'instances', 'initiated', '--page-size', '50', '--json'], function (err, j) {
    if (err || !j || !j.data || !j.data.instances) {
      return cb({ ok: false, status: 'unknown', text: '', error: (err && err.message) || '读不到审批数据' });
    }
    try { cb(bossCompute(j.data.instances, new Date())); }
    catch (e) { cb({ ok: false, status: 'unknown', text: '', error: String(e && e.message) }); }
  });
}
let bossCache = { at: 0, data: null };
ipcMain.handle('sally:boss-status', function (e, arg) {
  const force = !!(arg && arg.force);
  const ttl = 10 * 60 * 1000;   // 10 分钟内用缓存，别一直打飞书接口
  if (!force && bossCache.data && (Date.now() - bossCache.at) < ttl) return Promise.resolve(bossCache.data);
  return new Promise(function (resolve) {
    fetchBossStatus(function (r) { bossCache = { at: Date.now(), data: r }; resolve(r); });
  });
});
// ---- 给微信好友发消息（GUI 自动化：剪贴板 + 模拟按键；中文必须走剪贴板）----
ipcMain.handle('sally:wechat-send', function (e, arg) {
  const name = String((arg && arg.to) || '').trim();
  const text = String((arg && arg.text) || '').trim();
  if (!name || !text) return { ok: false, error: '缺少收件人或内容' };
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$ws = New-Object -ComObject WScript.Shell',
    'function Act($t){ for($i=0;$i -lt 12;$i++){ if($ws.AppActivate($t)){ return $true }; Start-Sleep -Milliseconds 400 }; return $false }',
    '$ok = (Act "微信") -or (Act "WeChat")',
    'if(-not $ok){ Start-Process "weixin://"; Start-Sleep -Seconds 6; $ok = (Act "微信") -or (Act "WeChat") }',
    'if(-not $ok){ Write-Output "NO_WINDOW"; exit 3 }',
    'Start-Sleep -Milliseconds 700',
    '[System.Windows.Forms.SendKeys]::SendWait("^f")',
    'Start-Sleep -Milliseconds 600',
    'Set-Clipboard -Value $env:SALLY_NAME',
    'Start-Sleep -Milliseconds 250',
    '[System.Windows.Forms.SendKeys]::SendWait("^v")',
    'Start-Sleep -Milliseconds 1400',
    '[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
    'Start-Sleep -Milliseconds 1000',
    'Set-Clipboard -Value $env:SALLY_TEXT',
    'Start-Sleep -Milliseconds 250',
    '[System.Windows.Forms.SendKeys]::SendWait("^v")',
    'Start-Sleep -Milliseconds 500',
    '[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")',
    'Write-Output "OK"'
  ].join('\r\n');
  return new Promise(function (resolve) {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      timeout: 90000, windowsHide: true,
      env: Object.assign({}, process.env, { SALLY_NAME: name, SALLY_TEXT: text })
    }, function (err, out) {
      const o = String(out || '');
      if (o.indexOf('OK') >= 0) return resolve({ ok: true, name: name });
      if (o.indexOf('NO_WINDOW') >= 0) return resolve({ ok: false, error: '没找到微信窗口，请先登录微信（桌面版）' });
      resolve({ ok: false, error: (err && String(err.message).slice(0, 120)) || '微信发送失败（可能没登录，或窗口标题不是「微信」）' });
    });
  });
});
// ---- 平台绑定：飞书授权（用本机 lark-cli，token 落在自己的用户目录，互不干扰）----
const LARK_SCOPES = 'contact:user:search im:message im:message.send_as_user im:message.p2p_msg:get_as_user im:message.group_msg:get_as_user im:chat:read approval:instance:read approval:instance:write approval:task:read approval:task:write';
// ---- 第二身份（管理员账号）：小仁自己直连飞书 OAuth ----
// lark-cli 一个 app 只能挂一个登录用户，所以第二个账号只能走这条路。
// 懒加载 + try/catch：模块坏了只丢"第二身份"，主身份照常用。
let LARK2 = null;
function lark2() {
  if (LARK2) return LARK2;
  try {
    const make = require('./lark-oauth.js');
    LARK2 = make({
      dir: app.getPath('userData'),
      scopes: LARK_SCOPES,
      safeStorage: safeStorage,
      log: function (m) { try { console.log('[lark2] ' + m); } catch (e) {} }
    });
  } catch (e) { try { console.log('[lark2] init failed: ' + e.message); } catch (x) {} }
  return LARK2;
}
ipcMain.handle('sally:lark-status', function () {
  return new Promise(function (resolve) {
    larkRun(['auth', 'status', '--json'], function (err, j, out, er) {
      if (j && j.identities) {
        const u = j.identities.user || {};
        resolve({ ok: true, installed: true, ready: u.status === 'ready', name: u.userName || '', open_id: u.openId || '', scope: u.scope || '' });
      } else if (/not found|ENOENT|不是内部或外部命令/i.test(String(er) + String(err && err.message))) {
        resolve({ ok: false, installed: false, error: '本机没装 lark-cli' });
      } else {
        resolve({ ok: false, installed: true, ready: false, error: String(er || (err && err.message) || '').slice(0, 160) });
      }
    });
  });
});
ipcMain.handle('sally:lark-auth-start', function () {
  return new Promise(function (resolve) {
    larkRun(['auth', 'login', '--scope', LARK_SCOPES, '--no-wait', '--json'], function (err, j, out, er) {
      if (j && j.verification_url) resolve({ ok: true, url: j.verification_url, device_code: j.device_code || '' });
      else resolve({ ok: false, error: String(er || (err && err.message) || '启动授权失败').slice(0, 200) });
    });
  });
});
ipcMain.handle('sally:lark-auth-finish', function (e, arg) {
  const code = String((arg && arg.device_code) || '').trim();
  if (!code) return { ok: false, error: '缺 device_code' };
  return new Promise(function (resolve) {
    larkRun(['auth', 'login', '--device-code', code], function (err, j, out, er) {
      if (j && j.ok) resolve({ ok: true });
      else resolve({ ok: false, error: String(er || (err && error0(err)) || '授权未完成').slice(0, 200) });
    });
  });
});
// 第二身份（管理员账号）的绑定/解绑/切换。前端每 5 秒 poll 一次，不阻塞主进程。
ipcMain.handle('sally:lark2-status', function () {
  const m = lark2();
  return m ? m.status() : { ok: false, error: '第二身份模块没加载' };
});
ipcMain.handle('sally:lark2-bind-start', function () {
  const m = lark2();
  return m ? m.start() : Promise.resolve({ ok: false, error: '第二身份模块没加载' });
});
ipcMain.handle('sally:lark2-bind-poll', function (e, arg) {
  const m = lark2();
  if (!m) return Promise.resolve({ ok: false, error: '第二身份模块没加载' });
  return m.poll(arg && arg.device_code);
});
ipcMain.handle('sally:lark2-unbind', function () {
  const m = lark2();
  return m ? m.unbind() : { ok: false };
});
ipcMain.handle('sally:lark2-default', function (e, arg) {
  const m = lark2();
  return m ? m.setDefault(String((arg && arg.account) || 'a')) : { ok: false };
});

// ---- 第三身份：Lark 国际版（海外运营号）----
// 飞书国内版（open.feishu.cn）和 Lark 国际版（open.larksuite.com）是两套独立后台，
// 应用凭证、租户、open_id 全都不通用，所以必须单独占一个身份位。
// 这里不再自己写 device flow（lark-oauth.js 那套是绑死 feishu.cn 的），而是让 lark-cli 开第二个
// profile（--brand lark）：scope 校验、refresh_token、多域（im/approval/calendar）都由它管，
// 发送时只要多带一个 --profile，行为和主身份完全一致。
const INTL_PROFILE = 'lark-intl';
// 全套：消息 + 审批 + 日程。国际版若没开放其中某个 scope，start 会自动回退成按域申请。
const INTL_SCOPES = 'im:message im:message.send_as_user im:message.p2p_msg:get_as_user im:message.group_msg:get_as_user im:chat:read contact:user:search approval:instance:read approval:instance:write approval:task:read approval:task:write calendar:calendar';
function intlRun(args, cb) { larkRun(['--profile', INTL_PROFILE].concat(args), cb); }
// 把 lark-cli 的原始报错翻成用户看得懂的一句话（页面直接显示）
function humanLark(t) {
  const s = String(t || '');
  if (/each profile must have a unique app-id/i.test(s)) return '这个 App ID 已经挂在别的 profile 上了（一个应用只能绑一个 profile）。先在本卡片解绑，或换一个应用。';
  if (/does not exist|app not found|invalid_c?l?ient|invalid app/i.test(s)) return 'Lark 那边不认识这个 App ID：确认它是在 open.larksuite.com（国际版）建的，不是飞书国内版 open.feishu.cn。';
  if (/app_?secret|secret is invalid|client secret/i.test(s)) return 'App Secret 不对或已被重置，去 Lark 后台「凭证与基础信息」重新复制一次。';
  if (/scope|permission/i.test(s)) return '应用没开通需要的权限：Lark 后台「权限管理」里加上消息/审批/日程权限，再创建并发布新版本。';
  const line = s.split(/[\r\n]/).filter(function (x) { return x && x.replace(/\s/g, ''); })[0] || s;
  return line.replace(/^❌\s*/, '').slice(0, 160);
}
// 「用哪个身份办事」：a=工作号（主身份）· b=飞书管理员号 · c=Lark 国际版运营号
const IDENTITY_FILE = path.join(app.getPath('userData'), 'identity.json');
let IDENTITY = null;
function identityGet() {
  if (IDENTITY) return IDENTITY;
  try {
    const j = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
    if (j && j.current) IDENTITY = { current: String(j.current) };
  } catch (e) {}
  if (!IDENTITY || ['a', 'b', 'c'].indexOf(IDENTITY.current) < 0) {
    // 老用户没有 identity.json：从 lark-oauth 的旧状态推断，别把人家已选的第二身份弄丢
    let seed = 'a';
    try {
      const s = (lark2() || {}).status ? lark2().status() : null;
      if (s && s.current === 'b' && s.bound) seed = 'b';
    } catch (e) {}
    IDENTITY = { current: seed };
  }
  return IDENTITY;
}
function identitySet(which) {
  const w = ['a', 'b', 'c'].indexOf(String(which)) >= 0 ? String(which) : 'a';
  IDENTITY = { current: w };
  try { fs.writeFileSync(IDENTITY_FILE, JSON.stringify(IDENTITY), 'utf8'); } catch (e) {}
  return IDENTITY;
}
function intlProfile(cb) {
  // 注意：profile list 没有 --json 开关，它默认就吐 JSON（加了会被拒：unknown flag）
  larkRun(['profile', 'list'], function (e, list) {
    const arr = Array.isArray(list) ? list : ((list && list.profiles) || []);
    const p = arr.filter(function (x) { return x && String(x.name) === INTL_PROFILE; })[0] || null;
    cb(p);
  });
}
// 立刻用这个 profile 问一次「我是谁」，避免 auth status 缓存骗人
function intlWho(cb) {
  intlRun(['auth', 'status', '--json'], function (e, j) {
    const u = (j && j.identities && j.identities.user) || {};
    cb(u.userName ? { name: String(u.userName), open_id: u.openId || '', scope: String(u.scope || '') } : null);
  });
}
ipcMain.handle('sally:lark3-status', function () {
  return new Promise(function (resolve) {
    intlProfile(function (p) {
      const cur = identityGet().current;
      if (!p) return resolve({ ok: true, exists: false, configured: false, bound: false, current: cur });
      intlWho(function (u) {
        resolve({
          ok: true, exists: true, configured: true, bound: !!u, brand: 'lark',
          app_id: p.appId || p.app_id || '', name: (u && u.name) || '', open_id: (u && u.open_id) || '',
          scope: (u && u.scope) || '', current: cur
        });
      });
    });
  });
});
// 存应用凭证：只走 stdin，不进命令行参数、不落明文 JSON（lark-cli 自己存 keychain）
ipcMain.handle('sally:lark3-setup', function (e, arg) {
  const appId = String((arg && arg.appId) || '').trim();
  const sec = String((arg && arg.appSecret) || '').trim();
  if (!/^cli_[A-Za-z0-9]{6,}$/.test(appId)) return Promise.resolve({ ok: false, error: 'App ID 一般是 cli_ 开头的一串，请从 Lark 后台「凭证与基础信息」复制' });
  if (sec.length < 10) return Promise.resolve({ ok: false, error: 'App Secret 看起来不对（太短），同样在「凭证与基础信息」里点显示后复制' });
  return new Promise(function (resolve) {
    const add = function () {
      const args = ['profile', 'add', '--name', INTL_PROFILE, '--brand', 'lark', '--app-id', appId, '--app-secret-stdin'];
      const line = '"' + LARK_CLI + '" ' + args.map(larkQ).join(' ');
      let ch = null;
      try {
        ch = exec(line, { timeout: 60000, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, function (err, o, er) {
          const txt = String(o || '') + String(er || '');
          if (/OK: Profile/.test(txt)) return resolve({ ok: true, app_id: appId });
          resolve({ ok: false, error: humanLark(txt) || '保存失败' });
        });
      } catch (x) { return resolve({ ok: false, error: String(x && x.message) }); }
      try { ch.stdin.write(sec + '\n'); ch.stdin.end(); } catch (x) {}
    };
    intlProfile(function (p) {
      if (!p) return add();
      if (String(p.appId || p.app_id || '') === appId) return resolve({ ok: true, app_id: appId, unchanged: true });
      // 换应用：同名 profile 还挂着旧 app-id 时 lark-cli 会拒（app-id 必须唯一），先删再建
      larkRun(['profile', 'remove', INTL_PROFILE], function () { add(); });
    });
  });
});
ipcMain.handle('sally:lark3-bind-start', function () {
  return new Promise(function (resolve) {
    intlProfile(function (p) {
      if (!p) return resolve({ ok: false, needs_cred: true, error: '还没有 Lark 国际版应用凭证：先把 App ID / App Secret 填进来保存' });
      const go = function (mode, cb) {
        const args = ['auth', 'login', '--no-wait', '--json'];
        if (mode === 'scope') args.push('--scope', INTL_SCOPES);
        else if (mode === 'domain') args.push('--domain', 'im,contact,approval,calendar');
        else args.push('--domain', 'im,contact');
        intlRun(args, function (e, j, o, er) {
          const msg = String((j && j.error && j.error.message) || er || (e && e.message) || '');
          if (j && j.verification_url) return cb({ ok: true, url: j.verification_url, device_code: j.device_code || '', mode: mode });
          cb({ ok: false, error: humanLark(msg) || '没拿到授权码', raw: msg.slice(0, 300) });
        });
      };
      const isScopeErr = function (r) { return /scope|permission|权限/i.test(String(r.raw || '') + String(r.error || '')); };
      // 三级降级：全套 scope → 按域（四域）→ 只留 im+contact。
      // 国际版对高级权限（日历/审批写）可能要求应用审核，拿不到就别卡死整个绑定。
      go('scope', function (r1) {
        if (r1.ok) return resolve(r1);
        if (!isScopeErr(r1)) return resolve(r1);
        go('domain', function (r2) {
          if (r2.ok) return resolve(r2);
          if (!isScopeErr(r2)) return resolve(r2);
          go('core', function (r3) {
            if (r3.ok) { r3.downgraded = true; return resolve(r3); }
            resolve(r3);
          });
        });
      });
    });
  });
});
ipcMain.handle('sally:lark3-bind-finish', function (e, arg) {
  const code = String((arg && arg.device_code) || '').trim();
  if (!code) return Promise.resolve({ ok: false, error: '缺 device_code' });
  return new Promise(function (resolve) {
    intlRun(['auth', 'login', '--device-code', code], function (err, j, o, er) {
      const txt = String(er || o || (j && j.error && j.error.message) || (err && err.message) || '');
      if (j && j.ok) {
        return intlWho(function (u) {
          if (u) { identitySet('c'); return resolve({ ok: true, name: u.name, open_id: u.open_id, scope: u.scope || '' }); }
          resolve({ ok: true });
        });
      }
      resolve({ ok: false, error: humanLark(txt) || '授权没完成' });
    });
  });
});
ipcMain.handle('sally:lark3-unbind', function () {
  return new Promise(function (resolve) {
    larkRun(['profile', 'remove', INTL_PROFILE], function () {
      if (identityGet().current === 'c') identitySet('a');
      resolve({ ok: true, current: identityGet().current });
    });
  });
});
ipcMain.handle('sally:identity-default', function (e, arg) {
  const want = ['a', 'b', 'c'].indexOf(String((arg && arg.account) || 'a')) >= 0 ? String((arg && arg.account) || 'a') : 'a';
  if (want === 'b') {
    const m = lark2();
    const s = m ? m.status() : null;
    if (!(s && s.bound)) return { ok: false, current: identityGet().current, error: '飞书管理员号还没绑定' };
    return { ok: true, current: identitySet('b').current };
  }
  if (want === 'c') {
    return new Promise(function (resolve) {
      intlProfile(function (p) {
        if (!p) return resolve({ ok: false, current: identityGet().current, error: 'Lark 国际版还没绑定' });
        intlWho(function (u) {
          if (!u) return resolve({ ok: false, current: identityGet().current, error: 'Lark 国际版授权已失效，重新扫码' });
          resolve({ ok: true, current: identitySet('c').current });
        });
      });
    });
  }
  return { ok: true, current: identitySet('a').current };
});
ipcMain.handle('sally:pending-approvals', function () {
  // 审批跟着当前身份走：国际版运营号查的是海外租户的待办，别拿国内租户的去凑数
  return new Promise(function (resolve) {
    const args = ['approval', 'tasks', 'query', '--topic', '1', '--json'];
    const run = identityGet().current === 'c' ? function (cb) { intlRun(args, cb); } : function (cb) { larkRun(args, cb); };
    run(function (err, j) {
      if (err || !j || !j.data) {
        return resolve({ ok: false, count: 0, tasks: [] });
      }
      resolve({ ok: true, count: j.data.count || 0, tasks: j.data.tasks || [] });
    });
  });
});
// 「我是谁」——启动时确认本机绑定的是哪个身份（扫了哪个平台就记哪个）
ipcMain.handle('sally:whoami', function () {
  const cur = identityGet().current;
  // 第三身份：Lark 国际版（海外运营号）
  if (cur === 'c') {
    return new Promise(function (resolve) {
      intlWho(function (u) {
        if (u) return resolve({ ok: true, name: u.name, openId: u.open_id || '', platform: 'lark', third: true });
        // 授权废了就别装：退回主身份，页面会重新引导绑定
        identitySet('a');
        resolve({ ok: false, platform: 'lark', fallback: 'a' });
      });
    });
  }
  // 第二身份：飞书管理员账号
  const m2 = lark2();
  if (cur === 'b' && m2) {
    try {
      const s2 = m2.status();
      if (s2 && s2.bound && s2.name) {
        return { ok: true, name: s2.name, openId: s2.open_id || '', platform: 'feishu', second: true };
      }
    } catch (e) {}
  }
  return new Promise(function (resolve) {
    larkRun(['auth', 'status', '--json'], function (err, j) {
      try {
        const u = j && j.identities && j.identities.user;
        if (u && u.available && u.userName) {
          return resolve({ ok: true, name: String(u.userName), openId: u.openId || '', platform: j.brand || 'feishu' });
        }
        resolve({ ok: false, platform: (j && j.brand) || 'feishu' });
      } catch (e) { resolve({ ok: false }); }
    });
  });
});
function error0(e) { return e && e.message; }
// 用 lark-cli 发消息的公共实现：prefix 决定用哪个 profile（[] = 主身份，['--profile','lark-intl'] = 国际版）
function sendViaCli(prefix, to, chatId, text, done) {
  const P = function (a) { return prefix.concat(a); };
  // 🔴 直接发到某个群（用她本人的身份）—— 群自定义机器人被停用也能发，不需要任何机器人权限
  if (chatId) {
    return larkRun(P(['im', '+messages-send', '--chat-id', chatId, '--content', JSON.stringify({ text: text }), '--msg-type', 'text', '--as', 'user']), function (e0, j0) {
      if (j0 && j0.ok) return done({ ok: true, name: chatId, chat: true });
      done({ ok: false, error: (j0 && j0.error && j0.error.message) || (e0 && e0.message) || '群发送失败' });
    });
  }
  larkRun(P(['contact', '+search-user', '--query', to, '--as', 'user']), function (err, j) {
    const us = (j && j.data && j.data.users) || [];
    if (!us.length) return done({ ok: false, error: '没找到「' + to + '」' });
    const u = us[0];
    const args = ['im', '+messages-send'];
    if (u.p2p_chat_id) args.push('--chat-id', u.p2p_chat_id); else args.push('--user-id', u.open_id);
    args.push('--text', text, '--as', 'user');
    larkRun(P(args), function (e2, j2) {
      if (j2 && j2.ok) return done({ ok: true, name: u.localized_name || to });
      const code = j2 && j2.error && j2.error.code;
      const cross = u.is_cross_tenant;
      let msg = (j2 && j2.error && j2.error.message) || (e2 && e2.message) || '未知错误';
      if (code === 230027 && cross) msg = '「' + (u.localized_name || to) + '」是外部联系人（跨公司），飞书租户策略不允许机器人代发消息。内部同事可以正常发。';
      done({ ok: false, error: msg, cross_tenant: !!cross });
    });
  });
}
// ---------- 按名字找飞书联系人：多变体 + 候选（2026-10-26） ----------
// 用户说「管理员（示例用户）」，通讯录里是「示例用户A」时，需先拆出候选名字。
// 这里把名字归一后按变体逐个查，唯一命中直接发，有歧义把候选交回前端让她点。
const LarkName = (function () { try { return require('./lark-name.js'); } catch (e) { return null; } })();

function larkSearchUser(query, cb) {
  larkRun(['contact', '+search-user', '--query', query, '--as', 'user'], function (err, j) {
    cb((j && j.data && j.data.users) || []);
  });
}

function larkResolveUser(raw, cb) {
  const src = String(raw || '').trim();
  let vs = [src];
  try { if (LarkName) vs = LarkName.variants(src) || [src]; } catch (e) { vs = [src]; }
  vs = vs.filter(Boolean).slice(0, 4);
  if (!vs.length) { cb({ user: null, candidates: [], tried: [] }); return; }

  const tried = [];
  const bag = {};
  let i = 0;

  function decide() {
    const users = Object.keys(bag).map(function (k) { return bag[k]; });
    let out;
    try { out = LarkName ? LarkName.choose(vs, users) : { user: users[0] || null, candidates: [] }; }
    catch (e) { out = { user: users[0] || null, candidates: [] }; }
    out.tried = tried;
    cb(out);
  }

  (function step() {
    if (i >= vs.length) return decide();
    const q = vs[i++];
    if (!q || tried.indexOf(q) >= 0) return step();
    tried.push(q);
    larkSearchUser(q, function (users) {
      users.forEach(function (u) {
        const id = (LarkName && LarkName.idOf(u)) || u.open_id || u.name;
        if (id && !bag[id]) bag[id] = u;
      });
      // 已经查到"完全同名"就不必再换词查了
      let hit = null;
      try {
        if (LarkName) hit = LarkName.choose(vs, Object.keys(bag).map(function (k) { return bag[k]; }));
      } catch (e) { hit = null; }
      if (hit && hit.user && hit.user.score === 1) return decide();
      step();
    });
  })();
}

function larkPicks(r) {
  return {
    needPick: true,
    tried: (r && r.tried) || [],
    candidates: ((r && r.candidates) || []).map(function (c) {
      return { name: c.name, open_id: c.open_id, dept: c.dept || '' };
    })
  };
}

function error0(e) { return e && e.message; }
ipcMain.handle('sally:lark-send', function (e, arg) {
  const to = String((arg && arg.to) || '').trim();
  const openId = String((arg && arg.openId) || '').trim();
  const chatId = String((arg && arg.chatId) || '').trim();
  const text = String((arg && arg.text) || '').trim();
  if ((!to && !chatId && !openId) || !text) return { ok: false, error: '缺少收件人或内容' };

  // 当前默认身份 = 第二身份（管理员账号）→ 用那套 user_access_token 发。
  const m2 = lark2();
  if (m2 && m2.isB()) {
    const finish2 = function (r, name) {
      if (r && r.ok) return { ok: true, name: name || to || openId || chatId, second: true };
      return r || { ok: false, error: '发送失败' };
    };
    if (chatId) {
      return m2.send({ chatId: chatId, text: text }, null).then(function (r) {
        return finish2(r, chatId);
      });
    }
    if (openId) {
      return m2.send({ to: openId, text: text }, null).then(function (r) {
        return finish2(r, to || openId);
      });
    }
    return new Promise(function (resolve) {
      larkResolveUser(to, function (rr) {
        if (!rr.user) {
          resolve(Object.assign({ ok: false, error: '没找到「' + to + '」' }, larkPicks(rr)));
          return;
        }
        // 把已解析到的 open_id 直接交给 send，不再让它自己猜一遍
        m2.send({ to: rr.user.name || rr.user.open_id, text: text }, function () {
          return { open_id: rr.user.open_id, name: rr.user.name };
        }).then(function (r) {
          const out = finish2(r, rr.user.name);
          if (rr.user.name && rr.user.name !== to) out.resolved = rr.user.name;
          resolve(out);
        });
      });
    });
  }

  return new Promise(function (resolve) {
    // 直接发到某个群（用她本人的身份）
    if (chatId) {
      return larkRun(['im', '+messages-send', '--chat-id', chatId, '--content', JSON.stringify({ text: text }), '--msg-type', 'text', '--as', 'user'], function (e0, j0) {
        if (j0 && j0.ok) return resolve({ ok: true, name: chatId, chat: true });
        resolve({ ok: false, error: (j0 && j0.error && j0.error.message) || (e0 && e0.message) || '群发送失败' });
      });
    }

    const deliver = function (u) {
      const nm = u.localized_name || u.name || to || openId;
      const args = ['im', '+messages-send'];
      if (u.p2p_chat_id) args.push('--chat-id', u.p2p_chat_id);
      else args.push('--user-id', u.open_id || openId);
      args.push('--text', text, '--as', 'user');
      larkRun(args, function (e2, j2) {
        if (j2 && j2.ok) {
          const okOut = { ok: true, name: nm };
          if (nm !== to) okOut.resolved = nm;
          return resolve(okOut);
        }
        const code = j2 && j2.error && j2.error.code;
        const cross = u.is_cross_tenant;
        let msg = (j2 && j2.error && j2.error.message) || (e2 && e2.message) || '未知错误';
        if (code === 230027 && cross) msg = '「' + nm + '」是外部联系人（跨公司），飞书租户策略不允许机器人代发消息。内部同事可以正常发。';
        resolve({ ok: false, error: msg, cross_tenant: !!cross });
      });
    };

    if (openId) return deliver({ open_id: openId, localized_name: to });
    larkResolveUser(to, function (rr) {
      if (rr.user) return deliver(rr.user);
      resolve(Object.assign({ ok: false, error: '没找到「' + to + '」' }, larkPicks(rr)));
    });
  });
});
// ---------- 自动登录：账号密码存进 Windows 凭据管理器（不落明文文件） ----------
const CRED_PS = path.join(__dirname, 'cred.ps1');
const AUTO_PS = path.join(__dirname, 'autologin.ps1');
// 这些软件桌面端是扫码 / 手机确认登录，没有账号密码框，自动填充用不上
const QR_APPS = ['微信', 'weixin', 'wechat', '企业微信', '企微', 'wxwork', '钉钉', 'dingtalk'];
function normKey(name) { return String(name || '').toLowerCase().replace(/\s+/g, ''); }
function credTarget(name) { return 'sally:' + normKey(name); }
function runPS(psPath, args, env, cb) {
  const opts = { timeout: 90000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' };
  if (env) opts.env = Object.assign({}, process.env, env);
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath].concat(args || []), opts, function (err, out, er) {
    cb(err && !String(out || '').trim() ? err : null, String(out || ''), String(er || ''));
  });
}
ipcMain.handle('sally:creds:set', function (e, arg) {
  const name = String((arg && arg.name) || '').trim();
  const user = String((arg && arg.user) || '').trim();
  const pass = String((arg && arg.pass) || '');
  if (!name || !user) return { ok: false, error: '软件名和账号不能为空' };
  if (!pass) return { ok: false, error: '密码不能为空' };
  return new Promise(function (resolve) {
    // 密码只走环境变量，绝不进命令行参数
    runPS(CRED_PS, ['set', credTarget(name)], { SALLY_CUSER: user, SALLY_CPASS: pass }, function (err, out) {
      if (String(out || '').trim() === 'OK') resolve({ ok: true, app: name });
      else resolve({ ok: false, error: (err && err.message) || String(out || '') || '保存失败' });
    });
  });
});
ipcMain.handle('sally:creds:list', function () {
  return new Promise(function (resolve) {
    runPS(CRED_PS, ['list'], null, function (err, out) {
      const lines = String(out || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== 'EMPTY'; });
      resolve({ ok: true, apps: lines });
    });
  });
});
ipcMain.handle('sally:creds:del', function (e, arg) {
  const name = String((arg && arg.name) || '').trim();
  if (!name) return { ok: false, error: '缺软件名' };
  return new Promise(function (resolve) {
    runPS(CRED_PS, ['del', credTarget(name)], null, function (err, out) {
      resolve({ ok: String(out || '').trim() === 'OK', error: String(out || '').trim() !== 'OK' ? (err && err.message) : '' });
    });
  });
});
ipcMain.handle('sally:autologin', function (e, arg) {
  const name = String((arg && arg.name) || '').trim();
  const proto = arg && arg.proto; const builtin = arg && arg.builtin;
  if (!name) return { ok: false, error: '没说哪个软件' };
  // 扫码 / 手机确认类：打开即可，告诉用户去扫码
  if (QR_APPS.indexOf(normKey(name)) >= 0) {
    openApp(name, proto, builtin);
    return { ok: true, qr: true, msg: '「' + name + '」是扫码 / 手机确认登录，已帮你打开，请用手机扫码或确认～' };
  }
  const target = credTarget(name);
  return new Promise(function (resolve) {
    runPS(CRED_PS, ['get', target], null, function (err, out) {
      const line = String(out || '').trim();
      if (line === 'NONE' || err) {
        openApp(name, proto, builtin);
        return resolve({ ok: false, needCred: true, msg: '还没保存「' + name + '」的账号密码。点顶栏「🔑 账号」把' + name + '的账号密码存进 Windows 凭据管理器，下次我就能全自动登录啦。' });
      }
      const tab = line.indexOf('\t');
      const user = tab >= 0 ? line.slice(0, tab) : line;
      openApp(name, proto, builtin);
      runPS(AUTO_PS, ['-Target', target, '-Window', name], null, function (e2, o2) {
        const log = String(o2 || '');
        if (/NO_CRED/.test(log)) return resolve({ ok: false, needCred: true, msg: '凭据读取失败，请重新保存「' + name + '」的账号密码。' });
        const filled = /USER_FILLED/.test(log) && /PASS_FILLED/.test(log);
        const clicked = /CLICKED|ENTER_SENT/.test(log);
        let msg = '已打开「' + name + '」并尝试填入账号' + (user ? '（' + user + '）' : '') + '。';
        if (clicked) msg += '已自动点击登录，如果还要短信 / 验证码，按提示完成即可。';
        else if (!filled) msg += '（没识别到账号密码框，可能这是扫码登录——请用手机扫码）';
        else msg += '（没找到登录按钮，你点一下「登录」就行）';
        resolve({ ok: true, msg: msg, log: log });
      });
    });
  });
});
// ---------- 桌面操作指令（关机/重启/锁屏/睡眠/注销/打印/回收站/截屏） ----------
const PRINT_PS = path.join(__dirname, 'print.ps1');
function homeDirs() {
  const home = process.env.USERPROFILE || os.homedir();
  return { desktop: path.join(home, 'Desktop'), documents: path.join(home, 'Documents'), downloads: path.join(home, 'Downloads') };
}
// 把「桌面上的报价单」/「D盘的合同.pdf」解析成真实路径（支持模糊匹配）
function resolveFile(name, location, drive) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (/^[A-Za-z]:[\\\/]/.test(n) || n.indexOf('\\') >= 0 || n.indexOf('/') >= 0) {
    try { if (fs.existsSync(n)) return n; } catch (e) {}
  }
  const d = homeDirs();
  const bases = [];
  if (location === 'desktop') bases.push(d.desktop);
  else if (location === 'downloads') bases.push(d.downloads);
  else if (location === 'documents') bases.push(d.documents);
  else if (location === 'drive' && drive) bases.push(drive + '\\');
  else bases.push(d.desktop, d.downloads, d.documents);
  const want = n.toLowerCase();
  const wantBase = want.replace(/\.[a-z0-9]+$/, '');
  let best = null;
  function scanExact(dir, depth) {
    if (depth > 3 || best) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], p = path.join(dir, e.name);
      if (e.isDirectory()) { scanExact(p, depth + 1); continue; }
      const base = e.name.toLowerCase();
      if (base === want || base.replace(/\.[a-z0-9]+$/, '') === wantBase) { best = p; return; }
    }
  }
  for (let i = 0; i < bases.length; i++) { if (best) break; scanExact(bases[i], 0); }
  if (!best) {
    function scanFuzzy(dir, depth) {
      if (depth > 3 || best) return;
      let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i], p = path.join(dir, e.name);
        if (e.isDirectory()) { scanFuzzy(p, depth + 1); continue; }
        const b = e.name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
        if (b && wantBase && (b.indexOf(wantBase) >= 0 || wantBase.indexOf(b) >= 0)) { best = p; return; }
      }
    }
    for (let i = 0; i < bases.length; i++) { if (best) break; scanFuzzy(bases[i], 0); }
  }
  return best;
}
function psRun(line, cb) { exec(line, { timeout: 60000, windowsHide: true, encoding: 'utf8' }, function (err, out, er) { cb(err, String(out || ''), String(er || '')); }); }
ipcMain.handle('sally:desktop', function (e, arg) {
  const cmd = String((arg && arg.cmd) || '');
  try {
    if (cmd === 'shutdown') { psRun('shutdown /s /t 20', function () {}); return { ok: true, msg: '已排定 20 秒后关机（说「取消关机」可撤销）' }; }
    if (cmd === 'restart') { psRun('shutdown /r /t 20', function () {}); return { ok: true, msg: '已排定 20 秒后重启（说「取消关机」可撤销）' }; }
    if (cmd === 'cancelShutdown') { psRun('shutdown /a', function () {}); return { ok: true, msg: '已取消关机 / 重启' }; }
    if (cmd === 'logoff') { psRun('shutdown /l', function () {}); return { ok: true, msg: '正在注销' }; }
    if (cmd === 'lock') { psRun('rundll32.exe user32.dll,LockWorkStation', function () {}); return { ok: true, msg: '已锁屏' }; }
    if (cmd === 'sleep') { psRun('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', function () {}); return { ok: true, msg: '进入睡眠' }; }
    if (cmd === 'emptyRecycle') {
      return new Promise(function (resolve) {
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output "OK"'], { timeout: 60000, windowsHide: true }, function () {
          resolve({ ok: true, msg: '回收站已清空' });
        });
      });
    }
    if (cmd === 'screenshot') {
      return new Promise(function (resolve) {
        const out = path.join(homeDirs().desktop, 'sally截图-' + Date.now() + '.png');
        const ps = 'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;' +
          '$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;' +
          '$bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height);' +
          '$g=[System.Drawing.Graphics]::FromImage($bmp);' +
          '$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size);' +
          '$bmp.Save("' + out.replace(/\\/g, '\\\\') + '");Write-Output "OK"';
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 60000, windowsHide: true }, function (err, o) {
          const okk = /OK/.test(String(o || ''));
          resolve({ ok: okk, msg: okk ? ('截图已存到桌面：' + path.basename(out)) : '截图失败' });
        });
      });
    }
    if (cmd === 'print') {
      const file = String((arg && arg.file) || '').trim();
      const abs = String((arg && arg.path) || '').trim();
      const copies = Math.max(1, Math.min(99, parseInt((arg && arg.copies) || 1, 10) || 1));
      // 拖拽/粘贴进来的文件带完整路径 → 直接用，不用再靠名字猜
      let p = null;
      if (abs) { try { if (fs.existsSync(abs) && fs.statSync(abs).isFile()) p = abs; } catch (e) {} }
      if (!p) p = resolveFile(file, (arg && arg.location) || 'auto', (arg && arg.drive) || '');
      if (!p) return { ok: false, msg: '没找到「' + (file || abs || '该文件') + '」。可以说清楚点，例如「打印桌面上的报价单5份」或「打印D盘的合同.pdf 3份」' };
      return new Promise(function (resolve) {
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PRINT_PS, '-Path', p, '-Copies', String(copies)], { timeout: 180000, windowsHide: true, encoding: 'utf8' }, function (err, o, er) {
          const log = String(o || '') + String(er || '');
          if (/NO_FILE/.test(log)) return resolve({ ok: false, msg: '文件不存在：' + p });
          // 文件被别的程序占着（WPS/Office 开着它）→ 直说，别让用户对着一堆弹窗猜
          if (/LOCKED/.test(log)) return resolve({ ok: false, msg: '「' + path.basename(p) + '」正被别的程序占用（多半是 WPS / Office 开着它）→ 先把它关掉，再让我打印。' });
          const pm = log.match(/OK \w+ copies=(\d+)( partial_locked| partial_noverb)?/);
          if (pm) {
            const n = parseInt(pm[1], 10) || 0;
            if (pm[2] === ' partial_locked') return resolve({ ok: true, msg: '🖨 只发出 ' + n + ' 份（文件被 WPS / Office 占住了；关掉它我能打全 ' + copies + ' 份）' });
            if (pm[2] === ' partial_noverb') return resolve({ ok: true, msg: '🖨 只发出 ' + n + ' 份（这种文件没有「打印」动作，剩下的打不了）' });
            return resolve({ ok: true, msg: '🖨 已发送打印：' + path.basename(p) + ' × ' + n + ' 份（默认打印机）' });
          }
          if (/OK/.test(log)) return resolve({ ok: true, msg: '🖨 已发送打印：' + path.basename(p) + ' × ' + copies + ' 份（默认打印机）' });
          if (/NO_PRINT_VERB/.test(log)) return resolve({ ok: false, msg: '这个文件类型没注册「打印」动作，可能要在它自己的软件里打印。文件：' + path.basename(p) });
          resolve({ ok: false, msg: '打印失败：' + (log.slice(0, 140) || (err && err.message) || '未知') });
        });
      });
    }
    if (cmd === 'open') {
      const file = String((arg && arg.file) || '').trim();
      const abs = String((arg && arg.path) || '').trim();
      let p = null;
      if (abs) { try { if (fs.existsSync(abs)) p = abs; } catch (e) {} }
      if (!p) p = resolveFile(file, (arg && arg.location) || 'auto', (arg && arg.drive) || '');
      if (!p) return { ok: false, msg: '没找到「' + (file || abs || '该文件') + '」。可以说「打开 H盘的 合同.pdf」这样带位置的说法。' };
      return shell.openPath(p).then(function (r) { return r ? { ok: false, msg: '打不开：' + r } : { ok: true, msg: '📂 已打开：' + path.basename(p) }; });
    }
    if (cmd === 'setDefaultPrinter') {
      const pn = String((arg && arg.printer) || '').trim();
      if (!pn) return { ok: false, msg: '没说要设哪台打印机' };
      return new Promise(function (resolve) {
        const ps = 'try { (New-Object -ComObject WScript.Network).SetDefaultPrinter("' + pn.replace(/"/g, '') + '"); Write-Output "OK" } catch { Write-Output "FAIL" }';
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 30000, windowsHide: true }, function (err, o) {
          const okk = /OK/.test(String(o || ''));
          resolve({ ok: okk, msg: okk ? ('已把默认打印机设为「' + pn + '」') : ('设置失败（可能没有这台打印机：' + pn + '）') });
        });
      });
    }
    return { ok: false, msg: '不认识的桌面指令：' + cmd };
  } catch (err) { return { ok: false, msg: String(err && err.message) }; }
});
// ---------- 设备探测（打印机 / USB / 串口 / 摄像头 / 蓝牙）—— 帮仓库同事看清"电脑接了什么" ----------
const DEVICES_PS = path.join(__dirname, 'devices.ps1');
ipcMain.handle('sally:devices', function () {
  return new Promise(function (resolve) {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', DEVICES_PS], { timeout: 60000, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }, function (err, o) {
      const raw = String(o || '').trim();
      try {
        const j = JSON.parse(raw.slice(raw.indexOf('{')));
        resolve({ ok: true, devices: j });
      } catch (e) {
        resolve({ ok: false, error: (err && err.message) || '设备探测失败', raw: raw.slice(0, 200) });
      }
    });
  });
});
ipcMain.handle('sally:set-default-printer', function (e, arg) {
  const name = String((arg && arg.name) || '').trim();
  if (!name) return { ok: false, msg: '没说要设哪台打印机' };
  return new Promise(function (resolve) {
    const ps = 'try { (New-Object -ComObject WScript.Network).SetDefaultPrinter("' + name.replace(/"/g, '') + '"); Write-Output "OK" } catch { Write-Output "FAIL" }';
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 30000, windowsHide: true }, function (err, o) {
      const okk = /OK/.test(String(o || ''));
      resolve({ ok: okk, msg: okk ? ('已把默认打印机设为「' + name + '」') : ('设置失败（可能没有这台打印机：' + name + '）') });
    });
  });
});
// ---------- 拨号（给某人打电话） / 用系统默认浏览器打开链接（视频通话走这个，摄像头最稳）----------
ipcMain.handle('sally:dial', function (e, arg) {
  const num = String((arg && arg.number) || '').replace(/[^\d+*#,;]/g, '');
  if (!num) return { ok: false, msg: '没有可拨的号码' };
  try { shell.openExternal('tel:' + num); return { ok: true, msg: '正在拨号：' + num + '（会调用系统默认电话/拨号程序）' }; }
  catch (err) { return { ok: false, msg: String(err && err.message) }; }
});
ipcMain.handle('sally:open-url', function (e, arg) {
  const u = String((arg && arg.url) || '').trim();
  if (!/^https?:/i.test(u)) return { ok: false, msg: '链接不合法' };
  try { shell.openExternal(u); return { ok: true, msg: '已用默认浏览器打开' }; }
  catch (err) { return { ok: false, msg: String(err && err.message) }; }
});
// ---------- 窗口控制（全屏 / 最小化到任务栏 / 关闭到托盘）----------
ipcMain.handle('sally:minimize', function () {
  try { if (win && !win.isDestroyed()) win.minimize(); return { ok: true }; } catch (e) { return { ok: false }; }
});
ipcMain.handle('sally:set-fullscreen', function (e, arg) {
  try {
    if (!win || win.isDestroyed()) return { ok: false };
    const on = !!(arg && arg.on);
    if (on) {
      if (!expanded) applySize(true);          // 全屏时确保是"聊天"版式
      try { savedBounds = win.getBounds(); } catch (e0) {}
      // 🔴 平时 resizable:false（为了去掉 Windows 那圈线框 + 保住透明），
      //    但非 resizable 的窗在 macOS 上进不了全屏 → 进全屏前临时放开，退出后再锁回去。
      try { win.setResizable(true); } catch (e0b) {}
      win.setFullScreen(true);
      // 透明/无边框窗在个别平台 setFullScreen 会不生效 → 80ms 后兜底：直接铺满整块屏
      setTimeout(function () {
        try {
          if (!win || win.isDestroyed() || win.isFullScreen()) return;
          const b = win.getBounds();
          let d;
          try { d = screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).bounds; }
          catch (e1) { d = screen.getPrimaryDisplay().bounds; }
          win.setBounds(d);
          win.setAlwaysOnTop(true, 'screen-saver');
        } catch (e2) {}
      }, 80);
    } else {
      win.setFullScreen(false);
      if (savedBounds) { try { win.setBounds(savedBounds); } catch (e3) {} }
      else applySize(expanded);                // 退出全屏时恢复原来的宠物/聊天尺寸
      savedBounds = null;
      // 退出全屏后 260ms 再把 resizable 锁回 false（等 setBounds 落定，否则会被系统再撑一下）
      setTimeout(function () { try { if (win && !win.isDestroyed()) win.setResizable(false); } catch (e4) {} }, 260);
    }
    return { ok: true, fullscreen: win.isFullScreen() };
  } catch (err) { return { ok: false }; }
});
ipcMain.handle('sally:close', function () {
  try {
    if (win && !win.isDestroyed()) {
      win.hide();
      if (tray) { try { tray.displayBalloon({ title: 'RB小仁同学', content: '我先躲到托盘啦～按 Ctrl+Alt+S 或点托盘图标就能把我叫回来 🎐' }); } catch (e) {} }
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
});
ipcMain.on('sally:wander', function (e, v) { wanderOn = !!v; });

// ---------- 桌面级全行为守望 ----------
// 只向渲染侧发送动作级上下文；观察器本地运行，不上传、不落盘。
desktopObserver.on(function (item) {
  if (!desktopWatchOn || !win || win.isDestroyed()) return;
  try { workflowMemory.record(item); } catch (e) {}
  try { win.webContents.send('sally:desktop-event', item); } catch (e) {}
});
ipcMain.handle('sally:workflow-summary', function (e, arg) {
  return workflowMemory.summary(arg && arg.days || 7);
});
ipcMain.handle('sally:desktop-watch-status', function () {
  return { ok: true, enabled: desktopWatchOn, running: desktopObserver.isRunning(), paused: desktopObserver.isPaused(), scope: 'action-context' };
});
ipcMain.handle('sally:desktop-watch-set', function (e, arg) {
  const on = !(arg && arg.enabled === false);
  desktopWatchOn = on;
  if (on) desktopObserver.start(); else desktopObserver.stop();
  return { ok: true, enabled: desktopWatchOn, running: desktopObserver.isRunning(), paused: desktopObserver.isPaused(), scope: 'action-context' };
});
ipcMain.handle('sally:desktop-watch-pause', function (e, arg) {
  const paused = desktopObserver.pause(!!(arg && arg.paused));
  return { ok: true, enabled: desktopWatchOn, running: desktopObserver.isRunning(), paused: paused, scope: 'action-context' };
});

function showHide() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide(); else { win.show(); win.focus(); }
}

// ---------- 桌面快捷方式（优先 Electron 原生 API，比 PowerShell 可靠） ----------
const SHORTCUT_NAME = '小仁同学.lnk';
const LEGACY_SHORTCUT_NAME = 'sally.lnk';
function createDesktopShortcut() {
  const exe = app.getPath('exe');
  const desktop = app.getPath('desktop');
  let ok = false;
  if (process.platform === 'win32') {
    const lnk = path.join(desktop, SHORTCUT_NAME);
    try {
      ok = shell.writeShortcutLink(lnk, {
        target: exe, cwd: path.dirname(exe), icon: exe, iconIndex: 0,
        description: '小仁同学 · RB 智能助理', appUserModelId: 'com.rb.assistant'
      });
    } catch (e) { ok = false; }
    if (!ok) {  // 兜底：PowerShell
      try {
        const ps = "$d=[Environment]::GetFolderPath('Desktop'); $p=Join-Path $d '" + SHORTCUT_NAME + "';" +
          "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($p);" +
          "$s.TargetPath='" + exe.replace(/'/g, "''") + "';" +
          "$s.WorkingDirectory='" + path.dirname(exe).replace(/'/g, "''") + "';" +
          "$s.IconLocation='" + exe.replace(/'/g, "''") + "';$s.Description='小仁同学 · RB 智能助理';$s.Save()";
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], function () {});
        ok = true;
      } catch (e) { ok = false; }
    }
  } else {
    try {  // macOS：在桌面放一个可双击的启动脚本
      const appDir = path.resolve(path.dirname(exe), '..', '..');
      const sh = path.join(desktop, 'sally.command');
      fs.writeFileSync(sh, '#!/bin/bash\nopen "' + appDir + '"\n', { mode: 0o755 });
      ok = true;
    } catch (e) { ok = false; }
  }
  if (ok) { try { fs.writeFileSync(path.join(app.getPath('userData'), 'shortcut-created.flag'), new Date().toISOString(), 'utf8'); } catch (e) {} }
  return ok;
}
// 2026-10-27：用户反馈「双击小仁同学，桌面上就冒出一个 sally 的快捷方式」。
// 原因就是这个函数——每次启动都补建 sally.lnk（删了下次又回来）。
// 现在启动只做一件事：把历史上被自动建出来的 sally.lnk 收走，而且**只删指向本程序的**，
// 别人同名（比如某个叫 sally 的软件）的快捷方式一个都不碰。想要快捷方式走托盘菜单手动建。
function cleanupLegacyShortcut() {
  if (process.platform !== 'win32') return false;
  const lnk = path.join(app.getPath('desktop'), LEGACY_SHORTCUT_NAME);
  try {
    if (!fs.existsSync(lnk)) return false;
    let target = '';
    try { target = String((shell.readShortcutLink(lnk) || {}).target || ''); } catch (e) { target = ''; }
    const self = path.resolve(app.getPath('exe')).toLowerCase();
    // 目标读不出来、或者指的不是本程序 → 一律不动（宁可不删，不可误删）
    if (!target || path.resolve(target).toLowerCase() !== self) return false;
    fs.unlinkSync(lnk);
    console.log('[sally] removed legacy shortcut ' + lnk);
    return true;
  } catch (e) { return false; }
}

// ---------- 版本检查与自动升级 ----------
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
  return 0;
}
function downloadFile(url, dest, cb) {
  const f = fs.createWriteStream(dest);
  https.get(url, { timeout: 120000 }, res => {
    if (res.statusCode !== 200) { f.close(); return cb(new Error('HTTP ' + res.statusCode)); }
    res.pipe(f);
    f.on('finish', () => f.close(() => cb(null)));
  }).on('error', e => { try { f.close(); } catch (x) {} cb(e); });
}
function applyShellUpdate() {
  if (!ZIP_URL) return dialog.showMessageBox({ type: 'info', title: '小仁同学', message: '未配置自动更新地址', detail: '设置 RB_UPDATE_ZIP_URL 后可启用自动更新。' });
  const appDir = path.dirname(app.getPath('exe'));
  const updateRoot = path.join(appDir, '.updates');
  const tmp = path.join(updateRoot, 'sally-upd-' + Date.now());
  try { fs.mkdirSync(tmp, { recursive: true }); } catch (e) {}
  const zip = path.join(tmp, 'u.zip'), ex = path.join(tmp, 'x');
  downloadFile(ZIP_URL, zip, function (err) {
    if (err) return dialog.showMessageBox({ type: 'error', title: '小仁同学', message: '更新包下载失败：' + err.message });
    execFile('powershell', ['-NoProfile', '-Command', 'Expand-Archive -Path "' + zip + '" -DestinationPath "' + ex + '" -Force'], function (e2) {
      if (e2) return dialog.showMessageBox({ type: 'error', title: '小仁同学', message: '解压失败，请手动到下载中心更新。' });
      const cmd = path.join(tmp, 'apply.cmd');
      const lines = [
        '@echo off',
        'ping 127.0.0.1 -n 4 >nul',
        'xcopy /E /Y /I "' + ex + '\\*" "' + appDir + '\\" >nul',
        'start "" "' + path.join(appDir, 'sally.exe') + '"',
        'rmdir /S /Q "' + tmp + '"'
      ];
      try { fs.writeFileSync(cmd, lines.join('\r\n'), 'utf8'); } catch (e) {}
      try { spawn('cmd', ['/c', cmd], { detached: true, stdio: 'ignore' }).unref(); } catch (e) {}
      quitting = true; app.quit();
    });
  });
}
function fetchVersion(cb) {
  if (!VERSION_URL) return cb && cb(null, '未配置 RB_VERSION_URL');
  https.get(VERSION_URL, { timeout: 12000 }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', function () {
      let j = null;
      try { j = JSON.parse(d); } catch (e) { return cb && cb(null, '版本文件格式不对'); }
      cb && cb(j, null);
    });
  }).on('error', function (e) { cb && cb(null, String((e && e.message) || e)); });
}
function checkVersion(manual) {
  fetchVersion(function (j, err) {
    if (!j) {
      if (manual) dialog.showMessageBox({ type: 'error', title: 'RB小仁同学 · 检查更新', message: '连不上更新服务器', detail: err || '' });
      return;
    }
    // 1) 内容变了 → 提醒后刷新页面，避免技能包/教材包升级被用户误以为没收到
    if (j.content && lastContent && j.content !== lastContent) {
      if (tray) {
        try {
          tray.setToolTip('RB小仁同学 · 已更新到最新内容');
          tray.displayBalloon({
            title: 'RB小仁同学内容已升级',
            content: j.notes || ('内容版：' + j.content + '，正在刷新页面')
          });
        } catch (e) {}
      }
      if (win && !win.isDestroyed()) {
        try {
          win.webContents.executeJavaScript(
            'window.__sallyUpdateBanner && window.__sallyUpdateBanner(' + JSON.stringify('内容 ' + j.content) + ')'
          ).catch(function () {});
        } catch (e) {}
        setTimeout(function () {
          try { if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache(); } catch (e) {}
        }, 1800);
      }
    }
    if (j.content) lastContent = j.content;

    // 2) 外壳版本
    const hasNew = j.shell && cmpVer(j.shell, MY_VER) > 0;
    if (!hasNew) {
      if (manual) dialog.showMessageBox({ type: 'info', title: 'RB小仁同学 · 检查更新', message: '已经是最新版 v' + MY_VER, detail: '内容版：' + (j.content || '-') + '\n外壳版：' + (j.shell || '-') });
      return;
    }
    // 🔴 页内横幅 —— 比弹窗可靠得多。弹窗挂在"透明+无边框+置顶"的小窗上会看不见，
    //    这正是 sally 反馈"退出好几遍、点了也不更新"的根因之一。
    try {
      if (win && !win.isDestroyed()) {
        win.webContents.executeJavaScript('window.__sallyUpdateBanner && window.__sallyUpdateBanner(' + JSON.stringify(String(j.shell)) + ')').catch(function () {});
      }
    } catch (e) {}
    if (tray) { try { tray.displayBalloon({ title: 'RB小仁同学 有新版本 v' + j.shell, content: '点托盘「检查更新」即可升级' }); } catch (e) {} }
    // 🔴 不传 parent 窗口 → 系统居中显示、会出现在任务栏，一定看得见
    dialog.showMessageBox({
      type: 'question', title: 'RB小仁同学 有新版本',
      message: '发现新版本 v' + j.shell + '（当前 v' + MY_VER + '）',
      detail: (j.notes ? j.notes + '\n\n' : '') + '点「立即更新」会自动下载并重启，不用手动去下载中心。',
      buttons: ['立即更新', '以后再说'], defaultId: 0, cancelId: 1, noLink: true
    }).then(function (r) { if (r.response === 0) applyShellUpdate(); }).catch(function () {});
  });
}
// 供页面/托盘调用的更新接口
ipcMain.handle('sally:update-check', function () {
  return new Promise(function (resolve) {
    fetchVersion(function (j, err) {
      if (!j) return resolve({ ok: false, error: err || '连不上更新服务器' });
      resolve({ ok: true, current: MY_VER, latest: j.shell || '', content: j.content || '', notes: j.notes || '', hasUpdate: !!(j.shell && cmpVer(j.shell, MY_VER) > 0) });
    });
  });
});
ipcMain.handle('sally:update-apply', function () { try { applyShellUpdate(); return { ok: true }; } catch (e) { return { ok: false, error: String(e && e.message) }; } });

// ---------- Accio Work 桥（CDP 调试口）----------
// 🔴 背景：Accio 官方没有开放 API（文档全站确认过），网关 4097 走 Basic Auth 且 token 只注入子进程、不落盘。
//    唯一可行路线是 CDP 驱动 UI：**但 Accio 必须带 --remote-debugging-port=9229 启动**。
//    ⚠️ 关键：只有跑在【用户桌面会话】里的进程才能拉起 GUI 的 Accio —— 也就是只有宠物能做这件事。
//    （从非交互 shell 启动会因 GPU 进程不可用而崩：FATAL "GPU process isn't usable. Goodbye."）
const ACCIO_EXE = config.accioExe;
const ACCIO_CDP_PORT = 9229;
function accioCdpAlive(cb) {
  const req = require('http').get({ host: '127.0.0.1', port: ACCIO_CDP_PORT, path: '/json/version', timeout: 2500 }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} cb(res.statusCode === 200, j); });
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { try { req.destroy(); } catch (e) {} cb(false); });
}
ipcMain.handle('sally:accio', function (e, arg) {
  const act = String((arg && arg.action) || 'status');
  if (act === 'status') {
    return new Promise(function (resolve) {
      if (!ACCIO_EXE || !fs.existsSync(ACCIO_EXE)) return resolve({ ok: false, msg: '未配置 Accio 路径，请设置 ACCIO_EXE' });
      accioCdpAlive(function (ok, info) { resolve({ ok: true, cdp: ok, port: ACCIO_CDP_PORT, browser: (info && info.Browser) || '' }); });
    });
  }
  if (act === 'launch') {
    return new Promise(function (resolve) {
      if (!ACCIO_EXE || !fs.existsSync(ACCIO_EXE)) return resolve({ ok: false, msg: '未配置 Accio 路径，请设置 ACCIO_EXE' });
      accioCdpAlive(function (ok) {
        if (ok) return resolve({ ok: true, already: true, msg: 'Accio 已经在调试模式下运行 ✅' });
        // 没有调试口的 Accio 没法被驱动 → 必须先关掉它（会打断它当前的对话，客户端会先确认）
        try { execFile('taskkill', ['/IM', 'Accio.exe', '/F'], { windowsHide: true }, function () {}); } catch (x) {}
        setTimeout(function () {
          try {
            const cp = spawn(ACCIO_EXE, ['--remote-debugging-port=' + ACCIO_CDP_PORT], { detached: true, stdio: 'ignore' });
            cp.unref();
          } catch (x) { return resolve({ ok: false, msg: '启动失败：' + x.message }); }
          let n = 0;
          const t = setInterval(function () {
            n++;
            accioCdpAlive(function (ok2) {
              if (ok2) { clearInterval(t); resolve({ ok: true, msg: 'Accio 已重启到调试模式 ✅（现在可以让我给它下指令了）' }); }
              else if (n >= 20) { clearInterval(t); resolve({ ok: false, msg: 'Accio 起来了但调试口没开（版本可能不支持），需要换方案' }); }
            });
          }, 2500);
        }, 3000);
      });
    });
  }
  // ---- 给 Accio 下指令：CDP 驱动界面 → 读会话文件拿回复 ----
  if (act === 'ask') {
    return new Promise(function (resolve) { accioAsk(String((arg && arg.text) || ''), resolve); });
  }
  return { ok: false, msg: '不认识的 Accio 动作：' + act };
});

// ---------- Accio CDP 桥：输入 → 点发送 → 读会话文件拿回复 ----------
function accioAccountDir() {
  try {
    const root = path.join(process.env.USERPROFILE || '', '.accio', 'accounts');
    const ds = fs.readdirSync(root).filter(function (d) { try { return fs.statSync(path.join(root, d)).isDirectory(); } catch (e) { return false; } });
    return ds.length ? path.join(root, ds[0]) : '';
  } catch (e) { return ''; }
}
function accioDmDir() { const a = accioAccountDir(); return a ? path.join(a, 'conversations', 'dm') : ''; }
function accioHttp(pathname, cb) {
  const req = require('http').get({ host: '127.0.0.1', port: ACCIO_CDP_PORT, path: pathname, timeout: 4000 }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} cb(j); });
  });
  req.on('error', () => cb(null)); req.on('timeout', () => { try { req.destroy(); } catch (e) {} cb(null); });
}
// 一个短连接，按顺序执行几条 CDP 命令
function accioCdp(wsUrl, steps, cb) {
  if (typeof WebSocket === 'undefined') return cb(new Error('这个 Electron 版本没有 WebSocket，无法驱动 Accio'));
  let ws;
  try { ws = new WebSocket(wsUrl); } catch (e) { return cb(e); }
  let seq = 0, i = 0, done = false;
  const timer = setTimeout(function () { if (!done) { done = true; try { ws.close(); } catch (e) {} cb(new Error('CDP 超时')); } }, 40000);
  function next() {
    if (i >= steps.length) { done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} return cb(null); }
    const st = steps[i++];
    const id = ++seq;
    ws.send(JSON.stringify({ id: id, method: st.m, params: st.p || {} }));
  }
  ws.onopen = next;
  ws.onmessage = function (ev) {
    const m = JSON.parse(ev.data);
    if (m.error) { done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} return cb(new Error(JSON.stringify(m.error))); }
    setTimeout(next, 250);   // 给界面一点反应时间
  };
  ws.onerror = function () { if (!done) { done = true; clearTimeout(timer); cb(new Error('CDP 连接失败')); } };
}
function accioResOf(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim().split('\n').map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(function (x) { return x && x.role === 'res'; });
  } catch (e) { return []; }
}
function accioAsk(text, cb) {
  text = String(text || '').trim();
  if (!text) return cb({ ok: false, msg: '没说要让 Accio 干什么' });
  const dm = accioDmDir();
  if (!dm) return cb({ ok: false, msg: '没找到 Accio 的账号目录（它可能没登录过）' });
  accioHttp('/json/list', function (list) {
    if (!list || !list.length) return cb({ ok: false, msg: 'Accio 没开调试口。先点一下「Accio Work」把它重启到调试模式。' });
    const page = list.filter(function (t) { return t.type === 'page' && /index/.test(t.url || ''); })[0]
              || list.filter(function (t) { return t.type === 'page'; })[0];
    if (!page || !page.webSocketDebuggerUrl) return cb({ ok: false, msg: '没找到可驱动的 Accio 窗口' });
    const t0 = Date.now();
    const steps = [
      { m: 'Runtime.evaluate', p: { expression: '(()=>{const ce=[...document.querySelectorAll(\'[contenteditable="true"]\')].filter(e=>e.offsetParent!==null);if(!ce.length)return"NO";ce[0].focus();return"OK";})()', returnByValue: true } },
      { m: 'Input.insertText', p: { text: text } },
      { m: 'Runtime.evaluate', p: { expression: '(()=>{const b=document.querySelector(".chat-send-btn");if(!b)return"NO";b.click();return"OK";})()', returnByValue: true } }
    ];
    accioCdp(page.webSocketDebuggerUrl, steps, function (err) {
      if (err) return cb({ ok: false, msg: '驱动 Accio 失败：' + err.message });
      // 🔴 关键：Accio 发完会**新建一个会话文件**，所以不能盯"原来最新的那个"，
      //    要找「发送之后被改动的、且包含这句话的」jsonl
      let tries = 0;
      const poll = setInterval(function () {
        tries++;
        let files = [];
        try {
          files = fs.readdirSync(dm).filter(function (f) { return /\.message_1\.jsonl$/.test(f); })
            .map(function (f) { const p = path.join(dm, f); return { p: p, m: fs.statSync(p).mtimeMs }; })
            .filter(function (x) { return x.m >= t0 - 2000; })
            .sort(function (a, b) { return b.m - a.m; });
        } catch (e) {}
        for (let k = 0; k < files.length; k++) {
          const rs = accioResOf(files[k].p);
          if (!rs.length) continue;
          const last = rs[rs.length - 1];
          if (last.status === 'finished' || last.status === 'error') {
            clearInterval(poll);
            return cb({ ok: true, reply: String(last.content || ''), status: last.status, agent: last.name || '', file: path.basename(files[k].p) });
          }
        }
        if (tries >= 60) {   // 最多等 5 分钟
          clearInterval(poll);
          cb({ ok: false, msg: '发出去了，但 5 分钟没等到 Accio 回复（可能还在跑长任务，或额度用完了）' });
        }
      }, 5000);
    });
  });
}

function makeTray() {
  let img = null;
  try { img = nativeImage.createFromPath(ICON_ICO); } catch (e) { img = null; }
  if (!img || img.isEmpty()) { try { img = nativeImage.createFromPath(ICON_PNG); } catch (e) { img = null; } }
  try { tray = new Tray(img && !img.isEmpty() ? img : nativeImage.createEmpty()); } catch (e) { return; }
  tray.setToolTip('RB小仁同学 · 点我显示/隐藏');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: showHide },
    { label: '叫回小仁同学（Ctrl+Alt+S）', accelerator: 'Control+Alt+S', click: function () { if (!win || win.isDestroyed()) return createWindow(); win.show(); win.focus(); } },
    { label: '始终置顶', type: 'checkbox', checked: true, click: (mi) => { if (win) win.setAlwaysOnTop(!!mi.checked, 'screen-saver'); } },
    { label: '桌面漫游（偶尔自己溜达）', type: 'checkbox', checked: true, click: (mi) => { wanderOn = !!mi.checked; } },
    { label: '桌面守望（观察全部动作）', type: 'checkbox', checked: true, click: (mi) => { desktopWatchOn = !!mi.checked; if (desktopWatchOn) desktopObserver.start(); else desktopObserver.stop(); } },
    { label: '养生提醒（喝水 / 活动）', type: 'checkbox', checked: true, click: (mi) => { if (win) win.webContents.executeJavaScript('window.sallyHealthToggle && window.sallyHealthToggle(' + (mi.checked ? 'true' : 'false') + ')').catch(function () {}); } },
    { label: '在桌面创建「小仁同学」快捷方式', click: () => {
        const ok = createDesktopShortcut();
        dialog.showMessageBox({ type: ok ? 'info' : 'error', title: '小仁同学', message: ok ? '已在桌面创建「小仁同学」快捷方式 🎐' : '创建失败：请手动右键 sally.exe → 发送到 → 桌面快捷方式' });
      } },
    { label: '让它走两步', click: wander },
    { label: '换个位置（右下角）', click: () => { if (!win) return; const a = screen.getPrimaryDisplay().workAreaSize; win.setPosition(Math.max(0, a.width - win.getBounds().width - 24), Math.max(0, a.height - win.getBounds().height - 24)); } },
    { label: '重新载入（拿最新内容）', click: () => { if (win) win.webContents.reloadIgnoringCache(); } },
    { label: '检查更新', click: function () { checkVersion(true); } },
    { type: 'separator' },
    { label: '打开网页版', click: () => shell.openExternal(config.appUrl) },
    { label: '打开下载中心', enabled: !!config.downloadUrl, click: () => shell.openExternal(config.downloadUrl) },
    { type: 'separator' },
    { label: '退出 RB小仁同学', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showHide);
}

function revealWindow(){
    if(!win||win.isDestroyed())createWindow();
    if(win.isMinimized())win.restore();
    const a=screen.getPrimaryDisplay().workArea;
    applySize(true);
    const b=win.getBounds();
    win.setPosition(Math.max(a.x,Math.min(a.x+a.width-b.width,b.x)),Math.max(a.y,Math.min(a.y+a.height-b.height,b.y)));
    win.show();win.focus();
    win.webContents.executeJavaScript("document.body.classList.remove('collapsed')").catch(()=>{});
  }
  const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', revealWindow);
  app.on('activate', revealWindow);
  app.whenReady().then(() => {
    // ---- 允许摄像头/麦克风（Electron 默认会拒绝 getUserMedia → 这就是"客户端不能视频"的根因）----
    try {
      const ses = session.defaultSession;
      ses.setPermissionRequestHandler(function (wc, permission, cb) {
        cb(['media', 'mediaKeySystem', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'display-capture', 'audioCapture', 'videoCapture'].indexOf(permission) >= 0);
      });
      ses.setPermissionCheckHandler(function () { return true; });
      if (ses.setDisplayMediaRequestHandler) {
        ses.setDisplayMediaRequestHandler(function (req, cb) { try { cb({ video: req.videoRequested ? require('electron').desktopCapturer.getSources({ types: ['screen'] }).then(function (s) { return s[0]; }) : null }); } catch (e) { try { cb({}); } catch (x) {} } });
      }
    } catch (e) { console.log('[sally] permission handler err ' + e.message); }
    createWindow();
    workflowMemory.init(path.join(app.getPath('userData'), 'workflow-memory.json'));
    desktopObserver.start();
    makeTray();
    try { cleanupLegacyShortcut(); } catch (e) {}
    startAwayWatch();
    setTimeout(entranceWalk, 2200);   // 出场：从屏幕外走进来（等页面加载好再动）
    checkVersion();
    updateTimer = setInterval(checkVersion, 30 * 60 * 1000); // 每 30 分钟看一次
    setInterval(function () { if (Math.random() < 0.65) wander(); }, 40 * 1000); // 每 40 秒约 65% 概率溜达一下（大范围随机）
    setTimeout(wander, 20000); // 启动 20 秒后先走一次，让人看到它是"活的"
    // 版本检查更勤一点（5 分钟），内容一变立刻刷新
    clearInterval(updateTimer);
    updateTimer = setInterval(checkVersion, 5 * 60 * 1000);
    // 全局热键：随时把 sally 叫回来
    try {
      globalShortcut.register('Control+Alt+S', function () {
        if (!win || win.isDestroyed()) return createWindow();
        if (win.isVisible()) { win.hide(); } else { win.show(); win.focus(); }
      });
    } catch (e) {}
    // 托盘被点/双击也显示
    try { if (tray) tray.on('double-click', function () { if (win) { win.show(); win.focus(); } }); } catch (e) {}
  });
  app.on('before-quit', function () { try { desktopObserver.stop(); } catch (e) {} try { workflowMemory.save(); } catch (e) {} });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}
