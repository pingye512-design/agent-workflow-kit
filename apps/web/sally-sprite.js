/* 小仁同学（RB） · 悬浮 AI 客服 + 养宠 + 换装 + 语音 + 干活 + 拖动/缩放/附件  v5 (2026-09-18)
 * 用法：任意页面 </body> 前加 <script src="./sally-sprite.js" defer></script>
 * 后端地址通过 window.RB_CONFIG 配置。
 * 客户端模式：?sally=client；仅导出立绘：window.SALLY_NO_FLOAT=true
 */
(function () {
  if (window.__sallyLoaded) return; window.__sallyLoaded = true;

  var SLOGAN = '我不需要阿拉丁神灯，我想成为那盏万能的灯，请把你的愿望告诉我试试吧！';
  var OPEN_CONFIG = window.RB_CONFIG || {};
  var API = OPEN_CONFIG.apiBase || '/api/assistant';
  var INBOX = OPEN_CONFIG.inboxBase || '/api/inbox';
  var PET_KEY = 'sally_pet_v1', GREET_KEY = 'sally_greet_v1', HABIT_KEY = 'sally_habit_v1';
  var ROLE_KEY = 'sally_role_v1', POS_KEY = 'sally_pos_v1', SIZE_KEY = 'sally_size_v1', DL_KEY = 'sally_dl_v1', SKIN_KEY = 'sally_skin_v1';
  var HISTORY = [];
  var CLIENT = /[?&]sally=client/.test(location.search) || window.SALLY_CLIENT === true;
  var threadId = 0, lastSeenMsgId = 0, pollTimer = null, pollBusy = false, unreadHuman = 0;
  var role = 'default', ROLES = {};

  // 国际电话区号（秒回用）
  var COUNTRY = {
    '86': '中国大陆', '852': '中国香港', '853': '中国澳门', '886': '中国台湾',
    '1': '美国 / 加拿大', '44': '英国', '49': '德国', '33': '法国', '39': '意大利', '34': '西班牙',
    '31': '荷兰', '32': '比利时', '41': '瑞士', '43': '奥地利', '46': '瑞典', '47': '挪威', '45': '丹麦',
    '358': '芬兰', '351': '葡萄牙', '353': '爱尔兰', '30': '希腊', '48': '波兰', '420': '捷克',
    '36': '匈牙利', '40': '罗马尼亚', '7': '俄罗斯 / 哈萨克斯坦', '380': '乌克兰', '375': '白俄罗斯',
    '81': '日本', '82': '韩国', '65': '新加坡', '60': '马来西亚', '66': '泰国', '84': '越南',
    '62': '印度尼西亚', '63': '菲律宾', '855': '柬埔寨', '856': '老挝', '95': '缅甸', '673': '文莱',
    '91': '印度', '92': '巴基斯坦', '880': '孟加拉国', '94': '斯里兰卡', '977': '尼泊尔',
    '971': '阿联酋', '966': '沙特阿拉伯', '974': '卡塔尔', '965': '科威特', '973': '巴林',
    '968': '阿曼', '962': '约旦', '961': '黎巴嫩', '964': '伊拉克', '98': '伊朗', '972': '以色列',
    '90': '土耳其', '20': '埃及', '212': '摩洛哥', '213': '阿尔及利亚', '216': '突尼斯',
    '27': '南非', '234': '尼日利亚', '254': '肯尼亚', '255': '坦桑尼亚', '233': '加纳',
    '55': '巴西', '52': '墨西哥', '54': '阿根廷', '56': '智利', '57': '哥伦比亚', '51': '秘鲁',
    '58': '委内瑞拉', '593': '厄瓜多尔', '61': '澳大利亚', '64': '新西兰'
  };

  // ---------- 本地秒回（不经过服务器，豆包式即时反馈） ----------
  function instant(q) {
    var s = String(q || '').trim();
    if (!s) return null;
    // 1) 纯区号：+86 / 86 / +852 ...
    var m = s.match(/^[+＋]?(\d{1,4})$/);
    if (m && COUNTRY[m[1]]) return '🌍 +' + m[1] + ' → **' + COUNTRY[m[1]] + '**\n（国际电话区号）';
    // 2) 含区号的号码
    var m2 = s.match(/[+＋](\d{1,4})/);
    if (m2 && COUNTRY[m2[1]]) return '🌍 这串号码里的 **+' + m2[1] + '** 是 **' + COUNTRY[m2[1]] + '** 的区号。\n拨号时前面加 00 或 + 即可。';
    // 3) 寒暄
    if (/^(你好|您好|hi|hello|嗨|哈喽|抢麦|在吗|在么|在不在)[!！。.~～\s]*$/i.test(s)) return '嗨～我是小仁同学（RB） 🎐\n' + SLOGAN;
    if (/^(谢谢|多谢|感谢|3q|thx|thanks)[!！。.~～\s]*$/i.test(s)) return '不客气～能帮到你就好 🎐 还有别的想问的吗？';
    if (/^(再见|拜拜|bye|goodbye)[!！。.~～\s]*$/i.test(s)) return '拜拜～有事随时喊我 🎐';
    // 4) 时间
    if (/^(现在几点|几点了|时间|今天几号|今天日期|今天星期几)/.test(s)) {
      var d = new Date();
      return '🕐 现在是 ' + d.toLocaleString('zh-CN', { hour12: false }) + '（本机时间）';
    }
    // 5) 计算器（简单四则）
    var mc = s.match(/^[\d\s+\-*/().×÷]+$/);
    if (mc && /[+\-*/×÷]/.test(s)) {
      try {
        var expr = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/[^0-9+\-*/().]/g, '');
        var v = Function('"use strict";return (' + expr + ')')();
        if (typeof v === 'number' && isFinite(v)) return '🧮 ' + s + ' = **' + (Math.round(v * 1e6) / 1e6) + '**';
      } catch (e) { }
    }
    // 6) 外贸常用换算（秒回）
    var mi = s.match(/(\d+(?:\.\d+)?)\s*(英寸|inch)/i);
    if (mi) return '📏 ' + mi[1] + ' 英寸 = **' + (mi[1] * 2.54).toFixed(2) + ' 厘米**';
    var mp = s.match(/(\d+(?:\.\d+)?)\s*(磅|lb|lbs|pound)/i);
    if (mp) return '⚖️ ' + mp[1] + ' 磅 = **' + (mp[1] * 0.4536).toFixed(3) + ' 公斤**';
    var mk = s.match(/(\d+(?:\.\d+)?)\s*(公斤|kg)\s*(?:等于|换算|=)?\s*(?:多少)?\s*(磅|lb)/i);
    if (mk) return '⚖️ ' + mk[1] + ' 公斤 = **' + (mk[1] / 0.4536).toFixed(2) + ' 磅**';
    if (/柜型|集装箱尺寸|20gp|40gp|40hq|20尺柜|40尺柜|装多少方/i.test(s)) {
      return '🚢 常用柜型（内尺寸 · 参考）\n\n· **20GP**：5.90×2.35×2.39 m → 约 28 CBM，净载 21-22 吨\n· **40GP**：12.03×2.35×2.39 m → 约 58 CBM，净载 26 吨\n· **40HQ**：12.03×2.35×2.69 m → 约 68 CBM，净载 26 吨\n\n（不同船公司箱型略有差异，重货看净载、轻泡货看容积）';
    }
    if (/体积重|抛重|volumetric/i.test(s)) {
      return '📦 体积重（抛重）算法\n\n· 空运：长×宽×高(cm) ÷ **6000** = 计费重(kg)\n· 快递：长×宽×高(cm) ÷ **5000** = 计费重(kg)\n· 海运：按 **CBM（立方米）** 计费\n\n计费时取「实重」与「体积重」**较大者**。';
    }
    return null;
  }

  // ---------- 动作守望：把灵宠变成用户行为的前置观察者 ----------
  // 页面可用 window.SallyGuard.expect({ selector, label, step, hint }) 声明下一步；
  // 不声明时，守望器只对高风险动作做轻提醒，不拦截、不替用户点击。
  var GUARD = {
    expected: null,
    mode: 'observe',
    listeners: [],
    mutedUntil: 0,
    on: function (fn) { if (typeof fn === 'function') this.listeners.push(fn); return function () { var i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; },
    emit: function (payload) {
      payload = payload || {}; payload.ts = Date.now();
      if (payload.kind !== 'expected-done' && this.mutedUntil > Date.now()) return;
      this.listeners.slice().forEach(function (fn) { try { fn(payload); } catch (e) {} });
    },
    expect: function (spec) {
      spec = spec || {};
      this.expected = { selector: spec.selector || '', label: spec.label || '下一步', step: spec.step || '', hint: spec.hint || '', once: spec.once !== false };
      this.emit({ kind: 'expected', expected: this.expected });
      return this.expected;
    },
    clear: function () { this.expected = null; this.emit({ kind: 'cleared' }); },
    mute: function (ms) { this.mutedUntil = Date.now() + Math.max(0, Number(ms) || 60000); },
    setMode: function (mode) { this.mode = mode === 'confirm' ? 'confirm' : 'observe'; return this.mode; },
    snapshot: function () { return { expected: this.expected, mode: this.mode }; }
  };
  function closestEl(el, selector) {
    while (el && el !== document) { if (el.matches && el.matches(selector)) return el; el = el.parentNode; }
    return null;
  }
  function guardInfo(el) {
    var raw = '';
    try { raw = el.getAttribute('data-sally-action') || el.getAttribute('aria-label') || el.title || el.value || el.innerText || el.textContent || ''; } catch (e) {}
    raw = String(raw).replace(/\\s+/g, ' ').trim();
    var href = ''; try { href = el.getAttribute('href') || ''; } catch (e2) {}
    return { el: el, label: raw.slice(0, 64) || '这个操作', href: href.slice(0, 120) };
  }
  function guardMatch(el, exp) {
    if (!exp) return false;
    if (exp.selector && closestEl(el, exp.selector)) return true;
    if (exp.label) {
      var a = guardInfo(el).label.toLowerCase(), b = String(exp.label).toLowerCase();
      if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    }
    return false;
  }
  function guardRisk(label, el) {
    var s = String(label || '');
    if (/关机|重启|删除|清空|移除|付款|支付|提交订单|提交申请|发布|上线|覆盖|撤销|退出登录|关闭账户/.test(s)) return 'high';
    if (/发送|发出|提交|打印|导出|执行|同步|保存|确认|确定|继续|下一步/.test(s)) return 'medium';
    try {
      if (el && el.matches && el.matches('input[type=submit],button[type=submit]')) return 'medium';
    } catch (e) {}
    return '';
  }
  function guardIgnored(el) {
    return !!(closestEl(el, '#sallyRoot,#sallyPanel,#sallyGuard,#guardTip,#bar,#sallyInput,#send,#sallySend') || closestEl(el, '[data-sally-ignore]'));
  }
  function guardClick(e) {
    var el = closestEl(e.target, 'button,a,[role=button],input[type=submit],input[type=button],.btn,[data-sally-action]');
    if (!el || guardIgnored(el)) return;
    var info = guardInfo(el), exp = GUARD.expected, matched = guardMatch(el, exp), level = guardRisk(info.label, el);
    if (exp && !matched) {
      GUARD.emit({ kind: 'mismatch', actual: info, expected: exp, level: level || 'medium', blocked: false });
      return;
    }
    if (matched && exp) {
      if (exp.once) GUARD.expected = null;
      GUARD.emit({ kind: 'expected-done', actual: info, expected: exp });
      return;
    }
    if (level) GUARD.emit({ kind: 'risk', actual: info, expected: exp, level: level, blocked: false });
  }
  function guardSubmit(e) {
    var form = e.target, info = guardInfo(form), exp = GUARD.expected;
    if (guardIgnored(form)) return;
    if (exp && !guardMatch(form, exp)) GUARD.emit({ kind: 'mismatch', actual: info, expected: exp, level: 'high', blocked: false });
    else GUARD.emit({ kind: 'risk', actual: info, expected: exp, level: 'high', blocked: false });
  }
  function guardChange(e) {
    var el = closestEl(e.target, 'select,input[type=checkbox],input[type=radio],[data-sally-step]'), exp = GUARD.expected;
    if (!el || guardIgnored(el) || !exp) return;
    var info = guardInfo(el);
    if (!guardMatch(el, exp)) GUARD.emit({ kind: 'mismatch', actual: info, expected: exp, level: 'medium', blocked: false });
  }
  (function installGuardObserver() {
    if (window.__sallyGuardObserver) return;
    window.__sallyGuardObserver = true;
    document.addEventListener('click', guardClick, true);
    document.addEventListener('submit', guardSubmit, true);
    document.addEventListener('change', guardChange, true);
  })();
  window.SallyGuard = {
    expect: function (spec) { return GUARD.expect(spec); },
    clear: function () { return GUARD.clear(); },
    mute: function (ms) { return GUARD.mute(ms); },
    setMode: function (mode) { return GUARD.setMode(mode); },
    notify: function (payload) { return GUARD.emit(payload || {}); },
    snapshot: function () { return GUARD.snapshot(); },
    on: function (fn) { return GUARD.on(fn); },
    version: 'v1'
  };

  // 换装：角色主题
  var ROLE_THEME = {
    default: { hairL: '#8a6440', hair: '#67472a', hairD: '#4d3420', blouseL: '#fff9e6', blouseD: '#f2e2b0', skirtL: '#d3e4f4', skirtD: '#a7c5e0', acc: 'none', ring: '#4f7cff' },
    ops: { hairL: '#7b6146', hair: '#5c4a2f', hairD: '#3f3220', blouseL: '#f2f9ff', blouseD: '#d8ecff', skirtL: '#a8d0f0', skirtD: '#6ba6dd', acc: 'headset', ring: '#2f80ed' },
    cs: { hairL: '#8a6a52', hair: '#6b4a3a', hairD: '#4a3128', blouseL: '#fff4f8', blouseD: '#ffe0ec', skirtL: '#f4c2d6', skirtD: '#e493b6', acc: 'headset', ring: '#eb5c8a' },
    sales: { hairL: '#8e6b3f', hair: '#7a5a34', hairD: '#55401f', blouseL: '#fffdf5', blouseD: '#f7ead0', skirtL: '#efd9a8', skirtD: '#d9b877', acc: 'tie', ring: '#e0a030' },
    buyer: { hairL: '#7d604a', hair: '#5f4636', hairD: '#412f24', blouseL: '#f7fff5', blouseD: '#dff3da', skirtL: '#bfe3ba', skirtD: '#8fc78a', acc: 'badge', ring: '#3fae5a' },
    keeper: { hairL: '#8a7159', hair: '#6a5140', hairD: '#47362b', blouseL: '#faf8ff', blouseD: '#e8e2fa', skirtL: '#c9c0ea', skirtD: '#a294d6', acc: 'helmet', ring: '#7b61d8' },
    therapist: { hairL: '#8f6a74', hair: '#7a5a62', hairD: '#4f3a41', blouseL: '#fff7fb', blouseD: '#ffe3f0', skirtL: '#f6cede', skirtD: '#dd9dc0', acc: 'heartpin', ring: '#d96fa6' },
    logistics: { hairL: '#64707f', hair: '#4f5a6b', hairD: '#333c48', blouseL: '#f4faff', blouseD: '#dceeff', skirtL: '#b5d3ef', skirtD: '#7fa9d6', acc: 'cap', ring: '#2b7fd4' },
    accountant: { hairL: '#6b5a46', hair: '#5a4a3a', hairD: '#3a2f24', blouseL: '#fffdf4', blouseD: '#f5ebcd', skirtL: '#e8dcb4', skirtD: '#cbb985', acc: 'pen', ring: '#b98b2f' },
    docs: { hairL: '#6f6656', hair: '#5f5648', hairD: '#3d372d', blouseL: '#fcfbf7', blouseD: '#e9e7de', skirtL: '#d7dce7', skirtD: '#aeb7c9', acc: 'clip', ring: '#5b6f96' },
    designer: { hairL: '#8a6a8a', hair: '#6b4f6b', hairD: '#453043', blouseL: '#fdf8ff', blouseD: '#f0e0f8', skirtL: '#e2cdee', skirtD: '#c0a3d6', acc: 'brush', ring: '#9b59b6' },
    hr: { hairL: '#6b7a66', hair: '#4f5a4a', hairD: '#343d31', blouseL: '#f7fff5', blouseD: '#e2f2dc', skirtL: '#cfe3c8', skirtD: '#a8c69f', acc: 'badge', ring: '#4a9d5f' },
    gm: { hairL: '#5a544c', hair: '#3f3a34', hairD: '#282420', blouseL: '#f9f9f6', blouseD: '#e8e8e2', skirtL: '#d6d6cf', skirtD: '#b3b3aa', acc: 'tie', ring: '#8a6d3b' },
    dev: { hairL: '#5a6a7a', hair: '#3f4a5a', hairD: '#28303c', blouseL: '#f5f9ff', blouseD: '#e0ecff', skirtL: '#b8cde8', skirtD: '#8aa8d0', acc: 'laptop', ring: '#3b82f6' },
    devops: { hairL: '#5f5f66', hair: '#4a4a52', hairD: '#2e2e34', blouseL: '#f6f6f8', blouseD: '#e6e6ea', skirtL: '#c8c8d0', skirtD: '#a0a0aa', acc: 'wrench', ring: '#6b7280' },
    merch: { hairL: '#7a6a7a', hair: '#5a4a5a', hairD: '#3a2f3a', blouseL: '#fff9fc', blouseD: '#f7e6ef', skirtL: '#e8cede', skirtD: '#c9a2bc', acc: 'clip', ring: '#c2568a' },
    forwarder: { hairL: '#64746a', hair: '#4a5a4f', hairD: '#2f3a33', blouseL: '#f7fcf8', blouseD: '#e2f2e6', skirtL: '#c8ded0', skirtD: '#9fc0a8', acc: 'cap', ring: '#2f9e6e' }
  };
  var ROLE_FALLBACK = [
    { id: 'default', name: '小仁同学（RB）', icon: '🎐', tag: '全能小助理' },
    { id: 'gm', name: '总经理·小仁', icon: '🎯', tag: '经营决策与统筹' },
    { id: 'ops', name: '运营·小仁', icon: '📈', tag: '平台运营与增长' },
    { id: 'cs', name: '客服·小仁', icon: '💬', tag: '客户沟通与售后' },
    { id: 'sales', name: '业务·小仁', icon: '🤝', tag: '询盘报价与谈判' },
    { id: 'merch', name: '跟单·小仁', icon: '📋', tag: '订单跟单与交期' },
    { id: 'buyer', name: '采购·小仁', icon: '📦', tag: '供应商与成本' },
    { id: 'keeper', name: '仓管·小仁', icon: '🏭', tag: '库存与履约' },
    { id: 'forwarder', name: '货代·小仁', icon: '🚛', tag: '订舱拖车与报关' },
    { id: 'logistics', name: '物流·小仁', icon: '🚢', tag: '运输与报关时效' },
    { id: 'docs', name: '单证·小仁', icon: '📄', tag: '单证制作与审核' },
    { id: 'accountant', name: '会计·小仁', icon: '🧾', tag: '记账税务与成本' },
    { id: 'designer', name: '设计师·小仁', icon: '🎨', tag: '电商/UI/平面设计' },
    { id: 'dev', name: '全栈工程师·小仁', icon: '💻', tag: '全栈开发与集成' },
    { id: 'devops', name: '运维·小仁', icon: '🛠️', tag: '服务器运维与稳定' },
    { id: 'hr', name: '人事·小仁', icon: '👥', tag: '考勤薪酬与员工事务' },
    { id: 'therapist', name: '心理师·小仁', icon: '💗', tag: '情绪支持与心理疏导' }
  ];

  function loadPet() { try { return JSON.parse(localStorage.getItem(PET_KEY)) || { inti: 0, pats: 0, level: 1 }; } catch (e) { return { inti: 0, pats: 0, level: 1 }; } }
  function savePet(p) { try { localStorage.setItem(PET_KEY, JSON.stringify(p)); } catch (e) {} }
  function loadHabit() { try { return JSON.parse(localStorage.getItem(HABIT_KEY)) || {}; } catch (e) { return {}; } }
  function bumpHabit(t) { var h = loadHabit(); h[t] = (h[t] || 0) + 1; try { localStorage.setItem(HABIT_KEY, JSON.stringify(h)); } catch (e) {} }
  function topHabits(n) { var h = loadHabit(); return Object.keys(h).sort(function (a, b) { return h[b] - h[a]; }).slice(0, n || 2); }
  var pet = loadPet();

  // ---------- 角色立绘 SVG ----------
  function mascot() {
    return '' +
'<svg class="sp-svg" viewBox="0 0 160 260" xmlns="http://www.w3.org/2000/svg">' +
  '<defs>' +
    '<linearGradient id="spHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sp-hairL,#8a6440)"/><stop offset=".5" style="stop-color:var(--sp-hair,#67472a)"/><stop offset="1" style="stop-color:var(--sp-hairD,#4d3420)"/></linearGradient>' +
    '<linearGradient id="spBlouse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sp-blouseL,#fff9e6)"/><stop offset="1" style="stop-color:var(--sp-blouseD,#f2e2b0)"/></linearGradient>' +
    '<linearGradient id="spSkirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sp-skirtL,#d3e4f4)"/><stop offset="1" style="stop-color:var(--sp-skirtD,#a7c5e0)"/></linearGradient>' +
  '</defs>' +
  '<ellipse cx="80" cy="253" rx="30" ry="5" fill="#000" opacity=".16"/>' +
  '<g class="sp-sparkles">' +
    '<circle class="sp-sp sp-sp1" cx="30" cy="96" r="2.4" fill="#ffe07a"/>' +
    '<circle class="sp-sp sp-sp2" cx="132" cy="78" r="2" fill="#9fe0ff"/>' +
    '<circle class="sp-sp sp-sp3" cx="24" cy="150" r="1.8" fill="#ffc7dd"/>' +
    '<circle class="sp-sp sp-sp4" cx="138" cy="140" r="2.2" fill="#ffe07a"/>' +
    '<path class="sp-sp sp-sp5" d="M112 40 l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 z" fill="#fff2b8"/>' +
    '<path class="sp-sp sp-sp6" d="M44 46 l1.4 3.8 3.8 1.4 -3.8 1.4 -1.4 3.8 -1.4 -3.8 -3.8 -1.4 3.8 -1.4 z" fill="#cfe9ff"/>' +
  '</g>' +
  '<g class="sp-hairBack">' +
    '<path d="M80 24 C42 24 32 60 36 92 C27 140 25 190 34 234 C52 245 108 245 126 234 C135 190 133 140 124 92 C128 60 118 24 80 24 Z" fill="url(#spHair)"/>' +
    '<path d="M80 30 C52 30 42 60 44 92 C40 136 40 188 44 228" stroke="#8a6440" stroke-width="2" fill="none" opacity=".4"/>' +
    '<path d="M80 30 C108 30 118 60 116 92 C120 136 120 188 116 228" stroke="#8a6440" stroke-width="2" fill="none" opacity=".4"/>' +
  '</g>' +
  '<g class="sp-legs">' +
    '<path d="M66 198 L78 198 L77 224 L66 224 Z" fill="#ffe6d6"/><path d="M82 198 L94 198 L94 224 L83 224 Z" fill="#ffe6d6"/>' +
    '<path d="M64 220 L78 220 L78 246 L65 246 Z" fill="#2b2b33"/><path d="M82 220 L96 220 L95 246 L82 246 Z" fill="#2b2b33"/>' +
    '<path d="M63 244 C63 240 68 238 72 238 L78 238 C80 238 81 240 81 244 L81 249 C81 251 79 252 77 252 L66 252 C64 252 63 251 63 249 Z" fill="#1d1d22"/>' +
    '<path d="M81 244 C81 240 86 238 90 238 L94 238 C96 238 97 240 97 244 L97 249 C97 251 95 252 93 252 L84 252 C82 252 81 251 81 249 Z" fill="#1d1d22"/>' +
  '</g>' +
  '<g class="sp-skirt">' +
    '<path d="M62 168 L98 168 L116 202 C116 206 108 208 100 208 L60 208 C52 208 44 206 44 202 Z" fill="url(#spSkirt)"/>' +
    '<path d="M72 169 L66 206" stroke="#96b6d4" stroke-width="1.2" opacity=".7"/><path d="M80 169 L80 207" stroke="#96b6d4" stroke-width="1.2" opacity=".7"/><path d="M88 169 L94 206" stroke="#96b6d4" stroke-width="1.2" opacity=".7"/>' +
    '<path d="M62 168 L98 168 L98 173 L62 173 Z" fill="#ffffff" opacity=".7"/>' +
  '</g>' +
  '<g class="sp-torso">' +
    '<path d="M58 122 C58 114 64 110 70 110 L90 110 C96 110 102 114 102 122 L99 170 C99 174 95 176 91 176 L69 176 C65 176 61 174 61 170 Z" fill="url(#spBlouse)"/>' +
    '<path d="M70 110 L80 130 L90 110 L86 108 L80 120 L74 108 Z" fill="#ffffff"/>' +
    '<path d="M80 130 L80 174" stroke="#00000022" stroke-width="1"/>' +
    '<circle cx="80" cy="138" r="1.6" fill="#d8c48c"/><circle cx="80" cy="152" r="1.6" fill="#d8c48c"/><circle cx="80" cy="166" r="1.6" fill="#d8c48c"/>' +
    '<path d="M58 120 C50 122 46 130 48 138 C52 142 60 140 62 134 Z" fill="url(#spBlouse)"/>' +
    '<path d="M102 120 C110 122 114 130 112 138 C108 142 100 140 98 134 Z" fill="url(#spBlouse)"/>' +
  '</g>' +
  '<g class="sp-acc sp-acc-tie" style="display:none"><path d="M80 132 L84 140 L80 168 L76 140 Z" fill="#c94b4b"/></g>' +
  '<g class="sp-acc sp-acc-badge" style="display:none"><rect x="88" y="138" width="13" height="18" rx="2" fill="#fff" stroke="#bbb" stroke-width="1"/><rect x="90" y="141" width="9" height="3" fill="var(--sp-ring,#3fae5a)"/><path d="M90 146 h9 M90 149 h9 M90 152 h6" stroke="#bbb" stroke-width="1"/></g>' +
  '<g class="sp-acc sp-acc-headset" style="display:none"><path d="M46 70 C46 44 60 30 80 30 C100 30 114 44 114 70" stroke="#2f3646" stroke-width="3" fill="none"/><rect x="40" y="66" width="10" height="16" rx="4" fill="#2f3646"/><rect x="110" y="66" width="10" height="16" rx="4" fill="#2f3646"/><path d="M112 82 C112 96 100 102 88 102" stroke="#2f3646" stroke-width="2.4" fill="none"/><circle cx="88" cy="102" r="4" fill="#2f3646"/></g>' +
  '<g class="sp-acc sp-acc-helmet" style="display:none"><path d="M48 62 C48 34 64 22 80 22 C96 22 112 34 112 62 Z" fill="#ffd24a"/><rect x="44" y="60" width="72" height="7" rx="3" fill="#e8b62f"/><path d="M80 22 L80 60" stroke="#e8b62f" stroke-width="2"/></g>' +
  '<g class="sp-acc sp-acc-cap" style="display:none"><path d="M53 57 C53 33 66 23 80 23 C94 23 107 33 107 57 Z" fill="#2b7fd4"/><path d="M45 55 h74 a5 5 0 0 1 0 9 H45 a5 5 0 0 1 0-9 z" fill="#1f5fa0"/><circle cx="80" cy="23" r="3" fill="#1f5fa0"/></g>' +
  '<g class="sp-acc sp-acc-pen" style="display:none"><rect x="90" y="138" width="4.4" height="16" rx="1.4" fill="#2f3646"/><path d="M90 138 l4.4 0 l-2.2 -6.4 z" fill="#c94b4b"/><rect x="88.6" y="150" width="7.2" height="9" rx="1.4" fill="#e6ecf7" stroke="#c3cbdb" stroke-width=".8"/></g>' +
  '<g class="sp-acc sp-acc-clip" style="display:none"><rect x="30" y="150" width="26" height="34" rx="3" fill="#f4efe2" stroke="#b9ae94" stroke-width="1.2"/><rect x="36" y="146" width="14" height="6" rx="2" fill="#9c8f74"/><path d="M35 158 h16 M35 164 h16 M35 170 h11" stroke="#c3b9a3" stroke-width="1.4"/></g>' +
  '<g class="sp-acc sp-acc-heartpin" style="display:none"><path d="M94 145 c-3-4-9-2-9 3 0 4 5 7 9 11 4-4 9-7 9-11 0-5-6-7-9-3 z" fill="#ff7aa2" stroke="#e05a86" stroke-width=".8"/></g>' +
  '<g class="sp-acc sp-acc-brush" style="display:none"><ellipse cx="40" cy="174" rx="14" ry="10" fill="#f2e9db" stroke="#c9b8a0" stroke-width="1"/><circle cx="35" cy="171" r="2.4" fill="#e05a5a"/><circle cx="41" cy="169" r="2.4" fill="#4f9de0"/><circle cx="46" cy="174" r="2.4" fill="#e0c04a"/><circle cx="38" cy="178" r="2.4" fill="#5fbf7a"/><rect x="52" y="156" width="4.4" height="20" rx="1.8" fill="#8a6d3b" transform="rotate(22 54 166)"/><path d="M50 154 l7 -2.4 l1.8 5.4 l-7 2.4 z" fill="#9b59b6" transform="rotate(22 54 166)"/></g>' +
  '<g class="sp-acc sp-acc-laptop" style="display:none"><rect x="30" y="156" width="30" height="20" rx="2.4" fill="#3a4a5a" stroke="#2a3a4a" stroke-width="1"/><rect x="33" y="159" width="24" height="14" rx="1" fill="#8fb6ff"/><path d="M35 162 h12 M35 165 h16 M35 168 h9" stroke="#2a3a4a" stroke-width="1"/><path d="M25 176 h40 v4.4 h-40 z" rx="2" fill="#5a6a7a"/></g>' +
  '<g class="sp-acc sp-acc-wrench" style="display:none"><path d="M104 134 a10 10 0 1 1 -8 8 l-16 16 a4.6 4.6 0 0 1 -6.6 -6.6 l16 -16 a10 10 0 0 1 14.6 -1.4 z" fill="#9aa0aa" stroke="#7c828c" stroke-width="1"/><circle cx="100" cy="138" r="3.4" fill="#f4f4f6"/></g>' +
  '<g class="sp-armL"><path d="M56 130 C50 146 46 160 45 172 C44 178 52 181 55 176 C58 162 62 146 66 134 Z" fill="#ffe6d6"/><ellipse cx="49" cy="178" rx="6" ry="6.5" fill="#ffe6d6"/></g>' +
  '<g class="sp-armR"><path d="M102 130 C110 120 118 108 121 98 C124 92 132 96 128 104 C121 118 113 130 107 138 Z" fill="#ffe6d6"/><circle cx="124" cy="96" r="7" fill="#ffe6d6"/>' +
    '<g class="sp-heartHand" style="display:none"><path d="M124 90 c-3-4-9-2-9 3 0 4 5 7 9 11 4-4 9-7 9-11 0-5-6-7-9-3 z" fill="#ff6b8f"/></g></g>' +
  '<path d="M73 100 L87 100 L87 114 L73 114 Z" fill="#f3c9b4"/>' +
  '<g class="sp-head">' +
    '<ellipse cx="80" cy="73" rx="29" ry="32" fill="#ffe6d6"/>' +
    '<g class="sp-hairFront">' +
      '<path d="M50 72 C50 40 64 28 80 28 C96 28 110 40 110 72 C108 54 100 46 92 50 C88 43 72 43 68 50 C60 46 52 54 50 72 Z" fill="url(#spHair)"/>' +
      '<path d="M80 30 C63 30 53 44 51 66 C54 48 63 38 80 38 C97 38 106 48 109 66 C107 44 97 30 80 30 Z" fill="#ffffff" opacity=".18"/>' +
      '<path d="M50 60 C44 92 44 132 48 168 C55 172 61 169 62 162 C58 130 56 96 58 66 Z" fill="url(#spHair)"/>' +
      '<path d="M110 60 C116 92 116 132 112 168 C105 172 99 169 98 162 C102 130 104 96 102 66 Z" fill="url(#spHair)"/>' +
    '</g>' +
    '<g class="sp-eyewrap">' +
      '<g class="sp-eyesN">' +
        '<ellipse cx="68" cy="76" rx="8.2" ry="9.4" fill="#fff"/><ellipse cx="92" cy="76" rx="8.2" ry="9.4" fill="#fff"/>' +
        '<g class="sp-pupils">' +
          '<ellipse class="sp-pupil" cx="68" cy="76.5" rx="6" ry="7.2" fill="#5a3d28"/><ellipse class="sp-pupil" cx="92" cy="76.5" rx="6" ry="7.2" fill="#5a3d28"/>' +
          '<circle class="sp-pupil" cx="68" cy="76.5" r="2.8" fill="#2e1e12"/><circle class="sp-pupil" cx="92" cy="76.5" r="2.8" fill="#2e1e12"/>' +
          '<circle cx="70.4" cy="73.6" r="2.1" fill="#fff"/><circle cx="94.4" cy="73.6" r="2.1" fill="#fff"/>' +
        '</g>' +
      '</g>' +
      '<g class="sp-eyesH" style="display:none">' +
        '<path d="M61 79 C65 71 71 71 75 79" stroke="#3a2718" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M85 79 C89 71 95 71 99 79" stroke="#3a2718" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '</g>' +
    '</g>' +
    '<path d="M61 66 C65 63 72 63 75 66" stroke="#4a3520" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<path d="M85 66 C88 63 95 63 99 66" stroke="#4a3520" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<g class="sp-glasses" stroke="#b9bcc9" stroke-width="1.5" fill="none">' +
      '<circle cx="68" cy="76" r="11.8"/><circle cx="92" cy="76" r="11.8"/>' +
      '<path d="M79.6 76 L80.4 76"/><path d="M56.2 74 L48 69"/><path d="M103.8 74 L112 69"/>' +
    '</g>' +
    '<ellipse class="sp-blush" cx="57" cy="87" rx="5.6" ry="3.3" fill="#ff9db2" opacity=".5"/>' +
    '<ellipse class="sp-blush" cx="103" cy="87" rx="5.6" ry="3.3" fill="#ff9db2" opacity=".5"/>' +
    '<path class="sp-mouthN" d="M76 90 Q80 94.5 84 90" stroke="#d97f8f" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    '<path class="sp-mouthH" d="M75 89 Q80 97 85 89 Q80 92 75 89 Z" fill="#d97f8f" style="display:none"/>' +
  '</g>' +
'</svg>';
  }

  // ---------- 小灵宠形态（圆滚滚的小生物 + 提一盏灯，呼应 slogan） ----------
  function mascotCreature() {
    return '' +
'<svg class="sp-svg sp-cr" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">' +
  '<defs>' +
    '<radialGradient id="crBody" cx="38%" cy="26%" r="82%">' +
      '<stop offset="0" style="stop-color:#ffffff"/><stop offset=".5" style="stop-color:var(--sp-blouseL,#fff9e6)"/>' +
      '<stop offset="1" style="stop-color:var(--sp-skirtD,#a7c5e0)"/></radialGradient>' +
    '<radialGradient id="crGlow" cx="50%" cy="50%">' +
      '<stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset="1" stop-color="#ffcf5c" stop-opacity="0"/></radialGradient>' +
  '</defs>' +
  '<ellipse cx="80" cy="190" rx="36" ry="6" fill="#000" opacity=".18"/>' +
  '<circle class="cr-glow" cx="128" cy="152" r="28" fill="url(#crGlow)"/>' +
  '<g class="cr-body">' +
    '<circle cx="80" cy="44" r="20" fill="url(#crBody)"/>' +
    '<circle cx="46" cy="72" r="17" fill="url(#crBody)"/>' +
    '<circle cx="114" cy="72" r="17" fill="url(#crBody)"/>' +
    '<circle cx="38" cy="106" r="15" fill="url(#crBody)"/>' +
    '<circle cx="122" cy="106" r="15" fill="url(#crBody)"/>' +
    '<circle cx="50" cy="140" r="14" fill="url(#crBody)"/>' +
    '<circle cx="110" cy="140" r="14" fill="url(#crBody)"/>' +
    '<path d="M80 30 C116 30 134 62 134 100 C134 146 112 174 80 174 C48 174 26 146 26 100 C26 62 44 30 80 30 Z" fill="url(#crBody)"/>' +
  '</g>' +
  '<path class="cr-tuft" d="M80 18 C77 6 88 2 92 11 C96 20 87 24 83 24 Z" style="fill:var(--sp-hair,#67472a)"/>' +
  '<ellipse class="sp-blush" cx="46" cy="112" rx="9" ry="5.5" fill="#ff9db2" opacity=".55"/>' +
  '<ellipse class="sp-blush" cx="114" cy="112" rx="9" ry="5.5" fill="#ff9db2" opacity=".55"/>' +
  '<g class="sp-eyewrap" style="transform-origin:80px 96px">' +
    '<g class="sp-eyesN">' +
      '<ellipse cx="62" cy="96" rx="14" ry="16" fill="#fff"/><ellipse cx="98" cy="96" rx="14" ry="16" fill="#fff"/>' +
      '<g class="sp-pupils">' +
        '<ellipse class="sp-pupil" cx="62" cy="97" rx="10" ry="11.5" fill="#5a3d28"/><ellipse class="sp-pupil" cx="98" cy="97" rx="10" ry="11.5" fill="#5a3d28"/>' +
        '<circle class="sp-pupil" cx="62" cy="97" r="4.6" fill="#2e1e12"/><circle class="sp-pupil" cx="98" cy="97" r="4.6" fill="#2e1e12"/>' +
        '<circle cx="66" cy="91" r="3.6" fill="#fff"/><circle cx="102" cy="91" r="3.6" fill="#fff"/>' +
        '<circle cx="58" cy="103" r="1.8" fill="#fff" opacity=".8"/><circle cx="94" cy="103" r="1.8" fill="#fff" opacity=".8"/>' +
      '</g>' +
    '</g>' +
    '<g class="sp-eyesH" style="display:none">' +
      '<path d="M50 99 C56 89 68 89 74 99" stroke="#3a2718" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M86 99 C92 89 104 89 110 99" stroke="#3a2718" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
    '</g>' +
  '</g>' +
  '<g class="sp-glasses" stroke="#b9bcc9" stroke-width="1.6" fill="none">' +
    '<circle cx="62" cy="96" r="17"/><circle cx="98" cy="96" r="17"/><path d="M79 96 h2"/><path d="M45 93 L34 87"/><path d="M115 93 L126 87"/>' +
  '</g>' +
  '<path class="sp-mouthN" d="M74 122 Q80 128 86 122" stroke="#d97f8f" stroke-width="1.9" fill="none" stroke-linecap="round"/>' +
  '<path class="sp-mouthH" d="M72 120 Q80 132 88 120 Q80 125 72 120 Z" fill="#d97f8f" style="display:none"/>' +
  '<g class="cr-armL"><ellipse cx="30" cy="128" rx="11" ry="9" fill="url(#crBody)"/></g>' +
  '<g class="cr-armR"><ellipse cx="130" cy="128" rx="11" ry="9" fill="url(#crBody)"/></g>' +
  '<ellipse cx="62" cy="176" rx="12" ry="8" fill="var(--sp-skirtD,#a7c5e0)"/>' +
  '<ellipse cx="98" cy="176" rx="12" ry="8" fill="var(--sp-skirtD,#a7c5e0)"/>' +
  '<path d="M130 122 C136 130 138 138 138 146" stroke="#8a6d3b" stroke-width="2" fill="none"/>' +
  '<g class="cr-lantern">' +
    '<path d="M128 144 h20 v4 h-20 z" fill="#8a6d3b"/>' +
    '<path d="M130 148 h16 l3 20 h-22 z" fill="#ffe6a8" stroke="#c99a3b" stroke-width="1.2"/>' +
    '<path d="M132 168 h12 v4 h-12 z" fill="#8a6d3b"/>' +
    '<circle cx="138" cy="158" r="3" fill="#fff8dc"/>' +
  '</g>' +
'</svg>';
  }

  // ---------- 样式 ----------
  var css = '' +
    '#sallyRoot{position:fixed;right:18px;bottom:14px;z-index:99999;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;--sp-ring:#4f7cff}' +
    '#sallyStage{position:relative;width:152px;height:242px;overflow:visible;cursor:grab;touch-action:none}' +
    '#sallyStage.dragging{cursor:grabbing}' +
    '.sp-portal{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);width:120px;height:30px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(79,124,255,.9),rgba(34,193,195,.4) 55%,transparent 76%);filter:blur(1px);z-index:1}' +
    '.sp-portal::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:1.5px solid rgba(150,190,255,.55);animation:spRing 3s ease-in-out infinite}' +
    '.sp-portal::before{content:"";position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:96px;height:150px;border-radius:50%;background:linear-gradient(180deg,rgba(120,160,255,.28),rgba(34,193,195,.06));filter:blur(6px)}' +
    '@keyframes spRing{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.12);opacity:.95}}' +
    '.sp-char{position:relative;z-index:2;width:152px;height:242px;filter:drop-shadow(0 12px 16px rgba(15,35,80,.38))}' +
    '.sp-svg{width:152px;height:242px;display:block;transform-origin:80px 250px;animation:spBob 3.6s ease-in-out infinite}' +
    // 小灵宠形态
    '.sp-cr{transform-origin:80px 190px;animation:crBob 3.2s ease-in-out infinite}' +
    '@keyframes crBob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.012)}}' +
    '.cr-body{transform-origin:80px 150px;animation:crSquish 3.2s ease-in-out infinite}' +
    '@keyframes crSquish{0%,100%{transform:scale(1,1)}50%{transform:scale(1.02,.98)}}' +
    '.cr-tuft{transform-origin:80px 24px;animation:crTuft 2.6s ease-in-out infinite}' +
    '@keyframes crTuft{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}' +
    '.cr-glow{animation:crGlow 2.4s ease-in-out infinite}' +
    '@keyframes crGlow{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.1)}}' +
    '.cr-lantern{transform-origin:138px 144px;animation:crLamp 3.6s ease-in-out infinite}' +
    '@keyframes crLamp{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}' +
    '.cr-armR{transform-origin:126px 128px;animation:crArmR 2.8s ease-in-out infinite}' +
    '@keyframes crArmR{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(6deg)}}' +
    '.cr-armL{transform-origin:34px 128px;animation:crArmL 2.8s ease-in-out infinite}' +
    '@keyframes crArmL{0%,100%{transform:rotate(4deg)}50%{transform:rotate(-6deg)}}' +
    // 小灵宠皮肤下整体尺寸收紧（矮一些）
    'body.sally-skin-creature #sallyStage{height:202px}' +
    'body.sally-skin-creature .sp-char{height:202px}' +
    'body.sally-skin-creature .sp-svg{height:202px}' +
    'body.sally-skin-creature .sp-portal{bottom:0;width:108px}' +
    'body.sally-skin-creature #sallyPatBtn,body.sally-skin-creature #sallyMicBtn{bottom:42px}' +
    'body.sally-skin-creature #sallyBadge{bottom:6px}' +
    'body.sally-skin-creature #sallyPanel{bottom:214px;max-height:calc(100vh - 240px)}' +
    'body.sally-skin-creature #sallyHud{bottom:214px}' +
    'body.sally-skin-creature #sallyDl{bottom:252px}' +
    'body.sally-skin-creature #sallyUpd{bottom:292px}' +
    '@keyframes spBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}' +
    '.sp-hairBack{transform-origin:80px 40px;animation:spSway 5.2s ease-in-out infinite}' +
    '.sp-hairFront{transform-origin:80px 40px;animation:spSway 5.2s ease-in-out infinite reverse}' +
    '@keyframes spSway{0%,100%{transform:rotate(-1.1deg)}50%{transform:rotate(1.1deg)}}' +
    '.sp-head{transform-origin:80px 106px;transition:transform .25s ease-out}' +
    '.sp-eyewrap{transform-origin:80px 76px;animation:spBlink 5s infinite}' +
    '@keyframes spBlink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}' +
    '.sp-pupils{transition:transform .18s ease-out}' +
    '.sp-blush{animation:spBlush 3.2s ease-in-out infinite}' +
    '@keyframes spBlush{0%,100%{opacity:.42}50%{opacity:.72}}' +
    '.sp-armR{transform-origin:104px 130px;animation:spWave 3.6s ease-in-out infinite}' +
    '@keyframes spWave{0%,70%,100%{transform:rotate(-6deg)}20%{transform:rotate(16deg)}45%{transform:rotate(6deg)}}' +
    '.sp-sp{animation:spSpark 2.8s ease-in-out infinite}' +
    '.sp-sp2{animation-delay:.5s}.sp-sp3{animation-delay:1s}.sp-sp4{animation-delay:1.5s}.sp-sp5{animation-delay:.8s}.sp-sp6{animation-delay:2s}' +
    '@keyframes spSpark{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:.95;transform:scale(1.15)}}' +
    '.sp-mouthN,.sp-mouthH{transform-box:fill-box;transform-origin:center}' +
    '#sallyStage.talking .sp-mouthN{animation:spTalk .32s ease-in-out infinite}' +
    '@keyframes spTalk{0%,100%{transform:scaleY(1)}50%{transform:scaleY(2.4)}}' +
    '#sallyStage.tilt .sp-head{transform:rotate(9deg) translateY(2px)}' +
    '#sallyStage.love .sp-heartHand{display:block!important;animation:spHeartPop .9s ease-out}' +
    '@keyframes spHeartPop{0%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(1)}}' +
    '#sallyStage.pop .sp-svg{animation:spPop .7s cubic-bezier(.2,1.4,.4,1)}' +
    '@keyframes spPop{0%{transform:translateY(26px) scale(.8)}60%{transform:translateY(-6px) scale(1.04)}100%{transform:translateY(0) scale(1)}}' +
    '#sallyStage.pet .sp-svg{animation:spJump .55s}' +
    '@keyframes spJump{0%{transform:translateY(0)}30%{transform:translateY(-16px) scale(1.06)}60%{transform:translateY(0) scale(.98)}100%{transform:translateY(0)}}' +
    '#sallyStage.hop .sp-svg{animation:spHop .7s ease-in-out}' +
    '@keyframes spHop{0%{transform:translateY(0)}25%{transform:translateY(-12px) rotate(-3deg)}50%{transform:translateY(0)}75%{transform:translateY(-7px) rotate(3deg)}100%{transform:translateY(0)}}' +
    '#sallyStage.dance .sp-svg{animation:spDance 1.6s ease-in-out infinite}' +
    '@keyframes spDance{0%{transform:rotate(0) translateY(0)}15%{transform:rotate(-7deg) translateY(-6px)}30%{transform:rotate(0) translateY(0)}45%{transform:rotate(7deg) translateY(-6px)}60%{transform:rotate(0) translateY(0)}75%{transform:rotate(-4deg) translateY(-3px)}100%{transform:rotate(0) translateY(0)}}' +
    '#sallyStage.dance .sp-armL{animation:spDanceArmL 1.6s ease-in-out infinite;transform-origin:56px 130px}' +
    '#sallyStage.dance .sp-armR{animation:spDanceArmR 1.6s ease-in-out infinite}' +
    '@keyframes spDanceArmL{0%,100%{transform:rotate(0)}50%{transform:rotate(-28deg)}}' +
    '@keyframes spDanceArmR{0%,100%{transform:rotate(0)}50%{transform:rotate(30deg)}}' +
    '#sallyPatBtn{position:absolute;right:-6px;bottom:64px;width:34px;height:34px;border-radius:50%;background:#fff;color:#ff5a7a;font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 5px 16px rgba(30,60,140,.32);z-index:4;user-select:none;transition:transform .15s}' +
    '#sallyMicBtn{position:absolute;left:-6px;bottom:64px;width:34px;height:34px;border-radius:50%;background:#fff;color:#4f7cff;font-size:16px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 5px 16px rgba(30,60,140,.32);z-index:4;user-select:none;transition:transform .15s}' +
    '#sallyMicBtn.rec{background:#ff4d6d;color:#fff;animation:spBadge 1s infinite}' +
    '#sallyCallBtn{position:absolute;left:-6px;bottom:104px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#3ddc97,#22b783);color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 5px 16px rgba(30,120,90,.4);z-index:4;user-select:none;transition:transform .15s}' +
    '#sallyCallBtn:hover{transform:scale(1.14)}' +
    '#sallyCallBtn.live{background:linear-gradient(135deg,#ff6b8f,#e5484d);animation:spBadge 1.4s infinite}' +
    '#sallyPatBtn:hover,#sallyMicBtn:hover{transform:scale(1.14)}' +
    '#sallyBadge{position:absolute;left:8px;bottom:12px;background:#ff5a7a;color:#fff;font-size:10.5px;padding:2px 7px;border-radius:10px;font-weight:600;z-index:4;box-shadow:0 2px 6px rgba(255,90,122,.5)}' +
    '#sallyBadge.pulse{animation:spBadge 1.2s ease-in-out infinite}' +
    '@keyframes spBadge{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}' +
    // 面板
    '#sallyPanel{position:absolute;right:0;bottom:252px;width:352px;height:508px;max-width:calc(100vw - 24px);max-height:calc(100vh - 280px);background:#0f1730;border:1px solid #22305c;border-radius:16px;box-shadow:0 20px 52px rgba(0,0,0,.55);display:none;flex-direction:column;overflow:hidden;color:#e6ecff}' +
    '#sallyPanel.open{display:flex;animation:spPanel .28s ease-out}' +
    '@keyframes spPanel{0%{opacity:0;transform:translateY(14px) scale(.98)}100%{opacity:1;transform:none}}' +
    '#sallyGrip{position:absolute;left:0;top:0;width:16px;height:16px;cursor:nwse-resize;z-index:6;background:linear-gradient(135deg,#4f7cff55 0%,transparent 60%);border-top-left-radius:15px}' +
    '#sallyHead{background:linear-gradient(135deg,#243066,#141d3d);padding:9px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #22305c;cursor:move}' +
    '#sallyHead .ava{width:44px;height:44px;flex:0 0 44px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 40% 30%,#fff,#e9f0ff);display:flex;align-items:center;justify-content:center}' +
    '#sallyHead .ava .sp-svg{width:32px;height:51px;margin-top:6px;animation:none}' +
    '#sallyHead .tt{flex:1;min-width:0}' +
    '#sallyHead .tt b{font-size:14px}' +
    '#sallyHead .tt .sl{font-size:10.5px;color:#9db0e6;line-height:1.3;margin-top:1px}' +
    '#sallyHead .hb{cursor:pointer;color:#9db0e6;font-size:15px;padding:2px 6px;border-radius:6px}' +
    '#sallyHead .hb:hover{background:#22305c;color:#fff}' +
    '#sallyAgent{display:none}' +
    '#sallyAgentBox{position:absolute;left:0;right:0;top:0;bottom:0;background:#0f1730;display:none;flex-direction:column;z-index:7}' +
    '#sallyAgentBox.on{display:flex}' +
    '.ag-h{padding:9px 12px;border-bottom:1px solid #22305c;font-size:12.5px;color:#9db0e6;display:flex;gap:8px;align-items:center}' +
    '.ag-h span{cursor:pointer;color:#8fb6ff}' +
    '.ag-h .x2{margin-left:auto;cursor:pointer;color:#9db0e6}' +
    '.ag-t{padding:9px 12px;border-bottom:1px dashed #1d2c4e;cursor:pointer}' +
    '.ag-t:hover{background:rgba(79,124,255,.08)}' +
    '.ag-t1{font-size:12.5px;color:#dbe4ff}' +
    '.ag-t2{font-size:11.5px;color:#8aa0d8;margin-top:3px}' +
    '.ag-time{color:#5f7099;margin-left:6px}' +
    '.ag-empty{padding:22px;text-align:center;color:#7f90c4;font-size:12.5px;line-height:1.8}' +
    '.ag-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}' +
    '.ag-m{max-width:82%;padding:7px 10px;border-radius:10px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}' +
    '.ag-u{align-self:flex-start;background:#1a2447;border:1px solid #26325e;color:#dbe4ff}' +
    '.ag-a{align-self:flex-end;background:#25604a;color:#e6fff4}' +
    '.ag-in{display:flex;gap:7px;padding:9px;border-top:1px solid #22305c;background:#0c1330}' +
    '.ag-in input{flex:1;background:#151f42;border:1px solid #26325e;color:#e6ecff;border-radius:9px;padding:9px;font-size:13px;outline:none}' +
    '.ag-in button{background:#4f7cff;border:none;color:#fff;border-radius:9px;padding:0 14px;font-size:13px;cursor:pointer}' +
    // 通讯录（微信式）
    '#sallyBookBox{position:absolute;left:0;right:0;top:0;bottom:0;background:#0f1730;display:none;flex-direction:column;z-index:8}' +
    '#sallyBookBox.on{display:flex}' +
    '.bk-h{padding:9px 12px;border-bottom:1px solid #22305c;display:flex;align-items:center;gap:8px;font-size:12.5px;color:#9db0e6}' +
    '.bk-h b{color:#e6ecff}' +
    '.bk-h .x2{margin-left:auto;cursor:pointer;color:#9db0e6;font-size:14px}' +
    '.bk-s{padding:7px 12px;border-bottom:1px solid #1b2648}' +
    '.bk-s input{width:100%;background:#151f42;border:1px solid #26325e;color:#e6ecff;border-radius:8px;padding:7px 10px;font-size:12.5px;outline:none}' +
    '.bk-l{flex:1;overflow-y:auto;min-height:0}' +
    '.bk-g{padding:7px 12px 4px;font-size:11px;color:#6f83b8;letter-spacing:.5px}' +
    '.bk-i{display:flex;align-items:center;gap:9px;padding:8px 12px;cursor:pointer;border-bottom:1px dashed #1a2646}' +
    '.bk-i:hover{background:rgba(79,124,255,.1)}' +
    '.bk-av{width:30px;height:30px;flex:0 0 30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:600;color:#fff;background:linear-gradient(135deg,#4f7cff,#22c1c3)}' +
    '.bk-av.a{background:linear-gradient(135deg,#ff8fb1,#ff6b8f)}' +
    '.bk-av.e{background:linear-gradient(135deg,#3ddc97,#2b9e6e)}' +
    '.bk-n{flex:1;min-width:0}' +
    '.bk-n b{font-size:12.5px;color:#e6ecff;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bk-n span{font-size:11px;color:#8aa0d8;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.bk-empty{padding:24px;text-align:center;color:#7f90c4;font-size:12.5px;line-height:1.9}' +
    '#sallyRoles{display:flex;gap:5px;padding:7px 10px;background:#0c1330;border-bottom:1px solid #1b2648;overflow-x:auto}' +
    '.sp-role{flex:0 0 auto;font-size:11px;padding:4px 9px;border-radius:12px;background:#1a2447;border:1px solid #26325e;color:#a9bcf0;cursor:pointer;white-space:nowrap}' +
    '.sp-role.on{background:var(--sp-ring);border-color:var(--sp-ring);color:#fff}' +
    '#sallyPet{display:flex;align-items:center;gap:8px;padding:5px 12px;background:#0c1330;border-bottom:1px solid #1b2648;font-size:11px;color:#9db0e6}' +
    '#sallyPet .bar{flex:1;height:6px;background:#1b2648;border-radius:4px;overflow:hidden}' +
    '#sallyPet .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff7aa2,#ffb454);transition:width .4s}' +
    '#sallyMsgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}' +
    '.sp-msg{max-width:84%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word}' +
    '.sp-msg.u{align-self:flex-end;background:#4f7cff;color:#fff;border-bottom-right-radius:4px}' +
    '.sp-msg.a{align-self:flex-start;background:#1a2447;color:#dbe4ff;border-bottom-left-radius:4px;border:1px solid #26325e}' +
    '.sp-msg.a.typing{color:#8aa0d8}' +
    '.sp-msg.h{align-self:flex-start;background:#16303a;color:#c9f5e6;border-bottom-left-radius:4px;border:1px solid #235a52}' +
    '.sp-msg.sys{align-self:center;background:transparent;color:#7f90c4;font-size:11.5px;padding:2px 6px;text-align:center;max-width:92%}' +
    '.sp-msg .who{display:block;font-size:10.5px;color:#7de0c0;margin-bottom:3px}' +
    '.sp-msg .src{display:inline-block;margin-top:6px;font-size:11px;color:#8fb6ff;text-decoration:none;border-bottom:1px dashed #8fb6ff}' +
    '.sp-msg b{color:#fff}' +
    '.sp-msg img{max-width:100%;border-radius:8px;margin-top:5px;display:block}' +
    '.sp-msg.clamped{max-height:320px;overflow:hidden;position:relative}' +
    '.sp-msg.clamped::after{content:"";position:absolute;left:0;right:0;bottom:0;height:60px;background:linear-gradient(180deg,rgba(26,36,71,0),rgba(26,36,71,.98));pointer-events:none}' +
    '.sp-more{margin-top:6px;font-size:11.5px;color:#8fb6ff;cursor:pointer;text-align:center;border-top:1px dashed #26325e;padding-top:5px}' +
    '#sallyMsgs::-webkit-scrollbar{width:9px}' +
    '#sallyMsgs::-webkit-scrollbar-thumb{background:#2c3f7a;border-radius:5px}' +
    '#sallyMsgs::-webkit-scrollbar-thumb:hover{background:#3d55a0}' +
    '#sallyMsgs::-webkit-scrollbar-track{background:transparent}' +
    '#sallyQuick{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}' +
    '.sp-q{font-size:11.5px;background:#1a2447;border:1px solid #26325e;color:#a9bcf0;padding:5px 10px;border-radius:14px;cursor:pointer}' +
    '.sp-q:hover{border-color:#4f7cff;color:#fff}' +
    '#sallyPlay{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}' +
    '.sp-p{font-size:11.5px;background:#17233f;border:1px solid #2a3a63;color:#9fd8ff;padding:5px 10px;border-radius:14px;cursor:pointer}' +
    '.sp-p:hover{border-color:#4f7cff;color:#fff;transform:translateY(-1px)}' +
    '.sp-opt{display:block;width:100%;text-align:left;margin-top:6px;font-size:12.5px;background:#17233f;border:1px solid #2a3a63;color:#cfe0ff;padding:7px 10px;border-radius:9px;cursor:pointer}' +
    '.sp-opt:hover{border-color:#4f7cff;background:#1d2b52}' +
    '.sp-opt.ok{border-color:#3ddc97;background:#123027;color:#c9f5e6}' +
    '.sp-opt.no{border-color:#ff6b8f;background:#331723;color:#ffd6e0}' +
    '#sallyAttach{display:flex;gap:6px;padding:0 11px 6px}' +
    '.sp-at{font-size:11.5px;background:#151f42;border:1px solid #26325e;color:#9db0e6;padding:4px 10px;border-radius:12px;cursor:pointer}' +
    '.sp-at:hover{border-color:#4f7cff;color:#fff}' +
    '#sallyInput{display:flex;gap:7px;padding:9px 11px;border-top:1px solid #22305c;background:#0c1330}' +
    '#sallyInput input{flex:1;background:#151f42;border:1px solid #26325e;color:#e6ecff;border-radius:9px;padding:9px 11px;font-size:13px;outline:none}' +
    '#sallyInput input:focus{border-color:#4f7cff}' +
    '#sallySend{background:#4f7cff;color:#fff;border:none;border-radius:9px;padding:0 14px;font-size:13px;cursor:pointer;font-weight:500}' +
    '#sallySend:hover{background:#6b91ff}' +
    '.sp-heart{position:absolute;right:40px;bottom:120px;font-size:19px;pointer-events:none;z-index:5;animation:spHeart 1.1s ease-out forwards}' +
    '@keyframes spHeart{0%{opacity:0;transform:translateY(0) scale(.6)}30%{opacity:1}100%{opacity:0;transform:translateY(-70px) scale(1.3)}}' +
    '.sp-bubble{position:absolute;right:112px;bottom:150px;background:#fff;color:#2a3560;font-size:11.5px;padding:6px 11px;border-radius:12px;border-bottom-right-radius:3px;box-shadow:0 5px 16px rgba(0,0,0,.28);white-space:nowrap;pointer-events:none;z-index:5;animation:spBub 2.6s ease-out forwards}' +
    '@keyframes spBub{0%{opacity:0;transform:translateX(8px)}12%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}' +
    '#sallyGuard{position:absolute;right:88px;bottom:218px;width:248px;max-width:calc(100vw - 32px);display:none;background:linear-gradient(135deg,rgba(255,244,250,.98),rgba(255,224,238,.98));color:#46263a;border:1px solid #ff9fc0;border-radius:16px;padding:10px 11px;box-shadow:0 12px 30px rgba(175,55,112,.32),0 0 0 3px rgba(255,171,205,.18);z-index:100001;animation:sgIn .22s ease-out}' +
    '#sallyGuard.on{display:block}' +
    '#sallyGuard.high{background:linear-gradient(135deg,rgba(255,244,238,.99),rgba(255,220,220,.99));border-color:#ff8b93;color:#552632}' +
    '#sallyGuard .sg-top{display:flex;align-items:center;gap:6px;font-size:12px}' +
    '#sallyGuard .sg-ic{font-size:16px}' +
    '#sallyGuard .sg-title{flex:1}' +
    '#sallyGuard .sg-x{cursor:pointer;font-size:16px;line-height:1;opacity:.6}' +
    '#sallyGuard .sg-body{font-size:11.5px;line-height:1.55;margin-top:5px;word-break:break-word}' +
    '#sallyGuard .sg-actions{display:flex;gap:6px;margin-top:8px}' +
    '#sallyGuard button{border:1px solid #e78aac;background:rgba(255,255,255,.6);color:#7d3158;border-radius:9px;padding:4px 8px;font-size:11px;cursor:pointer}' +
    '#sallyGuard button:hover{background:#fff}' +
    '#sallyGuard .sg-go{margin-left:auto;background:#ff78a6;border-color:#ff78a6;color:#fff}' +
    '@keyframes sgIn{from{opacity:0;transform:translateY(7px) scale(.96)}to{opacity:1;transform:none}}' +
    '#sallyHud{position:absolute;right:0;bottom:252px;width:560px;max-width:calc(100vw - 24px);max-height:calc(100vh - 300px);background:linear-gradient(180deg,rgba(12,22,48,.97),rgba(8,14,32,.98));border:1px solid #2c3f7a;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(90,140,255,.15) inset;display:none;flex-direction:column;overflow:hidden;color:#dfe9ff;z-index:100000}' +
    '#sallyHud.open{display:flex;animation:spPanel .26s ease-out}' +
    '#sallyHud .hd{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #22345e;background:linear-gradient(90deg,rgba(47,128,237,.18),transparent)}' +
    '#sallyHud .hd b{font-size:13.5px;letter-spacing:.3px}' +
    '#sallyHud .hd .tag{font-size:10.5px;color:#7fb0ff;border:1px solid #2c4a86;border-radius:9px;padding:1px 7px}' +
    '#sallyHud .hd .x{margin-left:auto;cursor:pointer;color:#8fa8d8;font-size:17px;padding:0 6px}' +
    '#sallyHud .bd{padding:12px 14px;overflow:auto}' +
    '#sallyHud table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}' +
    '#sallyHud th{text-align:left;color:#8fb6ff;font-weight:600;padding:6px 8px;border-bottom:1px solid #24365f;position:sticky;top:0;background:#0d1832}' +
    '#sallyHud td{padding:6px 8px;border-bottom:1px dashed #1d2c4e;color:#cfe0ff;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;line-height:1.65}' +
    '#sallyHud tr:hover td{background:rgba(79,124,255,.08)}' +
    '#sallyHud .ft{padding:9px 14px;border-top:1px solid #22345e;display:flex;gap:10px;align-items:center;font-size:11.5px;color:#8fa8d8}' +
    '#sallyHud .ft a{color:#8fb6ff;text-decoration:none;border-bottom:1px dashed #8fb6ff;margin-left:auto}' +
    '#sallyDl{position:absolute;right:16px;bottom:250px;display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff9dbb,#ff6b8f);color:#fff;font-size:11.5px;font-weight:600;padding:6px 10px;border-radius:14px;box-shadow:0 8px 20px rgba(255,107,143,.45);cursor:pointer;z-index:5;animation:spDl 2.4s ease-in-out infinite;white-space:nowrap}' +
    '#sallyDl .ic{background:rgba(255,255,255,.28);border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:12px}' +
    '#sallyDl .x{opacity:.75;font-size:11px;padding:0 2px}' +
    '#sallyDl .x:hover{opacity:1}' +
    '#sallyPanel.open ~ #sallyDl{display:none}' +
    '#sallyUpd{position:absolute;right:16px;bottom:290px;display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#a06bff,#6b8fff);color:#fff;font-size:11.5px;font-weight:600;padding:6px 10px;border-radius:14px;box-shadow:0 8px 22px rgba(140,110,255,.5);cursor:pointer;z-index:6;white-space:nowrap;animation:spUpd 1.8s ease-in-out infinite}' +
    '#sallyUpd .u-ic{font-size:13px}' +
    '#sallyUpd .u-x{opacity:.75;font-size:11px;padding:0 2px}' +
    '#sallyUpd .u-x:hover{opacity:1}' +
    '@keyframes spUpd{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1.5deg)}}' +
    '@keyframes spDl{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}' +
    '@media(max-width:520px){#sallyDl{right:8px;bottom:246px;font-size:11px}}' +
    '#sallyRoot.sally-login{bottom:22px;right:26px}' +
    '#sallyRoot.sally-login #sallyStage{transform:scale(1.3);transform-origin:right bottom}' +
    '@media(max-width:520px){#sallyPanel{width:calc(100vw - 24px);height:64vh;bottom:246px}#sallyRoot{right:10px;bottom:8px}#sallyHud{width:calc(100vw - 24px)}#sallyRoot.sally-login #sallyStage{transform:scale(1.05)}}' +
    '/* 点击穿透：容器/舞台/精灵盒不拦点击，只有精灵图形与功能按钮可点 */' +
    '#sallyStage{pointer-events:none;cursor:default}' +
    '.sp-portal,.sp-char{pointer-events:none}' +
    '.sp-svg{pointer-events:visiblePainted;cursor:grab;touch-action:none}' +
    '#sallyMicBtn,#sallyCallBtn,#sallyPatBtn,#sallyGrip,#sallyDl,#sallyUpd{pointer-events:auto}' +
    '#sallyPanel,#sallyGuard,#sallyHud,#sallyBookBox,#sallyAgentBox{pointer-events:auto}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  if (window.SALLY_NO_FLOAT) {
    window.SallySprite = { mascot: mascot, mascotCreature: mascotCreature, SLOGAN: SLOGAN, API: API, INBOX: INBOX, ROLE_THEME: ROLE_THEME, ROLE_FALLBACK: ROLE_FALLBACK, version: 'v12' };
    console.log('[小仁同学] v5 export-only (no float)');
    return;
  }

  // ---------- DOM ----------
  var root = document.createElement('div'); root.id = 'sallyRoot';
  root.innerHTML =
    '<div id="sallyPanel">' +
      '<div id="sallyGrip" title="拖动可缩放"></div>' +
      '<div id="sallyHead"><div class="ava">' + mascot() + '</div>' +
        '<div class="tt"><b id="sallyName">小仁同学（RB）</b><div class="sl">' + SLOGAN + '</div></div>' +
        '<span class="hb" id="sallyBook" title="通讯录（系统所有成员）">👥</span>' +
        '<span class="hb" id="sallySkin" title="切换 人物 / 小灵宠">👧</span>' +
        '<span class="hb" id="sallyAgent" title="客服台（管理员）">🎧</span>' +
        '<span class="hb" id="sallyExpand" title="放大/还原">⤢</span>' +
        '<span class="hb" id="sallyPop" title="独立窗口打开">↗</span>' +
        '<span class="hb" id="sallyClose" title="关闭">✕</span></div>' +
      '<div id="sallyRoles"></div>' +
      '<div id="sallyPet"><span>🐾 亲密度</span><div class="bar"><i id="sallyInti"></i></div><span id="sallyLv">Lv.1</span></div>' +
      '<div id="sallyMsgs"></div>' +
      '<div id="sallyQuick"></div>' +
      '<div id="sallyPlay"></div>' +
      '<div id="sallyAttach"><span class="sp-at" id="atImg">🖼 图片</span><span class="sp-at" id="atFile">📎 文件</span><span class="sp-at" id="atVoice">🎙 录音</span><span class="sp-at" id="atClear" style="display:none">⏹ 停止录音</span></div>' +
      '<div id="sallyInput"><input id="sallyText" placeholder="说点什么，或让我帮你干活…" autocomplete="off"><button id="sallySend">发送</button></div>' +
      '<div id="sallyAgentBox"></div>' +
      '<div id="sallyBookBox"></div>' +
    '</div>' +
    '<div id="sallyGuard" role="status" aria-live="polite"><div class="sg-top"><span class="sg-ic">提示</span><b class="sg-title">我看到一个动作</b><span class="sg-x">×</span></div><div class="sg-body"></div><div class="sg-actions"><button class="sg-review">查看这一步</button><button class="sg-go">继续</button></div></div>' +
    '<div id="sallyHud"><div class="hd"><b id="hudTitle">数据舱</b><span class="tag">sally · live</span><span class="x" id="hudClose">✕</span></div><div class="bd" id="hudBody"></div><div class="ft" id="hudFoot"></div></div>' +
    '<div id="sallyStage">' +
      '<div class="sp-portal"></div>' +
      '<div class="sp-char">' + mascot() + '</div>' +
      '<div id="sallyMicBtn" title="语音输入">🎤</div>' +
      '<div id="sallyCallBtn" title="实时语音对话（像打电话一样）">📞</div>' +
      '<div id="sallyPatBtn" title="拍拍它">🐾</div>' +
      '<span id="sallyBadge" style="display:none">1</span>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (s) { return root.querySelector(s); };
  var stage = $('#sallyStage'), panel = $('#sallyPanel'), msgs = $('#sallyMsgs'), input = $('#sallyText');

  // ---------- 动作提示字段（头顶小牌子） ----------
  var guardTimer = null;
  function hideGuard() { var el = $('#sallyGuard'); if (el) el.classList.remove('on'); clearTimeout(guardTimer); }
  function showGuard(p) {
    if (!p || p.kind === 'expected' || p.kind === 'cleared' || p.kind === 'expected-done') { if (p && p.kind === 'expected-done') hideGuard(); return; }
    var el = $('#sallyGuard'); if (!el) return;
    var actual = p.actual || {}, expected = p.expected || {};
    var title = el.querySelector('.sg-title'), body = el.querySelector('.sg-body'), review = el.querySelector('.sg-review');
    var mismatch = p.kind === 'mismatch';
    title.textContent = mismatch ? '这一步好像偏了' : (p.level === 'high' ? '先停一下，我看到了' : '我看到你要做这一步');
    body.textContent = mismatch
      ? '你刚要点「' + (actual.label || '这个按钮') + '」，但当前更像是「' + (expected.label || '下一步') + '」。我先不替你拦，给你看一眼。'
      : '即将执行「' + (actual.label || '这个动作') + '」。如果这不是你想要的，先别继续，我在这里帮你核对。';
    if (expected.hint) body.textContent += ' ' + expected.hint;
    el.className = 'on ' + (p.level === 'high' ? 'high' : '');
    review.style.display = expected.label ? '' : 'none';
    review.textContent = mismatch ? '查看正确步骤' : '让我看一下';
    review.onclick = function () {
      hideGuard();
      if (!panel.classList.contains('open')) { panel.classList.add('open'); clearBadge(); }
      addMsg('sys', mismatch ? ('当前预期：' + (expected.label || '下一步') + (expected.step ? ' · 第 ' + expected.step + ' 步' : '')) : ('我看到你要做：' + (actual.label || '这个动作')));
    };
    el.querySelector('.sg-go').onclick = function () { hideGuard(); GUARD.mute(2600); };
    el.querySelector('.sg-x').onclick = hideGuard;
    clearTimeout(guardTimer); guardTimer = setTimeout(hideGuard, mismatch ? 10000 : 7000);
    flash('tilt', 900);
  }
  GUARD.on(showGuard);

  // ---------- 拖动精灵（拖到哪就停哪） ----------
  (function initDrag() {
    var dragging = false, moved = false, sx = 0, sy = 0, sr = 0, sb = 0;
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && typeof p.right === 'number') { root.style.right = p.right + 'px'; root.style.bottom = p.bottom + 'px'; }
    } catch (e) {}
    stage.addEventListener('mousedown', function (e) {
      if (e.target.id === 'sallyPatBtn' || e.target.id === 'sallyMicBtn') return;
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      sr = parseFloat(getComputedStyle(root).right) || 18;
      sb = parseFloat(getComputedStyle(root).bottom) || 14;
      stage.classList.add('dragging');
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      var nr = Math.max(2, Math.min(window.innerWidth - 60, sr - dx));
      var nb = Math.max(2, Math.min(window.innerHeight - 60, sb - dy));
      root.style.right = nr + 'px'; root.style.bottom = nb + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false; stage.classList.remove('dragging');
      if (moved) {
        try { localStorage.setItem(POS_KEY, JSON.stringify({ right: parseFloat(root.style.right), bottom: parseFloat(root.style.bottom) })); } catch (e) {}
      } else {
        stage.dispatchEvent(new CustomEvent('sally-toggle'));
      }
    });
  })();

  // ---------- 面板缩放 / 放大 / 独立窗口 ----------
  (function initPanel() {
    var sizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    try {
      var z = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (z && z.w) { panel.style.width = z.w + 'px'; panel.style.height = z.h + 'px'; }
    } catch (e) {}
    var grip = $('#sallyGrip');
    grip.addEventListener('mousedown', function (e) {
      sizing = true; sx = e.clientX; sy = e.clientY;
      sw = panel.offsetWidth; sh = panel.offsetHeight;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', function (e) {
      if (!sizing) return;
      var w = Math.max(300, Math.min(window.innerWidth - 24, sw - (e.clientX - sx)));
      var h = Math.max(280, Math.min(window.innerHeight - 120, sh - (e.clientY - sy)));
      panel.style.width = w + 'px'; panel.style.height = h + 'px';
    });
    document.addEventListener('mouseup', function () {
      if (!sizing) return; sizing = false;
      try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: panel.offsetWidth, h: panel.offsetHeight })); } catch (e) {}
    });
    $('#sallyExpand').onclick = function (e) {
      e.stopPropagation();
      if (panel.classList.contains('wide')) {
        panel.classList.remove('wide'); panel.style.width = ''; panel.style.height = '';
      } else {
        panel.classList.add('wide');
        panel.style.width = Math.min(window.innerWidth - 24, 760) + 'px';
        panel.style.height = Math.min(window.innerHeight - 120, 720) + 'px';
      }
    };
    $('#sallyPop').onclick = function (e) {
      e.stopPropagation();
      var clientUrl = OPEN_CONFIG.clientUrl || './index.html';
      window.open(clientUrl + (clientUrl.indexOf('?') >= 0 ? '&' : '?') + 'sally=client&q=' + encodeURIComponent(lastUserText.slice(0, 60)), 'sally_client', 'width=980,height=760');
    };
  })();

  // ---------- 皮肤：人物 / 小灵宠 ----------
  var skin = 'girl'; try { skin = localStorage.getItem(SKIN_KEY) || 'girl'; } catch (e) {}
  function mascotFor(s) { return s === 'creature' ? mascotCreature() : mascot(); }
  function applySkin() {
    try {
      var ch = stage.querySelector('.sp-char'); if (ch) ch.innerHTML = mascotFor(skin);
      var av = root.querySelector('#sallyHead .ava'); if (av) av.innerHTML = mascotFor(skin);
      var sb = $('#sallySkin');
      if (sb) { sb.textContent = skin === 'creature' ? '🐣' : '👧'; sb.title = skin === 'creature' ? '现在是「小灵宠」，点我换回人物' : '现在是「人物」，点我换成小灵宠'; }
      document.body.classList.toggle('sally-skin-creature', skin === 'creature');
      localStorage.setItem(SKIN_KEY, skin);
    } catch (e) {}
  }
  function toggleSkin() {
    skin = skin === 'creature' ? 'girl' : 'creature';
    applySkin();
    flash('hop', 750); popHearts(2);
    popText(skin === 'creature' ? '变成小灵宠啦～🎐' : '变回人物啦～');
  }

  // ---------- 换装 ----------
  function applyRole(id) {
    role = ROLE_THEME[id] ? id : 'default';
    try { localStorage.setItem(ROLE_KEY, role); } catch (e) {}
    var t = ROLE_THEME[role];
    root.style.setProperty('--sp-hairL', t.hairL); root.style.setProperty('--sp-hair', t.hair); root.style.setProperty('--sp-hairD', t.hairD);
    root.style.setProperty('--sp-blouseL', t.blouseL); root.style.setProperty('--sp-blouseD', t.blouseD);
    root.style.setProperty('--sp-skirtL', t.skirtL); root.style.setProperty('--sp-skirtD', t.skirtD);
    root.style.setProperty('--sp-ring', t.ring);
    root.querySelectorAll('.sp-acc').forEach(function (g) { g.style.display = 'none'; });
    if (t.acc && t.acc !== 'none') root.querySelectorAll('.sp-acc-' + t.acc).forEach(function (g) { g.style.display = ''; });
    var meta = null;
    Object.keys(ROLES).forEach(function (k) { if (ROLES[k].id === role) meta = ROLES[k]; });
    if (!meta) meta = ROLE_FALLBACK.filter(function (r) { return r.id === role; })[0] || ROLE_FALLBACK[0];
    $('#sallyName').textContent = meta.name + (meta.icon ? ' ' + meta.icon : '');
    root.querySelectorAll('.sp-role').forEach(function (b) { b.classList.toggle('on', b.dataset.role === role); });
    renderQuick();
  }
  function renderRoleBar() {
    var bar = $('#sallyRoles');
    var list = (Object.keys(ROLES).length ? Object.keys(ROLES).map(function (k) { return ROLES[k]; }) : ROLE_FALLBACK);
    bar.innerHTML = '';
    list.forEach(function (r) {
      var b = document.createElement('div');
      b.className = 'sp-role'; b.dataset.role = r.id;
      b.textContent = (r.icon || '') + ' ' + String(r.name || '').replace('·小仁', '');
      b.onclick = function () { applyRole(r.id); flash('hop', 750); addMsg('sys', '已换装为「' + r.name + '」· ' + (r.tag || '')); };
      bar.appendChild(b);
    });
  }

  function md(t) { // 极简 markdown：**粗体** + 自动链接
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<）)】]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#8fb6ff;word-break:break-all">$1</a>');
  }
  function clampMsg(el, text) {
    if (!text || text.length <= 480) return;
    el.classList.add('clamped');
    var b = document.createElement('div'); b.className = 'sp-more'; b.textContent = '展开全文 ▾（共 ' + text.length + ' 字）';
    b.onclick = function () { el.classList.remove('clamped'); b.remove(); msgs.scrollTop = msgs.scrollHeight; };
    el.appendChild(b);
  }
  function addMsg(roleK, text, who, src) {
    var d = document.createElement('div');
    d.className = 'sp-msg ' + (roleK === 'user' ? 'u' : roleK === 'human' ? 'h' : roleK === 'sys' ? 'sys' : 'a');
    if (who) { var w = document.createElement('span'); w.className = 'who'; w.textContent = who; d.appendChild(w); }
    d.insertAdjacentHTML('beforeend', md(text));
    if (src) { var a = document.createElement('a'); a.className = 'src'; a.href = src.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '↗ ' + (src.label || '查看来源'); d.appendChild(document.createElement('br')); d.appendChild(a); }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    clampMsg(d, text);
    return d;
  }
  function renderPet() { $('#sallyInti').style.width = Math.min(100, pet.inti) + '%'; $('#sallyLv').textContent = 'Lv.' + pet.level; }
  function popText(t) { var b = document.createElement('div'); b.className = 'sp-bubble'; b.textContent = t; root.appendChild(b); setTimeout(function () { b.remove(); }, 2700); }
  function popHearts(n) { for (var i = 0; i < (n || 3); i++) (function (i) { setTimeout(function () { var h = document.createElement('div'); h.className = 'sp-heart'; h.textContent = '❤'; h.style.right = (30 + Math.random() * 40) + 'px'; root.appendChild(h); setTimeout(function () { h.remove(); }, 1200); }, i * 130); })(i); }
  function happyOn() { stage.querySelectorAll('.sp-eyesN,.sp-mouthN').forEach(function (e) { e.style.display = 'none'; }); stage.querySelectorAll('.sp-eyesH,.sp-mouthH').forEach(function (e) { e.style.display = ''; }); }
  function happyOff() { stage.querySelectorAll('.sp-eyesH,.sp-mouthH').forEach(function (e) { e.style.display = 'none'; }); stage.querySelectorAll('.sp-eyesN,.sp-mouthN').forEach(function (e) { e.style.display = ''; }); }
  function flash(cls, ms) { stage.classList.remove(cls); void stage.offsetWidth; stage.classList.add(cls); setTimeout(function () { stage.classList.remove(cls); }, ms || 900); }
  function talkOn() { stage.classList.add('talking'); }
  function talkOff() { stage.classList.remove('talking'); }

  var PAT_WORDS = ['好痒呀～', '嘿嘿，谢谢你拍拍我！', '再拍拍嘛～', '我在呢，随时待命！', '摸摸头，元气满满✨', '被你拍得有点害羞啦～'];
  var happyTimer = null;
  function doPat() {
    pet.pats++; pet.inti = Math.min(100, pet.inti + 2);
    var nl = Math.min(9, 1 + Math.floor(pet.inti / 12)), up = nl > pet.level; pet.level = nl; savePet(pet); renderPet();
    flash('pet', 700); flash('love', 950);
    happyOn(); clearTimeout(happyTimer); happyTimer = setTimeout(happyOff, 1400);
    popHearts(up ? 5 : 2);
    popText(up ? ('🎉 升级啦！Lv.' + pet.level + ' ' + PAT_WORDS[pet.pats % PAT_WORDS.length]) : PAT_WORDS[pet.pats % PAT_WORDS.length]);
    if (!panel.classList.contains('open') && pet.pats % 3 === 0) showBadge();
  }
  $('#sallyPatBtn').addEventListener('click', function (e) { e.stopPropagation(); doPat(); });
  renderPet();

  var head = stage.querySelector('.sp-head'), pupils = stage.querySelector('.sp-pupils');
  var raf = null, tx = 0, ty = 0;
  document.addEventListener('mousemove', function (e) {
    var r = stage.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.3;
    var dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 420));
    var dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 420));
    tx = dx * 7; ty = dy * 5;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = null;
      if (head) head.style.transform = 'rotate(' + (tx * 0.5) + 'deg) translate(' + tx + 'px,' + ty + 'px)';
      if (pupils) pupils.style.transform = 'translate(' + (dx * 2.4) + 'px,' + (dy * 1.8) + 'px)';
    });
  });

  var IDLE = [
    function () { flash('tilt', 1400); }, function () { flash('hop', 750); },
    function () { flash('love', 950); popHearts(2); }, function () { flash('dance', 3200); popHearts(3); },
    function () { popText(['我在哦～', '有需要随时喊我 🎐', '喊我干活也行！', '可以把我拖到任何位置 🖐'][Math.floor(Math.random() * 4)]); },
    function () { flash('pop', 700); }
  ];
  (function idleLoop() { setTimeout(function () { if (!document.hidden) { try { IDLE[Math.floor(Math.random() * IDLE.length)](); } catch (e) {} } idleLoop(); }, 4200 + Math.random() * 4200); })();

  function showBadge() { var b = $('#sallyBadge'); unreadHuman++; b.textContent = unreadHuman > 9 ? '9+' : String(unreadHuman); b.style.display = 'block'; b.classList.add('pulse'); }
  function clearBadge() { unreadHuman = 0; var b = $('#sallyBadge'); b.style.display = 'none'; b.classList.remove('pulse'); }

  function hud(title, columns, rows, extra, src) {
    $('#hudTitle').textContent = title || '数据舱';
    var h = '';
    if (extra) { for (var k in extra) h += '<div style="font-size:11.5px;color:#8fa8d8;margin-bottom:8px">' + k + '：<span style="color:#cfe0ff">' + extra[k] + '</span></div>'; }
    if (columns && rows && rows.length) {
      h += '<table><thead><tr>' + columns.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r) { h += '<tr>' + r.map(function (c) { return '<td>' + String(c == null ? '' : c).replace(/</g, '&lt;') + '</td>'; }).join('') + '</tr>'; });
      h += '</tbody></table>';
    }
    $('#hudBody').innerHTML = h || '<div style="color:#8fa8d8;font-size:12.5px">没有数据。</div>';
    $('#hudFoot').innerHTML = '<span>共 ' + ((rows && rows.length) || 0) + ' 条 · ' + new Date().toLocaleTimeString() + '</span>' + (src ? '<a href="' + src.url + '" target="_blank" rel="noopener">' + (src.label || '打开来源') + ' ↗</a>' : '');
    $('#sallyHud').classList.add('open'); flash('hop', 700);
  }
  $('#hudClose').onclick = function () { $('#sallyHud').classList.remove('open'); };

  // ---------- 联系人卡片（含微信二维码） ----------
  function renderContact(c) {
    if (!c) return;
    var d = document.createElement('div'); d.className = 'sp-msg a'; d.style.maxWidth = '94%';
    function row(icon, label, val, href) {
      if (!val) return '';
      return '<div style="margin:3px 0;font-size:12.5px">' + icon + ' <span style="color:#9db0e6">' + label + '：</span>' +
        (href ? '<a href="' + href + '" target="_blank" rel="noopener" style="color:#8fb6ff">' + val + '</a>' : val) + '</div>';
    }
    var h = '<div style="font-weight:600;margin-bottom:6px">📇 ' + (c.name || 'sally') + ' 的联系方式</div>';
    h += row('👤', '职务', c.title);
    h += row('📧', '邮箱', c.email, c.email ? 'mailto:' + c.email : '');
    h += row('📱', '手机', c.phone, c.phone ? 'tel:' + String(c.phone).replace(/\s/g, '') : '');
    h += row('💬', 'WhatsApp', c.whatsapp, c.whatsapp ? 'https://wa.me/' + String(c.whatsapp).replace(/[^\d]/g, '') : '');
    h += row('🔵', '飞书', c.feishu);
    if (c.wechat_qr) h += '<div style="margin-top:8px"><div style="font-size:12.5px;color:#9db0e6;margin-bottom:4px">🟢 微信（扫码加我）</div><img src="' + c.wechat_qr + '" alt="微信二维码" style="width:170px;background:#fff;padding:6px;border-radius:10px"></div>';
    h += row('⚡', '最快的方式', c.inbox);
    if (c.note) h += '<div style="margin-top:6px;font-size:11.5px;color:#7f90c4">' + c.note + '</div>';
    d.innerHTML = h; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    flash('love', 950); popHearts(3);
  }

  // ---------- 消息盒子（含附件） ----------
  function mirrorToInbox(text, att) {
    try {
      var payload = { body: text || '', category: bookPeer ? ('私聊·' + bookPeer) : 'sally精灵'   /* 🔒 内部键：不要改名，线上库已有同名历史会话 */, title: (bookPeer ? ('给 ' + bookPeer + '：') : '') + String(text || (att && att.name) || '附件').slice(0, 50), page: location.href };
      if (att) { payload.attachment = att.b64; payload.filename = att.name; payload.mime = att.mime; }
      fetch(INBOX + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.thread_id) { threadId = j.thread_id; lastSeenMsgId = j.message_id || 0; startPoll(); } })
        .catch(function () {});
    } catch (e) {}
  }
  function pollOnce() {
    if (!threadId || pollBusy) return; pollBusy = true;
    fetch(INBOX + '/thread/' + threadId, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        pollBusy = false; if (!j || !j.messages) return;
        j.messages.forEach(function (m) {
          if (m.id <= lastSeenMsgId) return; lastSeenMsgId = m.id;
          if (m.sender_kind === 'user') return;
          var who = 'sally（人工）' + (m.sender && m.sender !== 'anonymous' ? ' · ' + m.sender : '');
          if (panel.classList.contains('open')) { addMsg('human', m.body || '(附件)', who); if (m.msg_type === 'image' && m.attachment_path) addImg(INBOX + '/attachment/' + m.id); flash('hop', 750); popHearts(2); }
          else { showBadge(); popText('sally 回你啦～点我看看 🎐'); }
        });
      }).catch(function () { pollBusy = false; });
  }
  function startPoll() { if (pollTimer) return; pollTimer = setInterval(function () { if (!document.hidden) pollOnce(); }, panel.classList.contains('open') ? 5000 : 20000); }
  function addImg(url) { var d = document.createElement('div'); d.className = 'sp-msg h'; d.innerHTML = '<img src="' + url + '">'; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; }

  // ---------- 语音输入（识别成文字） ----------
  var rec = null, recOn = false;
  (function initVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var btn = $('#sallyMicBtn');
    if (!SR) { btn.title = '当前浏览器不支持语音识别（请用 Chrome/Edge）'; btn.addEventListener('click', function (e) { e.stopPropagation(); popText('这个浏览器不支持语音，换 Chrome/Edge 试试～'); }); return; }
    rec = new SR(); rec.lang = 'zh-CN'; rec.interimResults = false;
    rec.onresult = function (e) { input.value = e.results[0][0].transcript; flash('hop', 700); send(); };
    rec.onerror = function () { recOn = false; btn.classList.remove('rec'); };
    rec.onend = function () { recOn = false; btn.classList.remove('rec'); };
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (recOn) { try { rec.stop(); } catch (x) {} return; }
      try { rec.start(); recOn = true; btn.classList.add('rec'); popText('我在听～'); flash('tilt', 1400); } catch (x) {}
    });
  })();

  // ---------- 实时语音对话（📞 像打电话一样） ----------
  (function initCall() {
    if (OPEN_CONFIG.voiceScript && !document.getElementById('sallyVoiceJs')) {
      var vs = document.createElement('script'); vs.id = 'sallyVoiceJs';
      vs.src = OPEN_CONFIG.voiceScript; vs.defer = true; document.head.appendChild(vs);
    }
    var btn = $('#sallyCallBtn');
    if (btn) btn.onclick = function (e) {
      e.stopPropagation();
      window.SallyVoiceRole = role;
      if (!window.SallyVoice) { popText('语音模块还在加载，再点一次～'); return; }
      if (window.SallyVoice.isOpen()) { window.SallyVoice.close(); btn.classList.remove('live'); return; }
      window.SallyVoice.open({ greet: '你好呀，我是小仁同学，我们开始语音聊天吧～' });
      btn.classList.add('live');
    };
    document.addEventListener('sally-voice', function (ev) {
      var stt = ev.detail && ev.detail.state;
      if (stt === 'speaking') { try { talkOn(); } catch (x) {} }
      else { try { talkOff(); } catch (x) {} }
      if (stt === 'closed') { var b = $('#sallyCallBtn'); if (b) b.classList.remove('live'); }
    });
  })();

  // ---------- 附件：图片 / 文件 / 录音 ----------
  function pickFile(accept, cb) {
    var f = document.createElement('input'); f.type = 'file'; if (accept) f.accept = accept;
    f.onchange = function () { var file = f.files && f.files[0]; if (!file) return; if (file.size > 25 * 1024 * 1024) { addMsg('sys', '⚠️ 文件不能超过 25MB'); return; } cb(file); };
    f.click();
  }
  function readB64(file, cb) { var r = new FileReader(); r.onload = function () { cb(String(r.result).split(',')[1] || ''); }; r.readAsDataURL(file); }
  $('#atImg').onclick = function () {
    pickFile('image/*', function (file) {
      readB64(file, function (b64) {
        addMsg('user', '🖼 发送图片：' + file.name);
        mirrorToInbox('[图片] ' + file.name, { b64: b64, name: file.name, mime: file.type || 'image/png' });
        addMsg('sys', '✅ 图片已发到 sally 的消息盒子');
      });
    });
  };
  $('#atFile').onclick = function () {
    pickFile('', function (file) {
      readB64(file, function (b64) {
        addMsg('user', '📎 发送文件：' + file.name);
        mirrorToInbox('[文件] ' + file.name, { b64: b64, name: file.name, mime: file.type || 'application/octet-stream' });
        addMsg('sys', '✅ 文件已发到 sally 的消息盒子');
      });
    });
  };
  var mediaRec = null, chunks = [];
  $('#atVoice').onclick = function () {
    if (mediaRec) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) { addMsg('sys', '⚠️ 当前浏览器不支持录音'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      mediaRec = new MediaRecorder(stream); chunks = [];
      mediaRec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mediaRec.onstop = function () {
        var blob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(function (t) { t.stop(); });
        var r = new FileReader(); r.onload = function () {
          var b64 = String(r.result).split(',')[1] || '';
          var name = 'voice-' + new Date().toISOString().slice(11, 19).replace(/:/g, '') + '.webm';
          addMsg('user', '🎙 发送语音（' + Math.round(blob.size / 1024) + 'KB）');
          mirrorToInbox('[语音]', { b64: b64, name: name, mime: 'audio/webm' });
          addMsg('sys', '✅ 语音已发到 sally 的消息盒子');
        }; r.readAsDataURL(blob);
        mediaRec = null; $('#atVoice').style.display = ''; $('#atClear').style.display = 'none';
      };
      mediaRec.start(); $('#atVoice').style.display = 'none'; $('#atClear').style.display = '';
      addMsg('sys', '🎙 录音中…说完点「⏹ 停止录音」');
      flash('tilt', 1400);
    }).catch(function () { addMsg('sys', '⚠️ 无法访问麦克风（请允许权限）'); });
  };
  $('#atClear').onclick = function () { if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop(); };

  var lastUserText = '';
  var ROLE_QUICKS = {
    default: ['怎么联系 sally 本人？', '铝条多少钱？', '帮我打开价格表', '有多少客资？', '今天南昌多少度？'],
    therapist: ['我有点不开心', '最近压力好大', '睡不着怎么办', '跟同事闹矛盾了', '怎么拒绝别人'],
    logistics: ['海运到迪拜多少天？', 'FCL 和 LCL 怎么选？', '目的港费用有哪些？', '化工品能空运吗？', '旺季订不到舱怎么办？'],
    accountant: ['出口退税要哪些单？', '香港离岸豁免怎么申请？', '成本怎么算才准？', 'VAT 漏报怎么办？', '应收账款怎么管？'],
    docs: ['PI 和 CI 有什么区别？', '提单收货人怎么写？', 'FORM E 怎么申请？', '信用证不符点怎么办？', '产地证怎么选？'],
    ops: ['国际站询盘少怎么办？', '怎么用漏斗定位问题？', 'A/B 测试怎么做？', '欧洲站先办什么？'],
    cs: ['客户投诉怎么处理？', '报价话术怎么写？', '催款邮件怎么写？', '客户要退款怎么办？'],
    sales: ['客户嫌贵怎么谈？', '新客户怎么收款？', '展会跟进怎么写？', 'PI 要写哪些字段？'],
    buyer: ['怎么跟供应商锁价？', '比价怎么做？', '交期延误怎么办？', '供应商质量不稳怎么办？'],
    keeper: ['库存账实不符怎么办？', '安全库存怎么定？', '呆滞料怎么处理？', '多仓调拨怎么记？'],
    designer: ['阿里国际站主图怎么做？', '详情页怎么排版？', 'LOGO 设计要注意什么？', '印刷出血和色彩怎么设？', '后台 UI 怎么改更好用？'],
    hr: ['明天要上班吗？', '帮我算一下工资', '考勤怎么查？', '请假流程是什么？', '社保公积金基数怎么定？'],
    gm: ['这个月经营指标怎么看？', '库存周转怎么提升？', '现金流怎么排？', '该砍哪个渠道？', '组织怎么调更高效？'],
    dev: ['这个报错怎么修？', '帮我写个定时脚本', '接口怎么设计更合理？', '数据库慢查询怎么优化？', '怎么接大模型做问答？'],
    devops: ['服务器磁盘满了怎么办？', '怎么配 nginx 反代？', 'SSL 证书怎么自动续期？', '服务挂了怎么排查？', '备份怎么做才可靠？'],
    merch: ['交期赶不上怎么办？', '验货不合格怎么处理？', '跟单节点怎么排？', '客户催货怎么回？', '样品和大货怎么衔接？'],
    forwarder: ['截关时间是什么时候？', '旺季订不到舱怎么办？', '报关要哪些资料？', '电放和正本提单怎么选？', '港口杂费都有哪些？']
  };
  var reqMode = false;
  function renderQuick() {
    var q = $('#sallyQuick'); q.innerHTML = '';
    topHabits(2).forEach(function (t) { var b = document.createElement('div'); b.className = 'sp-q'; b.textContent = '⭐ ' + t; b.onclick = function () { send(t); }; q.appendChild(b); });
    var list = (ROLE_QUICKS[role] || ROLE_QUICKS.default).slice();
    list.push('✨ 我有个新需求');
    list.forEach(function (t) {
      var b = document.createElement('div'); b.className = 'sp-q'; b.textContent = t;
      b.onclick = function () { if (t.indexOf('新需求') >= 0) { reqMode = true; input.placeholder = '请描述你的新需求（谁用/解决什么/期望效果）…'; input.focus(); } else send(t); };
      q.appendChild(b);
    });
  }

  // ---------- 玩法 ----------
  var QUIZ = [
    { q: 'T/T 电汇里 SHA 表示什么？', o: ['双方各付一半费用', '汇款人全付', '收款人全付'], a: 0 },
    { q: '出口退税的核心是？', o: ['四证链：报关+收汇+增票+合同', '只要有发票', '只要报关'], a: 0 },
    { q: '硅酮密封胶一般归哪个 HS 编码？', o: ['3214.10', '3506.91', '7604.29'], a: 0 },
    { q: '阿联酋 GCC 统一关税约多少？', o: ['5%', '15%', '25%'], a: 0 },
    { q: '欧洲亚马逊开店必须先有？', o: ['VAT 税号', 'EIN', 'SSN'], a: 0 },
    { q: 'L/C 的铁律是？', o: ['单证严格相符', '价格最低', '交期最快'], a: 0 },
    { q: 'D/A 与 D/P 哪个风险更高？', o: ['D/A', 'D/P', '一样高'], a: 0 },
    { q: '中空玻璃第一道密封常用？', o: ['丁基胶', '结构胶', '云石胶'], a: 0 },
    { q: '收款方式风险从稳到险？', o: ['预付<T/T<L/C<D/P<D/A<O/A', 'O/A<D/A<D/P<L/C<T/T<预付', '都一样'], a: 0 },
    { q: '询盘回复的黄金时间是？', o: ['1 小时内', '24 小时内', '3 天内'], a: 0 }
  ];
  var TIPS = [
    '🔎 选品三交集：需求 × 利润 × 合规，缺一不可。', '💡 净到账 = 汇款金额 − 电报费 − 中间行费；谈价一律看净到账。',
    '📌 出口退税四证链：报关单 + 收汇水单 + 增值税专票 + 合同。', '🏷 中东 GCC 统一关税约 5%，认证简单，是建材首攻甜点区。',
    '📦 库存三状态：可用 / 锁定 / 在途——只记总数一定会超卖。', '💰 安全库存 ≈ 日均销量 × 采购提前期 × 波动系数。',
    '🛃 报关「三单一致」：合同/发票、报关单、收汇水单。', '📊 健康增长：LTV > CAC，且至少 3 倍。',
    '🔐 防冻卡四原则：专卡专用、真实单证、金额一致、避开敏感地区。', '🌍 欧洲站硬门槛：VAT + 欧代；美国站：FCC/UL + 美代。'
  ];
  var SKITS = {
    default: ['【情景剧 · 新客户询盘】', '客户：Can you quote 2,000 kg MF899 FOB Ningbo?', 'sally：Sure — USD 1.35/kg FOB Ningbo, 30% T/T deposit, valid 30 days.', '客户：Can you do 1.30?', 'sally：For 5,000 kg we can offer 1.30 with 45-day validity 🎐'],
    sales: ['【情景剧 · 议价】', '客户：Your price is higher than others.', '业务·小仁：May I know your target price and the basis of comparison?', '客户：1.20, based on a local trader.', '业务·小仁：That is 11% below our cost base — but with 3 FCL I can go to 1.28 and lock DMC for you.'],
    cs: ['【情景剧 · 投诉处理】', '客户：The batch cures too slowly!', '客服·小仁：Sorry for the trouble — could you share the batch No. and site photos?', '客户：Batch 2603, photos attached.', '客服·小仁：We checked the COA: it is fine. Ambient temp may be below the application range — sending a work instruction plus a small batch today.'],
    ops: ['【情景剧 · 运营复盘】', '老板：曝光涨了为什么询盘没涨？', '运营·小仁：用漏斗拆——曝光↑但点击率低，说明主图/标题不够精准。', '老板：那怎么改？', '运营·小仁：先只改主图做 A/B 测试，跑 3-7 天看 CTR；同时把询盘响应压到 2 小时内。'],
    buyer: ['【情景剧 · 锁价谈判】', '采购·小仁：DMC 最近波动大，我们想把 Q4 的量锁一下。', '供应商：量能到多少？', '采购·小仁：月均 60 吨、季度 180 吨，锁定价 + 分批提货，价格按现价下调 3%。'],
    keeper: ['【情景剧 · 盘点差异】', '仓管·小仁：A 类原料这个月盘亏 1.2%。', '主管：什么原因？', '仓管·小仁：查了单据，是入库验收没记批号导致串批。先补流程：入库三签、动碰盘点。']
  };
  function playQuiz() {
    if (!panel.classList.contains('open')) panel.classList.add('open');
    var item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
    var opts = item.o.map(function (t, i) { return { t: t, ok: i === item.a }; });
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp; }
    var d = addMsg('assistant', '🎲 小游戏 · 答对我就比心 ❤\n\n' + item.q);
    var locked = false;
    opts.forEach(function (o) {
      var b = document.createElement('button'); b.className = 'sp-opt'; b.textContent = o.t;
      b.onclick = function () {
        if (locked) return; locked = true;
        b.classList.add(o.ok ? 'ok' : 'no');
        if (o.ok) { flash('love', 950); popHearts(4); popText('答对啦！好厉害 ✨'); }
        else { flash('tilt', 1400); popText('再想想～正确答案我标绿了'); opts.forEach(function (x, k) { if (x.ok) d.querySelectorAll('.sp-opt')[k].classList.add('ok'); }); }
        setTimeout(function () { locked = false; }, 800);
      };
      d.appendChild(b);
    });
    msgs.scrollTop = msgs.scrollHeight;
  }
  function playDance() { if (!panel.classList.contains('open')) panel.classList.add('open'); flash('dance', 3600); popHearts(4); popText('看我跳一段～ 💃'); addMsg('sys', '💃 sally 跳了一段'); }
  function playSkit() { if (!panel.classList.contains('open')) panel.classList.add('open'); var lines = SKITS[role] || SKITS.default; lines.forEach(function (l, i) { setTimeout(function () { addMsg(i === 0 ? 'sys' : (i % 2 ? 'user' : 'assistant'), l); if (i % 2 === 0) flash('tilt', 1000); }, i * 750); }); }
  function playTip() { if (!panel.classList.contains('open')) panel.classList.add('open'); addMsg('assistant', '📚 知识科普\n\n' + TIPS[Math.floor(Math.random() * TIPS.length)]); flash('hop', 700); popText('再点一次换一条～'); }
  (function renderPlay() {
    var p = $('#sallyPlay');
    [['🎲 小游戏', playQuiz], ['💃 跳舞', playDance], ['🎭 情景剧', playSkit], ['📚 知识科普', playTip]].forEach(function (x) {
      var b = document.createElement('div'); b.className = 'sp-p'; b.textContent = x[0]; b.onclick = x[1]; p.appendChild(b);
    });
  })();

  // ---------- 客服台（管理员专用：在精灵里直接回消息盒子） ----------
  var isAdmin = false;
  function probeAdmin() {
    fetch(INBOX + '/threads', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('no'); return r.json(); })
      .then(function (j) { if (j && j.threads) { isAdmin = true; $('#sallyAgent').style.display = ''; } })
      .catch(function () {});
  }
  function agentList() {
    var box = $('#sallyAgentBox');
    fetch(INBOX + '/threads', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var ts = (j.threads || []).filter(function (t) { return t.status === 'open'; });
      var h = '<div class="ag-h"><b>🎧 客服台</b><span style="color:#8aa0d8">待处理 ' + ts.length + ' 个</span><span class="x2" id="agClose">✕</span></div>';
      if (!ts.length) h += '<div class="ag-empty">暂时没有待处理的会话 🎐<br><span style="font-size:11.5px">用户在小仁同学 里发的消息会自动出现在这里</span></div>';
      ts.forEach(function (t) {
        var lm = t.last_message || {};
        h += '<div class="ag-t" data-id="' + t.id + '"><div class="ag-t1">' + (t.category || '') + ' · ' + String(t.title || '').replace(/</g, '&lt;') + '</div><div class="ag-t2">' + String(lm.body || '').replace(/</g, '&lt;').slice(0, 46) + '<span class="ag-time">' + String(t.last_message_at || '').slice(5, 16).replace('T', ' ') + '</span></div></div>';
      });
      box.innerHTML = h;
      box.querySelectorAll('.ag-t').forEach(function (el) { el.onclick = function () { agentOpen(+el.dataset.id); }; });
      var c = document.getElementById('agClose'); if (c) c.onclick = function () { box.classList.remove('on'); };
    }).catch(function () {});
  }
  function agentOpen(id) {
    var box = $('#sallyAgentBox');
    fetch(INBOX + '/thread/' + id, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      var h = '<div class="ag-h"><span id="agBack">← 列表</span><b style="color:#dbe4ff">会话 #' + id + '</b><span class="x2" id="agClose">✕</span></div><div class="ag-msgs">';
      (j.messages || []).forEach(function (m) {
        var side = m.sender_kind === 'user' ? 'ag-u' : 'ag-a';
        var att = '';
        if (m.attachment_path) {
          if (m.msg_type === 'image') att = '<img src="' + INBOX + '/attachment/' + m.id + '" style="max-width:150px;border-radius:6px;display:block;margin-bottom:4px">';
          else if (m.msg_type === 'audio') att = '<audio controls src="' + INBOX + '/attachment/' + m.id + '" style="max-width:190px;display:block;margin-bottom:4px"></audio>';
          else att = '<a href="' + INBOX + '/attachment/' + m.id + '" target="_blank" rel="noopener" style="color:#8fb6ff">📎 ' + String(m.attachment_name || '下载附件') + '</a><br>';
        }
        h += '<div class="ag-m ' + side + '">' + att + String(m.body || '').replace(/</g, '&lt;') + '</div>';
      });
      h += '</div><div class="ag-in"><input id="agText" placeholder="输入回复，Enter 发送"><button id="agSend">回复</button></div>';
      box.innerHTML = h;
      var back = document.getElementById('agBack'); if (back) back.onclick = agentList;
      var cl = document.getElementById('agClose'); if (cl) cl.onclick = function () { box.classList.remove('on'); };
      var doSend = function () {
        var t = document.getElementById('agText').value.trim(); if (!t) return;
        fetch(INBOX + '/reply/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ body: t }) })
          .then(function (r) { return r.json(); })
          .then(function (x) { if (x && x.ok) { agentOpen(id); flash('hop', 700); popText('已回复 🎐'); } else { popText((x && x.error) || '发送失败'); } })
          .catch(function () { popText('发送失败'); });
      };
      document.getElementById('agSend').onclick = doSend;
      document.getElementById('agText').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSend(); });
    }).catch(function () {});
  }
  $('#sallyAgent').onclick = function (e) {
    e.stopPropagation();
    var box = $('#sallyAgentBox');
    if (box.classList.contains('on')) { box.classList.remove('on'); return; }
    box.classList.add('on'); agentList();
  };
  $('#sallySkin').onclick = function (e) { e.stopPropagation(); toggleSkin(); };

  // ---------- 通讯录（微信式：系统所有账号 + 在职员工，后台新增自动出现） ----------
  var BOOK = null, bookPeer = '';
  function bookRender(kw) {
    var box = $('#sallyBookBox');
    var all = BOOK || [], list = all;
    kw = String(kw || '').trim().toLowerCase();
    if (kw) list = all.filter(function (m) { return (m.name + ' ' + (m.sub || '') + ' ' + (m.account || '') + ' ' + (m.phone || '')).toLowerCase().indexOf(kw) >= 0; });
    var groups = {};
    list.forEach(function (m) { var g = m.group || '其他'; (groups[g] = groups[g] || []).push(m); });
    var h = '<div class="bk-h"><b>👥 通讯录</b><span style="color:#8aa0d8">共 ' + all.length + ' 人</span><span class="x2" id="bkClose">✕</span></div>' +
      '<div class="bk-s"><input id="bkSearch" placeholder="搜索姓名 / 岗位 / 账号 / 手机号…" value="' + kw.replace(/"/g, '') + '"></div><div class="bk-l">';
    ['管理员', '系统账号', '在职员工', '其他'].forEach(function (g) {
      if (!groups[g]) return;
      h += '<div class="bk-g">' + g + '（' + groups[g].length + '）</div>';
      groups[g].forEach(function (m) {
        var ini = String(m.name || '?').slice(0, 1);
        var cls = m.kind === 'admin' ? 'bk-av a' : (m.kind === 'employee' ? 'bk-av e' : 'bk-av');
        h += '<div class="bk-i" data-n="' + String(m.name).replace(/"/g, '') + '"><div class="' + cls + '">' + ini + '</div><div class="bk-n"><b>' + m.name + '</b><span>' + (m.sub || '') + (m.account ? ' · ' + m.account : '') + '</span></div></div>';
      });
    });
    if (!list.length) h += '<div class="bk-empty">没找到匹配的成员 🎐</div>';
    h += '</div>';
    box.innerHTML = h;
    document.getElementById('bkClose').onclick = function () { box.classList.remove('on'); };
    var si = document.getElementById('bkSearch');
    si.oninput = function () { bookRender(si.value); };
    box.querySelectorAll('.bk-i').forEach(function (el) {
      el.onclick = function () {
        bookPeer = el.dataset.n;
        box.classList.remove('on');
        addMsg('sys', '已选择联系人「' + bookPeer + '」—— 你说的话会记录到与 TA 的对话里。');
        try { input.placeholder = '给 ' + bookPeer + ' 留言…'; input.focus(); } catch (e) {}
      };
    });
  }
  function bookOpen() {
    var box = $('#sallyBookBox');
    if (box.classList.contains('on')) { box.classList.remove('on'); return; }
    box.classList.add('on');
    if (BOOK) { bookRender(''); return; }
    box.innerHTML = '<div class="bk-h"><b>👥 通讯录</b><span class="x2" id="bkClose">✕</span></div><div class="bk-empty">正在读取系统成员…</div>';
    document.getElementById('bkClose').onclick = function () { box.classList.remove('on'); };
    fetch(API + '/members').then(function (r) { return r.json(); }).then(function (j) {
      BOOK = (j && j.members) || []; bookRender('');
    }).catch(function () { var e = box.querySelector('.bk-empty'); if (e) e.textContent = '读取失败，请检查网络后重试'; });
  }
  $('#sallyBook').onclick = function (e) { e.stopPropagation(); bookOpen(); };

  // ---------- 发送 ----------
  function send(forced) {
    var text = (forced != null ? forced : input.value).trim();
    if (!text) return;
    input.value = ''; lastUserText = text;
    addMsg('user', text);
    HISTORY.push({ role: 'user', content: text });
    bumpHabit(text);

    // 1) 本地秒回（区号 / 寒暄 / 时间 / 计算）—— 0 延迟
    var ins = instant(text);
    if (ins) {
      addMsg('assistant', ins);
      flash('hop', 700); popHearts(1);
      mirrorToInbox(text);
      return;
    }

    var isReq = reqMode || /需求|建议|希望增加|能不能加|加个功能|想要一个|新功能|开发|改进/.test(text);
    reqMode = false; input.placeholder = '说点什么，或让我帮你干活…';

    var t = addMsg('assistant', '小仁同学正在处理…'); t.classList.add('typing');
    talkOn();
    function done(reply, src) { talkOff(); t.classList.remove('typing'); t.innerHTML = md(reply); if (src) { var a = document.createElement('a'); a.className = 'src'; a.href = src.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '↗ ' + src.label; t.appendChild(document.createElement('br')); t.appendChild(a); } clampMsg(t, reply); HISTORY.push({ role: 'assistant', content: reply }); }

    if (isReq) fetch(API + '/req', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, page: location.href }) }).catch(function () {});
    mirrorToInbox(text);

    fetch(API + '/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, role: role, page: location.href }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j) throw new Error('bad');
        if (j.action === 'open' && j.url) { done(j.reply || ('正在为你打开「' + j.label + '」')); setTimeout(function () { window.open(j.url, '_blank', 'noopener'); }, 400); flash('hop', 700); return; }
        if (j.action === 'send-msg') {
          done(j.reply || '正在发送…');
          if (j.platform === 'lark' && window.sallyPet && window.sallyPet.larkSend) {
            window.sallyPet.larkSend({ to: j.to, text: j.text }).then(function (r) {
              addMsg('sys', (r && r.ok) ? ('✅ 已发给飞书「' + (r.name || j.to) + '」：' + j.text) : ('⚠️ 发送失败：' + ((r && r.error) || '未知原因')));
            }).catch(function (e) { addMsg('sys', '⚠️ 发送失败：' + e.message); });
          } else if (j.platform === 'lark') {
            addMsg('sys', '⚠️ 「给飞书发消息」需要桌面端和本机 lark-cli，请查看项目 README。');
          }
          flash('hop', 700); return;
        }
        if (j.action === 'app') {
          done(j.reply || ('正在打开「' + (j.name || '') + '」'));
          if (window.sallyPet && window.sallyPet.openApp) {
            window.sallyPet.openApp({ name: j.name, proto: j.proto, builtin: j.builtin }).then(function (r) {
              addMsg('sys', (r && r.ok) ? ('✅ 已打开「' + (r.name || j.name) + '」') : ('⚠️ 没打开：' + ((r && r.error) || '未知原因')));
            }).catch(function (e) { addMsg('sys', '⚠️ 打开失败：' + e.message); });
          } else {
            addMsg('sys', '⚠️ 「打开本机软件」需要桌面端权限，请查看项目 README。');
          }
          flash('hop', 700); return;
        }
        if (j.action === 'data') { done(j.reply || '数据已就绪，见数据舱 →'); hud(j.title, j.columns, j.rows, j.extra, j.source ? { url: j.source, label: j.sourceLabel || '打开来源' } : null); return; }
        if (j.action === 'contact') { done(j.reply); renderContact(j.contact); return; }
        if (j.action === 'learn') { done(j.reply, j.source ? { url: j.source, label: j.sourceLabel || '查看来源' } : null); flash('tilt', 1400); return; }
        if (j.action === 'chat' && j.reply) {
          done(j.reply);
          if (j.role_hint && j.role_hint !== role && ROLE_THEME[j.role_hint]) {
            var meta = ROLES[j.role_hint] || ROLE_FALLBACK.filter(function (r) { return r.id === j.role_hint; })[0] || {};
            var hint = document.createElement('div'); hint.className = 'sp-q'; hint.style.marginTop = '7px'; hint.style.borderColor = '#d96fa6';
            hint.textContent = '💗 换到「' + (meta.name || j.role_hint) + '」聊聊';
            hint.onclick = function () { applyRole(j.role_hint); flash('love', 950); popHearts(3); addMsg('sys', '已换到「' + (meta.name || j.role_hint) + '」，我在这儿听你说 🎐'); };
            t.appendChild(hint);
          }
          flash('hop', 700); return;
        }
        throw new Error('fallthrough');
      })
      .catch(function () {
        fetch(API + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: HISTORY.slice(-8), role: role, page: location.href }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.reply) done(j.reply); else throw new Error('x'); })
          .catch(function () { talkOff(); t.classList.remove('typing'); t.innerHTML = md('唔…我的灯芯好像有点短路（连不上大脑）。请检查 API 配置后再试。'); });
      });
  }

  $('#sallySend').onclick = function () { send(); };
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  $('#sallyClose').onclick = function (e) { e.stopPropagation(); panel.classList.remove('open'); };

  stage.addEventListener('sally-toggle', function () {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      clearBadge(); flash('pop', 700);
      happyOn(); clearTimeout(happyTimer); happyTimer = setTimeout(happyOff, 1600);
      if (!msgs.children.length) addMsg('assistant', '嗨，我是小仁同学（RB） 🎐\n' + SLOGAN + '\n\n我能答疑、能换装、还能帮你干活：\n· 「帮我查北京到上海的高铁车次」\n· 「铝条多少钱」\n· 「怎么联系管理员」\n· 「今天南昌多少度」\n可以把我**拖到任意位置**，也可以拉左上角**缩放面板**～'
        // 已经在桌面端里了，就别再劝人下桌面端（同一个人被劝两次很傻）
        + (CLIENT ? '' : '\n\n💻 桌面版请查看项目 README 的启动说明。'));
      pollOnce(); input.focus();
    }
  });

  try {
    if (!sessionStorage.getItem(GREET_KEY)) {
      sessionStorage.setItem(GREET_KEY, '1');
      setTimeout(function () { flash('tilt', 1400); popText('嗨～我是小仁同学，点我聊天/干活呀 🎐'); }, 400);
    }
  } catch (e) {}

  var IS_LOGIN = /全链ERP|登录|login|sign\s*in/i.test(document.title || '') && !/echo|learn/i.test(location.pathname);
  if (IS_LOGIN) {
    root.classList.add('sally-login');
    setTimeout(function () { flash('hop', 750); popText('登录前先玩一下？点我 → 换装 / 小游戏 / 情景剧 🎐'); }, 500);
    setTimeout(function () { if (!panel.classList.contains('open')) { popHearts(3); flash('love', 950); popText('点我点我～ 🎐'); } }, 6000);
  }

  (function initAll() {
    probeAdmin();
    // 先立刻渲染（用内置角色表），不等网络 —— 让精灵第一时间就可用
    renderRoleBar();
    var saved = 'default'; try { saved = localStorage.getItem(ROLE_KEY) || 'default'; } catch (e) {}
    applyRole(saved);
    applySkin();
    var preQ = (location.search.match(/[?&]q=([^&]+)/) || [])[1];
    if (preQ) { setTimeout(function () { panel.classList.add('open'); send(decodeURIComponent(preQ)); }, 300); }
    // 后端角色表回来后再刷新一次
    fetch(API + '/roles').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.roles && j.roles.length) {
        ROLES = {}; j.roles.forEach(function (x) { ROLES[x.id] = x; });
        renderRoleBar(); applyRole(role);
      }
    }).catch(function () {});
    try {
      fetch(INBOX + '/mine', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
        var ts = (j && j.threads) || [];
        for (var i = 0; i < ts.length; i++) {
          if (ts[i].category === 'sally精灵' && ts[i].status === 'open') { threadId = ts[i].id; lastSeenMsgId = (ts[i].last_message && ts[i].last_message.id) || 0; startPoll(); break; }
        }
      }).catch(function () {});
    } catch (e) {}
  })();

  // ---------- 桌面端下载引导（可爱徽标，每页都有） ----------
  (function initDownload() {
    var hidden = false; try { hidden = localStorage.getItem(DL_KEY) === 'hide'; } catch (e) {}
    if (hidden || CLIENT || !OPEN_CONFIG.downloadUrl) return; // 已经是桌面端或未配置下载页就不再提示
    var b = document.createElement('div'); b.id = 'sallyDl';
    var texts = ['下载桌面版 ⬇', '装到电脑上，随时能用', '桌面小助手 · 点我下载', '在电脑上用 sally', '一键装到桌面 ⬇'];
    b.innerHTML = '<span class="ic">⬇</span><span class="tx">' + texts[0] + '</span><span class="x" title="不再提示">✕</span>';
    root.appendChild(b);
    var i = 0, t = setInterval(function () { i = (i + 1) % texts.length; b.querySelector('.tx').textContent = texts[i]; }, 4000);
    function go() {
      window.open(OPEN_CONFIG.downloadUrl, '_blank');
      popText('下载页已打开～里面有桌面版和轻量版可选 🎐');
      flash('love', 950); popHearts(3);
    }
    b.querySelector('.ic').onclick = go; b.querySelector('.tx').onclick = go;
    b.querySelector('.x').onclick = function (e) {
      e.stopPropagation(); clearInterval(t); b.remove();
      try { localStorage.setItem(DL_KEY, 'hide'); } catch (x) {}
    };
  })();

  // ---------- 版本更新提示（二次元风格：我升级啦） ----------
  (function initUpdateNotice() {
    if (CLIENT) return; // 客户端里有托盘/弹窗提示，不重复
    var KEY = 'sally_ver_seen';
    if (!OPEN_CONFIG.versionUrl) return;
    fetch(OPEN_CONFIG.versionUrl + (OPEN_CONFIG.versionUrl.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.content) return;
        var seen = ''; try { seen = localStorage.getItem(KEY) || ''; } catch (e) {}
        if (!seen) { try { localStorage.setItem(KEY, j.content); } catch (e) {} return; }  // 首次访问不打扰
        if (seen === j.content) return;
        try { localStorage.setItem(KEY, j.content); } catch (e) {}
        var b = document.createElement('div'); b.id = 'sallyUpd';
        b.innerHTML = '<span class="u-ic">✨</span><span class="u-tx">我升级啦' + (j.notes ? '：' + String(j.notes).slice(0, 34) : '！') + '</span><span class="u-x">✕</span>';
        root.appendChild(b);
        setTimeout(function () { flash('love', 950); popHearts(4); popText('🎐 我变强了一点点，点我看看～'); }, 300);
        var t = setTimeout(function () { try { b.remove(); } catch (e) {} }, 16000);
        b.querySelector('.u-x').onclick = function (e) { e.stopPropagation(); clearTimeout(t); b.remove(); };
        b.querySelector('.u-tx').onclick = b.querySelector('.u-ic').onclick = function () { clearTimeout(t); b.remove(); stage.dispatchEvent(new CustomEvent('sally-toggle')); };
      }).catch(function () {});
  })();

  if (CLIENT) { try { root.classList.add('sally-client'); } catch (e) {} }
  window.SallySprite = { mascot: mascot, mascotCreature: mascotCreature, SLOGAN: SLOGAN, API: API, INBOX: INBOX, ROLE_THEME: ROLE_THEME, ROLE_FALLBACK: ROLE_FALLBACK, instant: instant, version: 'v12' };
  console.log('[小仁同学] v5 ready · ' + SLOGAN + (CLIENT ? ' · client mode' : ''));
})();
