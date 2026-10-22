import { getBuildSelectionStatus, hasSnapshotRevisionUpdate } from './core.js'
import { getChromiumVersionStatus } from './versions.js'
import { getBadgePresentation, getBadgeStatus } from './badge.js'

// Pure derived state shared by the popup and the service worker. snapshotNotice
// is popup-local UI memory: acknowledging storage must not hide an open notice.
export const getUpdatePresentation = (config = {}, { snapshotNotice = null } = {}) => {
  const selectionStatus = getBuildSelectionStatus(config)
  const current = selectionStatus === 'valid'
    ? config.versions[config.arch].find(build => build.tag === config.tag)
    : undefined
  const versionStatus = getChromiumVersionStatus(config.currentVersion, current?.version)
  const snapshotRevisionPending = hasSnapshotRevisionUpdate({ ...config, current })
  const retainNotice = config.notifySnapshotRevisions && current &&
    snapshotNotice?.id === current.id && snapshotNotice?.revision === current.revision
  const nextNotice = snapshotRevisionPending || retainNotice
    ? { id: current.id, revision: current.revision }
    : null
  const snapshotRevisionUpdate = Boolean(nextNotice)
  const hasStaleBuildSource = current?.source?.stale === true
  const badgeStatus = getBadgeStatus({
    ...config,
    availableVersion: current?.version,
    snapshotRevisionUpdate
  })
  return {
    current,
    selectionStatus,
    versionStatus,
    snapshotRevisionPending,
    snapshotRevisionUpdate,
    snapshotNotice: nextNotice,
    hasStaleBuildSource,
    badgeStatus,
    badge: getBadgePresentation(badgeStatus, {
      ...config, hasStaleBuildSource, snapshotRevisionUpdate
    })
  }
}
