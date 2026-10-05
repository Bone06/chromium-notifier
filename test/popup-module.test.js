import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('popup module resolves all local imports', async () => {
  await assert.rejects(
    import('../js/popup.js'),
    error => {
      assert.equal(error.name, 'ReferenceError')
      assert.match(error.message, /document is not defined/)
      return true
    }
  )
})

test('popup pins the verified stable Preact 11 release', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const notices = await readFile(
    new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url),
    'utf8'
  )
  const vendor = await readFile(
    new URL('../js/vendor/preact-11.0.0.mjs', import.meta.url)
  )

  assert.match(source, /vendor\/preact-11\.0\.0\.mjs/)
  assert.match(notices, /Preact 11\.0\.0/)
  assert.equal(
    createHash('sha256').update(vendor).digest('hex'),
    '7f8e0de60ede059be0e5ac12c79734a90840fb8a17b8b3282724433b6c4d8c61'
  )
})

test('popup gives stable keys to dynamic Preact lists', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')

  assert.match(source, /<\$\{ExtensionRow\}\s+key="\$\{extension\.id\}"/)
  assert.match(source, /key="\$\{archOpt\}"/)
  assert.match(source, /key="\$\{tagOpts\.tag\}"/)
  assert.match(source, /<label key="\$\{name\}">/)
})

test('popup separates the Chromium title from the installed version', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /<span>Chromium<\/span>/)
  assert.match(source, /class="chromium-status__installed"/)
  assert.match(source, /<span>Installed: <\/span>\s*<code[\s\S]*?>/)
  assert.match(source, /chromium-status__installed-version--update/)
})

test('popup presents stable release metadata without a beta label', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /beta-label|Experimental UI build/)
  assert.doesNotMatch(styles, /\.beta-label/)
  assert.match(
    source,
    /class="popup-header__credit"[\s\S]*?class="popup-header__meta"/
  )
})

test('popup keeps the update check in the Chromium summary', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  const summary = source.match(
    /<summary class="chromium-status__summary">[\s\S]*?<span>Chromium[\s\S]*?<\/summary>/
  )?.[0]
  assert.match(summary, /aria-label="\$\{checking \? 'Checking for updates' : 'Check for updates'\}"/)
  assert.match(summary, />\$\{checking \? 'Checking…' : 'Check now'\}<\/button>/)
  assert.match(summary, /class="check-now"/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /event\.stopPropagation\(\)/)
  assert.match(styles, /\.chromium-status__summary-content\s*\{[\s\S]*?display: inline-flex;/)
  assert.match(styles, /button\.check-now[\s\S]*?margin: 0 0 0 auto;/)
  assert.match(styles, /button\.check-now[\s\S]*?font-size: 0\.75rem;/)
  assert.match(styles, /button\.check-now[\s\S]*?min-width: 0;/)
  assert.match(
    styles,
    /\.chromium-status__installed code\.chromium-status__installed-version--update\s*\{\s*color: var\(--error\);/
  )
})

test('popup keeps check history visible outside the collapsible details', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(
    source,
    /<\/details>[\s\S]*?<div class="chromium-status__history">/
  )
})

test('manual update checks open Chromium details when an update is available', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /response\?\.ok &&\s*getChromiumVersionStatus\(/)
  assert.match(source, /chromiumOpenRequest \+ 1/)
  assert.match(source, /key="\$\{chromiumOpenRequest\}"/)
})

test('popup keeps spacing between the revision and its timestamp', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(
    source,
    /\$\{' '\}\(\$\{new Date\(/
  )
  assert.doesNotMatch(source, /notifySnapshotRevisions && 'badge'/)
})

test('popup identifies custom colors as badge colors', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(source, /Use custom badge colors/)
  assert.match(source, /\['both', 'Chromium \+ extensions'\]/)
  assert.doesNotMatch(source, /Multiple updates/)
  assert.match(styles, /\.badge-colors input\[type=color\][\s\S]*?border-radius: 50%;/)
  assert.match(styles, /\.badge-colors input\[type=color\][\s\S]*?box-shadow: 0 0 0 1px var\(--border\);/)
  assert.match(styles, /::-webkit-color-swatch[\s\S]*?border-radius: 50%;/)
})

test('popup visibly identifies a new snapshot revision until it closes', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(source, /hasSnapshotRevisionUpdate\(\{/)
  assert.match(source, /snapshotRevisionUpdate:[\s\S]*?snapshotRevisionUpdate/)
  assert.match(source, /class="revision-update-label">New<\/span>/)
  assert.match(styles, /\.revision-update-label\s*\{[\s\S]*?background: var\(--action-background\);/)
})

test('popup consistently indents card details from their summaries', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(source, /class="chromium-status__tracking"/)
  assert.match(styles, /\.chromium-status__installed\s*\{[\s\S]*?font-size: 13px;/)
  assert.equal(source.match(/class="details-content"/g)?.length, 3)
  assert.match(styles, /\.details-content\s*\{[\s\S]*?margin-left: 0\.75rem;/)
  assert.match(styles, /\.chromium-status__tracking\s*\{[\s\S]*?margin: 1em 0 0;/)
})

test('popup vertically centers custom disclosure markers', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(styles, /details > summary\s*\{[\s\S]*?list-style: none;/)
  assert.match(styles, /details > summary::before\s*\{[\s\S]*?top: 0\.725em;/)
  assert.match(styles, /details\[open\] > summary::before\s*\{[\s\S]*?rotate\(90deg\)/)
  assert.doesNotMatch(styles, /summary::marker/)
})

test('popup only disables selection for controls and visual labels', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(
    styles,
    /button,\s*input,\s*select,\s*img,\s*\.install-type\s*\{\s*user-select: none;/
  )
  assert.doesNotMatch(styles, /(?:body|section|summary|a)\s*\{[^}]*user-select: none;/)
})

test('popup dropdowns use the shared UI typography and surfaces', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(styles, /label > select\s*\{[\s\S]*?border-radius: 10px;/)
  assert.match(styles, /label > select\s*\{[\s\S]*?color: var\(--strong-text\);/)
  assert.match(styles, /label > select\s*\{[\s\S]*?font-family: inherit;/)
  assert.match(styles, /label > select\s*\{[\s\S]*?font-size: 13px;/)
})

test('popup truncates long extension names without overflowing their row', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(source, /class="extension-row__name"/)
  assert.match(source, /title="\$\{extension\.name\}"/)
  assert.match(styles, /\.extension-row__name\s*\{[\s\S]*?text-overflow: ellipsis;/)
  assert.match(styles, /\.extension-row__content\s*\{[\s\S]*?min-width: 0;/)
})

test('popup extensions follow the card text hierarchy', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')
  assert.match(styles, /\.extensions li \.extension-row__name\s*\{[\s\S]*?color: var\(--strong-text\);/)
  assert.match(styles, /\.extensions li \.extension-row__version\s*\{\s*color: var\(--muted-text\);/)
  assert.match(styles, /\.extensions li button\.remove\s*\{[\s\S]*?background: transparent;/)
})

test('popup credits the build data project and labels the tracked build', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /<span>Powered by <\/span>/)
  assert.match(source, />Chromatic Feed<\/a>/)
  assert.match(source, /<span>Tracking <\/span>/)
  assert.match(
    source,
    /https:\/\/github\.com\/Bone06\/chromatic-feed/
  )
})

test('popup only warns when the selected build source is stale', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /current\.source\?\.stale/)
  assert.match(source, /The selected build source could not be refreshed/)
  assert.doesNotMatch(source, /buildFeedSources\.some/)
})

test('popup keeps planned key-rotation notice outside the collapsible status', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /getFeedKeyRotationNotice\(buildFeedKeyId\)/)
  assert.match(source, /<\/details>\s*\$\{feedKeyRotationNotice && html`/)
  assert.match(source, /class="feed-key-notice"/)
})

test('popup keeps Chromium status and manual checks visible without feed data', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /Chromium update information is not available yet\./)
  assert.match(source, /Choose a Chromium build in Settings to track updates\./)
  assert.match(source, /const hasCurrent = Boolean\(current\.version\)/)
  assert.doesNotMatch(source, /\$\{arch &&\s*tag &&\s*current &&/)
})

test('popup wraps error messages inside their cards', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(
    styles,
    /\.error-text\s*\{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/
  )
  assert.match(
    styles,
    /\.setting-warning\s*\{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/
  )
  assert.match(
    styles,
    /\.management-error\s*\{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/
  )
})

test('popup guards asynchronous initialization and local storage changes', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  assert.match(source, /if \(areaName !== 'local'\)/)
  assert.match(source, /if \(this\.mounted\) \{\s*this\.setState\(\{\s*\.\.\.config,/)
  assert.match(source, /componentWillUnmount \(\) \{\s*this\.mounted = false/)
})

test('popup provides accessible controls, live status and external links', async () => {
  const source = await readFile(new URL('../js/popup.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8')

  assert.match(source, /aria-label="\$\{toggleTitle\} \$\{extension\.name\}"/)
  assert.match(source, /aria-label="Open the project on GitHub"/)
  assert.match(source, /aria-live="polite"/)
  assert.equal(
    source.match(/target="_blank"/g)?.length,
    source.match(/rel="noopener noreferrer"/g)?.length
  )
  assert.match(styles, /summary:focus-visible/)
})
