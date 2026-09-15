'use strict';

const jwt = require('jsonwebtoken');
const { getSecret } = require('../lib/secret');

/** 管理端登录鉴权:校验 httpOnly Cookie 中的 JWT */
function authAdmin(req, res, next) {
  const token = req.cookies ? req.cookies.syk_token : null;
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录' });
  }
  try {
    req.admin = jwt.verify(token, getSecret());
    return next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已失效,请重新登录' });
  }
}

/** 角色限制:authAdmin 之后使用 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ code: 401, message: '未登录' });
    }
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ code: 403, message: '无权限执行该操作' });
    }
    return next();
  };
}

module.exports = { authAdmin, requireRole };