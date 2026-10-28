const departments = [
  { name: '管理层', people: [{ name: '示例用户A', role: '负责人' }] },
  { name: '业务部', people: [{ name: '示例用户B', role: '业务经理' }, { name: '示例用户C', role: '业务员' }] },
  { name: '运营部', people: [{ name: '示例用户D', role: '运营经理' }, { name: '示例用户E', role: '平台运营' }] },
  { name: '采购部', people: [{ name: '示例用户F', role: '采购经理' }] },
  { name: '财务部', people: [{ name: '示例用户G', role: '财务' }] },
  { name: '仓储部', people: [{ name: '示例用户H', role: '仓库管理员' }] }
];

const quickProcesses = [
  { label: '报销', owner: '财务部', status: '示例流程' },
  { label: '请假', owner: '直属上级', status: '示例流程' },
  { label: '领料', owner: '仓储部', status: '示例流程' },
  { label: '用章', owner: '管理层', status: '示例流程' },
  { label: '开户', owner: '财务部', status: '示例流程' }
];

module.exports = { departments, quickProcesses };
