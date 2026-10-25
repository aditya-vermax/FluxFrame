# FluxFrame Privacy Policy

Last updated: October 25, 2026

FluxFrame detects downloadable media on the page the user is viewing. It does not operate an account service, analytics service, or developer-operated media server.

## Information processed

- While detection is active, FluxFrame observes eligible network request URLs and response headers on websites where Chrome grants it access. It uses this information to identify direct video files and HLS playlists. A content script also reads video and source element URLs on the page.
- Candidate media URLs and associated tab identifiers are held temporarily in the extension service worker's memory. They are not written to persistent extension storage or sent to FluxFrame. Candidates expire after 30 minutes when the service worker remains active, and Chrome may clear them sooner when it suspends the worker or the tab navigates/closes.
- If the user starts a download, Chrome and the media host receive the requests necessary to download the selected file. HLS playlist, segment, and key requests are made by the browser directly to the URLs declared by the playlist. These requests omit cookies and FluxFrame does not rewrite `Referer` or `Origin` headers. The destination media host may receive ordinary request metadata such as the requested URL and network address as part of serving the file.
- FluxFrame stores up to 30 records for downloads initiated by the extension. Each record contains a filename, status, byte count, and start/end time. It does not store the downloaded media URL in this history.
- The user's ignored-domain list is stored in Chrome's local extension storage.

## Storage and sharing

Download history and ignored domains remain on the user's device in `chrome.storage.local`. They are not transmitted to FluxFrame or another analytics provider. The user can clear the download list and edit the ignored-domain list from FluxFrame Settings. Clearing this list does not delete downloaded files.

## Permissions

- `webRequest` and all-site host access allow detection across arbitrary websites and media CDN hosts. This broad access is necessary for the extension's current cross-site detection design.
- `activeTab` supports reading the current tab's page details when the user opens the popup.
- `downloads` starts direct downloads and records their local status.
- `storage` saves ignored domains and the bounded download list locally.

## User choice and contact

Users can stop detection by disabling or removing the extension, restrict its site access in Chrome's extension controls, edit ignored domains in Settings, or clear the local download list there. For privacy questions, contact: **[Replace with publisher support email before publication]**.
