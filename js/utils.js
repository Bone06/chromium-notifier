import {
  createExtensionUpdateBatches,
  createExtensionUpdateUrl,
  CURRENT_SCHEMA_VERSION,
  extractChromiumVersion,
  filterRelevantExtensions,
  getChromiumVersionFromUserAgentData,
  getSafeExtensionUpdateUrl,
  mapPlatformToArch,
  migrateStoredConfig,
  parseUpdateManifest
} from './core.js'

const addIfNew = (arr = [], item) =>
  item === undefined ? arr : [...new Set([...arr]).add(item)]

export const DEFAULT_REQUEST_TIMEOUT_MS = 15000
export const MAX_REMOTE_RESPONSE_BYTES = 1024 * 1024

const readResponseText = async (response, label, maxResponseBytes) => {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new Error(
      `${label} response exceeds ${maxResponseBytes} bytes`
    )
  }

  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxResponseBytes) {
      throw new Error(`${label} response exceeds ${maxResponseBytes} bytes`)
    }
    return new TextDecoder().decode(buffer)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return text + decoder.decode()
    }
    byteLength += value.byteLength
    if (byteLength > maxResponseBytes) {
      await reader.cancel().catch(() => {})
      throw new Error(`${label} response exceeds ${maxResponseBytes} bytes`)
    }
    text += decoder.decode(value, { stream: true })
  }
}

export const fetchTextResponse = async (
  input,
  init = {},
  {
    allowNotModified = false,
    label = 'Request',
    maxResponseBytes = MAX_REMOTE_RESPONSE_BYTES,
    redirect = 'follow',
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  } = {}
) => {
  const controller = new AbortController()
  const timeoutError = new Error(`${label} timed out after ${timeoutMs} ms`)
  const timeout = setTimeout(() => controller.abort(timeoutError), timeoutMs)

  try {
    const response = await fetch(input, {
      ...init,
      redirect,
      signal: controller.signal
    })
    if (allowNotModified && response.status === 304) {
      return {
        etag: response.headers.get('etag'),
        notModified: true,
        status: response.status,
        text: null
      }
    }
    if (!response.ok) {
      throw new Error(`${label} failed (${response.status})`)
    }
    return {
      etag: response.headers.get('etag'),
      notModified: false,
      status: response.status,
      text: await readResponseText(response, label, maxResponseBytes)
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchText = async (input, init, options) =>
  (await fetchTextResponse(input, init, options)).text

export const getSelf = () =>
  new Promise(resolve => chrome.management.get(chrome.runtime.id, resolve))

export const getInstalledExtensions = () =>
  new Promise(resolve =>
    chrome.management.getAll(extensions =>
      resolve(filterRelevantExtensions(extensions, chrome.runtime.id))
    )
  )

export const fetchExtensionInfo = async (
  updateUrl,
  ids,
  prodversion,
  requestOptions = {}
) => {
  const { allowPrivateNetwork = false, ...fetchOptions } = requestOptions
  const url = createExtensionUpdateUrl(updateUrl, ids, prodversion, {
    allowPrivateNetwork
  })
  const apps = parseUpdateManifest(await fetchText(url, {}, {
    label: 'Extension update request',
    redirect: 'error',
    ...fetchOptions
  }))
  const requestedIds = new Set(ids)

  return apps
    .filter(({ app }) => requestedIds.has(app.appid))
    .map(({ app, updatecheck }) => {
      if (updatecheck?.codebase && !getSafeExtensionUpdateUrl(
        updatecheck.codebase,
        { allowPrivateNetwork }
      )) {
        throw new Error('Invalid extension update codebase URL')
      }
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
  {
    allowPrivateNetwork = false,
    maxResponseBytes = MAX_REMOTE_RESPONSE_BYTES,
    maxUrlLength = 1800,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  } = {}
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
      maxUrlLength,
      { allowPrivateNetwork }
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
      fetchExtensionInfo(updateUrl, ids, prodversion, {
        allowPrivateNetwork,
        maxResponseBytes,
        timeoutMs
      })
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
    extensionsGeneralError: null,
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
      uaFullVersion = getChromiumVersionFromUserAgentData({
        ...data,
        brands: navigator.userAgentData.brands
      })
    } catch (error) {
      console.debug('User-Agent Client Hints unavailable', error)
    }
  }

  if (!uaFullVersion) {
    uaFullVersion = getChromiumVersionFromUserAgentData({
      brands: navigator.userAgentData?.brands
    }) || extractChromiumVersion(navigator.userAgent)
  }

  const platformInfo = await new Promise(resolve =>
    chrome.runtime.getPlatformInfo(resolve)
  )

  return { ...platformInfo, uaFullVersion }
}

export const getStoredConfig = async () => {
  const store = await new Promise(resolve => chrome.storage.local.get(resolve))
  const migrated = migrateStoredConfig(store)

  if ((store.schemaVersion || 0) < CURRENT_SCHEMA_VERSION) {
    await chrome.storage.local.set(migrated)
  }

  return migrated
}

export const getConfig = async () => {
  const [{ arch, os, uaFullVersion }, extensions, self, store] =
    await Promise.all([
      getUserAgentData(),
      getInstalledExtensions(),
      getSelf(),
      getStoredConfig()
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
