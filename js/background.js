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
  validateBuildSourcesFeed
} from './core.js'

const ALARM_NAME = 'main'
const BUILD_FEED_URL = 'http://127.0.0.1:8787/versions.json'
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

  const buildFeedJob = fetchText(
    BUILD_FEED_URL,
    {},
    { label: 'Chromium build source feed' }
  )
      .then(text => {
        try {
          const json = JSON.parse(text)
          return json
        } catch (error) {
          throw new Error(
            `${error.message} (build source feed): ${
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
  const [buildFeedResult, extensionResult] = await Promise.allSettled([
    buildFeedJob,
    extensionJob
  ])
  let newState

  try {
    if (buildFeedResult.status === 'rejected') {
      throw buildFeedResult.reason
    }
    const { generatedAt, sources, versions } = validateBuildSourcesFeed(
      buildFeedResult.value
    )
    newState = {
      ...getWoolyssSuccessState(versions, now),
      buildFeedGeneratedAt: generatedAt,
      buildFeedSources: sources
    }
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
