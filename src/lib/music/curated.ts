// PATH: src/lib/music/curated.ts
/**
 * Curated mood playlists – Nigerian-first.
 * Swap any Spotify ID later by editing this file only.
 *
 * How to change a playlist:
 * 1. Open a public playlist on open.spotify.com
 * 2. Copy the ID from the URL (the long string after /playlist/)
 * 3. Paste it below
 */

export type MoodId =
  | "afrobeats-chill"
  | "gospel"
  | "amapiano"
  | "lofi"
  | "instrumental"
  | "classical"

export type MoodPlaylist = {
  id: MoodId
  label: string
  description: string
  /** Spotify playlist ID only (not full URL) */
  spotifyId: string
}

export const MOOD_PLAYLISTS: MoodPlaylist[] = [
  {
    id: "afrobeats-chill",
    label: "Afrobeats Chill",
    description: "Wizkid, Rema, Black Sherif, Omah Lay & more",
    // Soft / chill Afrobeats mix – replace if you find a better public one
    spotifyId: "37i9dQZF1DWYkaDif7Ztbp",
  },
  {
    id: "gospel",
    label: "Naija Gospel",
    description: "Mercy Chinwo, Nathaniel Bassey, Moses Bliss…",
    // Spotify editorial: Naija Worship
    spotifyId: "37i9dQZF1DX1PgTwYgvl4t",
  },
  {
    id: "amapiano",
    label: "Amapiano Soft",
    description: "Laid-back piano & log drums",
    spotifyId: "37i9dQZF1DWZQaaqNMbbXa",
  },
  {
    id: "lofi",
    label: "Lo-fi",
    description: "Beats to study / relax to",
    spotifyId: "37i9dQZF1DWWQRwui0ExPn",
  },
  {
    id: "instrumental",
    label: "Instrumental",
    description: "No lyrics – pure focus",
    spotifyId: "37i9dQZF1DX4sWSpwq3LiO",
  },
  {
    id: "classical",
    label: "Classical",
    description: "Quiet classical favourites",
    spotifyId: "37i9dQZF1DWWEJlAGA9gs0",
  },
]

export function moodEmbedUrl(mood: MoodPlaylist): string {
  // theme=0 = dark player that matches our mini-bar
  return `https://open.spotify.com/embed/playlist/${mood.spotifyId}?utm_source=generator&theme=0`
}

export function moodOpenUrl(mood: MoodPlaylist): string {
  return `https://open.spotify.com/playlist/${mood.spotifyId}`
}
