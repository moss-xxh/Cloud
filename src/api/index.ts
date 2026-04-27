import type { FileItem, ResourceResponse, UsageResponse } from '../types'

// Trash filename layout: `<name><TRASH_SENTINEL><urlencoded original parent dir>`.
// Wrapped in U+0001 control chars so it cannot collide with any practical filename.
const TRASH_SENTINEL = '\u0001__FROM__\u0001'
const LEGACY_TRASH_SENTINEL = '__FROM__'

function getToken(): string {
  return localStorage.getItem('auth_token') || ''
}

function authHeaders(): Record<string, string> {
  return {
    'X-Auth': getToken()
  }
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw new Error('Login failed')
  const token = await res.text()
  localStorage.setItem('auth_token', token)
  return token
}

export async function getResources(path: string): Promise<ResourceResponse> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`/api/resources/${encodedPath}`, {
    headers: authHeaders()
  })
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    window.location.href = '/cloud/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`Failed to get resources: ${res.statusText}`)
  return res.json()
}

export async function deleteResource(path: string): Promise<void> {
  const encodedPath = path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`/api/resources/${encodedPath}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Failed to delete: ${res.statusText}`)
}

export async function renameResource(oldPath: string, newPath: string): Promise<void> {
  const encodedOld = oldPath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  const encodedNew = encodeURIComponent(newPath)
  const res = await fetch(`/api/resources/${encodedOld}?destination=${encodedNew}&action=rename`, {
    method: 'PATCH',
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Failed to rename: ${res.statusText}`)
}

export async function moveResource(srcPath: string, destPath: string): Promise<void> {
  const encodedSrc = srcPath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  const encodedDest = encodeURIComponent(destPath)
  const res = await fetch(`/api/resources/${encodedSrc}?destination=${encodedDest}&action=rename`, {
    method: 'PATCH',
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Failed to move: ${res.statusText}`)
}

export async function moveToTrash(path: string, name: string): Promise<void> {
  const parentDir = path.substring(0, path.lastIndexOf('/'))
  const encodedOrigPath = encodeURIComponent(parentDir || '/')
  const trashName = `${name}${TRASH_SENTINEL}${encodedOrigPath}`
  const destPath = `/.trash/${trashName}`
  // Ensure .trash folder exists
  try {
    await createFolder('.trash')
  } catch {
    // folder may already exist, ignore
  }
  await moveResource(path, destPath)
}

export function parseTrashName(trashName: string): { originalName: string; originalDir: string } {
  // Prefer new sentinel; fall back to legacy for items trashed before the sentinel change.
  // Use lastIndexOf so that even if the sentinel string somehow appears in originalName,
  // we still split on the last occurrence (which is what moveToTrash appended).
  let idx = trashName.lastIndexOf(TRASH_SENTINEL)
  let sentinelLen = TRASH_SENTINEL.length
  if (idx === -1) {
    idx = trashName.lastIndexOf(LEGACY_TRASH_SENTINEL)
    sentinelLen = LEGACY_TRASH_SENTINEL.length
  }
  if (idx === -1) {
    return { originalName: trashName, originalDir: '/' }
  }
  const originalName = trashName.substring(0, idx)
  let originalDir = '/'
  try {
    originalDir = decodeURIComponent(trashName.substring(idx + sentinelLen)) || '/'
  } catch {
    // Malformed encoding — fall back to root rather than failing the whole list.
    originalDir = '/'
  }
  return { originalName, originalDir }
}

export async function restoreFromTrash(trashPath: string, trashName: string): Promise<void> {
  const { originalName, originalDir } = parseTrashName(trashName)
  const destPath = originalDir === '/' ? `/${originalName}` : `${originalDir}/${originalName}`
  await moveResource(trashPath, destPath)
}

export async function createFolder(path: string): Promise<void> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `/api/resources/${encodedPath}/`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders()
    },
    body: ''
  })
  if (res.status === 409) {
    throw new Error('Folder already exists')
  }
  if (!res.ok) throw new Error(`Failed to create folder: ${res.statusText}`)
}

export async function uploadFile(
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cleanPath = path.replace(/^\/+/, '')
    const filePath = cleanPath ? `${cleanPath}/${file.name}` : file.name
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
    xhr.open('POST', `/api/resources/${encodedPath}?override=true`, true)
    xhr.setRequestHeader('X-Auth', getToken())

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload network error'))

    const formData = new FormData()
    formData.append('files', file, file.name)
    xhr.send(formData)
  })
}

export async function getUsage(): Promise<UsageResponse> {
  const res = await fetch('/api/usage', {
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Failed to get usage: ${res.statusText}`)
  return res.json()
}

export async function searchFiles(path: string, query: string): Promise<{ items: FileItem[] }> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`/api/search/${encodedPath}?query=${encodeURIComponent(query)}`, {
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`)
  // FileBrowser search returns NDJSON (one JSON per line), not a JSON array.
  // A single malformed line must not abort the entire result set.
  const text = await res.text()
  const items: FileItem[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj: any
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue
    }
    const fullPath = typeof obj.path === 'string' ? obj.path : ''
    if (!fullPath) continue
    const parts = fullPath.split('/')
    const name = parts[parts.length - 1] || parts[parts.length - 2] || fullPath
    const extIdx = name.lastIndexOf('.')
    items.push({
      path: '/' + fullPath,
      name,
      size: obj.size || 0,
      extension: extIdx > 0 ? name.substring(extIdx) : '',
      modified: obj.modified || new Date().toISOString(),
      mode: obj.mode || 0,
      isDir: obj.dir || false,
      isSymlink: false,
      type: obj.type || (obj.dir ? 'directory' : 'file')
    })
  }
  return { items }
}

export async function shareResource(path: string): Promise<{ hash: string } | null> {
  try {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const res = await fetch('/api/share/' + encodedPath, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function getRawUrl(path: string, inline = true): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const base = `/api/raw/${encodedPath}`
  return inline ? base : `${base}?inline=false`
}

export function isImageFile(extension: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(
    extension.toLowerCase()
  )
}

export function isVideoFile(extension: string): boolean {
  return ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(extension.toLowerCase())
}

export function isAudioFile(extension: string): boolean {
  return ['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'].includes(extension.toLowerCase())
}

export function isPdfFile(extension: string): boolean {
  return extension.toLowerCase() === '.pdf'
}

export function isHtmlFile(extension: string): boolean {
  return ['.html', '.htm'].includes(extension.toLowerCase())
}

export function isTextFile(extension: string): boolean {
  return ['.txt', '.md', '.json', '.js', '.ts', '.py', '.css', '.xml', '.yaml', '.yml', '.sh', '.conf', '.env', '.log', '.csv', '.tsx', '.jsx', '.vue', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.rb', '.php', '.sql', '.toml', '.ini', '.cfg'].includes(
    extension.toLowerCase()
  )
}

export function getFileIcon(extension: string, isDir: boolean): string {
  if (isDir) return 'folder'
  const ext = extension.toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) return 'image'
  if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) return 'movie'
  if (['.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a'].includes(ext)) return 'audio_file'
  if (['.pdf'].includes(ext)) return 'picture_as_pdf'
  if (['.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) return 'description'
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'table_chart'
  if (['.ppt', '.pptx'].includes(ext)) return 'slideshow'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'folder_zip'
  if (['.js', '.ts', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.sh'].includes(ext)) return 'code'
  return 'insert_drive_file'
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const dayMs = 86400000

  if (diff < dayMs) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < dayMs * 7) {
    return d.toLocaleDateString('zh-CN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- Share Management ---
export async function getShares(): Promise<Array<{ hash: string; path: string; expire: number }>> {
  const res = await fetch('/api/shares', { headers: authHeaders() })
  if (!res.ok) return []
  return res.json()
}

export async function deleteShare(hash: string): Promise<void> {
  const res = await fetch(`/api/share/${hash}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!res.ok) throw new Error(`Delete share failed: ${res.status}`)
}
