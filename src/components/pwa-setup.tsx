// PATH: src/components/pwa-setup.tsx
"use client"

// Does two jobs:
//  1. Registers the service worker (so the app can be installed and shows an offline page).
//  2. Shows a small "Install app" card on the Home page.
//     - Android/Chrome: one tap installs it.
//     - iPhone/Safari: shows the steps (Safari has no install button we can trigger).

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Download, Share, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "studybuddy-install-dismissed"

export function PwaSetup() {
  const pathname = usePathname()
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    // 1. Service worker (only on the real website, not while developing)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    // 2. Do not show the card if the app is already installed or was dismissed
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      // storage blocked, ignore
    }
    if (installed || dismissed) return

    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    setHidden(false)

    const onPrompt = (e: Event) => {
      e.preventDefault() // we show our own button instead of the browser's
      setInstallEvent(e as InstallEvent)
    }
    const onInstalled = () => setHidden(true)

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // ignore
    }
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    setInstallEvent(null)
    if (choice.outcome === "accepted") setHidden(true)
  }

  // Only show on the Home page, and only when installing is actually possible
  const canShow = pathname.startsWith("/home") && !hidden && (installEvent || isIos)
  if (!canShow) return null

  return (
    <div className="fixed left-4 right-4 bottom-20 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80 z-50 rounded-2xl bg-card border border-border shadow-lg p-4">
      <button
        onClick={dismiss}
        aria-label="Close"
        className="absolute top-2 right-2 p-1.5 rounded-full text-gray-400 hover:bg-muted"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Download size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">Install StudyBuddy</p>
          {installEvent ? (
            <p className="text-sm text-gray-500 mt-0.5">
              Add it to your home screen to open it like a normal app.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">
              Tap <Share size={13} className="inline -mt-0.5" /> Share, then{" "}
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          )}
        </div>
      </div>
      {installEvent && (
        <Button size="sm" className="w-full mt-3" onClick={install}>
          Install app
        </Button>
      )}
    </div>
  )
}
