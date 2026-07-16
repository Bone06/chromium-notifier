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
  const url = new URL(updateUrl)
  url.searchParams.set('acceptformat', 'crx2,crx3')
  url.searchParams.set('prodversion', prodversion)
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
  if (!info.codebase.includes('clients2.googleusercontent.com')) {
    return info.codebase
  }

  const url = new URL(info.updateUrl)
  url.searchParams.set('response', 'redirect')
  url.searchParams.set('acceptformat', 'crx2,crx3')
  url.searchParams.set('prodversion', currentVersion)
  url.searchParams.set('x', `id=${info.id}&installsource=ondemand&uc`)
  return url.href
}

export const mapPlatformToArch = ({ arch, os }) =>
  os === 'mac'
    ? 'mac'
    : os === 'win' && arch === 'x86-64'
    ? 'win64'
    : os === 'win'
    ? 'win32'
    : undefined

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

const isObject = value =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isHttpUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

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
            !isHttpUrl(link.url)
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
  woolyssError
}) => {
  const chromiumUpdate =
    getChromiumVersionStatus(currentVersion, availableVersion) ===
    'update-available'
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
    title: woolyssDataStale
      ? `${presentation.title} (latest Chromium check failed; using cached data)`
      : presentation.title
  }
}
