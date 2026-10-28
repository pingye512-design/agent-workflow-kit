// RB 小仁同学 · 「站内窗口」
// 为什么单独成文件：外壳升级包里只换 resources/app，多一个文件就能多一类能力，
// 而 main.js 里只留一行 require（try/catch 包住）—— 这个文件坏了，宠物照常用。
//
// 解决的事：侧边栏「公司系统」那些链接以前一律丢给系统浏览器（窗口顶部还有一个
// 带地址栏的浏览器窗口看着像"跳出去了"。现在可信同域页面直接开一个
// 桌面窗口，位置随便拖，登录态跟宠物窗口共用；想用浏览器看，窗口菜单里有
// 「在浏览器中打开」，客户端那边也支持 Alt+点击。
const { BrowserWindow, Menu, shell, clipboard, screen, session } = require('electron');
const config = require('./config');

const HOST = config.internalHost;

function isInternal(url) {
  try {
    const u = new URL(String(url || ''));
    return (u.protocol === 'https:' || u.protocol === 'http:') && (u.hostname === HOST || u.hostname.endsWith('.' + HOST));
  } catch (e) { return false; }
}

const OPENED = new Map();   // url -> BrowserWindow（同一页只留一个，重复点就聚焦）

function titleOf(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, '');
    if (/schedule|attendance/.test(p)) return '排班 / 考勤';
    if (/prices/.test(p)) return '价格表';
    if (/leads/.test(p)) return '客资 / 线索';
    if (/minutes/.test(p)) return '会议纪要';
    if (/finance/.test(p)) return '财务工作区';
    if (/work[-_]report/.test(p)) return '工作汇报';
    if (/learn/.test(p)) return '学习中心';
    return '工作区';
  } catch (e) { return '工作区'; }
}

function buildMenu(win) {
  const goBrowser = function () {
    try { shell.openExternal(win.webContents.getURL()); } catch (e) {}
  };
  return Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '在浏览器中打开', accelerator: 'CmdOrCtrl+Shift+O', click: goBrowser },
        {
          label: '复制页面地址', click: function () {
            try { clipboard.writeText(win.webContents.getURL()); } catch (e) {}
          }
        },
        { type: 'separator' },
        { label: '关闭窗口', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    },
    {
      label: '查看',
      submenu: [
        { label: '重新载入', accelerator: 'F5', role: 'reload' },
        { label: '强制刷新', accelerator: 'CmdOrCtrl+F5', role: 'forceReload' },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', click: function () { try { win.setFullScreen(!win.isFullScreen()); } catch (e) {} } }
      ]
    }
  ]);
}

// 位置：贴在宠物窗口旁边，超出屏幕就往回收
function place(parent, w, h) {
  try {
    const pb = parent && !parent.isDestroyed() ? parent.getBounds() : null;
    const disp = screen.getDisplayNearestPoint(pb ? { x: pb.x + 20, y: pb.y + 20 } : screen.getCursorScreenPoint());
    const wa = disp.workArea;
    const W = Math.min(w, wa.width - 40), H = Math.min(h, wa.height - 40);
    let x = pb ? (pb.x - W - 12) : (wa.x + Math.round((wa.width - W) / 2));
    if (x < wa.x + 8) x = pb ? Math.min(pb.x + pb.width + 12, wa.x + wa.width - W - 8) : wa.x + 8;
    let y = pb ? Math.min(pb.y, wa.y + wa.height - H - 8) : (wa.y + Math.round((wa.height - H) / 2));
    if (y < wa.y + 8) y = wa.y + 8;
    return { x: x, y: y, width: W, height: H };
  } catch (e) { return { width: 1180, height: 820 }; }
}

function open(parent, url, iconPath) {
  const target = String(url || '');
  if (!isInternal(target)) {
    try { shell.openExternal(target); } catch (e) {}
    return { ok: false, external: true };
  }
  const alive = OPENED.get(target);
  if (alive && !alive.isDestroyed()) {
    try { alive.show(); alive.focus(); } catch (e) {}
    return { ok: true, reused: true };
  }

  const b = place(parent, 1180, 820);
  const w = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 720, minHeight: 480,
    title: 'RB小仁同学 · ' + titleOf(target),
    icon: iconPath || undefined,
    backgroundColor: '#0f1730',
    show: false,
    autoHideMenuBar: false,
    // 不设 parent：要能拖到桌面任意一块地方，也不被宠物窗口"管"着
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
      // 不指定 partition → 用默认 session，跟宠物窗口共用登录态（这是"unauthorized"消失的关键）
    }
  });

  try { w.setMenu(buildMenu(w)); } catch (e) {}

  // 窗口里再点链接：站内继续开新窗口，站外丢给浏览器
  try {
    w.webContents.setWindowOpenHandler(function (arg) {
      const u = String(arg.url || '');
      if (isInternal(u)) { open(w, u, iconPath); return { action: 'deny' }; }
      try { shell.openExternal(u); } catch (e) {}
      return { action: 'deny' };
    });
  } catch (e) {}

  // 可选登录页与会话 Cookie 均通过环境变量配置；未配置时直接打开目标页。
  function loadTarget() {
    if (!config.loginUrl || !config.sessionCookieName) { try { w.loadURL(target); } catch (e) {} return; }
    let finished = false, tries = 0, timer = null;
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } };
    const go = function () { if (finished || w.isDestroyed()) { stop(); return; } finished = true; stop(); try { w.loadURL(target); } catch (e) {} };
    try {
      session.defaultSession.cookies.get({ name: config.sessionCookieName }).then(function (cs) {
        if (cs && cs.length) { go(); return; }
        if (w.isDestroyed()) return;
        try { w.setTitle('RB小仁同学 · 先登录中控台'); } catch (e) {}
        try { w.loadURL(config.loginUrl); } catch (e) {}
        timer = setInterval(function () {
          if (finished || w.isDestroyed() || ++tries > 240) { stop(); return; }
          session.defaultSession.cookies.get({ name: config.sessionCookieName }).then(function (c2) {
            if (c2 && c2.length) go();
          }).catch(function () {});
        }, 1500);
      }).catch(function () { go(); });
    } catch (e) { try { w.loadURL(target); } catch (x) {} }
    // 窗口提前关掉就别再轮询
    w.on('closed', stop);
  }

  // 这个窗口里不需要「下载桌面版」的粉色小徽标 —— 人已经在桌面端里了
  w.webContents.on('did-finish-load', function () {
    try {
      w.webContents.executeJavaScript(
        "(function(){var e=document.getElementById('sallyDl'); if(e) e.remove();})()"
      ).catch(function () {});
    } catch (e) {}
  });

  w.once('ready-to-show', function () { try { w.show(); } catch (e) {} });
  w.on('page-title-updated', function (e, t) {
    try { e.preventDefault(); w.setTitle('RB小仁同学 · ' + (t || titleOf(target))); } catch (x) {}
  });
  w.on('closed', function () { OPENED.delete(target); });

  try { loadTarget(); } catch (e) { return { ok: false, error: String(e && e.message) }; }
  OPENED.set(target, w);
  return { ok: true };
}

function openOrExternal(parent, url, iconPath) {
  try {
    if (!isInternal(url)) { shell.openExternal(String(url || '')); return { ok: true, external: true }; }
    return open(parent, url, iconPath);
  } catch (e) {
    try { shell.openExternal(String(url || '')); } catch (x) {}
    return { ok: false, error: String(e && e.message) };
  }
}

module.exports = { isInternal: isInternal, open: open, openOrExternal: openOrExternal };
