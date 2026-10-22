// Compatibility facade: existing imports remain valid while responsibilities live
// in focused, browser-independent modules.
export * from './urls.js'
export * from './versions.js'
export * from './extension-updates.js'
export * from './build-feed.js'
export * from './badge.js'

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
