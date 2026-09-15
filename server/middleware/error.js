'use strict';

/** 包装 async 路由的异常,统一走错误处理中间件 */
const asyncWrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  if (res.headersSent) return next(err);

  // 业务校验错误: throw {code: 4xx, msg: '...'}
  if (err && typeof err === 'object' && typeof err.code === 'number' && err.msg) {
    return res.status(err.code).json({ code: err.code, message: err.msg, data: null });
  }

  res.status(500).json({ code: 500, message: '服务器内部错误' });
}

module.exports = { asyncWrap, errorHandler };