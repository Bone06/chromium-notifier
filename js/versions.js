const validBrowserVersion = version =>
  typeof version === 'string' && /^\d+(?:\.\d+){0,3}$/.test(version)

export const extractChromiumVersion = (userAgent = '') => {
  const version = userAgent.match(
    /(?:Chromium|Chrome)\/([0-9]+(?:\.[0-9]+){0,3})/i
  )?.[1]
  return validBrowserVersion(version) ? version : undefined
}

export const getChromiumVersionFromUserAgentData = (data = {}) => {
  const fullVersionList = Array.isArray(data.fullVersionList)
    ? data.fullVersionList
    : []
  const brands = Array.isArray(data.brands) ? data.brands : []
  const candidates = [
    fullVersionList.find(({ brand }) => /^Chromium$/i.test(brand))?.version,
    fullVersionList.find(({ brand }) => /Chrome/i.test(brand))?.version,
    data.uaFullVersion,
    brands.find(({ brand }) => /^Chromium$/i.test(brand))?.version,
    brands.find(({ brand }) => /Chrome/i.test(brand))?.version
  ]

  return candidates.find(validBrowserVersion)
}

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
