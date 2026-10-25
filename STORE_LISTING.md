# Chrome Web Store listing draft

## Name

FluxFrame

## Short description

Find supported media files and HLS streams on the current tab.

## Single purpose

FluxFrame identifies direct video files and supported HLS streams available on the current webpage and lets the user download them.

## Full description

FluxFrame helps you find media files available on the page you are viewing. It shows the source and known file details, starts direct downloads, and lets you choose a quality for supported HLS streams.

Use FluxFrame only for content you own or are authorized to download. DRM-protected streams and access-control bypass are not supported. Some HLS formats and servers are not compatible; see the known limitations before use.

Detection stays in your browser. The extension does not send browsing activity to a FluxFrame server. Recent download names/statuses and ignored domains are stored locally and can be cleared in Settings. HLS requests go directly to the media host and omit cookies. FluxFrame requests access to all websites because media and stream playlists can be served by a page's separate CDN.

## Before publishing, fill in

- Publisher support email: **[required]**
- Public HTTPS privacy policy URL pointing to `PRIVACY_POLICY.md`: **[required]**
- Store screenshots of the actual installed popup, HLS quality picker, settings, and error/empty state: **[required]**
- Confirm the product name and logo do not conflict with existing marks: **[publisher review required]**
- Complete Dashboard privacy declarations and the permission justification using the exact current manifest and behavior.

## Permission justifications

- `webRequest`: identify video and HLS responses from network response headers.
- All-site host access: allow detection on arbitrary user-selected websites and their media/CDN origins; results are used only for the extension's media-detection purpose.
- `activeTab`: read the active tab URL/title after the user opens the extension popup.
- `downloads`: initiate user-requested downloads and track their local status for the extension's recent-download list.
- `storage`: store the user's ignored-domain preferences and up to 30 local download records.

No remote code is used. The extension does not run analytics or use a remote backend.
