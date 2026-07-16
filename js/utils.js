import {
  createExtensionUpdateUrl,
  mapPlatformToArch,
  parseUpdateManifest
} from './core.js'

const addIfNew = (arr = [], item) =>
  item === undefined ? arr : [...new Set([...arr]).add(item)]

export const getSelf = () =>
  new Promise(resolve => chrome.management.get(chrome.runtime.id, resolve))

const fetchExtensionInfo = async (updateUrl, ids, prodversion) => {
  const url = createExtensionUpdateUrl(updateUrl, ids, prodversion)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Extension update request failed (${response.status})`)
  }

  const apps = parseUpdateManifest(await response.text())

  return apps.map(({ app, updatecheck }) => {
    const info = {
      id: app.appid,
      prodversion,
      timestamp: new Date().getTime(),
      updateUrl
    }

    return updatecheck
      ? {
          ...info,
          ...updatecheck
        }
      : info
  })
}

const fetchExtensionsInfo = async (extensions, prodversion) => {
  const jobs = extensions.reduce((acc, { id, updateUrl }) => {
    if (updateUrl) {
      acc[updateUrl] = addIfNew(acc[updateUrl], id)
    }
    return acc
  }, {})

  const results = await Promise.allSettled(
    Object.keys(jobs).map(
      updateUrl =>
      updateUrl &&
      fetchExtensionInfo(updateUrl, jobs[updateUrl], prodversion)
    )
  )

  return results
    .filter(({ status }) => status === 'fulfilled')
    .map(({ value }) => value)
    .flat()
}

export const getUserAgentData = async () => {
  let uaFullVersion

  if (navigator.userAgentData?.getHighEntropyValues) {
    try {
      const data = await navigator.userAgentData.getHighEntropyValues([
        'fullVersionList',
        'uaFullVersion'
      ])
      const chromium = data.fullVersionList?.find(({ brand }) =>
        /Chromium|Chrome/i.test(brand)
      )
      uaFullVersion = chromium?.version || data.uaFullVersion
    } catch (error) {
      console.debug('User-Agent Client Hints unavailable', error)
    }
  }

  if (!uaFullVersion) {
    uaFullVersion = navigator.userAgent.match(
      /(?:Chrome|Chromium)\/([0-9]+(?:\.[0-9]+){1,3})/
    )?.[1]
  }

  const platformInfo = await new Promise(resolve =>
    chrome.runtime.getPlatformInfo(resolve)
  )

  return { ...platformInfo, uaFullVersion }
}

export const getConfig = () =>
  new Promise(resolve =>
    getUserAgentData().then(({ arch, os, uaFullVersion }) => {
      chrome.management.getAll(extensions =>
        chrome.storage.local.get(store => {
          if (!store.arch) {
            store.arch = mapPlatformToArch({ arch, os })
          }
          getSelf().then(self =>
            resolve({
              ...store,
              currentVersion: uaFullVersion,
              extensions,
              self
            })
          )
        })
      )
    })
  )

export const getExtensionsInfo = async currentVersion => {
  const extensions = await new Promise(resolve =>
    chrome.management.getAll(exts =>
      resolve(
        exts.map(ext => ({
          id: ext.id,
          updateUrl: ext.updateUrl
        }))
      )
    )
  )

  return await fetchExtensionsInfo(extensions, currentVersion)
}
