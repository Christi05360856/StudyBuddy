// PATH: src/components/onboarding-tour.tsx
"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export const ONBOARDING_STORAGE_KEY = "sb_onboarding_v1"
export const ONBOARDING_START_EVENT = "sb-start-tour"

type Step = {
  id: string
  title: string
  body: string
  target?: string
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to StudyBuddy",
    body: "Upload your class notes, get quizzes and an AI tutor from the same materials. Takes a minute to learn the basics.",
  },
  {
    id: "home",
    title: "Home",
    body: "Your streak, search, and notes shared by classmates in your department show up here.",
    target: "nav-home",
  },
  {
    id: "courses",
    title: "Courses",
    body: "Add each course (e.g. SEN 307). Upload notes under a course to generate quizzes and flashcards.",
    target: "nav-courses",
  },
  {
    id: "tutor",
    title: "AI Tutor",
    body: "Pick a note and ask questions. The tutor only uses your uploaded materials — not random internet answers.",
    target: "nav-tutor",
  },
  {
    id: "progress",
    title: "Progress",
    body: "See quiz scores and how you're doing over time.",
    target: "nav-progress",
  },
  {
    id: "share",
    title: "Share with department",
    body: "On a course, use the share icon to publish general class notes for your school and department. Classmates can add them with no extra AI cost.",
  },
  {
    id: "music",
    title: "Study music",
    body: "Tap the headphones icon to play focus sounds or playlists while you study. Music keeps going in the background.",
  },
]

/** Call from Profile (or anywhere) to open the walkthrough again. */
export function startOnboardingTour() {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_START_EVENT))
  }
}

export function OnboardingTour() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [spot, setSpot] = useState<DOMRect | null>(null)

  // The tour can show on any app page, but it only starts by itself on Home,
  // where the bottom bar it points at is always visible.
  const onHome = pathname.startsWith("/home")
  const onApp =
    pathname.startsWith("/home") ||
    pathname.startsWith("/courses") ||
    pathname.startsWith("/tutor") ||
    pathname.startsWith("/progress") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/quiz") ||
    pathname.startsWith("/flashcards")

  // First visit: start by itself on Home
  useEffect(() => {
    if (!onHome) return
    try {
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1") return
    } catch {
      return
    }
    const t = window.setTimeout(() => {
      setStep(0)
      setOpen(true)
    }, 600)
    return () => clearTimeout(t)
  }, [onHome])

  // "Replay app tour" on the Profile page sends the student to /home?tour=1
  useEffect(() => {
    if (!onHome) return
    if (new URLSearchParams(window.location.search).get("tour") !== "1") return
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", "/home") // so a refresh does not replay it
      setStep(0)
      setOpen(true)
    }, 400)
    return () => clearTimeout(t)
  }, [onHome, pathname])

  useEffect(() => {
    const onStart = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(ONBOARDING_START_EVENT, onStart)
    return () => window.removeEventListener(ONBOARDING_START_EVENT, onStart)
  }, [])

  useEffect(() => {
    if (!open) return
    const current = STEPS[step]
    if (!current?.target) {
      setSpot(null)
      return
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`)
    if (el) {
      setSpot(el.getBoundingClientRect())
    } else {
      setSpot(null)
    }
  }, [open, step, pathname])

  if (!open || !onApp) return null

  const current = STEPS[step]
  const isLast = step >= STEPS.length - 1

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "1")
    } catch {
      // ignore
    }
    setOpen(false)
  }

  const next = () => {
    if (isLast) finish()
    else setStep((s) => s + 1)
  }

  const nearBottom = spot ? spot.top > window.innerHeight * 0.55 : false

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="App tour">
      <div className="absolute inset-0 bg-black/50" onClick={finish} />

      {spot && (
        <div
          className="absolute rounded-2xl border-2 border-dashed border-primary bg-white/10 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{
            top: spot.top - 8,
            left: spot.left - 8,
            width: spot.width + 16,
            height: spot.height + 16,
          }}
        />
      )}

      <div
        className={cn(
          "absolute left-4 right-4 max-w-sm mx-auto bg-card rounded-2xl p-5 shadow-xl border border-border"
        )}
        style={
          spot
            ? nearBottom
              ? { bottom: window.innerHeight - spot.top + 16 }
              : { top: spot.bottom + 16 }
            : { top: "30%" }
        }
      >
        <p className="text-xs font-medium text-primary mb-1">
          {step + 1} of {STEPS.length}
        </p>
        <h2 className="text-lg font-semibold text-foreground mb-1">{current.title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">{current.body}</p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-gray-500 px-2 py-2"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={next}
            className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  )
}
