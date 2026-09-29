'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');

const config = require('../../config');
const { getDb } = require('../../db');
const { authAdmin, requireRole } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const {
  REPO,
  fetchLatestRelease,
  isNewerVersion,
  readLocalVersion,
} = require('../../lib/release');

const router = express.Router();
const appRoot = path.join(__dirname, '../../..');
const updaterScript = path.join(appRoot, 'deploy', 'panel-update.sh');
const stateFile = path.join(config.dataDir, 'update-status.json');
const routeLoadedAt = Date.now();
const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.status === 'running' && Date.now() - Number(state.updatedAt || 0) > 30 * 60 * 1000) {
      return { ...state, status: 'failed', phase: 'stale', message: '上次更新未正常结束，请查看 update.log' };
    }
    // 更新器会在终止旧进程前写入 restarting。只有新进程加载本路由后，
    // 才将匹配当前版本的状态收尾，避免旧进程在真正重启前提前显示完成。
    if (
      state.status === 'success'
      && state.phase === 'restarting'
      && Number(state.updatedAt || 0) <= routeLoadedAt
      && readLocalVersion(appRoot) === state.version
    ) {
      const completed = {
        ...state,
        status: 'success',
        phase: 'complete',
        message: `更新完成，当前版本 ${state.version}`,
        completedAt: Date.now(),
      };
      writeState(completed);
      return completed;
    }
    // 成功信息只保留十分钟，之后恢复普通的版本状态说明。
    if (state.status === 'success' && state.phase === 'complete'
      && Date.now() - Number(state.updatedAt || 0) > 10 * 60 * 1000) {
      return { status: 'idle', phase: 'idle', message: '' };
    }
    return state;
  } catch {
    return { status: 'idle', phase: 'idle', message: '' };
  }
}

function writeState(state) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ ...state, updatedAt: Date.now() }, null, 2));
}

function deploymentMode() {
  const configured = String(process.env.DEPLOY_MODE || '').toLowerCase();
  if (configured) return configured;
  if (fs.existsSync('/.dockerenv')) return 'docker';
  if (fs.existsSync('/etc/kmglxt/env')) return 'oneclick';
  return process.platform === 'linux' ? 'panel' : 'development';
}

function canRestartAutomatically() {
  return Boolean(
    process.env.WEB_UPDATE_RESTART === '1'
    || process.env.INVOCATION_ID
    || process.env.pm_id
    || fs.existsSync('/etc/kmglxt/env')
  );
}

function canWriteApp() {
  try {
    fs.accessSync(appRoot, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function buildStatus(force = false) {
  const mode = deploymentMode();
  const current = readLocalVersion(appRoot);
  let latest = null;
  let checkError = '';
  try {
    latest = await fetchLatestRelease(force);
    if (latest?.stale) checkError = latest.checkError || '最新版本检查失败，当前显示缓存结果';
  } catch (error) {
    checkError = error.message || '无法连接 GitHub';
  }

  const linuxHost = process.platform === 'linux' && mode !== 'docker';
  return {
    repo: REPO,
    mode,
    current: current || 'source',
    currentKnown: Boolean(current),
    latest,
    updateAvailable: Boolean(latest && isNewerVersion(latest.tag, current)),
    canUpdate: linuxHost && fs.existsSync(updaterScript) && canWriteApp(),
    autoRestart: linuxHost && canRestartAutomatically(),
    checkError,
    state: readState(),
    dockerCommand: 'docker compose pull && docker compose up -d',
  };
}

router.get('/status', authAdmin, asyncWrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, await buildStatus(req.query.refresh === '1'));
}));

router.post('/install', authAdmin, requireRole('super'), asyncWrap(async (req, res) => {
  const status = await buildStatus(true);
  if (status.mode === 'docker') {
    return res.status(409).json({ code: 409, message: `Docker 环境请执行：${status.dockerCommand}` });
  }
  if (!status.canUpdate) {
    return res.status(409).json({ code: 409, message: '当前环境不支持网页更新，请按部署页中的命令更新' });
  }
  if (!status.latest?.assetUrl) {
    return res.status(502).json({ code: 502, message: '最新 Release 尚无可下载安装包' });
  }
  if (!status.updateAvailable && !req.body?.force) {
    return res.status(409).json({ code: 409, message: '当前已经是最新版本' });
  }
  if (status.state?.status === 'running' && Date.now() - Number(status.state.updatedAt || 0) < 30 * 60 * 1000) {
    return res.status(409).json({ code: 409, message: '更新正在进行，请勿重复操作' });
  }

  writeState({
    status: 'running',
    phase: 'queued',
    message: `准备更新到 ${status.latest.tag}`,
    version: status.latest.tag,
    startedAt: Date.now(),
  });
  logOper(
    getDb(),
    { id: req.admin.id, username: req.admin.username, _ip: req.ip },
    'system:update',
    '系统更新',
    `${status.current} -> ${status.latest.tag}`
  );

  const child = spawn('bash', [updaterScript, appRoot, status.latest.tag], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      DATA_DIR: config.dataDir,
      KM_SERVER_PID: String(process.pid),
      KM_AUTO_RESTART: status.autoRestart ? '1' : '0',
    },
  });
  child.once('error', (error) => {
    writeState({
      status: 'failed',
      phase: 'spawn',
      message: `无法启动更新器：${error.message}`,
      version: status.latest.tag,
    });
  });
  child.unref();
  return ok(res, { accepted: true, version: status.latest.tag, autoRestart: status.autoRestart });
}));

module.exports = router;
