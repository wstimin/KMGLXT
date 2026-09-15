'use strict';

const express = require('express');
const router = express.Router();
const { authSign } = require('../../middleware/auth.sign');
const { now } = require('../../lib/time');
const { dispatch } = require('../../services/cardApi');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

/* ── 健康检查(无签名,公开) ── */
router.get('/status', (req, res) => {
  return ok(res, { app: '十夜卡密', version: '1.0.0', time: now() });
});

/* ── 六接口(需签名) ── */
router.post('/card/verify',   authSign, (req, res) => res.json(dispatch('verify',   req.project, req.body, req.ip)));
router.post('/card/activate', authSign, (req, res) => res.json(dispatch('activate', req.project, req.body, req.ip)));
router.post('/card/consume',  authSign, (req, res) => res.json(dispatch('consume',  req.project, req.body, req.ip)));
router.post('/card/query',    authSign, (req, res) => res.json(dispatch('query',    req.project, req.body, req.ip)));
router.post('/card/freeze',   authSign, (req, res) => res.json(dispatch('freeze',   req.project, req.body, req.ip)));
router.post('/card/unfreeze', authSign, (req, res) => res.json(dispatch('unfreeze', req.project, req.body, req.ip)));

module.exports = router;
