# Chromium Update Notifications

Chromium Update Notifications is a Manifest V3 extension for independently
distributed Chromium builds without a built-in updater. It reads a normalized,
cryptographically signed multi-source feed and displays a badge when a newer
version—or optionally a newer snapshot revision—is available.

It can also check installed extensions for updates and provide basic extension
management where Chromium permits it.

## Current development status

- The source tree is the unreleased Manifest V3 version 3.0.0.
- Build data comes from the separate Chromium Build Sources aggregator, not
  directly from Woolyss or individual build repositories.
- Feed bytes are verified with an embedded ECDSA P-256 public key before JSON
  parsing and strict schema validation.
- The development endpoint is currently a loopback server. Permanent HTTPS
  hosting and the final release package are not configured yet.
- The published CRX and `gupdate.xml` still refer to 2.0.0. Update them only
  after the 3.0.0 package has been signed and tested as an upgrade.

## Features

- signed Chromium build metadata and HTTPS download links;
- Windows x64/ARM64, macOS Intel/Apple Silicon and Linux x64 builds;
- optional snapshot revision notifications;
- manual update checks and distinct Chromium/extension/error badge states;
- optional installed-extension update tracking;
- enable, disable and remove extension actions where allowed;
- custom badge colors;
- light, dark and browser-default popup themes;
- cached data and per-source stale/error reporting.

Tracking arbitrary extension update servers requires the broad HTTP/HTTPS host
permissions declared in `manifest.json`. This is an intentional compatibility
trade-off and must be reviewed before distribution.

## Installation

The links below still point to the last published release until 3.0.0 is ready.

1. Review the source code.
2. Download the [.crx file from the latest release](https://github.com/kkkrist/chromium-notifier/releases/latest/download/chromium-notifier.crx).
3. Navigate to `chrome://extensions`.
4. Drag and drop the CRX file into the browser window.

### Load unpacked

If Chromium blocks external CRX installation, clone or unpack the repository,
open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and
select the project directory.

An unpacked installation does not follow the normal CRX update path. After a
Git update, use the extension tile's reload action.

Some Chromium builds require
`chrome://flags/#extension-mime-request-handling` to be set to **Always prompt
for install** for one-click external extension installation.

## Configuration

Open the popup and select a platform and build. Settings also include extension
update tracking, snapshot revision notifications, theme mode and custom badge
colors. `Check now` performs an immediate refresh.

## Development

```text
npm ci
npm run check
```

Runtime JavaScript and third-party UI libraries are bundled locally. npm
dependencies are development tools and are not loaded by the extension.

A current screenshot should be captured from the final signed 3.0.0 package
before release.

## Historical upstream notice

The following notice and legacy notes are retained from the original project
for attribution and historical context. The maintained fork has since completed
the Manifest V3 and build-source migration described above.

This project is going to be archived in March 2023. It's been a fun one and I'm happy to have given something back to the Chromium community. The project has been on cruise-control for quite some time anyway, mostly because I've stopped using it myself. To keep it working beyond the coming months it's going to need some updates which I simply lack the time (and motivation to make time) for. Parts of the functionality need to be re-written to work in a service worker context for manifest v3. The [privacy proxy](https://github.com/kkkrist/chromium-extension-service) needs updating to adapt to backend changes. On top of that, it's running at its capacity limits since months and I don't feel like paying for higher service tiers (it runs on Vercel/MongoDB Atlas). It doesn't help that some forks of the extension have their users hammer on the error logger either.

There's going to be one last update in the form of v2.0.0. It will have the option to use the privacy proxy removed, which I'm going to shut down (also includes the error logger). Apart from that, the functionality will be identical to the latest v1 (v1.8.9). So if you want to track updates for your installed extensions (which is optional), you're going to have to let it communicate with origin servers directly (i.e. Google, with all privacy implications).

v2.0.0 (or v1.8.9 with the privacy proxy disabled) should keep working for as long as the Woolyss API and the Chrome Web Store API do not introduce breaking changes and your preferred Chromium build supports installing manifest v2 extensions (in some way).

~~I plan to list this extension in the Chrome Web Store soon to get around this issue~~ (see [#14](https://github.com/kkkrist/chromium-notifier/issues/14)).

~~You can also enable [error tracking](https://github.com/kkkrist/chromium-extension-service#error-tracking) to help improving this extension and increase your privacy by using a proxy to fetch extension updates. The latter will [strip all personal and adtech-related data](https://github.com/kkkrist/chromium-extension-service#version-info-for-installed-extensions) your browser might send if it requests the data directly (this was always enabled in versions prior to 1.7.0, now it's optional). I use a [public Vercel deployment](https://chrome-extension-service-kkkrist.vercel.app/_src) to host the proxy, so you can review all of the actual source code used to run it.~~ (Removed in v2.0.0, see comment on top!)
