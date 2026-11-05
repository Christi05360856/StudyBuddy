// PATH: src/lib/music/focus-sounds.ts
/**
 * Zero-data focus sounds generated with the Web Audio API.
 * No files to upload, works offline, no licensing risk.
 * iOS may pause generated audio when the screen locks – that is a platform limit.
 */

export type FocusSoundId = "rain" | "white" | "brown" | "pad" | "soft-piano"

export type FocusSound = {
  id: FocusSoundId
  label: string
  description: string
}

export const FOCUS_SOUNDS: FocusSound[] = [
  { id: "rain", label: "Rain", description: "Soft rain loop" },
  { id: "white", label: "White noise", description: "Steady focus noise" },
  { id: "brown", label: "Brown noise", description: "Deeper, calmer noise" },
  { id: "pad", label: "Soft pad", description: "Gentle ambient tone" },
  { id: "soft-piano", label: "Soft piano", description: "Simple calm notes" },
]

type Engine = {
  ctx: AudioContext
  stop: () => void
}

let active: Engine | null = null

function ensureCtx(): AudioContext {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

/** Stop whatever focus sound is currently playing. */
export function stopFocusSound() {
  if (active) {
    try {
      active.stop()
    } catch {
      // ignore
    }
    active = null
  }
}

/**
 * Start a focus sound. Returns a stop function.
 * Call stopFocusSound() or the returned function to stop.
 */
export function playFocusSound(id: FocusSoundId, volume = 0.35): () => void {
  stopFocusSound()

  const ctx = ensureCtx()
  if (ctx.state === "suspended") {
    void ctx.resume()
  }

  const master = ctx.createGain()
  master.gain.value = Math.max(0, Math.min(1, volume))
  master.connect(ctx.destination)

  const nodes: AudioNode[] = []
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
      setTimeout(() => {
        nodes.forEach((n) => {
          try {
            if ("stop" in n && typeof (n as OscillatorNode).stop === "function") {
              ;(n as OscillatorNode).stop()
            }
            n.disconnect()
          } catch {
            // ignore
          }
        })
        master.disconnect()
        void ctx.close()
      }, 120)
    } catch {
      // ignore
    }
  }

  if (id === "rain" || id === "white" || id === "brown") {
    // Filtered noise buffer, looped
    const bufferSize = 2 * ctx.sampleRate
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    if (id === "white") {
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
    } else if (id === "brown") {
      let last = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      }
    } else {
      // rain-ish: mid noise + slow amplitude wobble baked in
      for (let i = 0; i < bufferSize; i++) {
        const n = Math.random() * 2 - 1
        const wobble = 0.7 + 0.3 * Math.sin(i / 9000)
        data[i] = n * wobble
      }
    }

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true

    const filter = ctx.createBiquadFilter()
    if (id === "rain") {
      filter.type = "bandpass"
      filter.frequency.value = 1200
      filter.Q.value = 0.6
    } else if (id === "brown") {
      filter.type = "lowpass"
      filter.frequency.value = 400
    } else {
      filter.type = "lowpass"
      filter.frequency.value = 8000
    }

    src.connect(filter)
    filter.connect(master)
    src.start()
    nodes.push(src, filter)
  } else if (id === "pad") {
    // Two slow detuned sine oscillators
    const freqs = [110, 164.81]
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.type = "sine"
      osc.frequency.value = f * (i === 1 ? 1.003 : 1)
      const g = ctx.createGain()
      g.gain.value = 0.22
      osc.connect(g)
      g.connect(master)
      osc.start()
      nodes.push(osc, g)
    })
  } else if (id === "soft-piano") {
    // Simple repeating calm arpeggio using short oscillators
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63] // C E G C G E
    let step = 0
    const interval = window.setInterval(() => {
      if (stopped) {
        clearInterval(interval)
        return
      }
      const osc = ctx.createOscillator()
      osc.type = "triangle"
      osc.frequency.value = notes[step % notes.length]
      const g = ctx.createGain()
      g.gain.value = 0
      g.gain.setValueAtTime(0, ctx.currentTime)
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4)
      osc.connect(g)
      g.connect(master)
      osc.start()
      osc.stop(ctx.currentTime + 1.5)
      step++
    }, 900)

    // Keep a dummy node so stop() still works cleanly
    const silent = ctx.createGain()
    silent.gain.value = 0
    silent.connect(master)
    nodes.push(silent)

    const originalStop = stop
    active = {
      ctx,
      stop: () => {
        clearInterval(interval)
        originalStop()
      },
    }
    return active.stop
  }

  active = { ctx, stop }
  return stop
}
