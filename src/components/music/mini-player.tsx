// PATH: src/components/music/mini-player.tsx
"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  Headphones,
  X,
  Pause,
  CloudRain,
  Music2,
  Link2,
  ChevronDown,
  Square,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FOCUS_SOUNDS,
  playFocusSound,
  stopFocusSound,
  type FocusSoundId,
} from "@/lib/music/focus-sounds"
import { parseMusicLink, type ParsedEmbed } from "@/lib/music/embed"
import {
  MOOD_PLAYLISTS,
  moodEmbedUrl,
  moodOpenUrl,
  type MoodId,
} from "@/lib/music/curated"
import { createClient } from "@/lib/supabase/client"

type Tab = "focus" | "moods" | "paste" | "session"

type PlayerState = {
  open: boolean
  tab: Tab
  playing: boolean
  mode: "focus" | "embed" | null
  focusId: FocusSoundId | null
  embed: ParsedEmbed | null
  moodId: MoodId | null
  sessionActive: boolean
  sessionSecondsLeft: number
  sessionStartedAt: number | null
  sleepMinutes: number | null
}

type MusicContextValue = {
  state: PlayerState
  openPlayer: (tab?: Tab) => void
  closePlayer: () => void
  togglePlay: () => void
  stop: () => void
  playFocus: (id: FocusSoundId) => void
  playMood: (id: MoodId) => void
  playPaste: (raw: string) => string | null
  startSession: (minutes?: number) => void
  stopSession: () => void
  setSleep: (minutes: number | null) => void
}

const MusicContext = createContext<MusicContextValue | null>(null)

export function useMusic() {
  const ctx = useContext(MusicContext)
  if (!ctx) throw new Error("useMusic must be used inside MusicProvider")
  return ctx
}

const STORAGE_KEY = "sb_music_last"
const SESSION_DEFAULT = 25 * 60

function loadLast(): Partial<PlayerState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<PlayerState>
  } catch {
    return {}
  }
}

function saveLast(partial: Partial<PlayerState>) {
  try {
    const prev = loadLast()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...partial }))
  } catch {
    // ignore
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>({
    open: false,
    tab: "focus",
    playing: false,
    mode: null,
    focusId: null,
    embed: null,
    moodId: null,
    sessionActive: false,
    sessionSecondsLeft: SESSION_DEFAULT,
    sessionStartedAt: null,
    sleepMinutes: null,
  })

  const stopFocusRef = useRef<(() => void) | null>(null)
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionAccumulatedRef = useRef(0)

  useEffect(() => {
    const last = loadLast()
    if (last.focusId || last.moodId || last.embed) {
      setState((s) => ({
        ...s,
        focusId: (last.focusId as FocusSoundId) ?? null,
        moodId: (last.moodId as MoodId) ?? null,
        embed: (last.embed as ParsedEmbed) ?? null,
        mode: last.mode === "focus" || last.mode === "embed" ? last.mode : null,
        tab: (last.tab as Tab) ?? "focus",
      }))
    }
  }, [])

  const clearSleep = () => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current)
      sleepTimerRef.current = null
    }
  }

  const stopAllAudio = useCallback(() => {
    stopFocusSound()
    stopFocusRef.current = null
    clearSleep()
    setState((s) => ({
      ...s,
      playing: false,
      embed: null,
      mode: null,
      moodId: null,
      focusId: null,
    }))
  }, [])

  useEffect(() => {
    return () => {
      stopFocusSound()
      clearSleep()
      if (sessionTickRef.current) clearInterval(sessionTickRef.current)
    }
  }, [])

  const playFocus = useCallback((id: FocusSoundId) => {
    stopFocusSound()
    const stop = playFocusSound(id, 0.35)
    stopFocusRef.current = stop
    setState((s) => ({
      ...s,
      playing: true,
      mode: "focus",
      focusId: id,
      embed: null,
      moodId: null,
    }))
    saveLast({ mode: "focus", focusId: id, moodId: null, embed: null, tab: "focus" })
  }, [])

  const playMood = useCallback((id: MoodId) => {
    stopFocusSound()
    stopFocusRef.current = null
    const mood = MOOD_PLAYLISTS.find((m) => m.id === id)
    if (!mood) return
    const embed: ParsedEmbed = {
      provider: "spotify",
      embedUrl: moodEmbedUrl(mood),
      openUrl: moodOpenUrl(mood),
      label: mood.label,
    }
    setState((s) => ({
      ...s,
      playing: true,
      mode: "embed",
      moodId: id,
      focusId: null,
      embed,
      tab: "moods",
    }))
    saveLast({ mode: "embed", moodId: id, focusId: null, embed, tab: "moods" })
  }, [])

  const playPaste = useCallback((raw: string): string | null => {
    const parsed = parseMusicLink(raw)
    if (!parsed) return "Paste a valid Audiomack, Spotify or YouTube link."
    stopFocusSound()
    stopFocusRef.current = null
    setState((s) => ({
      ...s,
      playing: true,
      mode: "embed",
      embed: parsed,
      moodId: null,
      focusId: null,
      tab: "paste",
    }))
    saveLast({ mode: "embed", embed: parsed, moodId: null, focusId: null, tab: "paste" })
    return null
  }, [])

  const togglePlay = useCallback(() => {
    setState((s) => {
      if (s.playing) {
        stopFocusSound()
        stopFocusRef.current = null
        clearSleep()
        return { ...s, playing: false }
      }
      if (s.mode === "focus" && s.focusId) {
        const stop = playFocusSound(s.focusId, 0.35)
        stopFocusRef.current = stop
        return { ...s, playing: true }
      }
      if (s.mode === "embed" && s.embed) {
        return { ...s, playing: true }
      }
      return s
    })
  }, [])

  const recordSessionIfNeeded = useCallback(async () => {
    if (sessionAccumulatedRef.current >= 10 * 60) {
      try {
        const supabase = createClient()
        await supabase.rpc("record_study_day")
      } catch {
        // non-fatal
      }
    }
  }, [])

  const stopSession = useCallback(() => {
    if (sessionTickRef.current) {
      clearInterval(sessionTickRef.current)
      sessionTickRef.current = null
    }
    void recordSessionIfNeeded()
    sessionAccumulatedRef.current = 0
    setState((s) => ({
      ...s,
      sessionActive: false,
      sessionSecondsLeft: SESSION_DEFAULT,
      sessionStartedAt: null,
    }))
  }, [recordSessionIfNeeded])

  const startSession = useCallback(
    (minutes = 25) => {
      if (sessionTickRef.current) clearInterval(sessionTickRef.current)
      sessionAccumulatedRef.current = 0
      const total = minutes * 60
      const startedAt = Date.now()

      setState((s) => ({
        ...s,
        sessionActive: true,
        sessionSecondsLeft: total,
        sessionStartedAt: startedAt,
        tab: "session",
        open: true,
      }))

      sessionTickRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        sessionAccumulatedRef.current = elapsed
        const left = Math.max(0, total - elapsed)
        setState((s) => ({ ...s, sessionSecondsLeft: left }))
        if (left <= 0) {
          if (sessionTickRef.current) clearInterval(sessionTickRef.current)
          sessionTickRef.current = null
          void recordSessionIfNeeded()
          setState((s) => ({
            ...s,
            sessionActive: false,
            sessionSecondsLeft: 0,
            sessionStartedAt: null,
          }))
        }
      }, 1000)
    },
    [recordSessionIfNeeded]
  )

  const setSleep = useCallback(
    (minutes: number | null) => {
      clearSleep()
      setState((s) => ({ ...s, sleepMinutes: minutes }))
      if (minutes && minutes > 0) {
        sleepTimerRef.current = setTimeout(() => {
          stopAllAudio()
          setState((s) => ({ ...s, sleepMinutes: null, playing: false }))
        }, minutes * 60 * 1000)
      }
    },
    [stopAllAudio]
  )

  const openPlayer = useCallback((tab: Tab = "focus") => {
    setState((s) => ({ ...s, open: true, tab }))
  }, [])

  const closePlayer = useCallback(() => {
    // Music continues — we only hide the sheet
    setState((s) => ({ ...s, open: false }))
  }, [])

  const value: MusicContextValue = {
    state,
    openPlayer,
    closePlayer,
    togglePlay,
    stop: stopAllAudio,
    playFocus,
    playMood,
    playPaste,
    startSession,
    stopSession,
    setSleep,
  }

  return (
    <MusicContext.Provider value={value}>
      {children}
      <MiniPlayerUI />
    </MusicContext.Provider>
  )
}

/**
 * The only visible control. Place it in your header / nav.
 * The pulsing dot shows that audio is playing.
 */
export function HeadsetButton({ className }: { className?: string }) {
  const { state, openPlayer } = useMusic()
  return (
    <button
      type="button"
      onClick={() => openPlayer(state.tab)}
      aria-label="Open study music"
      className={cn("relative p-2 rounded-full hover:bg-muted", className)}
    >
      <Headphones size={20} />
      {state.playing && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  )
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function MiniPlayerUI() {
  const {
    state,
    closePlayer,
    openPlayer,
    togglePlay,
    stop,
    playFocus,
    playMood,
    playPaste,
    startSession,
    stopSession,
    setSleep,
  } = useMusic()

  const [pasteValue, setPasteValue] = useState("")
  const [pasteError, setPasteError] = useState<string | null>(null)

  const embedAlive = state.mode === "embed" && !!state.embed
  const nowPlayingLabel =
    state.mode === "embed"
      ? state.embed?.label
      : state.mode === "focus" && state.focusId
        ? FOCUS_SOUNDS.find((f) => f.id === state.focusId)?.label
        : null

  return (
    <>
      {/* ========== PERSISTENT EMBED (single iframe, never unmounted) ==========
          Closed: parked off-screen at real size so it keeps playing and nothing
          sits over the page. Open: shown at the top, above the sheet. */}
      {embedAlive && state.embed && (
        <div
          aria-hidden={!state.open}
          className={cn(
            "fixed z-[60]",
            state.open
              ? "top-4 left-3 right-3 lg:left-[16rem] lg:right-6 opacity-100"
              : "opacity-0 pointer-events-none"
          )}
          style={
            state.open ? undefined : { top: 0, left: -9999, width: 320 }
          }
        >
          <div className="max-w-lg mx-auto lg:max-w-none rounded-2xl overflow-hidden shadow-xl border border-border bg-card">
            <iframe
              key={state.embed.embedUrl}
              title={state.embed.label}
              src={state.embed.embedUrl}
              className="w-full border-0 block"
              style={{ height: state.embed.provider === "youtube" ? 160 : 80 }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              tabIndex={state.open ? 0 : -1}
            />
          </div>
        </div>
      )}

      {/* ========== FULL SHEET ========== */}
      {state.open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close music"
            onClick={closePlayer}
          />
          <div className="relative bg-card rounded-t-3xl max-h-[75vh] overflow-y-auto safe-area-pb">
            <div className="sticky top-0 bg-card z-10 px-5 pt-3 pb-2 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Headphones size={18} className="text-primary" />
                  <h2 className="font-semibold text-lg">Study music</h2>
                </div>
                <button
                  type="button"
                  onClick={closePlayer}
                  className="p-2 -mr-2 rounded-full hover:bg-muted"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex gap-1 overflow-x-auto pb-1">
                {(
                  [
                    ["focus", "Focus"],
                    ["moods", "Moods"],
                    ["paste", "My playlist"],
                    ["session", "Timer"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => openPlayer(id)}
                    className={cn(
                      "shrink-0 px-3.5 py-2 rounded-full text-sm font-medium transition-colors",
                      state.tab === id
                        ? "bg-primary text-white"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {nowPlayingLabel && (
                <div className="flex items-center gap-2 mt-2 rounded-xl bg-muted px-3 py-2">
                  <Music2 size={14} className="text-primary shrink-0" />
                  <p className="flex-1 min-w-0 text-sm truncate">
                    {state.playing ? "Playing" : "Paused"} · {nowPlayingLabel}
                  </p>
                  <button
                    type="button"
                    onClick={stop}
                    className="flex items-center gap-1 text-xs font-medium text-danger px-2 py-1 rounded-lg hover:bg-background"
                  >
                    <Square size={12} /> Stop
                  </button>
                </div>
              )}
            </div>

            <div className="px-5 py-4 space-y-4 pb-28">
              {state.tab === "focus" && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 mb-3">
                    Zero data. Generated on your phone. Works offline.
                  </p>
                  {FOCUS_SOUNDS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => playFocus(s.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-colors text-left",
                        state.focusId === s.id && state.playing
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <CloudRain size={18} className="text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{s.label}</p>
                        <p className="text-xs text-gray-500">{s.description}</p>
                      </div>
                      {state.focusId === s.id && state.playing && (
                        <span className="text-xs font-medium text-primary">Playing</span>
                      )}
                    </button>
                  ))}
                  {state.mode === "focus" && state.playing && (
                    <Button variant="secondary" className="w-full mt-2" onClick={togglePlay}>
                      <Pause size={16} className="mr-2" /> Pause sound
                    </Button>
                  )}
                </div>
              )}

              {state.tab === "moods" && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 mb-1">
                    Nigerian-first. Music keeps playing after you close this sheet. Tap the headset to come back.
                  </p>
                  <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                    Spotify often plays only 30-second previews if you are not logged into Spotify in this browser. Use “Open this playlist in Spotify” below for full songs.
                  </p>
                  {MOOD_PLAYLISTS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => playMood(m.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-colors text-left",
                        state.moodId === m.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Music2 size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{m.label}</p>
                        <p className="text-xs text-gray-500">{m.description}</p>
                      </div>
                    </button>
                  ))}
                  {state.moodId && state.embed && (
                    <a
                      href={state.embed.openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-sm text-primary font-medium py-2"
                    >
                      Open this playlist in Spotify
                    </a>
                  )}
                </div>
              )}

              {state.tab === "paste" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Paste an Audiomack, Spotify or YouTube link. Music keeps playing after you close this sheet.
                  </p>
                  <Input
                    placeholder="https://audiomack.com/... or Spotify / YouTube"
                    value={pasteValue}
                    onChange={(e) => {
                      setPasteValue(e.target.value)
                      setPasteError(null)
                    }}
                  />
                  {pasteError && <p className="text-sm text-danger">{pasteError}</p>}
                  <Button
                    className="w-full"
                    onClick={() => {
                      const err = playPaste(pasteValue)
                      if (err) setPasteError(err)
                      else setPasteError(null)
                    }}
                  >
                    <Link2 size={16} className="mr-2" />
                    Play link
                  </Button>
                  {state.embed && !state.moodId && (
                    <a
                      href={state.embed.openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-sm text-primary font-medium py-2"
                    >
                      Open in {state.embed.label}
                    </a>
                  )}
                </div>
              )}

              {state.tab === "session" && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Pick a sound, then run a focused block. Sessions of 10 minutes or more count toward your streak.
                  </p>
                  <div className="rounded-2xl bg-muted/60 p-6 text-center">
                    <p className="text-4xl font-bold tabular-nums tracking-tight">
                      {formatTime(state.sessionSecondsLeft)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {state.sessionActive ? "Time left" : "Ready when you are"}
                    </p>
                  </div>
                  {!state.sessionActive ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[15, 25, 45].map((m) => (
                        <Button key={m} variant="secondary" onClick={() => startSession(m)}>
                          {m} min
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Button variant="secondary" className="w-full" onClick={stopSession}>
                      End session
                    </Button>
                  )}
                  <div>
                    <p className="text-sm font-medium mb-2">Sleep timer</p>
                    <div className="flex flex-wrap gap-2">
                      {[null, 15, 30, 45, 60].map((m) => (
                        <button
                          key={String(m)}
                          type="button"
                          onClick={() => setSleep(m)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                            state.sleepMinutes === m
                              ? "bg-primary text-white border-primary"
                              : "bg-card border-border text-foreground"
                          )}
                        >
                          {m === null ? "Off" : `${m}m`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-center pb-3">
              <ChevronDown size={18} className="text-gray-300" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
