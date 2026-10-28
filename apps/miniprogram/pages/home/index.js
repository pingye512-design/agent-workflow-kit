const api = require('../../utils/api');

Page({
  data: {
    role: 'guide',
    roleName: '向导·小仁',
    input: '',
    sending: false,
    messages: [{ from: 'assistant', text: '东西在哪、流程怎么走、该找谁，直接问我。' }],
    quick: ['公司 ERP 在哪？', '采购经理是谁？', '报销找谁？', '南昌去上海怎么走？']
  },
  switchRole(e) {
    const role = e.currentTarget.dataset.role;
    const travel = role === 'travel';
    this.setData({
      role,
      roleName: travel ? '随行·小仁' : '向导·小仁',
      messages: [{ from: 'assistant', text: travel ? '把出发地、目的地和日期告诉我，我先排可执行行程。' : '东西在哪、流程怎么走、该找谁，直接问我。' }]
    });
  },
  onInput(e) { this.setData({ input: e.detail.value }); },
  useQuick(e) { this.setData({ input: e.currentTarget.dataset.text }, () => this.send()); },
  async send() {
    const q = String(this.data.input || '').trim();
    if (!q || this.data.sending) return;
    const messages = this.data.messages.concat([{ from: 'user', text: q }]);
    this.setData({ messages, input: '', sending: true });
    try {
      const out = await api.ask(this.data.role, q);
      this.setData({ messages: messages.concat([{ from: 'assistant', text: out.reply || '暂时没有结果。' }]) });
    } catch (err) {
      this.setData({ messages: messages.concat([{ from: 'assistant', text: '没连上小仁服务：' + err.message }]) });
    } finally { this.setData({ sending: false }); }
  }
});
