import test from "node:test";
import assert from "node:assert/strict";
import { checkDrm, parsePlaylist } from "../src/hls-parser.mjs";

const base = "https://media.example.test/master.m3u8";

test("parses master variants, orders by bandwidth, and resolves relative URLs", () => {
  const playlist = parsePlaylist([
    "#EXTM3U",
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION="1280x720",AUDIO="main"',
    "720/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=350000,RESOLUTION="640x360",AUDIO="main"',
    "360/index.m3u8",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="main",NAME="English",DEFAULT=YES,URI="audio/en.m3u8"',
  ].join("\n"), base);

  assert.equal(playlist.type, "master");
  assert.equal(playlist.variants[0].resolution, "1280x720");
  assert.equal(playlist.variants[1].url, "https://media.example.test/360/index.m3u8");
  assert.equal(playlist.audioRenditions[0].url, "https://media.example.test/audio/en.m3u8");
});

test("parses media segments and applies implicit AES-128 key and sequence", () => {
  const playlist = parsePlaylist([
    "#EXTM3U",
    "#EXT-X-MEDIA-SEQUENCE:41",
    '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
    "#EXTINF:4.0,",
    "segments/one.ts",
    "#EXTINF:4.0,",
    "segments/two.ts",
    "#EXT-X-ENDLIST",
  ].join("\n"), base);

  assert.equal(playlist.type, "media");
  assert.equal(playlist.live, false);
  assert.equal(playlist.segments[0].sequence, 41);
  assert.equal(playlist.segments[1].sequence, 42);
  assert.equal(playlist.segments[0].key.uri, "https://media.example.test/keys/key.bin");
  assert.doesNotThrow(() => checkDrm(playlist));
});

test("rejects invalid playlist content", () => {
  assert.throws(() => parsePlaylist("not a playlist", base), /valid M3U8/);
});

test("rejects non-HTTP media references", () => {
  assert.throws(() => parsePlaylist([
    "#EXTM3U", "#EXTINF:4,", "file:///private/video.ts",
  ].join("\n"), base), /not HTTP or HTTPS/);
});

test("marks byte ranges and discontinuities as unsupported", () => {
  const playlist = parsePlaylist([
    "#EXTM3U", "#EXTINF:4,", "#EXT-X-BYTERANGE:1024@0", "chunk.ts",
    "#EXT-X-DISCONTINUITY", "#EXTINF:4,", "next.ts",
  ].join("\n"), base);
  assert.deepEqual(playlist.unsupportedFeatures, ["byte-range segments", "discontinuities"]);
});

test("refuses DRM encryption and session keys", () => {
  const protectedMedia = parsePlaylist([
    "#EXTM3U", '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"', "#EXTINF:4,", "segment.ts",
  ].join("\n"), base);
  assert.throws(() => checkDrm(protectedMedia), /DRM-protected/);

  const protectedMaster = parsePlaylist([
    "#EXTM3U", '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key.bin"',
    "#EXT-X-STREAM-INF:BANDWIDTH=500000", "video.m3u8",
  ].join("\n"), base);
  assert.throws(() => checkDrm(protectedMaster), /session encryption key/);
});
