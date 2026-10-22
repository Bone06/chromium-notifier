import { html } from './html.js'
import { DEFAULT_BADGE_COLORS } from '../badge.js'
import { getCompactBuildName, getPlatformDisplayName } from '../core.js'
import {
  changeAccent, changeBadgeColor, changeBoolSetting, changePlatform,
  changeTag, changeTheme
} from './settings-events.js'

export const Settings = ({
  accentPalette,
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
    <div class="details-content">
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
              <option
                key="${archOpt}"
                selected="${archOpt === arch}"
                value="${archOpt}"
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
                <option
                  key="${tagOpts.tag}"
                  selected="${tagOpts.tag === tag}"
                  value="${tagOpts.tag}"
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

      <label class="accent-setting">
        <p>Interface color</p>
        <select onChange="${changeAccent}">
          <option selected="${accentPalette !== 'teal'}" value="blue">Chromium blue</option>
          <option selected="${accentPalette === 'teal'}" value="teal">Teal</option>
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
              ['both', 'Chromium + extensions'],
              ['error', 'Errors']
            ].map(([name, label]) => html`
              <label key="${name}">
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
