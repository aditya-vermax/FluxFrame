function parseAttributes(value) {
  const attributes = {};
  const pattern = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match;
  while ((match = pattern.exec(value))) {
    attributes[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return attributes;
}

function resolveHttpUrl(value, baseUrl) {
  const resolved = new URL(value, baseUrl);
  if (!new Set(["http:", "https:"]).has(resolved.protocol)) {
    throw new Error("A playlist contains a media URL that is not HTTP or HTTPS.");
  }
  return resolved.href;
}

export function parsePlaylist(text, baseUrl) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || !lines[0].startsWith("#EXTM3U")) {
    throw new Error("The response is not a valid M3U8 playlist.");
  }

  const isMaster = lines.some((line) => line.startsWith("#EXT-X-STREAM-INF:"));
  if (isMaster) {
    const variants = [];
    const audioRenditions = [];
    let hasSessionKey = false;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line.startsWith("#EXT-X-MEDIA:")) {
        const attributes = parseAttributes(line.slice("#EXT-X-MEDIA:".length));
        if (attributes.TYPE === "AUDIO" && attributes.URI) {
          audioRenditions.push({
            groupId: attributes["GROUP-ID"] || "",
            name: attributes.NAME || "Audio",
            isDefault: attributes.DEFAULT === "YES",
            url: resolveHttpUrl(attributes.URI, baseUrl),
          });
        }
      } else if (line.startsWith("#EXT-X-SESSION-KEY:")) {
        hasSessionKey = true;
      } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const attributes = parseAttributes(line.slice("#EXT-X-STREAM-INF:".length));
        const variantLine = lines.slice(index + 1).find((candidate) => !candidate.startsWith("#"));
        if (variantLine) {
          variants.push({
            url: resolveHttpUrl(variantLine, baseUrl),
            bandwidth: Number.parseInt(attributes.BANDWIDTH || "0", 10) || 0,
            resolution: attributes.RESOLUTION || "",
            codecs: attributes.CODECS || "",
            audioGroup: attributes.AUDIO || "",
          });
        }
      }
    }
    variants.sort((a, b) => b.bandwidth - a.bandwidth);
    return { type: "master", variants, audioRenditions, hasSessionKey };
  }

  const segments = [];
  const unsupportedFeatures = new Set();
  let currentKey = null;
  let map = null;
  let mediaSequence = 0;
  let live = true;
  let expectingSegment = false;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = Number.parseInt(line.slice(line.indexOf(":") + 1), 10) || 0;
    } else if (line === "#EXT-X-ENDLIST") {
      live = false;
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const attributes = parseAttributes(line.slice("#EXT-X-MAP:".length));
      if (attributes.URI) map = { url: resolveHttpUrl(attributes.URI, baseUrl) };
    } else if (line.startsWith("#EXT-X-BYTERANGE:")) {
      unsupportedFeatures.add("byte-range segments");
    } else if (line.startsWith("#EXT-X-DISCONTINUITY")) {
      unsupportedFeatures.add("discontinuities");
    } else if (line.startsWith("#EXT-X-I-FRAMES-ONLY")) {
      unsupportedFeatures.add("I-frame-only playlists");
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const attributes = parseAttributes(line.slice("#EXT-X-KEY:".length));
      const method = attributes.METHOD || "NONE";
      currentKey = method === "NONE" ? null : {
        method,
        uri: attributes.URI ? resolveHttpUrl(attributes.URI, baseUrl) : "",
        iv: attributes.IV || "",
        keyFormat: attributes.KEYFORMAT || "identity",
      };
    } else if (line.startsWith("#EXTINF:")) {
      expectingSegment = true;
    } else if (expectingSegment && !line.startsWith("#")) {
      segments.push({
        url: resolveHttpUrl(line, baseUrl),
        key: currentKey,
        sequence: mediaSequence + segments.length,
      });
      expectingSegment = false;
    }
  }

  return { type: "media", segments, map, live, unsupportedFeatures: [...unsupportedFeatures] };
}

export function checkDrm(playlist) {
  if (playlist.hasSessionKey) {
    throw new Error("This playlist uses a session encryption key that is not supported.");
  }
  for (const segment of playlist.segments || []) {
    if (!segment.key) continue;
    const method = segment.key.method.toUpperCase();
    const keyFormat = (segment.key.keyFormat || "identity").toLowerCase();
    if (method !== "AES-128" || keyFormat !== "identity") {
      throw new Error(`This stream uses ${segment.key.method} encryption. DRM-protected content is not downloaded.`);
    }
    if (!segment.key.uri) throw new Error("The AES-128 playlist does not provide a valid key URL.");
    if (segment.key.iv) {
      const iv = segment.key.iv.replace(/^0x/i, "");
      if (!/^[0-9a-f]{1,32}$/i.test(iv)) throw new Error("The playlist contains an invalid AES-128 IV.");
    }
  }
}
