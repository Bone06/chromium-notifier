import { Component, h, render } from './vendor/preact-10.29.8.js'
import htm from './vendor/htm-3.1.1.js'
import {
  getConfig,
  getExtensionsInfo,
  getInstalledExtensions,
  getUserAgentData
} from './utils.js'
import {
  DEFAULT_BADGE_COLORS,
  getBuildSelectionStatus,
  getCompactBuildName,
  getChromiumVersionStatus,
  getDefaultBadgeColors,
  getExtensionDownloadUrl,
  getExtensionCapabilities,
  getInstallTypeLabel,
  getPlatformDisplayName,
  hasExtensionUpdate,
  matchExtension
} from './core.js'

const html = htm.bind(h)
const BUILD_SOURCES_PROJECT_URL =
  'https://github.com/OWNER/chromium-build-sources'

/*
 * Event handlers
 */

const changeBoolSetting = ({ target: { checked, name } }) => {
  if (name === 'useCustomColors') {
    chrome.storage.local.set(
      checked
        ? { badgeColors: getDefaultBadgeColors(), useCustomColors: true }
        : { badgeColors: null, useCustomColors: false }
    )
    return
  }

  if (name === 'notifySnapshotRevisions' && checked) {
    chrome.storage.local.get(
      ['arch', 'snapshotRevisionsSeen', 'tag', 'versions'],
      ({ arch, snapshotRevisionsSeen = {}, tag, versions = {} }) => {
        const current = versions[arch]?.find(build => build.tag === tag)
        chrome.storage.local.set({
          notifySnapshotRevisions: true,
          snapshotRevisionsSeen: current?.channel === 'snapshot'
            ? { ...snapshotRevisionsSeen, [current.id]: current.revision }
            : snapshotRevisionsSeen
        })
      }
    )
    return
  }

  const newState = {
    [name]: checked
  }

  if (name === 'extensionsTrack' && checked) {
    getUserAgentData()
      .then(({ uaFullVersion }) => getExtensionsInfo(uaFullVersion))
      .then(extensionsResult => {
        Object.assign(newState, extensionsResult)
      })
      .finally(() => {
        chrome.storage.local.set(newState)
      })
  } else {
    chrome.storage.local.set(newState)
  }
}

const changePlatform = e =>
  chrome.storage.local.set({
    arch: e.target.value,
    tag: null
  })

const changeTag = e => {
  const tag = e.target.value
  chrome.storage.local.get(
    ['arch', 'notifySnapshotRevisions', 'snapshotRevisionsSeen', 'versions'],
    ({ arch, notifySnapshotRevisions, snapshotRevisionsSeen = {}, versions = {} }) => {
      const current = versions[arch]?.find(build => build.tag === tag)
      chrome.storage.local.set({
        snapshotRevisionsSeen: notifySnapshotRevisions &&
          current?.channel === 'snapshot'
          ? { ...snapshotRevisionsSeen, [current.id]: current.revision }
          : snapshotRevisionsSeen,
        tag
      })
    }
  )
}

const changeTheme = e =>
  chrome.storage.local.set({ themeMode: e.target.value })

/*
 * Components
 */

const ChromiumInfo = ({
  checking,
  chromiumOpenRequest,
  current = {},
  currentVersion,
  lastSuccessAt,
  notifySnapshotRevisions,
  onCheckNow,
  woolyssDataStale,
  woolyssError
}) => {
  const versionStatus = getChromiumVersionStatus(
    currentVersion,
    current.version
  )
  const checkForUpdates = event => {
    event.preventDefault()
    event.stopPropagation()
    onCheckNow()
  }

  return html`
  <details
    key="${chromiumOpenRequest}"
    open="${versionStatus === 'update-available'}"
  >
    <summary>
      <span>Chromium </span>
      <code>${currentVersion ? `v${currentVersion}` : 'version unavailable'}</code>
      <button
        aria-busy="${checking}"
        aria-live="polite"
        class="check-now"
        disabled="${checking}"
        onClick="${checkForUpdates}"
        type="button"
      >${checking ? 'Checking…' : 'Check for Updates'}</button>
    </summary>
    <ul>
      <li>
        <span class="muted-label">Available: </span>
        <code class="${versionStatus === 'update-available' && 'badge'}"
          >v${current.version}</code
        >
      </li>
      <li>
        <span class="muted-label">Revision: </span><span
          class="${notifySnapshotRevisions && 'badge'}"
          >${current.revision}</span
        >${' '}(${new Date(current.timestamp * 1000).toLocaleString()})
      </li>
      ${current.links &&
        html`
          <li>
            <span class="muted-label">Downloads: </span>
            ${current.links.map(
              ({ label, url }, i) => html`
                <a href="${url}" rel="noopener noreferrer" target="_blank"
                  >${label}</a
                >
                ${i + 1 < current.links.length && ', '}
              `
            )}
          </li>
        `}
    </ul>
    <div style="font-size: smaller; margin-top: 1em">
      ${woolyssDataStale &&
        html`
          <p aria-live="polite" class="setting-warning">
            Latest check failed. Showing data from
            ${lastSuccessAt
              ? new Date(lastSuccessAt).toLocaleString()
              : 'the last successful check'}.
            ${woolyssError}
          </p>
        `}
      ${current.source?.stale &&
        html`
          <p aria-live="polite" class="setting-warning">
            This build source could not be refreshed. Showing cached source
            data from ${new Date(current.source.lastSuccessAt).toLocaleString()}.
            ${current.source.error}
          </p>
        `}
      ${versionStatus === 'local-newer' &&
        html`
          <p style="margin: 0 0 0.5rem; white-space: normal;">
            The installed Chromium version is newer than this build.
          </p>
        `}
      ${versionStatus === 'unknown' &&
        html`
          <p aria-live="polite" class="compact-message error-text">
            Chromium versions could not be compared.
          </p>
        `}
      <span>Tracking </span>
      <a
        href="${current.releaseUrl}"
        rel="noopener noreferrer"
        target="_blank"
        >${current.source.name}</a
      >
    </div>
  </details>
`
}

const changeBadgeColor = ({ target: { name, value } }) =>
  chrome.storage.local.get('badgeColors', ({ badgeColors = {} }) =>
    chrome.storage.local.set({
      badgeColors: { ...badgeColors, [name]: value }
    })
  )

const ExtensionRow = ({
  currentVersion,
  extension,
  info,
  onRemoveExtension,
  onToggleExtension,
  pending
}) => {
  const { canRemove, canToggle } = getExtensionCapabilities(extension)
  const downloadUrl = info
    ? getExtensionDownloadUrl(info, currentVersion)
    : null
  const installTypeLabel = getInstallTypeLabel(extension.installType)
  const toggleTitle = !canToggle
    ? extension.enabled
      ? 'This extension cannot be disabled'
      : 'This extension cannot be enabled'
    : extension.enabled
    ? 'Disable'
    : 'Enable'

  return html`
    <li>
      <div class="${extension.enabled ? '' : ' disabled'}">
        <input
          aria-label="${toggleTitle} ${extension.name}"
          checked="${extension.enabled}"
          disabled="${pending || !canToggle}"
          id="${extension.id}"
          onChange="${onToggleExtension}"
          style="margin-right: 0.75em"
          title="${toggleTitle}"
          type="checkbox"
        />
        ${extension.homepageUrl
          ? html`
              <a
                href="${extension.homepageUrl}"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span>${extension.name} </span>
              </a>
            `
          : `${extension.name} `}
        <code>
          <span>v${extension.version} </span>
          ${hasExtensionUpdate(extension, info) &&
            downloadUrl &&
            html`
              <a
                class="badge"
                href="${downloadUrl}"
                rel="noopener noreferrer"
                target="_blank"
              >v${info.version}</a>
            `}
        </code>
        ${installTypeLabel &&
          html`<span class="install-type">${installTypeLabel}</span>`}
      </div>
      <div>
        <button
          aria-label="${canRemove
            ? `Remove ${extension.name}`
            : `${extension.name} cannot be removed`}"
          class="remove"
          disabled="${pending || !canRemove}"
          id="${extension.id}"
          onClick="${onRemoveExtension}"
          title="${canRemove
            ? 'Remove extension'
            : 'This extension cannot be removed'}"
          type="button"
        >🗑</button>
      </div>
    </li>
  `
}

const ExtensionsInfo = ({
  currentVersion,
  extensions = [],
  extensionsErrors = [],
  extensionsGeneralError,
  extensionsInfo = [],
  extensionsUpdateSummary = {},
  managementError,
  onRemoveExtension,
  onToggleExtension,
  pendingExtensionIds = []
}) => {
  const supported = extensions
    .filter(ext => extensionsInfo.find(matchExtension(ext)))
    .sort((a, b) => a.name.localeCompare(b.name))

  const unsupported = extensions
    .filter(ext => !supported.find(({ id }) => id === ext.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return html`
    <details
      open="${extensions.some(extension =>
        hasExtensionUpdate(
          extension,
          extensionsInfo.find(({ id }) => id === extension.id)
        )
      )}"
    >
      <summary>${extensions.length} Extensions</summary>
      ${managementError &&
        html`
          <p aria-live="polite" class="management-error">
            ${managementError}
          </p>
        `}
      ${extensionsGeneralError &&
        html`
          <p aria-live="polite" class="management-error">
            Extension update check failed: ${extensionsGeneralError}
          </p>
        `}
      <ul class="extensions">
        ${supported.map(ext => {
          const info = extensionsInfo.find(matchExtension(ext))
          return html`
            <${ExtensionRow}
              currentVersion="${currentVersion}"
              extension="${ext}"
              info="${info}"
              onRemoveExtension="${onRemoveExtension}"
              onToggleExtension="${onToggleExtension}"
              pending="${pendingExtensionIds.includes(ext.id)}"
            />
          `
        })}
      </ul>
      ${unsupported.length > 0 &&
        html`
          <p style="margin-bottom: 0;">No update info available:</p>
          <ul class="extensions">
            ${unsupported.map(ext => {
              const info = extensionsInfo.find(({ id }) => id === ext.id)
              return html`
                <${ExtensionRow}
                  currentVersion="${currentVersion}"
                  extension="${ext}"
                  info="${info}"
                  onRemoveExtension="${onRemoveExtension}"
                  onToggleExtension="${onToggleExtension}"
                  pending="${pendingExtensionIds.includes(ext.id)}"
                />
              `
            })}
          </ul>
        `}
      ${extensionsErrors.length > 0 &&
        html`
          <div style="display: block; margin-top: 0.75rem; white-space: normal;">
            <small aria-live="polite" class="error-text">
              Update information partially or fully unavailable from
              ${extensionsUpdateSummary.failed || extensionsErrors.length} of
              ${extensionsUpdateSummary.total || extensionsErrors.length}
              servers.
            </small>
            <ul>
              ${extensionsErrors.map(({
                batch,
                message,
                totalBatches,
                updateUrl
              }) => html`
                <li>
                  <code>${new URL(updateUrl).host}</code>${totalBatches > 1
                    ? ` (batch ${batch}/${totalBatches})`
                    : ''}: ${message}
                </li>
              `)}
            </ul>
          </div>
        `}
    </details>
  `
}

const Header = ({ version }) => html`
  <div>
    <div>
      <p class="header-title">
        <strong>Chromium Update Notifications </strong>
        <code class="muted-label">${version && `v${version}`}</code>
      </p>
      <div class="supplemental-info">
        <span>Powered by </span>
        <a
          href="${BUILD_SOURCES_PROJECT_URL}"
          rel="noopener noreferrer"
          target="_blank"
        >Chromium Build Sources</a>
      </div>
    </div>
    <div class="header-cell">
      <a
        aria-label="Open the project on GitHub"
        href="https://github.com/kkkrist/chromium-notifier"
        rel="noopener noreferrer"
        target="_blank"
      >
        <img alt="" src="../img/github.svg" style="height: 1rem; width: auto;" />
      </a>
    </div>
  </div>
`

class Section extends Component {
  state = { errorMsg: null }

  componentDidCatch (error) {
    this.setState({ errorMsg: error.message })
  }

  render ({ children }, { errorMsg }) {
    return html`
      <section>
        ${errorMsg
          ? html`
              <small aria-live="polite" class="error-text">${errorMsg}</small>
            `
          : children}
      </section>
    `
  }
}

const Settings = ({
  arch,
  badgeColors = {},
  current,
  extensionsTrack,
  notifySnapshotRevisions,
  selectionStatus,
  tag,
  themeMode = 'browser',
  useCustomColors,
  versions
}) => html`
  <details open="${selectionStatus !== 'valid'}">
    <summary>Settings</summary>
    <div>
      ${selectionStatus === 'platform-unavailable' &&
        html`
          <p class="setting-warning">
            The selected platform is no longer available. Please choose
            another platform.
          </p>
        `}
      ${selectionStatus === 'tag-unavailable' &&
        html`
          <p class="setting-warning">
            The selected Chromium build is no longer available. Please choose
            another tag.
          </p>
        `}
      <label>
        <p>Platform</p>
        <select
          disabled="${!Object.keys(versions).length}"
          onChange="${changePlatform}"
        >
          <option disabled="${arch && versions[arch]}" value=""
            >Choose platform…</option
          >
          ${selectionStatus === 'platform-unavailable' &&
            html`
              <option disabled selected value="${arch}"
                >${getPlatformDisplayName(arch)} (unavailable)</option
              >
            `}
          ${Object.keys(versions).map(
            archOpt => html`
              <option selected="${archOpt === arch}" value="${archOpt}"
                >${getPlatformDisplayName(archOpt)}</option
              >
            `
          )}
        </select>
      </label>
      <label>
        <p>Tag</p>
        <select disabled="${!arch || !versions[arch]}" onChange="${changeTag}">
          <option disabled="${tag}" value="">Choose tag…</option>
          ${selectionStatus === 'tag-unavailable' &&
            html`
              <option disabled selected value="${tag}"
                >${tag} (unavailable)</option
              >
            `}
          ${arch &&
            versions[arch] &&
            versions[arch].map(
              tagOpts => html`
                <option selected="${tagOpts.tag === tag}" value="${tagOpts.tag}"
                  >${getCompactBuildName(tagOpts.displayName || tagOpts.tag)}</option
                >
              `
            )}
        </select>
        ${current &&
          html`
            <small class="selected-build-details">
              ${current.displayName || current.tag}
            </small>
          `}
      </label>

      <p style="margin: 1rem 0;">
        <label>
          <input
            checked="${notifySnapshotRevisions}"
            name="notifySnapshotRevisions"
            onChange="${changeBoolSetting}"
            style="margin: 0.25rem 0.25rem 0 0"
            type="checkbox"
          />
          Notify about new snapshot revisions
        </label>
      </p>

      <p style="margin: 1rem 0;">
        <label>
          <input
            checked="${extensionsTrack}"
            name="extensionsTrack"
            onChange="${changeBoolSetting}"
            style="margin: 0.25rem 0.25rem 0 0"
            type="checkbox"
          />
          Track extension updates
        </label>
      </p>

      <label class="theme-setting">
        <p>Theme</p>
        <select onChange="${changeTheme}">
          <option selected="${themeMode === 'browser'}" value="browser"
            >Browser default</option
          >
          <option selected="${themeMode === 'light'}" value="light"
            >Light</option
          >
          <option selected="${themeMode === 'dark'}" value="dark"
            >Dark</option
          >
        </select>
      </label>

      <p style="margin: 0;">
        <label>
          <input
            checked="${useCustomColors}"
            name="useCustomColors"
            onChange="${changeBoolSetting}"
            style="margin: 0 0.25rem 0 0"
            type="checkbox"
          />
          Use custom badge colors
        </label>
      </p>

      ${useCustomColors &&
        html`
          <div class="badge-colors">
            ${[
              ['chromium', 'Chromium updates'],
              ['extensions', 'Extension updates'],
              ['both', 'Multiple updates'],
              ['error', 'Errors']
            ].map(([name, label]) => html`
              <label>
                <input
                  name="${name}"
                  onChange="${changeBadgeColor}"
                  type="color"
                  value="${badgeColors?.[name] || DEFAULT_BADGE_COLORS[name]}"
                />
                ${label}
              </label>
            `)}
          </div>
        `}

    </div>
  </details>
`

/*
 * Main app
 */

class App extends Component {
  mounted = false

  state = {
    checking: false,
    chromiumOpenRequest: 0,
    badgeColors: {},
    extensions: [],
    extensionsErrors: [],
    extensionsGeneralError: null,
    extensionsInfo: [],
    extensionsUpdateSummary: {},
    managementError: null,
    pendingExtensionIds: [],
    self: {},
    versions: {}
  }

  onCheckNow = () => {
    this.setState({ checking: true })
    chrome.runtime.sendMessage({ type: 'check-now' }, async response => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError)
      }

      const config = await getConfig()
      const current = config.versions?.[config.arch]?.find(
        build => build.tag === config.tag
      )
      const updateAvailable =
        response?.ok &&
        getChromiumVersionStatus(
          config.currentVersion,
          current?.version
        ) === 'update-available'

      if (this.mounted) {
        this.setState(({ chromiumOpenRequest }) => ({
          checking: false,
          chromiumOpenRequest: updateAvailable
            ? chromiumOpenRequest + 1
            : chromiumOpenRequest
        }))
      }
    })
  }

  refreshExtensions = async () => {
    this.setState({ extensions: await getInstalledExtensions() })
  }

  onManagementChange = () => {
    this.refreshExtensions().catch(error => console.error(error))
  }

  setExtensionPending = (id, pending) => {
    this.setState(({ pendingExtensionIds }) => ({
      pendingExtensionIds: pending
        ? [...new Set([...pendingExtensionIds, id])]
        : pendingExtensionIds.filter(pendingId => pendingId !== id)
    }))
  }

  runManagementAction = async (id, action, operation) => {
    const extension = this.state.extensions.find(item => item.id === id)
    this.setExtensionPending(id, true)
    this.setState({ managementError: null })

    try {
      await operation()
      await this.refreshExtensions()
    } catch (error) {
      this.setState({
        managementError: `Could not ${action} “${extension?.name || id}”: ${
          error?.message || String(error)
        }`
      })
    } finally {
      this.setExtensionPending(id, false)
    }
  }

  onToggleExtension = ({ target: { checked, id } }) => {
    this.runManagementAction(
      id,
      checked ? 'enable' : 'disable',
      () => chrome.management.setEnabled(id, checked)
    )
  }

  onRemoveExtension = ({ currentTarget: { id } }) => {
    this.runManagementAction(
      id,
      'remove',
      () => chrome.management.uninstall(id, { showConfirmDialog: true })
    )
  }

  onStorageChanges = (changes, areaName) => {
    if (areaName !== 'local') {
      return
    }

    this.setState(
      Object.keys(changes).reduce(
        (acc, key) => ({ ...acc, [key]: changes[key].newValue }),
        {}
      )
    )
  }

  async componentDidMount () {
    this.mounted = true
    chrome.storage.onChanged.addListener(this.onStorageChanges)
    chrome.management.onDisabled.addListener(this.onManagementChange)
    chrome.management.onEnabled.addListener(this.onManagementChange)
    chrome.management.onInstalled.addListener(this.onManagementChange)
    chrome.management.onUninstalled.addListener(this.onManagementChange)

    const config = await getConfig()
    if (this.mounted) {
      this.setState(config)
    }
    const current = config.versions?.[config.arch]?.find(
      build => build.tag === config.tag
    )
    if (
      config.notifySnapshotRevisions &&
      current?.channel === 'snapshot' &&
      current.revision !== config.snapshotRevisionsSeen?.[current.id]
    ) {
      await chrome.storage.local.set({
        snapshotRevisionsSeen: {
          ...config.snapshotRevisionsSeen,
          [current.id]: current.revision
        }
      })
    }
  }

  componentWillUnmount () {
    this.mounted = false
    chrome.storage.onChanged.removeListener(this.onStorageChanges)
    chrome.management.onDisabled.removeListener(this.onManagementChange)
    chrome.management.onEnabled.removeListener(this.onManagementChange)
    chrome.management.onInstalled.removeListener(this.onManagementChange)
    chrome.management.onUninstalled.removeListener(this.onManagementChange)
  }

  render (
    _props,
    {
      arch,
      badgeColors,
      checking,
      chromiumOpenRequest,
      currentVersion,
      extensions,
      extensionsErrors,
      extensionsGeneralError,
      extensionsInfo,
      extensionsTrack,
      extensionsUpdateSummary,
      lastAttemptAt,
      lastErrorAt,
      lastSuccessAt,
      managementError,
      notifySnapshotRevisions,
      pendingExtensionIds,
      self,
      tag,
      themeMode,
      useCustomColors,
      versions,
      woolyssDataStale,
      woolyssError
    }
  ) {
    const current =
      arch && versions[arch] && versions[arch].find(v => v.tag === tag)
    const selectionStatus = getBuildSelectionStatus({ arch, tag, versions })

    return html`
      <${Section}>
        <${Header} version="${self && self.version}"/>
      <//>

      ${arch &&
        tag &&
        current &&
        html`
          <${Section}>
            <${ChromiumInfo}
              checking="${checking}"
              chromiumOpenRequest="${chromiumOpenRequest}"
              current="${current}"
              currentVersion="${currentVersion}"
              lastSuccessAt="${lastSuccessAt}"
              notifySnapshotRevisions="${notifySnapshotRevisions}"
              onCheckNow="${this.onCheckNow}"
              woolyssDataStale="${woolyssDataStale}"
              woolyssError="${woolyssError}"
            />
          <//>
        `}
      ${extensionsTrack &&
        html`
          <${Section}>
            <${ExtensionsInfo}
              currentVersion="${currentVersion}"
              extensions="${extensions}"
              extensionsErrors="${extensionsErrors}"
              extensionsGeneralError="${extensionsGeneralError}"
              extensionsInfo="${extensionsInfo}"
              extensionsUpdateSummary="${extensionsUpdateSummary}"
              managementError="${managementError}"
              onRemoveExtension="${this.onRemoveExtension}"
              onToggleExtension="${this.onToggleExtension}"
              pendingExtensionIds="${pendingExtensionIds}"
            />
          <//>
        `}

      <${Section}>
        <${Settings}
          arch="${arch}"
          badgeColors="${badgeColors}"
          current="${current}"
          extensionsTrack="${extensionsTrack}"
          notifySnapshotRevisions="${notifySnapshotRevisions}"
          selectionStatus="${selectionStatus}"
          tag="${tag}"
          themeMode="${themeMode}"
          useCustomColors="${useCustomColors}"
          versions="${versions}"
        />
      <//>

      <${Section}>
        ${current?.source?.stale &&
          html`
            <small aria-live="polite" class="setting-warning">
              The selected build source could not be refreshed and is using
              cached data.
            </small>
          `}
        <small class="supplemental-info">
          ${lastAttemptAt
            ? `Last check attempt: ${new Date(lastAttemptAt).toLocaleString()}`
            : `Waiting for data…`}
        </small>
        ${lastSuccessAt &&
          html`
            <small class="supplemental-info">
              Last successful check: ${new Date(lastSuccessAt).toLocaleString()}
            </small>
          `}
        ${woolyssError &&
          html`
            <small aria-live="polite" class="error-text last-error">
              Last error${lastErrorAt
                ? ` (${new Date(lastErrorAt).toLocaleString()})`
                : ''}: ${woolyssError}
            </small>
          `}
      <//>
    `
  }
}

render(
  html`
    <${App} />
  `,
  document.getElementById('app')
)
