export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const RESPONSE_CACHE_PREFIX = 'kmglxt:response:v1:'
const RESPONSE_CACHE_MAX_AGE = 5 * 60 * 1000
const RESPONSE_CACHE_REVALIDATE_AFTER = 3 * 1000
const RESPONSE_CACHE_ENTRY_LIMIT = 512 * 1024

function cacheKey(path) {
  return `${RESPONSE_CACHE_PREFIX}${path}`
}

function canCache(path, method, enabled) {
  if (!enabled || method !== 'GET' || typeof sessionStorage === 'undefined') return false
  if (!String(path).startsWith('/api/')) return false
  const url = new URL(path, location.origin)
  return url.searchParams.get('refresh') !== '1'
}

function readResponseCache(path) {
  try {
    const raw = sessionStorage.getItem(cacheKey(path))
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry || Date.now() - Number(entry.savedAt || 0) > RESPONSE_CACHE_MAX_AGE) {
      sessionStorage.removeItem(cacheKey(path))
      return null
    }
    return entry
  } catch {
    return null
  }
}

function writeResponseCache(path, data) {
  try {
    const raw = JSON.stringify({ savedAt: Date.now(), data })
    if (raw.length <= RESPONSE_CACHE_ENTRY_LIMIT) sessionStorage.setItem(cacheKey(path), raw)
  } catch {
    /* 浏览器禁用存储或容量不足时直接退回网络请求 */
  }
}

export function clearResponseCache() {
  if (typeof sessionStorage === 'undefined') return
  try {
    const keys = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(RESPONSE_CACHE_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}

async function networkRequest(path, { method, body, redirectOnUnauthorized }) {
  const opts = { method, credentials: 'same-origin', headers: {}, cache: 'no-store' }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(path, opts)
  } catch {
    throw new ApiError(-1, '网络连接失败')
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  // 会话失效:整体跳登录页(登录接口自身的 401 除外)
  if (res.status === 401 && redirectOnUnauthorized && !location.pathname.startsWith('/login')) {
    clearResponseCache()
    window.location.href = '/login'
    throw new ApiError(401, json?.message || '登录已失效')
  }

  if (!res.ok || (json && json.code !== 0)) {
    throw new ApiError(json?.code ?? res.status, json?.message || `请求失败(${res.status})`)
  }
  return json ? json.data : null
}

async function request(path, {
  method = 'GET',
  body,
  redirectOnUnauthorized = true,
  browserCache = true,
} = {}) {
  const useCache = canCache(path, method, browserCache)
  const cached = useCache ? readResponseCache(path) : null

  if (cached) {
    // 先恢复页面内容；缓存稍旧时在后台刷新，下一次读取即可获得新数据。
    if (Date.now() - cached.savedAt > RESPONSE_CACHE_REVALIDATE_AFTER) {
      networkRequest(path, { method, body, redirectOnUnauthorized })
        .then((data) => {
          if (path === '/api/bootstrap' && cached.data?.admin && !data?.admin) {
            clearResponseCache()
            if (!location.pathname.startsWith('/login')) window.location.href = '/login'
            return
          }
          writeResponseCache(path, data)
        })
        .catch(() => {})
    }
    return cached.data
  }

  if (method !== 'GET') clearResponseCache()
  const data = await networkRequest(path, { method, body, redirectOnUnauthorized })
  if (useCache) writeResponseCache(path, data)
  return data
}

export function get(path, options) {
  return request(path, options)
}
export function post(path, body) {
  return request(path, { method: 'POST', body, browserCache: false })
}
export function put(path, body) {
  return request(path, { method: 'PUT', body, browserCache: false })
}
export function del(path) {
  return request(path, { method: 'DELETE', browserCache: false })
}

/** multipart/form-data 上传(不手动设置 Content-Type) */
export async function upload(path, formData) {
  clearResponseCache()
  let res
  try {
    res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: formData })
  } catch {
    throw new ApiError(-1, '网络连接失败')
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    window.location.href = '/login'
    throw new ApiError(401, json?.message || '登录已失效')
  }
  if (!res.ok || (json && json.code !== 0)) {
    throw new ApiError(json?.code ?? res.status, json?.message || `请求失败(${res.status})`)
  }
  return json ? json.data : null
}

/** 下载文件(解析 Content-Disposition 文件名) */
export async function downloadUrl(url, fallbackName) {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) {
    let msg = '下载失败'
    try {
      const j = await res.json()
      msg = j.message || msg
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  const blob = await res.blob()
  const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') || '')
  let name = fallbackName
  if (m) {
    try {
      name = decodeURIComponent(m[1])
    } catch {
      /* ignore */
    }
  }
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 1500)
}
