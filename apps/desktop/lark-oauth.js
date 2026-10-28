// RB小仁同学 · 第二身份（管理员账号）—— 直连飞书 OAuth，不走 lark-cli
//
// 为什么单独写：lark-cli 一个 app（=一个 profile）只认一个登录用户，
// LARKSUITE_CLI_PROFILE 只能换 profile，换不了同一 app 下的第二个用户。
// 所以"管理员账号 + 工作账号同绑一个桌面端"只能由小仁自己走 device flow，
// 各存一套 user_access_token（用 Electron safeStorage 加密落盘，不出本机）。
//
// 约定：works with failures —— 这个文件坏了/飞书挂了，只是"第二身份不可用"，
// 主身份（lark-cli）照常工作。main.js 里 require 已包 try/catch。
const https = require('https');
const fs = require('fs');
const path = require('path');

const H_ACCOUNTS = 'accounts.feishu.cn';
const H_OPEN = 'open.feishu.cn';

function req(host, method, p, body, headers) {
  return new Promise(function (resolve) {
    let data = '';
    try {
      if (body) data = JSON.stringify(body);
    } catch (e) { return resolve({ ok: false, error: '参数序列化失败' }); }
    const opt = {
      host: host, path: p, method: method, timeout: 20000,
      headers: Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data || '')
      }, headers || {})
    };
    let done = false;
    const finish = function (v) { if (!done) { done = true; resolve(v); } };
    let r;
    try {
      r = https.request(opt, function (res) {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { buf += c; });
        res.on('end', function () {
          let j = null;
          try { j = JSON.parse(buf); } catch (e) {}
          finish({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: j, raw: buf });
        });
      });
    } catch (e) { return finish({ ok: false, error: String(e && e.message) }); }
    r.on('timeout', function () { try { r.destroy(); } catch (e) {} finish({ ok: false, error: '请求超时' }); });
    r.on('error', function (e) { finish({ ok: false, error: String(e && e.message) }); });
    try { if (data) r.write(data); r.end(); } catch (e) { finish({ ok: false, error: String(e && e.message) }); }
  });
}

// 从本机 lark-cli 的配置里取 app_id / app_secret（小仁本来就在用这个应用）
function readAppCred() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const roots = [];
  try {
    const base = path.join(home, '.lark-cli');
    (fs.readdirSync(base) || []).forEach(function (d) {
      const f = path.join(base, d, 'config.json');
      if (fs.existsSync(f)) roots.push(f);
    });
  } catch (e) {}
  roots.push(path.join(home, '.lark-cli', 'config.json'));
  for (let i = 0; i < roots.length; i++) {
    try {
      const j = JSON.parse(fs.readFileSync(roots[i], 'utf8'));
      const apps = j.apps || [];
      for (let k = 0; k < apps.length; k++) {
        const a = apps[k];
        if (!a || !a.appId) continue;
        let sec = a.appSecret;
        if (sec && typeof sec === 'object') sec = '';   // keychain 引用：读不到明文
        if (sec && typeof sec === 'string') return { appId: a.appId, appSecret: sec, brand: a.brand || 'feishu' };
      }
    } catch (e) {}
  }
  return null;
}

module.exports = function createLark2(opts) {
  const dir = opts.dir;
  const scopes = opts.scopes || '';
  const log = opts.log || function () {};
  const safeStorage = opts.safeStorage || null;
  const FILE = path.join(dir, 'lark-accounts.json');

  let state = { accounts: {}, current: 'a' };
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')) || state; } catch (e) {}
  if (!state.accounts) state.accounts = {};
  if (!state.current) state.current = 'a';

  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(state), 'utf8'); } catch (e) { log('save failed ' + e.message); }
  }
  function enc(s) {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
        return { e: 1, v: safeStorage.encryptString(String(s)).toString('base64') };
      }
    } catch (e) {}
    return { e: 0, v: String(s) };
  }
  function dec(o) {
    try {
      if (!o) return '';
      if (o.e === 1 && safeStorage && safeStorage.decryptString) return safeStorage.decryptString(Buffer.from(o.v, 'base64'));
      return o.v || '';
    } catch (e) { return ''; }
  }

  const b = function () { return state.accounts.b || null; };
  const isB = function () { return state.current === 'b' && !!(b() && b().token); };

  function status() {
    const x = b();
    return {
      ok: true,
      current: state.current === 'b' ? 'b' : 'a',
      bound: !!(x && x.token),
      name: (x && x.name) || '',
      open_id: (x && x.open_id) || '',
      at: (x && x.at) || '',
      cred: !!readAppCred()
    };
  }

  function start() {
    const c = readAppCred();
    if (!c) return Promise.resolve({ ok: false, error: '找不到本机飞书应用凭证（app_secret 只存在 keychain 里）。先把 lark-cli 的主账号绑好再来。' });
    const body = { client_id: c.appId, client_secret: c.appSecret, scope: scopes };
    return req(H_ACCOUNTS, 'POST', '/oauth/v1/device_authorization', body).then(function (r) {
      const j = r.json || {};
      if (j.device_code && (j.verification_uri || j.verification_url)) {
        return { ok: true, device_code: j.device_code, url: j.verification_uri_complete || j.verification_uri || j.verification_url, interval: (j.interval || 5) * 1000, expires_in: j.expires_in || 600 };
      }
      return { ok: false, error: (j.error_description || j.message || r.raw || '飞书没返回授权码').slice(0, 200) };
    });
  }

  function poll(deviceCode) {
    const c = readAppCred();
    if (!c) return Promise.resolve({ ok: false, error: '缺少应用凭证' });
    const body = {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: String(deviceCode || ''),
      client_id: c.appId, client_secret: c.appSecret
    };
    return req(H_ACCOUNTS, 'POST', '/oauth/v3/token', body).then(function (r) {
      const j = r.json || {};
      if (j.access_token) {
        const tok = {
          access: enc(j.access_token),
          refresh: enc(j.refresh_token || ''),
          exp: Date.now() + (Number(j.expires_in || 7200) - 120) * 1000,
          rexp: Date.now() + (Number(j.refresh_token_expires_in || 0) || 30 * 86400) * 1000
        };
        return userInfo(j.access_token).then(function (u) {
          state.accounts.b = {
            name: (u && u.name) || '', open_id: (u && u.open_id) || '',
            token: tok, at: new Date().toISOString()
          };
          save();
          return { ok: true, name: state.accounts.b.name, open_id: state.accounts.b.open_id };
        });
      }
      const code = String(j.error || '');
      if (code === 'authorization_pending' || code === 'slow_down') return { ok: true, pending: true };
      if (code === 'expired_token') return { ok: false, expired: true, error: '二维码超时了，重新点一次「绑定」' };
      if (code === 'access_denied') return { ok: false, error: '你在手机上拒绝了授权' };
      return { ok: false, error: (j.error_description || j.message || '授权校验失败').slice(0, 200) };
    });
  }

  function userInfo(token) {
    return req(H_OPEN, 'GET', '/open-apis/authen/v1/user_info', null, { Authorization: 'Bearer ' + token }).then(function (r) {
      const d = (r.json && r.json.data) || {};
      return { name: d.name || d.en_name || '', open_id: d.open_id || '' };
    });
  }

  function freshToken() {
    const x = b();
    if (!x || !x.token) return Promise.resolve('');
    const t = x.token;
    if (Date.now() < (t.exp || 0)) return Promise.resolve(dec(t.access));
    const rt = dec(t.refresh);
    if (!rt) return Promise.resolve('');
    const c = readAppCred();
    if (!c) return Promise.resolve('');
    const body = {
      grant_type: 'refresh_token', refresh_token: rt,
      client_id: c.appId, client_secret: c.appSecret
    };
    return req(H_ACCOUNTS, 'POST', '/oauth/v3/token', body).then(function (r) {
      const j = r.json || {};
      if (!j.access_token) return '';
      x.token = {
        access: enc(j.access_token),
        refresh: enc(j.refresh_token || rt),
        exp: Date.now() + (Number(j.expires_in || 7200) - 120) * 1000,
        rexp: x.token.rexp || 0
      };
      save();
      return j.access_token;
    });
  }

  // 用第二身份发消息：to = 名字（需要外部解析 open_id）或 open_id；chatId = 群
  function send(arg, resolveUser) {
    const text = String((arg && arg.text) || '').trim();
    const chatId = String((arg && arg.chatId) || '').trim();
    const to = String((arg && arg.to) || '').trim();
    const openId = String((arg && arg.openId) || '').trim();
    if (!text || (!chatId && !to && !openId)) return Promise.resolve({ ok: false, error: '缺少收件人或内容' });
    return freshToken().then(function (token) {
      if (!token) return { ok: false, error: '第二身份还没绑定或授权已过期' };
      const go = function (receiveId, idType) {
        const body = { receive_id: receiveId, msg_type: 'text', content: JSON.stringify({ text: text }) };
        return req(H_OPEN, 'POST', '/open-apis/im/v1/messages?receive_id_type=' + idType, body, { Authorization: 'Bearer ' + token })
          .then(function (r) {
            const j = r.json || {};
            if (j.code === 0) return { ok: true };
            return { ok: false, error: (j.msg || '发送失败') + (j.code ? ('（' + j.code + '）') : '') };
          });
      };
      if (chatId) return go(chatId, 'chat_id');
      if (openId) return go(openId, 'open_id');
      if (/^ou_/.test(to)) return go(to, 'open_id');
      return Promise.resolve(resolveUser ? resolveUser(to) : null).then(function (u) {
        if (!u || !u.open_id) return { ok: false, error: '没找到「' + to + '」' };
        return go(u.open_id, 'open_id').then(function (r) {
          if (r.ok && u.name) r.name = u.name;
          return r;
        });
      });
    });
  }

  function unbind() {
    try { delete state.accounts.b; } catch (e) {}
    state.current = 'a';
    save();
    return { ok: true };
  }

  function setDefault(which) {
    // 没绑定的身份不能设为默认，否则"切过去了但其实发不出去"
    const want = which === 'b' && b() && b().token ? 'b' : 'a';
    state.current = want;
    save();
    return status();
  }

  return { status: status, start: start, poll: poll, send: send, unbind: unbind, setDefault: setDefault, isB: isB, file: FILE };
};
