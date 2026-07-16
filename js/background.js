import {
  getConfig,
  getExtensionsInfo,
  fetchText,
  getUserAgentData,
} from './utils.js'
import {
  getBadgePresentation,
  getBadgeStatus,
  getWoolyssErrorState,
  getWoolyssSuccessState,
  validateWoolyssResponse
} from './core.js'

const ALARM_NAME = 'main'
let currentUpdate

const update = async (...args) => {
  const config = await getConfig()
  const now = Date.now()

  console.debug(new Date(now).toISOString(), args)

  if (!navigator.onLine) {
    const error = new Error('Browser is offline')
    console.debug(`We're not online, aborting.`, config)
    await chrome.storage.local.set(getWoolyssErrorState(config, error, now))
    return
  } else {
    console.debug('updating', config)
  }

  const {
    extensionsTrack,
  } = config

  const woolyssJob = fetchText(
    'https://chromium.woolyss.com/api/v4/?app=MTkxMDA5',
    {
      method: 'POST'
    },
    { label: 'Woolyss request' }
  )
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
            }`,
            { cause: error }
          )
        }
      })

  const { uaFullVersion } = await getUserAgentData()
  const extensionJob = extensionsTrack
    ? getExtensionsInfo(uaFullVersion)
    : Promise.resolve(null)
  const [woolyssResult, extensionResult] = await Promise.allSettled([
    woolyssJob,
    extensionJob
  ])
  let newState

  try {
    if (woolyssResult.status === 'rejected') {
      throw woolyssResult.reason
    }
    const versions = validateWoolyssResponse(woolyssResult.value)
    newState = getWoolyssSuccessState(versions, now)
  } catch (error) {
    console.error(error)
    newState = getWoolyssErrorState(config, error, now)
  }

  if (extensionResult.status === 'fulfilled' && extensionResult.value) {
    Object.assign(newState, extensionResult.value)
  } else if (extensionResult.status === 'rejected') {
    const message = extensionResult.reason?.message || String(
      extensionResult.reason
    )
    console.error(extensionResult.reason)
    newState.extensionsGeneralError = message
  }

  await chrome.storage.local.set(newState)
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
    badgeColors,
    extensions,
    extensionsInfo = [],
    extensionsTrack,
    tag,
    useCustomColors,
    versions,
    woolyssDataStale,
    woolyssError
  } = await getConfig()

  const current =
    versions &&
    arch &&
    versions[arch] &&
    versions[arch].find(v => v.tag === tag)

  const { uaFullVersion } = await getUserAgentData()
  const badge = getBadgePresentation(
    getBadgeStatus({
      availableVersion: current?.version,
      currentVersion: uaFullVersion,
      extensions,
      extensionsInfo,
      extensionsTrack,
      woolyssError
    }),
    { badgeColors, useCustomColors, woolyssDataStale }
  )

  if (woolyssError) {
    console.error(woolyssError)
  }

  chrome.action.setBadgeBackgroundColor({ color: badge.color })
  chrome.action.setBadgeText({ text: badge.text })
  chrome.action.setTitle({ title: badge.title })
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) {
    main(alarm.name)
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
