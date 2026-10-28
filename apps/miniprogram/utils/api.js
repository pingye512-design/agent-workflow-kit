function request(path, options) {
  const app = getApp();
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + path,
      method: opts.method || 'GET',
      data: opts.data || {},
      header: { 'content-type': 'application/json' },
      timeout: 45000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error('服务返回 ' + res.statusCode));
      },
      fail(err) { reject(new Error(err.errMsg || '网络请求失败')); }
    });
  });
}

function ask(role, q) {
  return request('/task', { method: 'POST', data: { role: role, q: q } });
}

function roles() { return request('/roles'); }

module.exports = { ask, roles };
