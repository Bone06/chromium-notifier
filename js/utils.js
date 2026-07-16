import {
  createExtensionUpdateBatches,
  createExtensionUpdateUrl,
  filterRelevantExtensions,
  mapPlatformToArch,
  parseUpdateManifest
} from './core.js'

const addIfNew = (arr = [], item) =>
  item === undefined ? arr : [...new Set([...arr]).add(item)]

export const getSelf = () =>
  new Promise(resolve => chrome.management.get(chrome.runtime.id, resolve))

export const getInstalledExtensions = () =>
  new Promise(resolve =>
    chrome.management.getAll(extensions =>
      resolve(filterRelevantExtensions(extensions, chrome.runtime.id))
    )
  )

export const fetchExtensionInfo = async (updateUrl, ids, prodversion) => {
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

export const fetchExtensionsInfo = async (
  extensions,
  prodversion,
  { maxUrlLength = 1800 } = {}
) => {
  const jobs = extensions.reduce((acc, { id, updateUrl }) => {
    if (updateUrl) {
      acc[updateUrl] = addIfNew(acc[updateUrl], id)
    }
    return acc
  }, {})

  const updateUrls = Object.keys(jobs)
  const serverJobs = updateUrls.map(updateUrl => ({
    batches: createExtensionUpdateBatches(
      updateUrl,
      jobs[updateUrl],
      prodversion,
      maxUrlLength
    ),
    updateUrl
  }))
  const batchJobs = serverJobs.flatMap(({ batches, updateUrl }) =>
    batches.map((ids, batchIndex) => ({
      batchIndex,
      ids,
      totalBatches: batches.length,
      updateUrl
    }))
  )
  const results = await Promise.allSettled(
    batchJobs.map(({ ids, updateUrl }) =>
      fetchExtensionInfo(updateUrl, ids, prodversion)
    )
  )

  const extensionsInfo = results
    .filter(({ status }) => status === 'fulfilled')
    .map(({ value }) => value)
    .flat()

  const extensionsErrors = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{
          batch: batchJobs[index].batchIndex + 1,
          totalBatches: batchJobs[index].totalBatches,
          updateUrl: batchJobs[index].updateUrl,
          message: result.reason?.message || String(result.reason)
        }]
      : []
  )
  const failedServers = new Set(
    extensionsErrors.map(({ updateUrl }) => updateUrl)
  )

  return {
    extensionsErrors,
    extensionsInfo,
    extensionsUpdateSummary: {
      batches: batchJobs.length,
      failed: failedServers.size,
      failedBatches: extensionsErrors.length,
      succeeded: serverJobs.length - failedServers.size,
      total: serverJobs.length
    }
  }
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

export const getConfig = async () => {
  const [{ arch, os, uaFullVersion }, extensions, self, store] =
    await Promise.all([
      getUserAgentData(),
      getInstalledExtensions(),
      getSelf(),
      new Promise(resolve => chrome.storage.local.get(resolve))
    ])

  return {
    ...store,
    arch: store.arch || mapPlatformToArch({ arch, os }),
    currentVersion: uaFullVersion,
    extensions,
    self
  }
}

export const getExtensionsInfo = async currentVersion => {
  const extensions = (await getInstalledExtensions()).map(ext => ({
    id: ext.id,
    updateUrl: ext.updateUrl
  }))

  return await fetchExtensionsInfo(extensions, currentVersion)
}
