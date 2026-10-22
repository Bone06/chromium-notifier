import { getChromiumVersionStatus } from './versions.js'
import { hasExtensionUpdate, indexExtensionInfoById } from './extension-updates.js'

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
  const extensionInfoById = extensionsTrack
    ? indexExtensionInfoById(extensionsInfo)
    : null
  const extensionUpdate = Boolean(
    extensionsTrack &&
    extensions.some(extension =>
      hasExtensionUpdate(
        extension,
        extensionInfoById.get(extension.id)
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
    hasStaleBuildSource = false,
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
      hasStaleBuildSource
        ? 'The selected build source is using cached data'
        : null
    ].filter(Boolean).join(' — ')
  }
}
