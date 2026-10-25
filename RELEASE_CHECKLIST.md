# Release checklist

## Implemented in this release candidate

- [x] Dark-first FluxFrame popup with detected media, empty/error/status states, and refresh.
- [x] English-only UI.
- [x] Local ignored-domain settings and a bounded list of extension-started downloads.
- [x] Remove Referer/Origin rewriting and its declarativeNetRequest permission.
- [x] Validate media URL schemes and runtime message shapes; expire stale candidates and cap per-tab results.
- [x] Reject HLS byte ranges, discontinuities, I-frame-only playlists, unsupported encryption, and fragmented MP4 without initialization data.
- [x] Unit tests for HLS parsing and encryption boundaries.
- [x] Release ZIP build script with the manifest at archive root.

## Required before Chrome Web Store submission

- [ ] Replace the support email placeholder and publish the privacy policy at a public HTTPS URL.
- [ ] Confirm FluxFrame name/logo availability and publisher identity.
- [ ] Capture authentic screenshots from the installed release candidate; do not use concept renders as product screenshots.
- [ ] Complete accurate dashboard data-use disclosures and permission justifications.
- [ ] Load the exact ZIP into a clean Chrome profile and manually test fresh install, tab access, direct download, HLS quality choice, settings, history, and removal.
- [ ] Verify media sites with 403/expired URLs, malformed playlists, DRM, byte ranges, discontinuities, separate audio, live snapshots, and the 300 MB assembly limit.
- [ ] Verify storage survives service-worker suspension and that no unrelated Chrome downloads enter FluxFrame history.
- [ ] Check keyboard navigation, visible focus, screen-reader announcements, reduced motion, English.
- [ ] Inspect extension service-worker and page consoles for errors.
- [ ] Review current Chrome Web Store policies and submit only after the packaged build passes the matrix.

## Acceptance matrix

| Scenario | Expected result |
| --- | --- |
| No supported media | Helpful empty state; refresh works |
| Direct MP4/WebM | One result with host/format; download starts |
| Repeated identical request | One result, metadata merges |
| Several media items | All candidates shown up to the per-tab cap |
| HLS master playlist | Qualities sorted by bandwidth and labeled from playlist metadata |
| Separate audio rendition | Audio saved separately and disclosed |
| Expired URL / 403 | Actionable error; no repeated 4xx retry loop |
| Malformed playlist | Error, never a success message |
| DRM / unsupported HLS feature | Clear refusal |
| Page navigation / close | Tab candidates and badge are cleared |
| Ignore a domain | Its existing and future candidates are hidden |
| Clear recent list | Extension history clears; downloaded files remain |
| Service-worker suspension | No crash; ephemeral candidates may be redetected |
| Privacy inspection | No analytics calls; local records contain no media URLs |
