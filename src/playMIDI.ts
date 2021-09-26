import { ControllerEvent, MidiFile } from "midifile-ts"
import { SynthEvent } from "./SynthEvent"

export const playMIDI = (
  midi: MidiFile,
  sampleRate: number,
  postMessage: (e: SynthEvent) => void
) => {
  let tempo = 120 // beatPerMinutes

  const tickToFrameTime = (tick: number) => {
    const beat = tick / midi.header.ticksPerBeat
    const sec = beat / (tempo / 60)
    return sampleRate * sec
  }

  midi.tracks.forEach((events) => {
    let time = 0
    let lastControllerEvent: ControllerEvent | null = null
    events.forEach((e) => {
      time += e.deltaTime
      const delayTime = tickToFrameTime(time)
      switch (e.type) {
        case "channel":
          switch (e.subtype) {
            case "noteOn":
              postMessage({
                type: "noteOn",
                pitch: e.noteNumber,
                velocity: e.velocity,
                channel: e.channel,
                delayTime,
              })
              break
            case "noteOff":
              postMessage({
                type: "noteOff",
                pitch: e.noteNumber,
                channel: e.channel,
                delayTime,
              })
              break
            case "programChange":
              postMessage({
                type: "programChange",
                channel: e.channel,
                value: e.value,
                delayTime,
              })
              break
            case "pitchBend":
              postMessage({
                type: "pitchBend",
                channel: e.channel,
                value: e.value,
                delayTime,
              })
              break
            case "controller": {
              switch (e.controllerType) {
                case 101:
                  break
                case 100:
                  if (lastControllerEvent?.controllerType !== 101) {
                    console.warn(`invalid RPN`)
                  }
                  break
                case 6: {
                  switch (lastControllerEvent?.controllerType) {
                    case 0:
                      // pitch bend sensitivity
                      postMessage({
                        type: "pitchBendSensitivity",
                        channel: e.channel,
                        value: e.value,
                        delayTime,
                      })
                      console.log(e)
                      break
                  }
                  break
                }
                case 7:
                  postMessage({
                    type: "mainVolume",
                    channel: e.channel,
                    value: e.value,
                    delayTime,
                  })
                  break
              }
              lastControllerEvent = e
              break
            }
            default:
              console.warn(`not supported channel event`, e)
              break
          }
          break
        case "meta":
          switch (e.subtype) {
            case "setTempo":
              tempo = (60 * 1000000) / e.microsecondsPerBeat
              break
            default:
              console.warn(`not supported meta event`, e)
              break
          }
      }
    })
  })
}
