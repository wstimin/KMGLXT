'use strict';

const fs = require('fs');
const path = require('path');

const REPO = 'wstimin/KMGLXT';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_TTL = 5 * 60 * 1000;

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

async function fetchLatestRelease(force = false) {
  if (!force && cache.data && cache.expiresAt > Date.now()) return cache.data;

  try {
    const response = await fetch(RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
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
    const data = {
      tag,
      name: json.name || tag,
      url: json.html_url || `https://github.com/${REPO}/releases/tag/${tag}`,
      assetUrl: archive?.browser_download_url || '',
      publishedAt: json.published_at || '',
      stale: false,
    };
    cache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch (error) {
    if (cache.data) return { ...cache.data, stale: true };
    throw error;
  }
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
