import { SynthEvent } from "@ryohey/wavelet"
import { AnyEvent, EndOfTrackEvent, MidiFile } from "midifile-ts"
import EventScheduler from "./EventScheduler"

interface Tick {
  tick: number
  track: number
}

function addTick(events: AnyEvent[], track: number): (AnyEvent & Tick)[] {
  let tick = 0
  return events.map((e) => {
    tick += e.deltaTime
    return { ...e, tick, track }
  })
}

export const isEndOfTrackEvent = (e: AnyEvent): e is EndOfTrackEvent =>
  "subtype" in e && e.subtype === "endOfTrack"

const TIMER_INTERVAL = 100
const LOOK_AHEAD_TIME = 50

export class MIDIPlayer {
  private output: (e: SynthEvent) => void
  private tempo = 120
  private interval: number | undefined
  private midi: MidiFile
  private sampleRate: number
  private tickedEvents: (AnyEvent & Tick)[]
  private scheduler: EventScheduler<AnyEvent & Tick>
  private endOfSong: number
  onProgress?: (progress: number) => void

  constructor(
    midi: MidiFile,
    sampleRate: number,
    output: (e: SynthEvent) => void
  ) {
    this.midi = midi
    this.sampleRate = sampleRate
    this.output = output
    this.tickedEvents = midi.tracks
      .flatMap(addTick)
      .sort((a, b) => a.tick - b.tick)
    this.scheduler = new EventScheduler(
      this.tickedEvents,
      0,
      this.midi.header.ticksPerBeat,
      TIMER_INTERVAL + LOOK_AHEAD_TIME
    )
    this.endOfSong = Math.max(
      ...this.tickedEvents.filter(isEndOfTrackEvent).map((e) => e.tick)
    )
  }

  resume() {
    if (this.interval === undefined) {
      this.interval = window.setInterval(() => this.onTimer(), TIMER_INTERVAL)
    }
  }

  pause() {
    clearInterval(this.interval)
    this.interval = undefined
    this.output({ type: "stop" })
  }

  // 0: start, 1: end
  seek(position: number) {
    this.output({ type: "stop" })
    this.scheduler.seek(position * this.endOfSong)
  }

  private onTimer() {
    const now = performance.now()
    const events = this.scheduler.readNextEvents(this.tempo, now)

    // channel イベントを MIDI Output に送信
    // Send Channel Event to MIDI OUTPUT
    events.forEach(({ event, timestamp }) => {
      const delayTime = ((timestamp - now) / 1000) * this.sampleRate
      const synthEvent = this.handleEvent(event, delayTime)
      if (synthEvent !== null) {
        this.output(synthEvent)
      }
    })

    if (this.scheduler.currentTick >= this.endOfSong) {
      clearInterval(this.interval)
      this.interval = undefined
    }

    this.onProgress?.(this.scheduler.currentTick / this.endOfSong)
  }

  private handleEvent(
    e: AnyEvent & Tick,
    delayTime: number
  ): SynthEvent | null {
    switch (e.type) {
      case "channel":
        return {
          type: "midi",
          midi: e,
          delayTime,
        }
      case "meta":
        switch (e.subtype) {
          case "setTempo":
            this.tempo = (60 * 1000000) / e.microsecondsPerBeat
            break
          default:
            console.warn(`not supported meta event`, e)
            break
        }
    }
    return null
  }
}
