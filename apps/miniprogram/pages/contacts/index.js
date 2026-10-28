const map = require('../../utils/company-map');

Page({
  data: { keyword: '', departments: map.departments, processes: map.quickProcesses },
  search(e) {
    const keyword = String(e.detail.value || '').trim().toLowerCase();
    const departments = !keyword ? map.departments : map.departments.map(d => ({
      name: d.name,
      people: d.people.filter(p => (d.name + p.name + p.role).toLowerCase().includes(keyword))
    })).filter(d => d.people.length);
    this.setData({ keyword, departments });
  }
});
