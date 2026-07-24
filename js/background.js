import {
  getConfig,
  getExtensionsInfo,
  fetchText,
  fetchTextResponse,
  getUserAgentData,
} from './utils.js'
import {
  getBadgePresentation,
  getBadgeStatus,
  hasSnapshotRevisionUpdate,
  getBuildFeedErrorState,
  getBuildFeedSuccessState,
  isBuildFeedRollback,
  validateBuildSourcesFeed
} from './core.js'
import { verifySignedBuildFeed } from './feed-signature.js'

const ALARM_NAME = 'main'
const BUILD_FEED_URL =
  'https://bone06.ddns.net/chromium/versions.json'
const BUILD_FEED_SIGNATURE_URL = `${BUILD_FEED_URL}.sig`
let currentUpdate

const fetchBuildFeed = async config => {
  const headers = {}
  if (
    config.buildFeedEtag &&
    config.buildFeedGeneratedAt &&
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
      label: 'Chromium build source feed'
    }
  )
  if (response.notModified) {
    if (!config.versions || !Object.keys(config.versions).length) {
      throw new Error('Build source feed returned 304 without cached data')
    }
    return { notModified: true }
  }

  const signatureText = await fetchText(BUILD_FEED_SIGNATURE_URL, {}, {
    label: 'Chromium build source feed signature',
    maxResponseBytes: 4096
  })
  try {
    await verifySignedBuildFeed(response.text, signatureText)
    return {
      etag: response.etag,
      json: JSON.parse(response.text),
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

const update = async (...args) => {
  const config = await getConfig()
  const now = Date.now()

  console.debug(new Date(now).toISOString(), args)

  if (!navigator.onLine) {
    const error = new Error('Browser is offline')
    console.debug(`We're not online, aborting.`, config)
    await chrome.storage.local.set(getBuildFeedErrorState(config, error, now))
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

  try {
    if (buildFeedResult.status === 'rejected') {
      throw buildFeedResult.reason
    }
    if (buildFeedResult.value.notModified) {
      newState = getBuildFeedSuccessState(config.versions, now)
    } else {
      const { generatedAt, sources, versions } = validateBuildSourcesFeed(
        buildFeedResult.value.json
      )
      if (isBuildFeedRollback(config.buildFeedGeneratedAt, generatedAt)) {
        throw new Error('Signed build source feed is older than the cached feed')
      }
      newState = {
        ...getBuildFeedSuccessState(versions, now),
        buildFeedEtag: buildFeedResult.value.etag,
        buildFeedGeneratedAt: generatedAt,
        buildFeedSources: sources
      }
    }
  } catch (error) {
    console.error(error)
    newState = getBuildFeedErrorState(config, error, now)
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
    notifySnapshotRevisions,
    snapshotRevisionsSeen,
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
  const snapshotRevisionUpdate = hasSnapshotRevisionUpdate({
    current,
    notifySnapshotRevisions,
    snapshotRevisionsSeen
  })

  const { uaFullVersion } = await getUserAgentData()
  const badge = getBadgePresentation(
    getBadgeStatus({
      availableVersion: current?.version,
      currentVersion: uaFullVersion,
      extensions,
      extensionsInfo,
      extensionsTrack,
      snapshotRevisionUpdate,
      woolyssError
    }),
    {
      badgeColors,
      hasStaleBuildSource: current?.source?.stale === true,
      snapshotRevisionUpdate,
      useCustomColors,
      woolyssDataStale
    }
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
