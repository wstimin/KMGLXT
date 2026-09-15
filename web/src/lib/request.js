export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} }
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
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    window.location.href = '/login'
    throw new ApiError(401, json?.message || '登录已失效')
  }

  if (!res.ok || (json && json.code !== 0)) {
    throw new ApiError(json?.code ?? res.status, json?.message || `请求失败(${res.status})`)
  }
  return json ? json.data : null
}

export function get(path) {
  return request(path)
}
export function post(path, body) {
  return request(path, { method: 'POST', body })
}
export function put(path, body) {
  return request(path, { method: 'PUT', body })
}
export function del(path) {
  return request(path, { method: 'DELETE' })
}

/** multipart/form-data 上传(不手动设置 Content-Type) */
export async function upload(path, formData) {
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
  const res = await fetch(url, { credentials: 'same-origin' })
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