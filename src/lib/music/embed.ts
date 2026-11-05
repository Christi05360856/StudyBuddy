// PATH: src/lib/music/embed.ts
/**
 * Safely turn a pasted Audiomack / Spotify / YouTube link into an embed URL.
 * We never put a raw user URL straight into an iframe.
 */

export type EmbedProvider = "audiomack" | "spotify" | "youtube" | null

export type ParsedEmbed = {
  provider: EmbedProvider
  embedUrl: string
  openUrl: string
  label: string
}

function clean(url: string): string {
  return url.trim().replace(/^<|>$/g, "")
}

/** Returns null if the link is not a supported music link. */
export function parseMusicLink(raw: string): ParsedEmbed | null {
  const input = clean(raw)
  if (!input) return null

  let url: URL
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase()

  // ----- Audiomack -----
  // https://audiomack.com/artist/song/title
  // https://audiomack.com/playlist/user/name
  // https://audiomack.com/album/artist/name
  if (host === "audiomack.com" || host.endsWith(".audiomack.com")) {
    const path = url.pathname.replace(/\/+$/, "")
    if (!path || path === "/") return null
    const embedUrl = `https://audiomack.com/embed${path}?background=1&color=3b5bdb`
    return {
      provider: "audiomack",
      embedUrl,
      openUrl: `https://audiomack.com${path}`,
      label: "Audiomack",
    }
  }

  // ----- Spotify -----
  // open.spotify.com/playlist/ID
  // open.spotify.com/track/ID
  // open.spotify.com/album/ID
  // open.spotify.com/artist/ID
  // open.spotify.com/episode/ID
  if (host === "open.spotify.com" || host === "spotify.com") {
    const parts = url.pathname.split("/").filter(Boolean)
    // skip optional locale prefix like /intl-en/
    const filtered = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts
    if (filtered.length < 2) return null
    const type = filtered[0]
    const id = filtered[1]?.split("?")[0]
    if (!id) return null
    const allowed = ["playlist", "track", "album", "artist", "episode", "show"]
    if (!allowed.includes(type)) return null
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`,
      openUrl: `https://open.spotify.com/${type}/${id}`,
      label: "Spotify",
    }
  }

  // ----- YouTube / YouTube Music -----
  // youtube.com/watch?v=ID
  // youtu.be/ID
  // youtube.com/playlist?list=ID
  // music.youtube.com/...
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be" ||
    host === "music.youtube.com"
  ) {
    let videoId: string | null = null
    let listId: string | null = null

    if (host === "youtu.be") {
      videoId = url.pathname.slice(1).split("/")[0] || null
    } else {
      videoId = url.searchParams.get("v")
      listId = url.searchParams.get("list")
      // /playlist?list= or /embed/ID
      if (!videoId && url.pathname.includes("/embed/")) {
        videoId = url.pathname.split("/embed/")[1]?.split("/")[0] || null
      }
      if (!listId && url.pathname.includes("/playlist")) {
        listId = url.searchParams.get("list")
      }
    }

    if (listId) {
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}`,
        openUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
        label: "YouTube",
      }
    }
    if (videoId) {
      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        openUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        label: "YouTube",
      }
    }
  }

  return null
}
