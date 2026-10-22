import { getHttpUrl } from './urls.js'
import { compareVersions } from './versions.js'

const decodeXml = value =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'"
  })[entity])

const getAttributes = source => {
  const attributes = {}
  let cursor = 0
  let count = 0
  const invalid = () => { throw new Error('Invalid extension update manifest attributes') }
  const whitespace = () => {
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1
  }
  while (cursor < source.length) {
    whitespace()
    if (cursor === source.length) break
    const start = cursor
    while (cursor < source.length && /[\w:-]/.test(source[cursor])) cursor += 1
    if (cursor === start || cursor - start > 128 || ++count > 64) invalid()
    const name = source.slice(start, cursor)
    whitespace()
    if (source[cursor++] !== '=') invalid()
    whitespace()
    const quote = source[cursor++]
    if (quote !== '"' && quote !== "'") invalid()
    const valueStart = cursor
    while (cursor < source.length && source[cursor] !== quote) cursor += 1
    if (cursor === source.length || cursor - valueStart > 8192 || Object.hasOwn(attributes, name)) invalid()
    Object.defineProperty(attributes, name, {
      enumerable: true, value: decodeXml(source.slice(valueStart, cursor))
    })
    cursor += 1
    if (cursor < source.length && !/\s/.test(source[cursor])) invalid()
  }
  return attributes
}

const getXmlTags = text => {
  const tags = []
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf('<', cursor)
    if (start === -1) break

    let quote = null
    let end = start + 1
    for (; end < text.length; end += 1) {
      const character = text[end]
      if (quote) {
        if (character === quote) quote = null
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === '>') {
        break
      }
    }
    if (end === text.length) break

    const source = text.slice(start + 1, end)
    if (source.length > 65536) {
      throw new Error('Invalid extension update manifest')
    }
    tags.push(source)
    cursor = end + 1
  }

  return tags
}

export const parseUpdateManifest = text => {
  if (typeof text !== 'string' || text.length > 256 * 1024) {
    throw new Error('Invalid extension update manifest')
  }

  const apps = []
  let current = null
  let hasGupdate = false

  for (const source of getXmlTags(text)) {
    if (/^\s*[!?]/.test(source)) continue
    const match = source.match(
      /^\s*(\/)?\s*(?:[\w-]+:)?(gupdate|app|updatecheck)\b([\s\S]*?)\s*(\/)?\s*$/i
    )
    if (!match) continue

    const [, closing, nameValue, attributes, selfClosing] = match
    const name = nameValue.toLowerCase()
    if (name === 'gupdate' && !closing) hasGupdate = true

    if (name === 'app') {
      if (closing) {
        if (current) apps.push(current)
        current = null
      } else {
        if (current) throw new Error('Invalid extension update manifest')
        current = { app: getAttributes(attributes), updatecheck: null }
        if (selfClosing) {
          apps.push(current)
          current = null
        }
      }
    } else if (name === 'updatecheck' && !closing && current) {
      current.updatecheck = getAttributes(attributes)
    }
  }

  if (current) throw new Error('Invalid extension update manifest')
  if (!apps.length && !hasGupdate) {
    throw new Error('Invalid extension update manifest')
  }
  return apps
}

const isPrivateIpv4 = hostname => {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value =>
    !Number.isInteger(value) || value < 0 || value > 255
  )) return false
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
}

const isPrivateIpv6 = hostname => {
  if (!hostname.startsWith('[') || !hostname.endsWith(']')) return false
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return value === '::' || value === '::1' || value.startsWith('fc') ||
    value.startsWith('fd') || /^fe[89ab]/.test(value) ||
    value.startsWith('::ffff:')
}

export const getSafeExtensionUpdateUrl = (
  value,
  { allowPrivateNetwork = false } = {}
) => {
  const url = getHttpUrl(value)
  if (!url) return null
  const hostname = url.hostname.toLowerCase()
  if (!allowPrivateNetwork && (
    hostname === 'localhost' || hostname.endsWith('.localhost') ||
    isPrivateIpv4(hostname) || isPrivateIpv6(hostname)
  )) return null
  return url
}

export const createExtensionUpdateUrl = (
  updateUrl,
  ids,
  prodversion,
  options
) => {
  const url = getSafeExtensionUpdateUrl(updateUrl, options)
  if (!url) {
    throw new Error('Invalid extension update URL')
  }
  url.searchParams.set('acceptformat', 'crx2,crx3')
  if (prodversion) {
    url.searchParams.set('prodversion', prodversion)
  }
  ids.forEach(id => url.searchParams.append('x', `id=${id}&uc`))
  return url
}

export const createExtensionUpdateBatches = (
  updateUrl,
  ids,
  prodversion,
  maxUrlLength = 1800,
  options
) => {
  const batches = []
  let current = []

  ids.forEach(id => {
    const candidate = [...current, id]
    const candidateLength = createExtensionUpdateUrl(
      updateUrl,
      candidate,
      prodversion,
      options
    ).href.length

    if (current.length && candidateLength > maxUrlLength) {
      batches.push(current)
      current = [id]
    } else {
      current = candidate
    }
  })

  if (current.length) {
    batches.push(current)
  }

  return batches
}

export const getExtensionDownloadUrl = (info, currentVersion) => {
  const codebase = getSafeExtensionUpdateUrl(info?.codebase)
  if (!codebase) {
    return null
  }
  if (codebase.hostname !== 'clients2.googleusercontent.com') {
    return codebase.href
  }

  const url = getSafeExtensionUpdateUrl(info.updateUrl)
  if (!url) {
    return null
  }
  url.searchParams.set('response', 'redirect')
  url.searchParams.set('acceptformat', 'crx2,crx3')
  if (currentVersion) {
    url.searchParams.set('prodversion', currentVersion)
  }
  url.searchParams.set('x', `id=${info.id}&installsource=ondemand&uc`)
  return url.href
}

export const indexExtensionInfoById = (extensionsInfo = []) => {
  const infoById = new Map()
  for (const info of extensionsInfo) {
    if (info?.id && info.version && !infoById.has(info.id)) {
      infoById.set(info.id, info)
    }
  }
  return infoById
}

export const groupExtensionsByUpdateInfo = (
  extensions = [],
  extensionsInfo = []
) => {
  const infoById = indexExtensionInfoById(extensionsInfo)

  const supported = []
  const unsupported = []
  for (const extension of [...extensions].sort((a, b) =>
    a.name.localeCompare(b.name))) {
    (infoById.has(extension.id) ? supported : unsupported).push(extension)
  }

  return { infoById, supported, unsupported }
}

export const filterRelevantExtensions = (extensions = [], selfId) =>
  extensions.filter(({ id, type }) => type === 'extension' && id !== selfId)

export const getExtensionCapabilities = extension => ({
  canRemove: extension.mayDisable !== false,
  canToggle: extension.enabled
    ? extension.mayDisable !== false
    : extension.mayEnable !== false
})

export const getInstallTypeLabel = installType => ({
  admin: 'Managed',
  development: 'Unpacked',
  sideload: 'Sideloaded'
})[installType] || null

export const hasExtensionUpdate = (extension, info) =>
  Boolean(
    info &&
      info.id === extension.id &&
      info.status !== 'noupdate' &&
      info.version &&
      compareVersions(info.version, extension.version) > 0
  )
