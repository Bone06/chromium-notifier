import {
  getConfig,
  getExtensionsInfo,
  getUserAgentData,
} from './utils.js'
import {
  getChromiumVersionStatus,
  hasExtensionUpdate
} from './core.js'

const ALARM_NAME = 'main'
let currentUpdate

const update = async (...args) => {
  const config = await getConfig()
  const now = new Date()

  console.debug(now.toISOString(), args)

  if (!navigator.onLine) {
    return console.debug(`We're not online, aborting.`, config)
  } else {
    console.debug('updating', config)
  }

  const {
    extensionsTrack,
  } = config

  const p = [
    fetch('https://chromium.woolyss.com/api/v4/?app=MTkxMDA5', {
      method: 'POST'
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Woolyss request failed (${res.status})`)
        }
        return res.text()
      })
      .then(text => {
        try {
          const json = JSON.parse(text)
          return json
        } catch (error) {
          throw new Error(
            `${error.message} (Woolyss API): ${
              text.length > 60
                ? text.slice(0, 30) + '…' + text.slice(text.length - 30)
                : text
            }`
          )
        }
      })
  ]

  const { uaFullVersion } = await getUserAgentData()

  if (extensionsTrack) {
    p.push(getExtensionsInfo(uaFullVersion))
  }

  try {
    const [versions, extensionsResult] = await Promise.all(p)
    const newState = {
      error: null,
      timestamp: now.getTime()
    }

    if (extensionsResult) {
      Object.assign(newState, extensionsResult)
    }

    if (versions) {
      newState.error = versions.error || null
      newState.versions = !versions.error ? versions : {}
    }

    await chrome.storage.local.set(newState)
  } catch (error) {
    console.error(error)
    await chrome.storage.local.set({
      error: error.message || String(error),
      timestamp: now.getTime()
    })
  }
}

const main = (...args) => {
  if (!currentUpdate) {
    currentUpdate = update(...args).finally(() => {
      currentUpdate = null
    })
  }
  return currentUpdate
}

const ensureAlarm = async () => {
  const alarm = await chrome.alarms.get(ALARM_NAME)
  if (!alarm) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 180 })
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.debug('Extension installed', reason)
  ensureAlarm()
  main(reason)
})

chrome.storage.onChanged.addListener(async () => {
  const {
    arch,
    error,
    extensions,
    extensionsInfo = [],
    tag,
    versions
  } = await getConfig()

  const current =
    versions &&
    arch &&
    versions[arch] &&
    versions[arch].find(v => v.tag === tag)

  const extensionsNew = extensions.some(extension =>
    hasExtensionUpdate(
      extension,
      extensionsInfo.find(({ id }) => id === extension.id)
    )
  )

  const { uaFullVersion } = await getUserAgentData()

  chrome.action.setBadgeText({
    text:
      (current &&
        getChromiumVersionStatus(uaFullVersion, current.version) ===
          'update-available') ||
      extensionsNew
        ? 'New'
        : ''
  })

  if (error) {
    console.error(error)
    chrome.action.setBadgeBackgroundColor({ color: [180, 0, 20, 255] })
    chrome.action.setBadgeText({ text: 'Error!' })
  } else {
    chrome.action.setBadgeBackgroundColor({ color: [0, 150, 180, 255] })
  }
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    main(alarm.name)
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'check-now') {
    return false
  }

  main('manual')
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({
      error: error.message || String(error),
      ok: false
    }))
  return true
})

chrome.runtime.onStartup.addListener(main)

ensureAlarm()
