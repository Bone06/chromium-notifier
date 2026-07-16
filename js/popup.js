import { Component, h, render } from './vendor/preact-10.29.7.js'
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
  getChromiumVersionStatus,
  getDefaultBadgeColors,
  getExtensionDownloadUrl,
  getExtensionCapabilities,
  getInstallTypeLabel,
  hasExtensionUpdate,
  matchExtension
} from './core.js'

const html = htm.bind(h)

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

const changeTag = e => chrome.storage.local.set({ tag: e.target.value })

const changeTheme = e =>
  chrome.storage.local.set({ themeMode: e.target.value })

/*
 * Components
 */

const ChromiumInfo = ({
  arch,
  checking,
  current = {},
  currentVersion,
  lastSuccessAt,
  onCheckNow,
  tag,
  woolyssDataStale,
  woolyssError
}) => {
  const versionStatus = getChromiumVersionStatus(
    currentVersion,
    current.version
  )

  return html`
  <details open="${versionStatus === 'update-available'}">
    <summary>
      <span>Chromium </span>
      <code>${currentVersion ? `v${currentVersion}` : 'version unavailable'}</code>
    </summary>
    <ul>
      <li>
        <span>Available: </span>
        <code class="${versionStatus === 'update-available' && 'badge'}"
          >v${current.version}</code
        >
        <button
          class="check-now"
          disabled="${checking}"
          onClick="${onCheckNow}"
          type="button"
        >${checking ? 'Checking…' : 'Check now'}</button>
      </li>
      <li>
        <span>Revision: ${current.revision} </span>
        (${new Date(current.timestamp * 1000).toLocaleString()})
      </li>
      ${current.links &&
        html`
          <li>
            <span>Downloads: </span>
            ${current.links.map(
              ({ label, url }, i) => html`
                <a href="${url}" target="_blank">${label}</a>
                ${i + 1 < current.links.length && ', '}
              `
            )}
          </li>
        `}
    </ul>
    <div style="font-size: smaller; margin-top: 1em">
      ${woolyssDataStale &&
        html`
          <p class="setting-warning">
            Latest check failed. Showing data from
            ${lastSuccessAt
              ? new Date(lastSuccessAt).toLocaleString()
              : 'the last successful check'}.
            ${woolyssError}
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
          <p class="compact-message error-text">
            Chromium versions could not be compared.
          </p>
        `}
      <span>Tracking </span>
      <a href="https://chromium.woolyss.com/#${arch}-${tag}" target="_blank"
        >${arch}-${tag}</a
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
              <a href="${extension.homepageUrl}" target="_blank">
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
                target="_blank"
              >v${info.version}</a>
            `}
        </code>
        ${installTypeLabel &&
          html`<span class="install-type">${installTypeLabel}</span>`}
      </div>
      <div>
        <button
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
          <p class="management-error">
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
            <small class="error-text">
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
        <code>${version && `v${version}`}</code>
      </p>
      <span>based on </span>
      <a href="https://chromium.woolyss.com/" target="_blank">Woolyss</a>
    </div>
    <div class="header-cell">
      <a href="https://github.com/kkkrist/chromium-notifier" target="_blank">
        <img src="../img/github.svg" style="height: 1rem; width: auto;" />
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
              <small class="error-text">${errorMsg}</small>
            `
          : children}
      </section>
    `
  }
}

const Settings = ({
  arch,
  badgeColors = {},
  extensionsTrack,
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
                >${arch} (unavailable)</option
              >
            `}
          ${Object.keys(versions).map(
            archOpt => html`
              <option selected="${archOpt === arch}" value="${archOpt}"
                >${archOpt}</option
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
                  >${tagOpts.tag}</option
                >
              `
            )}
        </select>
      </label>

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
  state = {
    checking: false,
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
    chrome.runtime.sendMessage({ type: 'check-now' }, () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError)
      }
      this.setState({ checking: false })
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

  onStorageChanges = changes => {
    this.setState(
      Object.keys(changes).reduce(
        (acc, key) => ({ ...acc, [key]: changes[key].newValue }),
        {}
      )
    )
  }

  async componentDidMount () {
    const config = await getConfig()
    this.setState(config)
    chrome.storage.onChanged.addListener(this.onStorageChanges)
    chrome.management.onDisabled.addListener(this.onManagementChange)
    chrome.management.onEnabled.addListener(this.onManagementChange)
    chrome.management.onInstalled.addListener(this.onManagementChange)
    chrome.management.onUninstalled.addListener(this.onManagementChange)
  }

  componentWillUnmount () {
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
      <${Section}><${Header} version="${self && self.version}"/><//>

      ${arch &&
        tag &&
        current &&
        html`
          <${Section}>
            <${ChromiumInfo}
              arch="${arch}"
              checking="${checking}"
              current="${current}"
              currentVersion="${currentVersion}"
              lastSuccessAt="${lastSuccessAt}"
              onCheckNow="${this.onCheckNow}"
              tag="${tag}"
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
          extensionsTrack="${extensionsTrack}"
          selectionStatus="${selectionStatus}"
          tag="${tag}"
          themeMode="${themeMode}"
          useCustomColors="${useCustomColors}"
          versions="${versions}"
        />
      <//>

      <${Section}>
        <small>
          ${lastAttemptAt
            ? `Last check attempt: ${new Date(lastAttemptAt).toLocaleString()}`
            : `Waiting for data…`}
        </small>
        ${lastSuccessAt &&
          html`
            <small>
              Last successful check: ${new Date(lastSuccessAt).toLocaleString()}
            </small>
          `}
        ${woolyssError &&
          html`
            <small class="error-text last-error">
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
