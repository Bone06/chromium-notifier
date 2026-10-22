import { html } from './html.js'
import { getFeedKeyRotationNotice } from '../feed-signature.js'

export const ChromiumInfo = ({
  buildFeedKeyId,
  checking,
  chromiumOpenRequest,
  current = {},
  currentVersion,
  lastAttemptAt,
  lastErrorAt,
  lastSuccessAt,
  onCheckNow,
  selectionStatus,
  snapshotRevisionUpdate,
  versionStatus,
  woolyssDataStale,
  woolyssError
}) => {
  const hasCurrent = Boolean(current.version)
  const unavailableMessage = {
    'platform-required': 'Choose a platform in Settings to track Chromium updates.',
    'platform-unavailable': 'Choose an available platform in Settings.',
    'tag-required': 'Choose a Chromium build in Settings to track updates.',
    'tag-unavailable': 'Choose an available Chromium build in Settings.'
  }[selectionStatus] || 'Chromium update information is not available yet.'
  const feedKeyRotationNotice = getFeedKeyRotationNotice(buildFeedKeyId)
  const checkForUpdates = event => {
    event.preventDefault()
    event.stopPropagation()
    onCheckNow()
  }

  return html`
  <div class="chromium-status">
  <details
    key="${chromiumOpenRequest}"
    open="${!hasCurrent || versionStatus === 'update-available'}"
  >
    <summary class="chromium-status__summary">
      <span class="chromium-status__summary-content">
        <span>Chromium</span>
      </span>
      <span class="chromium-status__installed">
        <span>
          <span>Installed: </span>
          <code
            class="${versionStatus === 'update-available'
              ? 'chromium-status__installed-version--update'
              : ''}"
          >${currentVersion ? `v${currentVersion}` : 'version unavailable'}</code>
        </span>
      </span>
    </summary>
    <div class="details-content">
    ${hasCurrent
      ? html`
    <ul>
      <li>
        <span class="muted-label">Available: </span>
        <code class="${versionStatus === 'update-available' && 'badge'}"
          >v${current.version}</code
        >
      </li>
      <li>
        <span class="muted-label">Revision: </span><span
          >${current.revision}</span
        >${snapshotRevisionUpdate &&
          html`<span class="revision-update-label">New</span>`}${' '}(${new Date(
          current.timestamp * 1000
        ).toLocaleString()})
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
    <div class="chromium-status__tracking">
      ${woolyssDataStale &&
        html`
          <p aria-live="polite" class="setting-warning">
            Latest check failed. Showing data from
            ${lastSuccessAt
              ? new Date(lastSuccessAt).toLocaleString()
              : 'the last successful check'}.
          </p>
        `}
      ${current.source?.stale &&
        html`
          <p aria-live="polite" class="setting-warning">
            The selected build source could not be refreshed. Showing cached source
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
      `
      : html`
        <p aria-live="polite" class="compact-message">
          ${unavailableMessage}
        </p>
      `}
    </div>
  </details>
  <button
    aria-busy="${checking}"
    aria-label="${checking ? 'Checking… for updates' : 'Check now for updates'}"
    aria-live="polite"
    class="check-now"
    disabled="${checking}"
    onClick="${checkForUpdates}"
    title="Check for updates"
    type="button"
  >${checking ? 'Checking…' : 'Check now'}</button>
  ${feedKeyRotationNotice && html`
    <p class="feed-key-notice">${feedKeyRotationNotice}</p>
  `}
  <div class="chromium-status__history">
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
          <small aria-live="polite" class="error-text">
            Last error${lastErrorAt
              ? ` (${new Date(lastErrorAt).toLocaleString()})`
              : ''}: ${woolyssError}
          </small>
        `}
  </div>
  </div>
`
}
