const { remaining } = require('../../utils/time');

Page({
  data: { trips: [], showForm: false, title: '', destination: '', departureAt: '', nextAction: '' },
  onShow() { this.load(); },
  load() {
    const trips = (wx.getStorageSync('xr_trips') || []).map(x => Object.assign({}, x, { countdown: remaining(x.departureAt) }));
    this.setData({ trips });
  },
  toggleForm() { this.setData({ showForm: !this.data.showForm }); },
  field(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  save() {
    if (!this.data.title || !this.data.departureAt) { wx.showToast({ title: '填写名称和时间', icon: 'none' }); return; }
    const trips = wx.getStorageSync('xr_trips') || [];
    trips.push({ id: Date.now(), title: this.data.title, destination: this.data.destination, departureAt: this.data.departureAt, nextAction: this.data.nextAction });
    wx.setStorageSync('xr_trips', trips);
    this.setData({ showForm: false, title: '', destination: '', departureAt: '', nextAction: '' });
    this.load();
  }
});
