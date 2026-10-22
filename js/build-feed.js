import { getHttpUrl } from './urls.js'

const isObject = value =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const hasOnlyKeys = (value, required, optional = []) => {
  if (!isObject(value)) return false
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return required.every(key => Object.hasOwn(value, key)) &&
    keys.every(key => allowed.has(key))
}

const getHttpsUrl = value => {
  const url = getHttpUrl(value)
  return url?.protocol === 'https:' && !url.username && !url.password &&
    value.length <= 2048
    ? url
    : null
}

const getIsoTimestamp = (value, location) => {
  const timestamp = typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    ? Date.parse(value)
    : NaN
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid build source feed: ${location} is invalid`)
  }
  return timestamp
}

const hasControlCharacters = value => [...value].some(character => {
  const code = character.charCodeAt(0)
  return code <= 31 || code === 127
})

const validFeedIdentifier = value => typeof value === 'string' &&
  value.length <= 120 && /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(value)
const validFeedLabel = value => typeof value === 'string' && value.trim() &&
  value.length <= 120 && !hasControlCharacters(value)

export const validateBuildSourcesFeed = response => {
  if (
    !hasOnlyKeys(response, ['schemaVersion', 'generatedAt', 'sources', 'builds']) ||
    response.schemaVersion !== 1
  ) {
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
      !hasOnlyKeys(source, [
        'id', 'name', 'repository', 'checkedAt', 'lastSuccessAt', 'stale',
        'error'
      ]) ||
      !validFeedIdentifier(source.id) ||
      !validFeedLabel(source.name) ||
      !getHttpsUrl(source.repository) ||
      typeof source.stale !== 'boolean' ||
      (source.error !== null &&
        (typeof source.error !== 'string' || !source.error.trim() ||
          source.error.length > 500 || hasControlCharacters(source.error))) ||
      source.stale !== Boolean(source.error)
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
      !hasOnlyKeys(build, [
        'id', 'sourceId', 'platform', 'architecture', 'tag', 'channel',
        'version', 'publishedAt', 'releaseUrl', 'capabilities', 'downloads'
      ], ['displayName', 'revision']) ||
      !validFeedIdentifier(build.id) ||
      !validFeedIdentifier(build.platform) ||
      !validFeedIdentifier(build.architecture) ||
      !validFeedIdentifier(build.tag) ||
      (build.displayName !== undefined && !validFeedLabel(build.displayName)) ||
      !validFeedIdentifier(build.channel) ||
      typeof build.version !== 'string' || !/^\d+(?:\.\d+){3}$/.test(build.version) ||
      (build.revision !== undefined && (typeof build.revision !== 'string' || !/^\d+$/.test(build.revision))) ||
      !source ||
      !hasOnlyKeys(build.capabilities, [
        'official', 'proprietaryCodecs', 'sync', 'widevine'
      ]) ||
      Object.values(build.capabilities).some(value => typeof value !== 'boolean') ||
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
        !hasOnlyKeys(download, ['label', 'name', 'size', 'url'], ['sha256']) ||
        !validFeedLabel(download.label) ||
        !validFeedLabel(download.name) ||
        !Number.isSafeInteger(download.size) ||
        download.size <= 0 ||
        !getHttpsUrl(download.url) ||
        (download.sha256 !== undefined &&
          !/^[a-f0-9]{64}$/.test(download.sha256))
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
    if (!Object.hasOwn(versions, build.platform)) {
      Object.defineProperty(versions, build.platform, { enumerable: true, value: [] })
    }
    versions[build.platform].push(normalizedBuild)
  })

  return {
    generatedAt: response.generatedAt,
    sources: response.sources,
    versions
  }
}

export const MAX_FEED_AGE_MS = 3 * 60 * 60 * 1000
export const MAX_FEED_FUTURE_SKEW_MS = 5 * 60 * 1000

export const assertBuildFeedFreshness = (generatedAt, now = Date.now()) => {
  const timestamp = getIsoTimestamp(generatedAt, 'generatedAt')
  if (timestamp - now > MAX_FEED_FUTURE_SKEW_MS) {
    throw new Error('Chromatic Feed generation time is unexpectedly in the future')
  }
  if (now - timestamp > MAX_FEED_AGE_MS) {
    throw new Error('Chromatic Feed is stale: generated more than three hours ago')
  }
}

export const isBuildFeedRollback = (previousGeneratedAt, nextGeneratedAt, now = Date.now()) =>
  Boolean(
    previousGeneratedAt &&
    Number.isFinite(Date.parse(previousGeneratedAt)) &&
    Date.parse(previousGeneratedAt) <= now + MAX_FEED_FUTURE_SKEW_MS &&
    Date.parse(nextGeneratedAt) < Date.parse(previousGeneratedAt)
  )

export const getBuildFeedSuccessState = (versions, now = Date.now()) => ({
  error: null,
  lastAttemptAt: now,
  lastErrorAt: null,
  lastSuccessAt: now,
  timestamp: now,
  versions,
  woolyssDataStale: false,
  woolyssError: null
})

export const getBuildFeedErrorState = (
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
