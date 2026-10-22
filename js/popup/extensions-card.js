import { html } from './html.js'
import { getHttpUrl } from '../urls.js'
import {
  getExtensionDownloadUrl, getExtensionCapabilities, getInstallTypeLabel,
  groupExtensionsByUpdateInfo, hasExtensionUpdate
} from '../extension-updates.js'

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
    <li class="extension-row">
      <div class="extension-row__content${extension.enabled ? '' : ' disabled'}">
        <input
          aria-label="${toggleTitle} ${extension.name}"
          checked="${extension.enabled}"
          disabled="${pending || !canToggle}"
          id="${extension.id}"
          onChange="${onToggleExtension}"
          class="extension-row__toggle"
          title="${toggleTitle}"
          type="checkbox"
        />
        ${extension.homepageUrl
          ? html`
              <a
                class="extension-row__name"
                href="${extension.homepageUrl}"
                rel="noopener noreferrer"
                target="_blank"
                title="${extension.name}"
              >
                ${extension.name}
              </a>
            `
          : html`<span class="extension-row__name" title="${extension.name}"
              >${extension.name}</span
            >`}
        <code class="extension-row__version">
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
      <div class="extension-row__actions">
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

export const ExtensionsInfo = ({
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
  const {
    infoById,
    supported,
    unsupported
  } = groupExtensionsByUpdateInfo(extensions, extensionsInfo)
  const pendingIds = new Set(pendingExtensionIds)
  const renderExtensionRow = extension => html`
    <${ExtensionRow}
      key="${extension.id}"
      currentVersion="${currentVersion}"
      extension="${extension}"
      info="${infoById.get(extension.id)}"
      onRemoveExtension="${onRemoveExtension}"
      onToggleExtension="${onToggleExtension}"
      pending="${pendingIds.has(extension.id)}"
    />
  `

  return html`
    <details
      open="${extensions.some(extension =>
        hasExtensionUpdate(
          extension,
          infoById.get(extension.id)
        )
      )}"
    >
      <summary>${extensions.length} Extensions</summary>
      <div class="details-content">
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
        ${supported.map(renderExtensionRow)}
      </ul>
      ${unsupported.length > 0 &&
        html`
          <p style="margin-bottom: 0;">No update info available:</p>
          <ul class="extensions">
            ${unsupported.map(renderExtensionRow)}
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
                <li key="${`${updateUrl}:${batch || 0}`}">
                  <code>${getHttpUrl(updateUrl)?.host || 'Invalid update server'}</code>${totalBatches > 1
                    ? ` (batch ${batch}/${totalBatches})`
                    : ''}: ${message}
                </li>
              `)}
            </ul>
          </div>
        `}
      </div>
    </details>
  `
}
