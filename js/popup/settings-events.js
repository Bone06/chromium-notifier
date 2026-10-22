import { getConfig } from '../utils.js'
import { getDefaultBadgeColors } from '../badge.js'

let snapshotSettingRequest = 0
let selectionRequest = 0

export const changeBoolSetting = ({ target: { checked, name } }) => {
  const request = name === 'notifySnapshotRevisions' ? ++snapshotSettingRequest : null
  if (name === 'useCustomColors') {
    chrome.storage.local.set(
      checked
        ? { badgeColors: getDefaultBadgeColors(), useCustomColors: true }
        : { badgeColors: null, useCustomColors: false }
    )
    return
  }

  if (name === 'notifySnapshotRevisions' && checked) {
    const enableWithBaseline = async () => {
      let config
      let selection
      do {
        selection = selectionRequest
        config = await getConfig()
        if (request !== snapshotSettingRequest) return
      } while (selection !== selectionRequest)
      const { arch, snapshotRevisionsSeen = {}, tag, versions = {} } = config
      const current = versions[arch]?.find(build => build.tag === tag)
      return chrome.storage.local.set({
        notifySnapshotRevisions: true,
        snapshotRevisionsSeen: current?.channel === 'snapshot'
          ? { ...snapshotRevisionsSeen, [current.id]: current.revision }
          : snapshotRevisionsSeen
      })
    }
    enableWithBaseline().catch(error => console.error(error))
    return
  }

  // Persist the choice immediately; the service worker owns network checks.
  chrome.storage.local.set({ [name]: checked })
}

export const changePlatform = e => {
  selectionRequest += 1
  return chrome.storage.local.set({
    arch: e.target.value,
    tag: null
  })
}

export const changeTag = e => {
  const tag = e.target.value
  const request = ++selectionRequest
  getConfig().then(({ arch, notifySnapshotRevisions, snapshotRevisionsSeen = {}, versions = {} }) => {
    if (request !== selectionRequest) return
    const current = versions[arch]?.find(build => build.tag === tag)
    return chrome.storage.local.set({
      ...(arch ? { arch } : {}),
      snapshotRevisionsSeen: notifySnapshotRevisions &&
        current?.channel === 'snapshot'
        ? { ...snapshotRevisionsSeen, [current.id]: current.revision }
        : snapshotRevisionsSeen,
      tag
    })
  }).catch(error => console.error(error))
}

export const changeTheme = e =>
  chrome.storage.local.set({ themeMode: e.target.value })

export const changeAccent = e =>
  chrome.storage.local.set({ accentPalette: e.target.value })

export const changeBadgeColor = ({ target: { name, value } }) =>
  chrome.storage.local.get('badgeColors', ({ badgeColors = {} }) =>
    chrome.storage.local.set({
      badgeColors: { ...badgeColors, [name]: value }
    })
  )
