/** 数字千分位 */
export function fmtNum(n) {
  const v = Number(n ?? 0)
  return v.toLocaleString('zh-CN')
}

/** Unix 秒 → 本地时间字符串;0/空 → "—" */
export function fmtTime(sec) {
  if (!sec) return '—'
  const d = new Date(sec * 1000)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 相对时间:几分钟前 / 几小时前 / 几天前 */
export function timeAgo(sec) {
  if (!sec) return '—'
  const diff = Math.floor(Date.now() / 1000) - sec
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return fmtTime(sec)
}