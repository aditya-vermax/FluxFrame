# FluxFrame

FluxFrame is a Chrome extension that helps you find direct video files and supported HLS streams available on the page you are viewing. It lists detected media, starts direct downloads, and lets you choose a quality for supported HLS streams.

## Features

- Detects supported media from page elements and network response headers.
- Shows detected media with its source, format, and known file size.
- Downloads direct media through Chrome and offers quality selection for HLS master playlists.
- Provides local ignored-domain settings and a recent-download list.
- Uses a dark navy interface with violet accents.
- Refuses DRM-protected streams and unsupported HLS playlist features.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository folder.
5. Pin FluxFrame, open a page that contains supported media, and select the extension icon.

## Privacy and permissions

FluxFrame requests access to websites so it can detect media served by both the page and its CDN. Detection runs in the browser. Candidate media URLs are held temporarily in service-worker memory. Ignored domains and up to 30 recent download records are stored locally by Chrome. FluxFrame does not send browsing activity to a developer-operated server or analytics service.

See the [privacy policy](PRIVACY_POLICY.md) for details. The policy file is a draft and still needs a publisher contact before public release.

## HLS support and limitations

FluxFrame supports ordinary HLS media playlists, master-playlist quality selection, separate audio renditions, and identity AES-128 segment encryption. HLS downloads are assembled in memory and limited to 300 MB.

DRM, unsupported encryption, byte-range segments, discontinuities, I-frame-only playlists, DASH, and fragmented MP4 without its initialization segment are not supported. Live playlists download only the snapshot currently listed. Separate audio is saved as a separate file. HLS requests omit cookies and do not rewrite `Referer` or `Origin`, so some media servers may refuse them. Media exposed only through `blob:` or `data:` URLs cannot be downloaded directly.

FluxFrame does not bypass authentication, paywalls, DRM, or site access controls. Download only media you own or are authorized to save.

## Development

Requirements: Google Chrome and Node.js.

Run the HLS parser tests:

```sh
node --test tests/hls-parser.test.mjs
```

Build the extension icons and Chrome Web Store package from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-icons.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

The release script writes a versioned ZIP to `release/`; the ZIP has `manifest.json` at its root. Release ZIPs are generated artifacts and are excluded from source control.

## License

This project is licensed under the [MIT License](LICENSE). It allows reuse, modification, redistribution, and commercial use provided the copyright and license notice are retained. Contributions are also offered under these terms unless stated otherwise.
