// PATH: src/app/manifest.ts
// Tells the phone how StudyBuddy should look when it is installed like an app.
// Next.js serves this automatically at /manifest.webmanifest

import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "StudyBuddy NG",
    short_name: "StudyBuddy",
    description: "Study smarter from your own class notes",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f7",
    theme_color: "#3b5bdb",
    categories: ["education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My courses", url: "/courses" },
      { name: "AI Tutor", url: "/tutor" },
    ],
  }
}
