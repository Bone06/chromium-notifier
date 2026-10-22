import assert from 'node:assert/strict'
import test from 'node:test'
import { getUpdatePresentation } from '../js/presentation.js'

const makeConfig = () => ({
  arch: 'win64', tag: 'snapshot', currentVersion: '150.0.0.0',
  notifySnapshotRevisions: true, snapshotRevisionsSeen: { snapshot: '100' },
  versions: { win64: [{
    id: 'snapshot', tag: 'snapshot', channel: 'snapshot', revision: '101',
    version: '150.0.0.0', source: { stale: false }
  }] }
})

test('shared presentation derives version, selection and snapshot state without mutating storage', () => {
  const config = makeConfig()
  const before = structuredClone(config)
  const state = getUpdatePresentation(config)
  assert.equal(state.current, config.versions.win64[0])
  assert.equal(state.selectionStatus, 'valid')
  assert.equal(state.versionStatus, 'current')
  assert.equal(state.snapshotRevisionPending, true)
  assert.equal(state.badgeStatus, 'chromium')
  assert.match(state.badge.title, /snapshot revision/)
  assert.deepEqual(config, before)
})

test('snapshot acknowledgment clears the badge but retains only the current popup notice', () => {
  const config = makeConfig()
  const { snapshotNotice } = getUpdatePresentation(config)
  config.snapshotRevisionsSeen.snapshot = '101'
  assert.equal(getUpdatePresentation(config).snapshotRevisionUpdate, false)
  const popup = getUpdatePresentation(config, { snapshotNotice })
  assert.equal(popup.snapshotRevisionPending, false)
  assert.equal(popup.snapshotRevisionUpdate, true)
  config.notifySnapshotRevisions = false
  assert.equal(getUpdatePresentation(config, { snapshotNotice }).snapshotNotice, null)
  config.notifySnapshotRevisions = true
  config.versions.win64[0].id = 'different-snapshot'
  assert.equal(getUpdatePresentation(config, { snapshotNotice }).snapshotNotice, null)
})

test('shared presentation keeps update priority and limits source warnings to the selected build', () => {
  const config = makeConfig()
  Object.assign(config, {
    extensionsTrack: true,
    extensions: [{ id: 'a', version: '1.0' }],
    extensionsInfo: [{ id: 'a', version: '2.0' }],
    woolyssError: 'Failed to fetch', woolyssDataStale: true,
    buildFeedSources: [{ stale: true }]
  })
  const state = getUpdatePresentation(config)
  assert.equal(state.badgeStatus, 'both')
  assert.equal(state.hasStaleBuildSource, false)
  assert.match(state.badge.title, /using cached data/)
  assert.doesNotMatch(state.badge.title, /selected build source/)
  config.versions.win64[0].source.stale = true
  assert.match(getUpdatePresentation(config).badge.title, /selected build source/)
})

test('missing selection and empty cache produce safe derived state', () => {
  assert.equal(getUpdatePresentation().selectionStatus, 'platform-required')
  const state = getUpdatePresentation({ ...makeConfig(), tag: 'removed' })
  assert.equal(state.selectionStatus, 'tag-unavailable')
  assert.equal(state.current, undefined)
  assert.equal(state.versionStatus, 'unknown')
  assert.equal(state.snapshotRevisionUpdate, false)
  assert.equal(state.badgeStatus, 'none')
})
