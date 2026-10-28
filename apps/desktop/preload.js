// sally精灵 桌面宠物 · 预加载脚本
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sallyPet', {
  isPet: true,
  setExpanded: function (v) { try { ipcRenderer.send('sally:expand', !!v); } catch (e) {} },
  setWander: function (v) { try { ipcRenderer.send('sally:wander', !!v); } catch (e) {} },
  // 桌面级行为守望：动作上下文，不采集键盘原文/剪贴板原文/截图
  desktopWatchStatus: function () { try { return ipcRenderer.invoke('sally:desktop-watch-status'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  workflowSummary: function (arg) { try { return ipcRenderer.invoke('sally:workflow-summary', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  desktopWatchSet: function (arg) { try { return ipcRenderer.invoke('sally:desktop-watch-set', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  desktopWatchPause: function (arg) { try { return ipcRenderer.invoke('sally:desktop-watch-pause', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  onDesktopEvent: function (fn) { try { if (typeof fn !== 'function') return function () {}; var h = function (e, item) { try { fn(item); } catch (x) {} }; ipcRenderer.on('sally:desktop-event', h); return function () { try { ipcRenderer.removeListener('sally:desktop-event', h); } catch (x) {} }; } catch (e) { return function () {}; } },
  // 拖动（用屏幕光标位置移动窗口，比 CSS drag 稳）
  dragBegin: function () { try { ipcRenderer.send('sally:drag-begin'); } catch (e) {} },
  dragMove: function () { try { ipcRenderer.send('sally:drag-move'); } catch (e) {} },
  dragEnd: function () { try { ipcRenderer.send('sally:drag-end'); } catch (e) {} },
  // 隐藏 / 找回
  hide: function () { try { ipcRenderer.send('sally:hide'); } catch (e) {} },
  show: function () { try { return ipcRenderer.invoke('sally:show'); } catch (e) { return Promise.resolve(false); } },
  // 打开本机软件 / 文件
  openApp: function (arg) {
    try { return ipcRenderer.invoke('sally:open-app', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  },
  openPath: function (p) {
    try { return ipcRenderer.invoke('sally:open-path', p); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  },
  // 拖拽/粘贴进来的 File → 真实路径。
  // ⚠️ 必须在渲染侧【同步】调 webUtils.getPathForFile，File 对象不能过 IPC
  filePath: function (file) {
    try {
      const wu = require('electron').webUtils;
      if (wu && typeof wu.getPathForFile === 'function') return wu.getPathForFile(file) || '';
    } catch (e) {}
    try { return (file && file.path) || ''; } catch (e) {}   // Electron <32 的老写法
    return '';
  },
  // 按路径读文件内容（图片→dataUrl / 文本→text / 其它→只给路径）
  fileRead: function (arg) {
    try { return ipcRenderer.invoke('sally:file-read', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  },
  // 自动更新
  checkUpdate: function () { try { return ipcRenderer.invoke('sally:update-check'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  applyUpdate: function () { try { return ipcRenderer.invoke('sally:update-apply'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // Accio Work 桥（CDP）：status / launch
  accio: function (arg) { try { return ipcRenderer.invoke('sally:accio', arg || {}); } catch (e) { return Promise.resolve({ ok: false, msg: String(e) }); } },
  // 给飞书某人发消息（本机 lark-cli）
  larkSend: function (arg) {
    try { return ipcRenderer.invoke('sally:lark-send', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  },
  // 给微信好友发消息（GUI 自动化）
  wechatSend: function (arg) {
    try { return ipcRenderer.invoke('sally:wechat-send', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  },
  // 平台绑定：飞书授权（本机 lark-cli）
  larkStatus: function () { try { return ipcRenderer.invoke('sally:lark-status'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  larkAuthStart: function () { try { return ipcRenderer.invoke('sally:lark-auth-start'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  larkAuthFinish: function (arg) { try { return ipcRenderer.invoke('sally:lark-auth-finish', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 第二身份（管理员账号）：小仁自己直连飞书 OAuth，跟主身份各存一套 token
  lark2Status: function () { try { return ipcRenderer.invoke('sally:lark2-status'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark2BindStart: function () { try { return ipcRenderer.invoke('sally:lark2-bind-start'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark2BindPoll: function (arg) { try { return ipcRenderer.invoke('sally:lark2-bind-poll', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark2Unbind: function () { try { return ipcRenderer.invoke('sally:lark2-unbind'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark2SetDefault: function (arg) { try { return ipcRenderer.invoke('sally:lark2-default', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 第三身份（Lark 国际版 · 海外运营号）：应用凭证 + 扫码授权，走 lark-cli 的第二个 profile
  lark3Status: function () { try { return ipcRenderer.invoke('sally:lark3-status'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark3Setup: function (arg) { try { return ipcRenderer.invoke('sally:lark3-setup', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark3BindStart: function () { try { return ipcRenderer.invoke('sally:lark3-bind-start'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark3BindFinish: function (arg) { try { return ipcRenderer.invoke('sally:lark3-bind-finish', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  lark3Unbind: function () { try { return ipcRenderer.invoke('sally:lark3-unbind'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  identityDefault: function (arg) { try { return ipcRenderer.invoke('sally:identity-default', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 待办审批事项
  pendingApprovals: function () { try { return ipcRenderer.invoke('sally:pending-approvals'); } catch (e) { return Promise.resolve({ ok: false, count: 0 }); } },
  // 老板状态（读飞书审批：请假 / 出差 / 外出 / 例会中）
  bossStatus: function (arg) { try { return ipcRenderer.invoke('sally:boss-status', arg || {}); } catch (e) { return Promise.resolve({ ok: false, status: 'unknown', text: '' }); } },
  // 「我是谁」——启动时确认本机绑定的身份（扫了哪个平台就记哪个）
  whoami: function () { try { return ipcRenderer.invoke('sally:whoami'); } catch (e) { return Promise.resolve({ ok: false }); } },
  // 自动登录：账号密码存进本机 Windows 凭据管理器
  credsSet: function (arg) { try { return ipcRenderer.invoke('sally:creds:set', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  credsList: function () { try { return ipcRenderer.invoke('sally:creds:list'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  credsDel: function (arg) { try { return ipcRenderer.invoke('sally:creds:del', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  autologin: function (arg) { try { return ipcRenderer.invoke('sally:autologin', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 桌面操作：关机/重启/锁屏/睡眠/注销/打印/回收站/截屏
  desktopCmd: function (arg) { try { return ipcRenderer.invoke('sally:desktop', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 设备探测 / 设默认打印机
  devices: function () { try { return ipcRenderer.invoke('sally:devices'); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  setDefaultPrinter: function (arg) { try { return ipcRenderer.invoke('sally:set-default-printer', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 拨号 / 用系统浏览器打开链接（视频通话）
  dial: function (arg) { try { return ipcRenderer.invoke('sally:dial', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  openUrl: function (arg) { try { return ipcRenderer.invoke('sally:open-url', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 站内窗口：同域页面直接在桌面端开窗（能拖到任意位置、共用登录态）；站外自动回落系统浏览器
  openInner: function (arg) { try { return ipcRenderer.invoke('sally:open-inner', arg || {}); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },
  // 窗口控制：全屏 / 最小化 / 关闭到托盘
  minimize: function () { try { return ipcRenderer.invoke('sally:minimize'); } catch (e) { return Promise.resolve({ ok: false }); } },
  setFullscreen: function (arg) { try { return ipcRenderer.invoke('sally:set-fullscreen', arg || {}); } catch (e) { return Promise.resolve({ ok: false }); } },
  closeWin: function () { try { return ipcRenderer.invoke('sally:close'); } catch (e) { return Promise.resolve({ ok: false }); } }
});
