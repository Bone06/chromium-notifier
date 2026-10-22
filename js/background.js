import {
  getConfig,
  getExtensionsInfo,
  fetchText,
  fetchTextResponse,
  getUserAgentData,
  isTransientNetworkError,
  retryTransientRequest,
} from './utils.js'
import {
  getBuildFeedErrorState,
  getBuildFeedSuccessState,
  assertBuildFeedFreshness,
  isBuildFeedRollback,
  validateBuildSourcesFeed
} from './core.js'
import { getUpdatePresentation } from './presentation.js'
import { isTrustedFeedKey, verifySignedBuildFeed } from './feed-signature.js'

const ALARM_NAME = 'main'
const RECOVERY_ALARM_NAME = 'feed-recovery'
const RECOVERY_DELAY_MINUTES = 1
const BUILD_FEED_URL =
  'https://bone06.ddns.net/chromium/versions.json'
const BUILD_FEED_SIGNATURE_URL = `${BUILD_FEED_URL}.sig`
let currentUpdate

const reportBackgroundError = (task, error) => {
  // Chromium may reject an in-flight extension API call after this worker stops.
  if (error?.message !== 'No SW') {
    console.error(`${task} failed`, error)
  }
}

const runBackgroundTask = (task, promise) =>
  promise.catch(error => reportBackgroundError(task, error))

const setRecoveryAlarm = async scheduled => {
  try {
    if (scheduled) {
      await chrome.alarms.create(RECOVERY_ALARM_NAME, {
        delayInMinutes: RECOVERY_DELAY_MINUTES
      })
    } else {
      await chrome.alarms.clear(RECOVERY_ALARM_NAME)
    }
  } catch (error) {
    reportBackgroundError('Feed recovery alarm', error)
  }
}

const fetchBuildFeedOnce = async config => {
  const headers = {}
  let freshCache = false
  try {
    assertBuildFeedFreshness(config.buildFeedGeneratedAt)
    freshCache = true
  } catch { /* Expired cache requires an unconditional, signed response. */ }
  if (
    config.buildFeedEtag &&
    isTrustedFeedKey(config.buildFeedKeyId) &&
    freshCache &&
    config.versions &&
    Object.keys(config.versions).length
  ) {
    headers['If-None-Match'] = config.buildFeedEtag
  }

  const response = await fetchTextResponse(
    BUILD_FEED_URL,
    { headers },
    {
      allowNotModified: true,
      label: 'Chromatic Feed'
    }
  )
  if (response.notModified) {
    if (!headers['If-None-Match'] || !isTrustedFeedKey(config.buildFeedKeyId)) {
      throw new Error('Build source feed returned 304 without a currently trusted cache')
    }
    assertBuildFeedFreshness(config.buildFeedGeneratedAt)
    return { notModified: true }
  }

  const signatureText = await fetchText(BUILD_FEED_SIGNATURE_URL, {}, {
    label: 'Chromatic Feed signature',
    maxResponseBytes: 4096
  })
  try {
    const keyId = await verifySignedBuildFeed(response.text, signatureText)
    return {
      etag: response.etag,
      json: JSON.parse(response.text),
      keyId,
      notModified: false
    }
  } catch (error) {
    throw new Error(
      `${error.message} (build source feed): ${
        response.text.length > 60
          ? response.text.slice(0, 30) + '…' +
            response.text.slice(response.text.length - 30)
          : response.text
      }`,
      { cause: error }
    )
  }
}

const fetchBuildFeed = config => retryTransientRequest(
  () => fetchBuildFeedOnce(config),
  {
    shouldRetry: error => {
      const retry = isTransientNetworkError(error)
      if (retry) {
        console.warn(
          'Transient Chromatic Feed request failed; retrying once.',
          error
        )
      }
      return retry
    }
  }
)

const update = async (...args) => {
  const config = await getConfig()
  const now = Date.now()
  const isRecoveryCheck = args[0] === RECOVERY_ALARM_NAME

  console.debug(new Date(now).toISOString(), args)

  if (!navigator.onLine) {
    const error = new Error('Browser is offline')
    console.debug(`We're not online, aborting.`, config)
    await chrome.storage.local.set(getBuildFeedErrorState(config, error, now))
    if (!isRecoveryCheck) await setRecoveryAlarm(true)
    return
  } else {
    console.debug('updating', config)
  }

  const {
    extensionsTrack
  } = config

  const buildFeedJob = fetchBuildFeed(config)

  const { uaFullVersion } = await getUserAgentData()
  const extensionJob = extensionsTrack
    ? getExtensionsInfo(uaFullVersion)
    : Promise.resolve(null)
  const [buildFeedResult, extensionResult] = await Promise.allSettled([
    buildFeedJob,
    extensionJob
  ])
  let newState
  let feedSucceeded = false
  let transientFeedFailure = false

  try {
    if (buildFeedResult.status === 'rejected') {
      throw buildFeedResult.reason
    }
    if (buildFeedResult.value.notModified) {
      if (!isTrustedFeedKey(config.buildFeedKeyId)) throw new Error('Cached feed signing key is no longer trusted')
      assertBuildFeedFreshness(config.buildFeedGeneratedAt)
      newState = getBuildFeedSuccessState(config.versions, now)
    } else {
      const { generatedAt, sources, versions } = validateBuildSourcesFeed(
        buildFeedResult.value.json
      )
      assertBuildFeedFreshness(generatedAt)
      if (!isTrustedFeedKey(buildFeedResult.value.keyId)) throw new Error('Feed signing key is no longer trusted')
      if (isBuildFeedRollback(config.buildFeedGeneratedAt, generatedAt)) {
        throw new Error('Signed build source feed is older than the cached feed')
      }
      newState = {
        ...getBuildFeedSuccessState(versions, now),
        buildFeedEtag: buildFeedResult.value.etag,
        buildFeedGeneratedAt: generatedAt,
        buildFeedKeyId: buildFeedResult.value.keyId,
        buildFeedSources: sources
      }
    }
    feedSucceeded = true
  } catch (error) {
    console.error(error)
    newState = getBuildFeedErrorState(config, error, now)
    transientFeedFailure = buildFeedResult.status === 'rejected' &&
      isTransientNetworkError(buildFeedResult.reason)
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
  if (feedSucceeded) await setRecoveryAlarm(false)
  else if (transientFeedFailure && !isRecoveryCheck) {
    await setRecoveryAlarm(true)
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
  runBackgroundTask('Alarm setup', ensureAlarm())
  runBackgroundTask('Update check', main(reason))
})

const updateBadge = async () => {
  const config = await getConfig()
  const { uaFullVersion } = await getUserAgentData()
  const { badge } = getUpdatePresentation({ ...config, currentVersion: uaFullVersion })

  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: badge.color }),
    chrome.action.setBadgeText({ text: badge.text }),
    chrome.action.setTitle({ title: badge.title })
  ])
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  const badgeTask = runBackgroundTask('Badge update', updateBadge())
  if (changes.extensionsTrack?.newValue === true && changes.extensionsTrack.oldValue !== true) {
    const check = currentUpdate
      ? currentUpdate.then(async () => {
          if ((await getConfig()).extensionsTrack) await main('tracking-enabled')
        })
      : main('tracking-enabled')
    runBackgroundTask('Extension tracking update', check)
  }
  return badgeTask
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME || alarm.name === RECOVERY_ALARM_NAME) {
    runBackgroundTask('Scheduled update check', main(alarm.name))
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

chrome.runtime.onStartup.addListener(() =>
  runBackgroundTask('Startup update check', main('startup'))
)

runBackgroundTask('Alarm setup', ensureAlarm())
