**Important Notice**

## Manifest V3 development notes

- The current source tree is the unreleased Manifest V3 version 3.0.0. The
  published CRX and `gupdate.xml` still refer to version 2.0.0 until the new
  package has been signed and tested as an update.
- Tracking updates from arbitrary extension update servers requires the broad
  HTTP/HTTPS host permissions declared in `manifest.json`. This is an intentional
  compatibility trade-off and should be reviewed before distribution.
- `gupdate.xml` still points to the last published v2 package. Update it only
  when the actual v3.0.0 CRX package is ready for release.
- The MV3 popup supports manual checks, separate Chromium/extension/error badge
  states, extension management, custom badge colors, and light, dark, or
  browser-default themes.

This project is going to be archived in March 2023. It's been a fun one and I'm happy to have given something back to the Chromium community. The project has been on cruise-control for quite some time anyway, mostly because I've stopped using it myself. To keep it working beyond the coming months it's going to need some updates which I simply lack the time (and motivation to make time) for. Parts of the functionality need to be re-written to work in a service worker context for manifest v3. The [privacy proxy](https://github.com/kkkrist/chromium-extension-service) needs updating to adapt to backend changes. On top of that, it's running at its capacity limits since months and I don't feel like paying for higher service tiers (it runs on Vercel/MongoDB Atlas). It doesn't help that some forks of the extension have their users hammer on the error logger either.

There's going to be one last update in the form of v2.0.0. It will have the option to use the privacy proxy removed, which I'm going to shut down (also includes the error logger). Apart from that, the functionality will be identical to the latest v1 (v1.8.9). So if you want to track updates for your installed extensions (which is optional), you're going to have to let it communicate with origin servers directly (i.e. Google, with all privacy implications).

v2.0.0 (or v1.8.9 with the privacy proxy disabled) should keep working for as long as the Woolyss API and the Chrome Web Store API do not introduce breaking changes and your preferred Chromium build supports installing manifest v2 extensions (in some way).

# Chromium Update Notifications

This extension periodically checks [Woolyss](https://chromium.woolyss.com/)
and displays a `New` badge when the selected platform/tag provides a
numerically newer Chromium version. It can also track updates for installed
extensions and provide basic extension management.

The previous screenshot has been removed from this development README because
it showed the historical v1 popup. A current screenshot should be captured
from the final signed v3 package before release.

## Installation

1. Review source code
2. Download [the .crx file from latest release](https://github.com/kkkrist/chromium-notifier/releases/latest/download/chromium-notifier.crx)
3. Navigate to `chrome://extensions`
4. Drag-and-drop the .crx file into the browser window

### Installing via "Load unpacked extension"

If it's not possible to enable or install the extension and a warning tells you "This extension is not listed in the Chrome Web Store and may have been added without your knowledge" or "crx required proof missing", try the following:

1. Download and unpack the source code from [the latest release](https://github.com/kkkrist/chromium-notifier/releases/latest) or git-clone the master branch of this repository into a local folder
2. Navigate to `chrome://extensions`
3. Enable developer mode
4. Click on "Load unpacked extension" and select folder

Please note that it's not possible to update via "Load unpacked extension". Every extension installed via this method will be installed as a separate and new extension, regardless of previously installed versions. If you've cloned the repository however, you can just git-pull the new release tag and click on the reload button in the extension's tile at `chrome://extensions` to update seamlessly.

~~I plan to list this extension in the Chrome Web Store soon to get around this issue~~ (see [#14](https://github.com/kkkrist/chromium-notifier/issues/14)).

## Configuration

Click the extension icon and select a platform (`mac`, `win64`, `linux`, etc.)
and a build tag. Extension update tracking is optional. The popup also offers:

- a `Check now` action;
- separate badge states for Chromium updates, extension updates, both, and
  errors;
- optional custom badge colors;
- light, dark, and browser-default popup themes;
- enable, disable, and remove actions where Chromium permits them.

## Development checks

```text
npm ci
npm run check
```

All runtime JavaScript is bundled locally. The npm dependencies are development
tools only and are not loaded by the extension.

~~You can also enable [error tracking](https://github.com/kkkrist/chromium-extension-service#error-tracking) to help improving this extension and increase your privacy by using a proxy to fetch extension updates. The latter will [strip all personal and adtech-related data](https://github.com/kkkrist/chromium-extension-service#version-info-for-installed-extensions) your browser might send if it requests the data directly (this was always enabled in versions prior to 1.7.0, now it's optional). I use a [public Vercel deployment](https://chrome-extension-service-kkkrist.vercel.app/_src) to host the proxy, so you can review all of the actual source code used to run it.~~ (Removed in v2.0.0, see comment on top!)

If your Chromium build contains [this patch](https://github.com/Eloston/ungoogled-chromium/blob/master/patches/extra/ungoogled-chromium/add-flag-to-configure-extension-downloading.patch), you may set the flag `chrome://flags/#extension-mime-request-handling` to "Always prompt for install" to enable 1-click installation of extension updates.
