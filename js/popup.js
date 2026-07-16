import { Component, h, render } from './vendor/preact-10.29.7.js'
import htm from './vendor/htm-3.1.1.js'
import {
  getConfig,
  getExtensionsInfo,
  getUserAgentData
} from './utils.js'
import {
  DEFAULT_BADGE_COLORS,
  getBuildSelectionStatus,
  getChromiumVersionStatus,
  getDefaultBadgeColors,
  getExtensionDownloadUrl,
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

const removeExt = e => chrome.management.uninstall(e.currentTarget.id)

/*
 * Components
 */

const ChromiumInfo = ({
  arch,
  checking,
  current = {},
  currentVersion,
  onCheckNow,
  tag
}) => {
  const versionStatus = getChromiumVersionStatus(
    currentVersion,
    current.version
  )

  return html`
  <details open="${versionStatus === 'update-available'}">
    <summary>Chromium <code>v${currentVersion}</code></summary>
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
      ${versionStatus === 'local-newer' &&
        html`
          <p style="margin: 0 0 0.5rem; white-space: normal;">
            The installed Chromium version is newer than this build.
          </p>
        `}
      ${versionStatus === 'unknown' &&
        html`
          <p style="color: #b00020; margin: 0 0 0.5rem; white-space: normal;">
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

const ExtensionsInfo = ({
  currentVersion,
  extensions = [],
  extensionsErrors = [],
  extensionsInfo = [],
  extensionsUpdateSummary = {},
  onDisableExtension
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
      <ul class="extensions">
        ${supported.map(ext => {
          const info = extensionsInfo.find(matchExtension(ext))
          return html`
            <li>
              <div class="${ext.enabled ? '' : ' disabled'}">
                <input
                  checked="${ext.enabled}"
                  id="${ext.id}"
                  onChange="${onDisableExtension}"
                  style="margin-right: 0.75em"
                  title="${ext.enabled ? 'Disable' : 'Enable'}"
                  type="checkbox"
                />
                ${ext.homepageUrl
                  ? html`
                      <a href="${ext.homepageUrl}" target="_blank"
                        ><span>${ext.name} </span>
                      </a>
                    `
                  : `${ext.name} `}
                <code
                  ><span>v${ext.version} </span> ${hasExtensionUpdate(ext, info) &&
                    info.codebase &&
                    html`
                      <a
                        class="badge"
                        href="${getExtensionDownloadUrl(info, currentVersion)}"
                        target="_blank"
                        >v${info.version}</a
                      >
                    `}</code
                >
              </div>
              <div>
                <button class="remove" id="${ext.id}" onClick="${removeExt}">
                  🗑
                </button>
              </div>
            </li>
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
                <li>
                  <div class="${ext.enabled ? '' : ' disabled'}">
                    <input
                      checked="${ext.enabled}"
                      id="${ext.id}"
                      onChange="${onDisableExtension}"
                      style="margin-right: 0.75em"
                      title="${ext.enabled ? 'Disable' : 'Enable'}"
                      type="checkbox"
                    />
                    ${ext.homepageUrl
                      ? html`
                          <a href="${ext.homepageUrl}" target="_blank"
                            ><span>${ext.name} </span>
                          </a>
                        `
                      : `${ext.name} `}
                    <code>v${ext.version}</code>
                  </div>
                  <div>
                    <button
                      class="remove"
                      id="${ext.id}"
                      onClick="${removeExt}"
                    >
                      🗑
                    </button>
                  </div>
                </li>
              `
            })}
          </ul>
        `}
      ${extensionsErrors.length > 0 &&
        html`
          <div style="display: block; margin-top: 0.75rem; white-space: normal;">
            <small style="color: #b00020;">
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
      <p style="color: #202124; margin: 0">
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
              <small style="color: red">${errorMsg}</small>
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

      <p style="margin: 0;">
        <label>
          <input
            checked="${useCustomColors}"
            name="useCustomColors"
            onChange="${changeBoolSetting}"
            style="margin: 0 0.25rem 0 0"
            type="checkbox"
          />
          Use custom colors
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
    extensionsInfo: [],
    extensionsUpdateSummary: {},
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

  onDisableExtension = ({ target: { checked, id } }) => {
    chrome.management.setEnabled(id, checked)

    const newState = [...this.state.extensions]
    const i = newState.findIndex(e => e.id === id)
    newState[i].enabled = checked
    this.setState({ extensions: newState })
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
  }

  componentWillUnmount () {
    chrome.storage.onChanged.removeListener(this.onStorageChanges)
  }

  render (
    props,
    {
      arch,
      badgeColors,
      checking,
      currentVersion,
      error,
      extensions,
      extensionsErrors,
      extensionsInfo,
      extensionsTrack,
      extensionsUpdateSummary,
      self,
      tag,
      timestamp,
      useCustomColors,
      versions
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
              onCheckNow="${this.onCheckNow}"
              tag="${tag}"
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
              extensionsInfo="${extensionsInfo}"
              extensionsUpdateSummary="${extensionsUpdateSummary}"
              onDisableExtension="${this.onDisableExtension}"
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
          useCustomColors="${useCustomColors}"
          versions="${versions}"
        />
      <//>

      <${Section}>
        <small>
          ${timestamp
            ? `Last update: ${new Date(timestamp).toLocaleString()}`
            : `Waiting for data…`}
        </small>
        ${error &&
          html`
            <small style="color: red; margin-top: 0.5rem;">
              Last error: ${error}
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
