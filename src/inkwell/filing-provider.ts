import { Refusal } from './model'

export type FilingProvider = 'box' | 'dropbox'
type Json = Record<string, unknown>
const failed = () => new Refusal('The filing provider could not verify the artifact. Retry manually.', 502, 'filing_provider_failed')
const conflict = () => new Refusal('The filing destination contains a different artifact.', 409, 'filing_conflict')
const fields = 'id,type,name,size,sha1,parent'
function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failed()
  return value as Json
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
async function digest(algorithm: string, bytes: Uint8Array) {
  return crypto.subtle.digest(algorithm, bytes as BufferSource)
}
async function dropboxHash(bytes: Uint8Array) {
  const blockSize = 4 * 1024 * 1024
  const hashes = new Uint8Array(Math.ceil(bytes.length / blockSize) * 32)
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    hashes.set(new Uint8Array(await digest('SHA-256', bytes.subarray(offset, offset + blockSize))), offset / blockSize * 32)
  }
  return hex(await digest('SHA-256', hashes))
}

/** Only fixed official hosts are used. Failed requests are never retried here. */
async function request(url: string, token: string, init: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers },
      redirect: 'manual', signal: AbortSignal.timeout(60_000),
    })
    if (![200, 201, 409].includes(response.status)) {
      await response.body?.cancel()
      throw failed()
    }
    return { status: response.status, data: record(await response.json()) }
  } catch { throw failed() }
}

function verifyBox(value: unknown, folder: string, name: string, size: number, hash: string) {
  const file = record(value), parent = record(file.parent)
  if (file.type !== 'file' || typeof file.id !== 'string' || !/^\d+$/.test(file.id) ||
      file.name !== name || parent.type !== 'folder' || parent.id !== folder || file.size !== size ||
      typeof file.sha1 !== 'string' || !/^[a-f0-9]{40}$/i.test(file.sha1) || file.sha1.toLowerCase() !== hash) throw conflict()
  return { id: file.id }
}
async function box(token: string, folder: string, name: string, bytes: Uint8Array) {
  const hash = hex(await digest('SHA-1', bytes)), body = new FormData()
  body.append('attributes', JSON.stringify({ name, parent: { id: folder } }))
  body.append('file', new Blob([bytes.slice().buffer]), name)
  const result = await request(`https://upload.box.com/api/2.0/files/content?fields=${fields}`, token, {
    method: 'POST', headers: { 'Content-MD5': hash }, body,
  })
  if (result.status === 201) {
    if (result.data.total_count !== 1 || !Array.isArray(result.data.entries) || result.data.entries.length !== 1) throw failed()
    return verifyBox(result.data.entries[0], folder, name, bytes.length, hash)
  }
  if (result.status !== 409 || result.data.type !== 'error' || result.data.status !== 409 || result.data.code !== 'item_name_in_use') throw failed()
  const conflicts = record(result.data.context_info).conflicts
  const items = Array.isArray(conflicts) ? conflicts : [conflicts]
  if (items.length !== 1) throw conflict()
  const candidate = record(items[0])
  if (candidate.type !== 'file' || candidate.name !== name || typeof candidate.id !== 'string' || !/^\d+$/.test(candidate.id)) throw conflict()
  const existing = await request(`https://api.box.com/2.0/files/${candidate.id}?fields=${fields}`, token, { method: 'GET' })
  if (existing.status !== 200 || existing.data.id !== candidate.id) throw failed()
  return verifyBox(existing.data, folder, name, bytes.length, hash)
}

function verifyDropbox(file: Json, path: string, name: string, size: number, hash: string, lookup: boolean) {
  if ((lookup ? file['.tag'] !== 'file' : file['.tag'] !== undefined && file['.tag'] !== 'file') ||
      typeof file.id !== 'string' || !/^id:[a-zA-Z0-9_-]+$/.test(file.id) || file.name !== name ||
      file.path_lower !== path.toLowerCase() || file.size !== size || file.symlink_info !== undefined ||
      typeof file.content_hash !== 'string' || !/^[a-f0-9]{64}$/.test(file.content_hash) || file.content_hash !== hash) throw conflict()
  return { id: file.id }
}
async function dropbox(token: string, folder: string, name: string, bytes: Uint8Array) {
  const path = `${folder === '/' ? '' : folder}/${name}`, hash = await dropboxHash(bytes)
  // HTTP headers need ASCII JSON, including for Unicode folder names.
  const argument = JSON.stringify({ path, mode: 'add', autorename: false, strict_conflict: true, content_hash: hash })
    .replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  const result = await request('https://content.dropboxapi.com/2/files/upload', token, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': argument }, body: bytes.slice().buffer,
  })
  if (result.status === 200) return verifyDropbox(result.data, path, name, bytes.length, hash, false)
  if (result.status !== 409) throw failed()
  const error = record(result.data.error), reason = record(record(error.path).reason)
  if (error['.tag'] !== 'path' || reason['.tag'] !== 'conflict' || record(reason.conflict)['.tag'] !== 'file') throw conflict()
  const existing = await request('https://api.dropboxapi.com/2/files/get_metadata', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, include_deleted: false }),
  })
  if (existing.status !== 200) throw failed()
  return verifyDropbox(existing.data, path, name, bytes.length, hash, true)
}

/** The caller supplies the same destination and deterministic filename on every manual retry. */
export async function fileArtifact(provider: FilingProvider, token: string, folder: string, name: string, bytes: Uint8Array): Promise<{ id: string }> {
  try {
    if (!['box', 'dropbox'].includes(provider) || typeof token !== 'string' || !token || /[\x00-\x20\x7f]/.test(token) ||
        typeof name !== 'string' || !name || name.length > 255 || name.trim() !== name || ['.', '..'].includes(name) || /[\\/\x00-\x1f\x7f]/.test(name) ||
        typeof folder !== 'string' || !(bytes instanceof Uint8Array)) throw new Refusal('The filing destination is invalid.')
    if (provider === 'box' ? !/^\d+$/.test(folder) : folder !== '' && folder !== '/' &&
        (!folder.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(folder) || folder.slice(1).split('/').some(part => !part || part === '.' || part === '..'))) {
      throw new Refusal('The filing destination is invalid.')
    }
    if (bytes.length > (provider === 'box' ? 50_000_000 : 150 * 1024 * 1024)) throw new Refusal('The artifact exceeds the filing provider upload limit.', 413)
    const content = new Uint8Array(bytes)
    return await (provider === 'box' ? box(token, folder, name, content) : dropbox(token, folder, name, content))
  } catch (error) {
    if (error instanceof Refusal) throw error
    throw failed()
  }
}

/** Resolve only the folder already authorized; never search outside its stable identity. */
export async function dropboxFolder(token:string,path:string):Promise<{id:string;path:string}> {
  const result=await request('https://api.dropboxapi.com/2/files/get_metadata',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,include_deleted:false})})
  const folder=result.data,location=folder.path_display
  if(result.status!==200||folder['.tag']!=='folder'||typeof folder.id!=='string'||!/^id:[A-Za-z0-9_-]+$/.test(folder.id)||typeof location!=='string'||!location.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(location)||location.slice(1).split('/').some(p=>!p||p==='.'||p==='..'))throw failed()
  if(path.startsWith('id:')&&folder.id!==path)throw conflict()
  return {id:folder.id,path:location}
}
