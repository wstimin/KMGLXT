/**
 * 十夜卡密 · pm2 生产配置
 * 用法: pm2 start deploy/pm2.config.js
 */
module.exports = {
  apps: [
    {
      name: 'shiyeka',
      script: 'server/app.js',
      cwd: __dirname + '/..',
      instances: 1,            // SQLite 单进程写,勿开 cluster
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      // 生产环境凭环境变量注入(例如 .env 或 pm2 ecosystem env)
      env: {
        NODE_ENV: 'production',
        PORT: 1111,
        // JWT_SECRET: '<生成一段随机长字符串>',
        // ADMIN_USER / ADMIN_PASS 仅在首次 init-db 时有用
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};