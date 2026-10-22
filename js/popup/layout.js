import { Component } from '../vendor/preact-11.0.1.mjs'
import { html } from './html.js'

const CHROMATIC_FEED_PROJECT_URL = 'https://github.com/Bone06/chromatic-feed'

export const Header = ({ version }) => html`
  <div class="popup-header">
    <img class="popup-header__icon" alt="" src="../img/icon_48.png" />
    <div class="popup-header__content">
      <h1 class="popup-header__title">
        Chromium Update Notifications
      </h1>
      <div class="popup-header__credit">
        <span>Powered by </span>
        <a
          href="${CHROMATIC_FEED_PROJECT_URL}"
          rel="noopener noreferrer"
          target="_blank"
        >Chromatic Feed</a>
      </div>
      <div class="popup-header__meta">
        <code>${version && `v${version}`}</code>
      </div>
    </div>
    <div class="header-cell">
      <a
        aria-label="Open the project on GitHub"
        href="https://github.com/Bone06/chromium-notifier"
        rel="noopener noreferrer"
        target="_blank"
      >
        <img alt="" src="../img/github.svg" style="height: 1rem; width: auto;" />
      </a>
    </div>
  </div>
`

export class Section extends Component {
  state = { errorMsg: null }

  componentDidCatch (error) {
    this.setState({ errorMsg: error.message })
  }

  render ({ children, className = '' }, { errorMsg }) {
    return html`
      <section class="card ${className}">
        ${errorMsg
          ? html`
              <small aria-live="polite" class="error-text">${errorMsg}</small>
            `
          : children}
      </section>
    `
  }
}
