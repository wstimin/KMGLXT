'use strict';

const fs = require('fs');
const path = require('path');

const REPO = 'wstimin/KMGLXT';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;
const CACHE_TTL = 60 * 1000;

let cache = { data: null, expiresAt: 0 };

function normalizeTag(value) {
  const tag = String(value || '').trim();
  return /^v\d+(?:\.\d+)*(?:[-._][0-9A-Za-z]+)*$/.test(tag) ? tag : '';
}

function versionParts(value) {
  return String(value || '')
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function isNewerVersion(latest, current) {
  if (!latest) return false;
  if (!current) return true;
  const a = versionParts(latest);
  const b = versionParts(current);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'number') return left > right;
    return String(left).localeCompare(String(right), undefined, { numeric: true }) > 0;
  }
  return false;
}

async function fetchReleaseApi(force = false) {
  const suffix = force ? `?refresh=${Date.now()}` : '';
  const response = await fetch(`${RELEASE_API}${suffix}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'KMGLXT-update-checker',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  const json = await response.json();
  const tag = normalizeTag(json.tag_name);
  if (!tag) throw new Error('GitHub Release 版本号无效');

  const archive = Array.isArray(json.assets)
    ? json.assets.find((item) => item.name === `KMGLXT-${tag}.tar.gz`)
    : null;
  return {
    tag,
    name: json.name || tag,
    url: json.html_url || `https://github.com/${REPO}/releases/tag/${tag}`,
    assetUrl: archive?.browser_download_url || '',
    publishedAt: json.published_at || '',
    stale: false,
  };
}

async function fetchReleasePage() {
  const response = await fetch(`${RELEASE_PAGE}?refresh=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'KMGLXT-update-checker',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GitHub Release 页面 ${response.status}`);
  const match = /\/releases\/tag\/([^/?#]+)/.exec(response.url);
  const tag = normalizeTag(match ? decodeURIComponent(match[1]) : '');
  if (!tag) throw new Error('GitHub Release 页面未返回版本号');
  return {
    tag,
    name: tag,
    url: `https://github.com/${REPO}/releases/tag/${tag}`,
    assetUrl: `https://github.com/${REPO}/releases/download/${tag}/KMGLXT-${tag}.tar.gz`,
    publishedAt: '',
    stale: false,
  };
}

async function settle(promise) {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

async function fetchLatestRelease(force = false) {
  if (!force && cache.data && cache.expiresAt > Date.now()) return cache.data;

  const attempts = [await settle(fetchReleaseApi(force))];
  if (attempts[0].status === 'rejected') {
    attempts.push(await settle(fetchReleasePage()));
  }

  const available = attempts
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  if (available.length) {
    const data = available.reduce((latest, item) => (
      isNewerVersion(item.tag, latest.tag) ? item : latest
    ));
    cache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  }

  const reason = attempts
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message)
    .filter(Boolean)
    .join('；') || '无法连接 GitHub';
  if (cache.data) {
    return {
      ...cache.data,
      stale: true,
      checkError: `GitHub 暂时不可用，显示的是缓存版本：${reason}`,
    };
  }
  throw new Error(reason);
}

function readLocalVersion(appRoot) {
  const file = path.join(appRoot, '.km-version');
  if (fs.existsSync(file)) {
    const tag = normalizeTag(fs.readFileSync(file, 'utf8'));
    if (tag) return tag;
  }
  const envTag = normalizeTag(process.env.APP_VERSION);
  if (envTag) return envTag;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    return normalizeTag(`v${manifest.version}`);
  } catch {
    return '';
  }
}

module.exports = {
  REPO,
  fetchLatestRelease,
  isNewerVersion,
  normalizeTag,
  readLocalVersion,
};
