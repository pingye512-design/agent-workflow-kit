function remaining(iso) {
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return '时间待确认';
  const diff = t - Date.now();
  if (diff <= 0) return '已到时间';
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rest = mins % 60;
  if (days) return days + ' 天 ' + hours + ' 小时';
  return hours + ' 小时 ' + rest + ' 分';
}

module.exports = { remaining };
