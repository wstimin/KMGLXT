'use strict';

/** 统一使用 Unix 秒作为数据库时间 */
const now = () => Math.floor(Date.now() / 1000);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};

module.exports = { now, startOfToday };