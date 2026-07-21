const decodeXml = value =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'"
  })[entity])

const getAttributes = source =>
  Array.from(source.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)).reduce(
    (attributes, [, name, , value]) => ({
      ...attributes,
      [name]: decodeXml(value)
    }),
    {}
  )

export const getHttpUrl = value => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

export const parseUpdateManifest = text => {
  const apps = Array.from(
    text.matchAll(
      /<(?:[\w-]+:)?app\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?app\s*>/gi
    )
  )

  if (!apps.length && !/<(?:[\w-]+:)?gupdate\b/i.test(text)) {
    throw new Error('Invalid extension update manifest')
  }

  return apps.map(([, appAttributes, contents]) => {
    const updateCheck = contents.match(
      /<(?:[\w-]+:)?updatecheck\b([^>]*)\/?\s*>/i
    )

    return {
      app: getAttributes(appAttributes),
      updatecheck: updateCheck ? getAttributes(updateCheck[1]) : null
    }
  })
}

export const createExtensionUpdateUrl = (updateUrl, ids, prodversion) => {
  const url = getHttpUrl(updateUrl)
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
  maxUrlLength = 1800
) => {
  const batches = []
  let current = []

  ids.forEach(id => {
    const candidate = [...current, id]
    const candidateLength = createExtensionUpdateUrl(
      updateUrl,
      candidate,
      prodversion
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
  const codebase = getHttpUrl(info?.codebase)
  if (!codebase) {
    return null
  }
  if (codebase.hostname !== 'clients2.googleusercontent.com') {
    return codebase.href
  }

  const url = getHttpUrl(info.updateUrl)
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

export const mapPlatformToArch = ({ arch, os }) => {
  if (os === 'mac') {
    return arch === 'arm64' ? 'macarm64' : arch === 'x86-64' ? 'mac' : undefined
  }
  if (os === 'linux') {
    return arch === 'x86-64' ? 'linux' : undefined
  }
  if (os === 'win') {
    return arch === 'arm64' ? 'winarm64' : arch === 'x86-64' ? 'win64' : undefined
  }
  return undefined
}

export const getPlatformDisplayName = platform => ({
  linux: 'Linux x64 - linux',
  mac: 'macOS Intel - mac',
  macarm64: 'macOS Apple Silicon - macarm64',
  win64: 'Windows x64 - win64',
  winarm64: 'Windows ARM64 - winarm64'
})[platform] || platform

const validBrowserVersion = version =>
  typeof version === 'string' && /^\d+(?:\.\d+){0,3}$/.test(version)

export const extractChromiumVersion = (userAgent = '') => {
  const version = userAgent.match(
    /(?:Chromium|Chrome)\/([0-9]+(?:\.[0-9]+){0,3})/i
  )?.[1]
  return validBrowserVersion(version) ? version : undefined
}

export const getChromiumVersionFromUserAgentData = (data = {}) => {
  const fullVersionList = Array.isArray(data.fullVersionList)
    ? data.fullVersionList
    : []
  const brands = Array.isArray(data.brands) ? data.brands : []
  const candidates = [
    fullVersionList.find(({ brand }) => /^Chromium$/i.test(brand))?.version,
    fullVersionList.find(({ brand }) => /Chrome/i.test(brand))?.version,
    data.uaFullVersion,
    brands.find(({ brand }) => /^Chromium$/i.test(brand))?.version,
    brands.find(({ brand }) => /Chrome/i.test(brand))?.version
  ]

  return candidates.find(validBrowserVersion)
}

export const CURRENT_SCHEMA_VERSION = 1

export const migrateStoredConfig = (store = {}) => {
  const schemaVersion = Number.isInteger(store.schemaVersion)
    ? store.schemaVersion
    : 0

  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return { ...store }
  }

  const migrated = {
    ...store,
    error: null,
    schemaVersion: CURRENT_SCHEMA_VERSION
  }
  const timestamp = Number(store.timestamp)
  const hasTimestamp = Number.isFinite(timestamp) && timestamp > 0
  const hasVersions = Boolean(
    store.versions && Object.keys(store.versions).length
  )

  if (!migrated.lastAttemptAt && hasTimestamp) {
    migrated.lastAttemptAt = timestamp
  }
  if (!migrated.lastSuccessAt && hasTimestamp && hasVersions && !store.error) {
    migrated.lastSuccessAt = timestamp
  }
  if (!migrated.woolyssError && store.error) {
    migrated.woolyssError = String(store.error)
  }
  if (migrated.woolyssDataStale === undefined && store.error) {
    migrated.woolyssDataStale = hasVersions
  }

  return migrated
}

export const matchExtension = extension => ({ id, version }) =>
  Boolean(version && id === extension.id)

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

export const compareVersions = (left = '', right = '') => {
  const a = left.split('.').map(part => Number(part) || 0)
  const b = right.split('.').map(part => Number(part) || 0)
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) {
      return (a[i] || 0) - (b[i] || 0)
    }
  }

  return 0
}

export const getChromiumVersionStatus = (currentVersion, availableVersion) => {
  const validVersion = /^\d+(?:\.\d+)*$/
  if (
    !validVersion.test(currentVersion || '') ||
    !validVersion.test(availableVersion || '')
  ) {
    return 'unknown'
  }

  const comparison = compareVersions(availableVersion, currentVersion)
  return comparison > 0
    ? 'update-available'
    : comparison < 0
    ? 'local-newer'
    : 'current'
}

export const getBuildSelectionStatus = ({ arch, tag, versions = {} }) => {
  if (!arch) {
    return 'platform-required'
  }
  if (!tag) {
    return 'tag-required'
  }
  if (!Object.keys(versions).length) {
    return 'no-data'
  }
  if (!Object.hasOwn(versions, arch)) {
    return 'platform-unavailable'
  }
  if (!versions[arch].some(build => build.tag === tag)) {
    return 'tag-unavailable'
  }
  return 'valid'
}

export const getCompactBuildName = displayName => displayName
  .replace(' – Modified', '')
  .replace(' – All Codecs+', '')
  .replace(' – All Codecs', '')

const isObject = value =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export const validateWoolyssResponse = response => {
  if (!isObject(response)) {
    throw new Error('Invalid Woolyss response: expected an object')
  }
  if (response.error) {
    throw new Error(`Woolyss API: ${response.error}`)
  }

  const responseVersions = Object.fromEntries(
    Object.entries(response).filter(([key]) => key !== 'error')
  )

  if (!Object.keys(responseVersions).length) {
    throw new Error('Invalid Woolyss response: no platforms found')
  }

  const versions = Object.fromEntries(
    Object.entries(responseVersions).map(([platform, buildCollection]) => {
      const collectionKeys = isObject(buildCollection)
        ? Object.keys(buildCollection)
        : []
      const builds = Array.isArray(buildCollection)
        ? buildCollection
        : isObject(buildCollection) &&
          collectionKeys.length > 0 &&
          collectionKeys.every(key => /^\d+$/.test(key))
        ? Object.values(buildCollection)
        : null

      if (!builds) {
        throw new Error(
          `Invalid Woolyss response: ${platform} must contain a build list`
        )
      }

      builds.forEach((build, index) => {
        const location = `${platform}[${index}]`
        if (!isObject(build)) {
          throw new Error(`Invalid Woolyss response: ${location} is not a build`)
        }
        if (typeof build.tag !== 'string' || !build.tag.trim()) {
          throw new Error(`Invalid Woolyss response: ${location}.tag is missing`)
        }
        if (!/^\d+(?:\.\d+)*$/.test(build.version || '')) {
          throw new Error(
            `Invalid Woolyss response: ${location}.version is invalid`
          )
        }
        if (
          build.timestamp !== undefined &&
          (typeof build.timestamp !== 'number' ||
            !Number.isFinite(build.timestamp))
        ) {
          throw new Error(
            `Invalid Woolyss response: ${location}.timestamp is invalid`
          )
        }
        if (build.links !== undefined && !Array.isArray(build.links)) {
          throw new Error(
            `Invalid Woolyss response: ${location}.links is invalid`
          )
        }
        build.links?.forEach((link, linkIndex) => {
          if (
            !isObject(link) ||
            typeof link.label !== 'string' ||
            !link.label.trim() ||
            !getHttpUrl(link.url)
          ) {
            throw new Error(
              `Invalid Woolyss response: ${location}.links[${linkIndex}] is invalid`
            )
          }
        })
      })

      return [platform, builds]
    })
  )

  return versions
}

const getHttpsUrl = value => {
  const url = getHttpUrl(value)
  return url?.protocol === 'https:' ? url : null
}

const getIsoTimestamp = (value, location) => {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid build source feed: ${location} is invalid`)
  }
  return timestamp
}

const hasControlCharacters = value => [...value].some(character => {
  const code = character.charCodeAt(0)
  return code <= 31 || code === 127
})

export const validateBuildSourcesFeed = response => {
  if (!isObject(response) || response.schemaVersion !== 1) {
    throw new Error('Invalid build source feed: expected schemaVersion 1')
  }

  getIsoTimestamp(response.generatedAt, 'generatedAt')
  if (!Array.isArray(response.sources) || !response.sources.length) {
    throw new Error('Invalid build source feed: sources must not be empty')
  }
  if (!Array.isArray(response.builds) || !response.builds.length) {
    throw new Error('Invalid build source feed: builds must not be empty')
  }

  const sources = new Map()
  response.sources.forEach((source, index) => {
    const location = `sources[${index}]`
    if (
      !isObject(source) ||
      typeof source.id !== 'string' ||
      !source.id.trim() ||
      typeof source.name !== 'string' ||
      !source.name.trim() ||
      !getHttpsUrl(source.repository) ||
      typeof source.stale !== 'boolean' ||
      (source.error !== null && typeof source.error !== 'string')
    ) {
      throw new Error(`Invalid build source feed: ${location} is invalid`)
    }
    if (sources.has(source.id)) {
      throw new Error(`Invalid build source feed: duplicate source ${source.id}`)
    }
    getIsoTimestamp(source.checkedAt, `${location}.checkedAt`)
    getIsoTimestamp(source.lastSuccessAt, `${location}.lastSuccessAt`)
    sources.set(source.id, source)
  })

  const buildIds = new Set()
  const versions = {}
  response.builds.forEach((build, index) => {
    const location = `builds[${index}]`
    const source = isObject(build) ? sources.get(build.sourceId) : null
    if (
      !isObject(build) ||
      typeof build.id !== 'string' ||
      !build.id.trim() ||
      typeof build.platform !== 'string' ||
      !/^[a-z0-9_-]+$/.test(build.platform) ||
      typeof build.architecture !== 'string' ||
      !build.architecture.trim() ||
      typeof build.tag !== 'string' ||
      !build.tag.trim() ||
      (build.displayName !== undefined &&
        (typeof build.displayName !== 'string' ||
          !build.displayName.trim() ||
          build.displayName.length > 120 ||
          hasControlCharacters(build.displayName))) ||
      typeof build.channel !== 'string' ||
      !build.channel.trim() ||
      !/^\d+(?:\.\d+){3}$/.test(build.version || '') ||
      (build.revision !== undefined && !/^\d+$/.test(build.revision)) ||
      !source ||
      !getHttpsUrl(build.releaseUrl) ||
      !Array.isArray(build.downloads) ||
      !build.downloads.length
    ) {
      throw new Error(`Invalid build source feed: ${location} is invalid`)
    }
    if (buildIds.has(build.id)) {
      throw new Error(`Invalid build source feed: duplicate build ${build.id}`)
    }
    buildIds.add(build.id)

    const publishedAt = getIsoTimestamp(
      build.publishedAt,
      `${location}.publishedAt`
    )
    const links = build.downloads.map((download, downloadIndex) => {
      if (
        !isObject(download) ||
        typeof download.label !== 'string' ||
        !download.label.trim() ||
        typeof download.name !== 'string' ||
        !download.name.trim() ||
        !Number.isSafeInteger(download.size) ||
        download.size <= 0 ||
        !getHttpsUrl(download.url)
      ) {
        throw new Error(
          `Invalid build source feed: ${location}.downloads[${downloadIndex}] is invalid`
        )
      }
      return { label: download.label, url: download.url }
    })

    const normalizedBuild = {
      channel: build.channel,
      displayName: build.displayName || build.tag,
      id: build.id,
      links,
      releaseUrl: build.releaseUrl,
      revision: build.revision,
      source: {
        checkedAt: source.checkedAt,
        error: source.error,
        id: source.id,
        lastSuccessAt: source.lastSuccessAt,
        name: source.name,
        repository: source.repository,
        stale: source.stale
      },
      tag: build.tag,
      timestamp: publishedAt / 1000,
      version: build.version
    }
    versions[build.platform] ||= []
    versions[build.platform].push(normalizedBuild)
  })

  return {
    generatedAt: response.generatedAt,
    sources: response.sources,
    versions
  }
}

export const getWoolyssSuccessState = (versions, now = Date.now()) => ({
  error: null,
  lastAttemptAt: now,
  lastErrorAt: null,
  lastSuccessAt: now,
  timestamp: now,
  versions,
  woolyssDataStale: false,
  woolyssError: null
})

export const getWoolyssErrorState = (
  previousState,
  error,
  now = Date.now()
) => ({
  error: null,
  lastAttemptAt: now,
  lastErrorAt: now,
  timestamp: now,
  woolyssDataStale: Boolean(
    previousState?.versions && Object.keys(previousState.versions).length
  ),
  woolyssError: error?.message || String(error)
})

export const hasExtensionUpdate = (extension, info) =>
  Boolean(
    info &&
      info.id === extension.id &&
      info.status !== 'noupdate' &&
      info.version &&
      compareVersions(info.version, extension.version) > 0
  )

export const getBadgeStatus = ({
  availableVersion,
  currentVersion,
  extensions = [],
  extensionsInfo = [],
  extensionsTrack = false,
  snapshotRevisionUpdate = false,
  woolyssError
}) => {
  const chromiumUpdate =
    getChromiumVersionStatus(currentVersion, availableVersion) ===
      'update-available' || snapshotRevisionUpdate
  const extensionUpdate = Boolean(
    extensionsTrack &&
    extensions.some(extension =>
      hasExtensionUpdate(
        extension,
        extensionsInfo.find(({ id }) => id === extension.id)
      )
    )
  )

  const updateStatus = chromiumUpdate && extensionUpdate
    ? 'both'
    : chromiumUpdate
    ? 'chromium'
    : extensionUpdate
    ? 'extensions'
    : null

  return updateStatus || (woolyssError ? 'error' : 'none')
}

export const DEFAULT_BADGE_COLORS = Object.freeze({
  both: '#7e22ce',
  chromium: '#0096b4',
  error: '#b40014',
  extensions: '#c2410c'
})

const hexToRgba = hex => {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '')
  return match
    ? [...match.slice(1).map(value => Number.parseInt(value, 16)), 255]
    : null
}

export const getDefaultBadgeColors = () => ({ ...DEFAULT_BADGE_COLORS })

export const getBadgePresentation = (
  status,
  {
    badgeColors = {},
    hasStaleBuildSources = false,
    snapshotRevisionUpdate = false,
    useCustomColors = false,
    woolyssDataStale = false
  } = {}
) => {
  const presentations = ({
  both: {
    color: [126, 34, 206, 255],
    text: 'NEW+',
    title: 'Chromium and extension updates are available'
  },
  chromium: {
    color: [0, 150, 180, 255],
    text: 'New',
    title: 'A new Chromium version is available'
  },
  error: {
    color: [180, 0, 20, 255],
    text: '!',
    title: 'Update check failed'
  },
  extensions: {
    color: [194, 65, 12, 255],
    text: 'EXT',
    title: 'Extension updates are available'
  },
  none: {
    color: [0, 150, 180, 255],
    text: '',
    title: 'Chromium is up to date'
  }
  })
  const presentation = presentations[status] || {
    color: [0, 150, 180, 255],
    text: '',
    title: 'Chromium update status is unavailable'
  }
  const customColor = useCustomColors
    ? hexToRgba(badgeColors?.[status])
    : null

  return {
    ...presentation,
    color: customColor || presentation.color,
    title: [
      snapshotRevisionUpdate && status === 'chromium'
        ? 'A new Chromium snapshot revision is available'
        : presentation.title,
      woolyssDataStale
        ? 'Latest Chromium check failed; using cached data'
        : null,
      hasStaleBuildSources
        ? 'Some build sources are using cached data'
        : null
    ].filter(Boolean).join(' — ')
  }
}

export const hasSnapshotRevisionUpdate = ({
  current,
  notifySnapshotRevisions = false,
  snapshotRevisionsSeen = {}
}) => Boolean(
  notifySnapshotRevisions &&
  current?.channel === 'snapshot' &&
  current.revision &&
  snapshotRevisionsSeen[current.id] &&
  Number(current.revision) > Number(snapshotRevisionsSeen[current.id])
)
