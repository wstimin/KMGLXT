'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { getDb } = require('./db');
const adminApi = require('./routes/admin');
const openApi = require('./routes/open');
const { errorHandler } = require('./middleware/error');

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) || 1 : false);
// 基础安全头
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
});

// 捕获原始请求体(供对外 API 签名校验 sha256(body))
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());

// 健康检查
app.get('/api/health', (req, res) =>
  res.json({ code: 0, message: 'ok', data: { app: '十夜卡密', time: Date.now() } })
);

// 前端站点信息(免登录):系统名称 / 首页公告,供登录页与各品牌位展示
app.get('/api/site', (req, res) => {
  const db = getDb();
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value])
  );
  return res.json({
    code: 0,
    message: 'ok',
    data: { name: settings.site_name || '', announcement: settings.announcement || '' },
  });
});

// 管理端 API
getDb();
app.use('/api/admin', adminApi);

// 对外验卡 API
app.use('/api/v1', openApi);

// 未匹配的 /api 一律 404(避免打进前端 SPA)
app.use('/api', (req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));

// 前端静态站(web 构建产物)
const indexFile = path.join(config.webDist, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(indexFile));
} else {
  console.warn('[warn] 未找到前端构建产物(server/public),预计运行: npm run build');
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log('✦ 十夜卡密 服务已启动');
  console.log(`  http://localhost:${config.port}`);
  console.log(`  Node ${process.version} · SQLite: ${config.dbPath}`);
});