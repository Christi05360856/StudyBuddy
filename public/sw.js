// PATH: public/sw.js
// StudyBuddy service worker.
// It does two safe things only:
//   1. Shows a friendly offline page when the phone has no internet.
//   2. Keeps app icons and built app files (JS/CSS) so the app opens faster.
// It never saves your notes, quizzes, API answers or Supabase data.

// Change this word whenever you edit this file, so phones pick up the new version.
const VERSION = "v2"
const CACHE = `studybuddy-static-${VERSION}`
const OFFLINE_URL = "/offline.html"
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Each file is saved on its own. If one file is missing, the others are still saved
      // and the service worker still installs (before, one missing icon blocked everything).
      .then((cache) =>
        Promise.allSettled(
          PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("studybuddy-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)

  // Supabase, Google and anything outside our own site: go straight to the network
  if (url.origin !== self.location.origin) return

  // Our own API routes are never cached
  if (url.pathname.startsWith("/api/")) return

  // Opening a page: always try the network first (so you never see old private pages).
  // If the phone is offline, show the saved offline page instead.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const saved = await caches.match(OFFLINE_URL)
        return (
          saved ||
          new Response("You are offline. Please check your internet and try again.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        )
      })
    )
    return
  }

  // App files and icons: use the saved copy if we have it
  const isIcon = /^\/(icon-|maskable-|apple-touch-icon)/.test(url.pathname)
  if (url.pathname.startsWith("/_next/static/") || isIcon) {
    event.respondWith(
      caches.match(request).then(
        (saved) =>
          saved ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
  }
})
