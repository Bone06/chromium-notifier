import { Component, render } from './vendor/preact-11.0.2.mjs'
import { getConfig, getInstalledExtensions } from './utils.js'
import { getUpdatePresentation } from './presentation.js'
import { html } from './popup/html.js'
import { ChromiumInfo } from './popup/chromium-card.js'
import { ExtensionsInfo } from './popup/extensions-card.js'
import { Header, Section } from './popup/layout.js'
import { Settings } from './popup/settings-card.js'

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
    snapshotNotice: null,
    versions: {}
  }

  onCheckNow = () => {
    this.setState({ checking: true })
    chrome.runtime.sendMessage({ type: 'check-now' }, async response => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError)
      }

      const config = await getConfig()
      const updateAvailable =
        response?.ok &&
        getUpdatePresentation(config).versionStatus === 'update-available'

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
      ),
      () => this.refreshSnapshotNotice(this.state)
    )
  }

  refreshSnapshotNotice = config => {
    if (!this.mounted) return
    const { current, snapshotRevisionPending: pending, snapshotNotice } = getUpdatePresentation(config, {
      snapshotNotice: this.state.snapshotNotice
    })
    if (this.state.snapshotNotice?.id !== snapshotNotice?.id ||
        this.state.snapshotNotice?.revision !== snapshotNotice?.revision) {
      this.setState({ snapshotNotice })
    }
    if (pending && this.acknowledgedSnapshot !== `${current.id}:${current.revision}`) {
      this.acknowledgedSnapshot = `${current.id}:${current.revision}`
      chrome.storage.local.set({
        snapshotRevisionsSeen: { ...config.snapshotRevisionsSeen, [current.id]: current.revision }
      }).catch(error => console.error(error))
    }
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
      this.setState(config, () => this.refreshSnapshotNotice(this.state))
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
      buildFeedKeyId,
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
      accentPalette,
      useCustomColors,
      versions,
      woolyssDataStale,
      woolyssError
    }
  ) {
    const { current, selectionStatus, snapshotRevisionUpdate, versionStatus } = getUpdatePresentation(
      this.state, { snapshotNotice: this.state.snapshotNotice }
    )

    return html`
      <main class="popup">
      <${Section} className="header-card">
        <${Header} version="${self && self.version}"/>
      <//>

      <${Section}>
        <${ChromiumInfo}
          buildFeedKeyId="${buildFeedKeyId}"
          checking="${checking}"
          chromiumOpenRequest="${chromiumOpenRequest}"
          current="${current}"
          currentVersion="${currentVersion}"
          lastAttemptAt="${lastAttemptAt}"
          lastErrorAt="${lastErrorAt}"
          lastSuccessAt="${lastSuccessAt}"
          onCheckNow="${this.onCheckNow}"
          selectionStatus="${selectionStatus}"
          snapshotRevisionUpdate="${snapshotRevisionUpdate}"
          versionStatus="${versionStatus}"
          woolyssDataStale="${woolyssDataStale}"
          woolyssError="${woolyssError}"
        />
      <//>
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
          accentPalette="${accentPalette}"
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

      </main>
    `
  }
}

render(
  html`
    <${App} />
  `,
  document.getElementById('app')
)
