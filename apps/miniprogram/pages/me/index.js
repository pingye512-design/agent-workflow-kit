Page({
  data: { build: '', service: '' },
  onLoad() {
    const app = getApp();
    let service = '未配置';
    try { service = String(app.globalData.apiBase || '').replace(/^https?:\/\//, '').split('/')[0] || service; } catch (e) {}
    this.setData({ build: app.globalData.build, service });
  },
  clearTrips() {
    wx.showModal({
      title: '清空离线行程',
      content: '只删除本机保存的行程，不影响服务器。',
      success(res) { if (res.confirm) wx.removeStorageSync('xr_trips'); }
    });
  }
});
