const addIfNew = (arr = [], item) =>
  item === undefined ? arr : [...new Set([...arr]).add(item)]

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

const parseUpdateManifest = text => {
  if (/<(?:[\w-]+:)?parsererror\b/i.test(text)) {
    throw new Error('Invalid extension update manifest')
  }

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

export const getSelf = () =>
  new Promise(resolve => chrome.management.get(chrome.runtime.id, resolve))

const fetchExtensionInfo = async (updateUrl, ids, prodversion) => {
  const url = new URL(updateUrl)
  url.searchParams.set('acceptformat', 'crx2,crx3')
  url.searchParams.set('prodversion', prodversion)
  ids.forEach(id => url.searchParams.append('x', `id=${id}&uc`))

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
    getUserAgentData().then(({ arch: cpuArch, os, uaFullVersion }) => {
      chrome.management.getAll(extensions =>
        chrome.storage.local.get(store => {
          if (!store.arch) {
            store.arch = os === 'mac'
              ? 'mac'
              : os === 'win' && cpuArch === 'x86-64'
              ? 'win64'
              : os === 'win'
              ? 'win32'
              : undefined
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

export const matchExtension = ext => ({ id, updateUrl, version }) => {
  return Boolean(version && id === ext.id)
}

const compareVersions = (left = '', right = '') => {
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

export const hasExtensionUpdate = (extension, info) =>
  Boolean(
    info &&
      info.id === extension.id &&
      info.status !== 'noupdate' &&
      info.version &&
      compareVersions(info.version, extension.version) > 0
  )
