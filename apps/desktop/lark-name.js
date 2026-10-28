/*!
 * lark-name.js —— 飞书联系人「名字归一化 + 查询变体 + 候选打分」
 *
 * 为什么需要它：
 *   用户会说「给飞书管理员（示例用户）发条消息」，通讯录里她叫「示例用户A」。
 *   拿整串去做全等查询 → 查无此人 → 回一句"没找到"，人还得自己再想一遍。
 *   这里把「她怎么说」翻成「通讯录里怎么查」，查不到时给出候选而不是一句报错。
 *
 * 纯函数、零依赖、ES5 —— 服务端 sally-tools.js 与桌面外壳 main.js 共用同一份，
 * 两端行为必须一致，否则同一句话在网页版和桌面版会得到不同结果。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LarkName = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 职位 / 角色词：用户常把角色和名字一起写（「管理员（示例用户）」「示例经理」）
  var ROLE_WORDS = ['总经理', '董事长', '管理员', '负责人', '经理', '总监', '主管', '老板',
    '老师', '主任', '助理', '秘书', '前台', '财务', '人事', '客服', '同事', '同学']
    .sort(function (a, b) { return b.length - a.length; });

  // 通道前缀：「飞书里的」「微信上的」——不是名字的一部分
  var CHANNEL_RE = /^(飞书|企业微信|微信|钉钉|工作号|私人号)(里面的|里的|里面|里|上的|中的|上|的)?/;

  var TRIM_RE = /^[\s·,，。、:：;；!！?？"'“”‘’]+|[\s·,，。、:：;；!！?？"'“”‘’]+$/g;
  var KEY_DROP_RE = /[\s·,，。、:：;；!！?？"'“”‘’()（）【】\[\]<>《》]/g;

  function toHalf(s) {
    return String(s == null ? '' : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\u3000/g, ' ');
  }

  // 括号里的内容：多半是"真名"，比括号外的角色词可靠
  function bracketParts(s) {
    var out = [], re = /[（(【\[]([^）)】\]]{1,20})[）)】\]]/g, m, src = String(s == null ? '' : s);
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  }

  // 只去括号符号、留下括号里的字：「管理员（示例用户）」→「管理员示例用户」
  function flatten(s) {
    return String(s == null ? '' : s).replace(/[（(【\[）)】\]]/g, '');
  }

  function key(s) {
    return toHalf(s).replace(KEY_DROP_RE, '').toLowerCase();
  }

  function stripRoles(s) {
    var out = String(s == null ? '' : s);
    for (var i = 0; i < ROLE_WORDS.length; i++) {
      var w = ROLE_WORDS[i];
      // 只在"剥掉之后还剩 ≥2 个字"时才剥，避免把「叶总」「王组」这类整名吃掉
      var head = out.replace(new RegExp('^' + w + '[\\s·:：\\-]*'), '');
      if (head !== out && key(head).length >= 2) out = head;
      var tail = out.replace(new RegExp('[\\s·:：\\-]*' + w + '$'), '');
      if (tail !== out && key(tail).length >= 2) out = tail;
    }
    return out;
  }

  function clean(s) {
    var v = toHalf(s).replace(CHANNEL_RE, '');
    v = stripRoles(flatten(v)).replace(TRIM_RE, '').trim();
    if (v) return v;
    return String(s == null ? '' : s).trim();
  }

  /**
   * 查询变体，按"命中概率"排序。
   * 「管理员（示例用户）」→ ['示例用户', '管理员（示例用户）']
   */
  function variants(raw) {
    var src = String(raw == null ? '' : raw).trim();
    if (!src) return [];
    var out = [];
    function push(v) {
      v = String(v == null ? '' : v).trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    }
    bracketParts(src).forEach(function (p) { push(clean(p)); });
    push(clean(src));
    push(stripRoles(flatten(toHalf(src))).replace(/\s+/g, ''));
    push(src);
    return out;
  }

  /**
   * 单条打分。1 = 完全一致；0.85 = 前缀；0.8 = 包含；0.6 = 共同开头；0 = 无关。
   */
  function score(query, name) {
    var q = key(query), n = key(name);
    if (!q || !n) return 0;
    if (q === n) return 1;
    if (n.indexOf(q) === 0 || q.indexOf(n) === 0) return 0.85;
    if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) return 0.8;
    var common = 0, lim = Math.min(q.length, n.length);
    for (var i = 0; i < lim; i++) { if (q[i] === n[i]) common++; else break; }
    if (common >= 2 && common / Math.max(q.length, n.length) >= 0.5) return 0.6;
    return 0;
  }

  function displayOf(u) {
    return String((u && (u.localized_name || u.name || u.en_name)) || '').trim();
  }

  function idOf(u) {
    return String((u && (u.open_id || u.user_id || u.id)) || '').trim();
  }

  function rank(queries, users) {
    var qs = [].concat(queries || []), best = [];
    (users || []).forEach(function (u) {
      var nm = displayOf(u);
      if (!nm) return;
      var s = 0, hit = '';
      for (var i = 0; i < qs.length; i++) {
        var x = score(qs[i], nm);
        if (x > s) { s = x; hit = qs[i]; }
      }
      if (s <= 0) return;
      best.push({
        user: u, name: nm, open_id: idOf(u),
        dept: String((u && (u.department_name || u.department || '')) || ''),
        score: s, hit: hit
      });
    });
    best.sort(function (a, b) { return b.score - a.score || a.name.length - b.name.length; });
    return best;
  }

  /**
   * 结论三选一：
   *   { user }            唯一命中 → 可以直接发
   *   { user:null, candidates:[...] } 有歧义 → 让她点一下
   *   { user:null, candidates:[] }    真没有 → 换名字 / 换通道
   */
  function choose(queries, users) {
    var ranked = rank(queries, users).filter(function (x) { return x.score >= 0.6; });
    if (!ranked.length) return { user: null, candidates: [] };
    var top = ranked[0];
    if (ranked.length === 1) return { user: top, candidates: ranked };
    if (top.score === 1 && ranked[1].score < 1) return { user: top, candidates: ranked };
    return { user: null, candidates: ranked.slice(0, 5) };
  }

  return {
    toHalf: toHalf, key: key, clean: clean, variants: variants,
    score: score, rank: rank, choose: choose,
    displayOf: displayOf, idOf: idOf
  };
});
