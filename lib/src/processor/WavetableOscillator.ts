import { SampleData } from "../SynthEvent"
import { AmplitudeEnvelope } from "./AmplitudeEnvelope"
import { LFO } from "./LFO"

export class WavetableOscillator {
  readonly sample: SampleData<Float32Array>
  private sampleIndex = 0
  private _isPlaying = false
  private _isNoteOff = false
  private isHold = false
  private isLooping = false
  private baseSpeed = 1
  private readonly envelope: AmplitudeEnvelope
  private readonly pitchLFO: LFO

  speed = 1
  // 0 to 1
  private velocity = 1
  // 0 to 1
  volume = 1

  modulation = 0

  // cent
  modulationDepthRange = 50

  // -1 to 1
  pan = 0

  constructor(sample: SampleData<Float32Array>) {
    this.sample = sample
    this.envelope = new AmplitudeEnvelope(sample.amplitudeEnvelope)
    this.pitchLFO = new LFO()
  }

  noteOn(pitch: number, velocity: number) {
    this.velocity = velocity
    this._isPlaying = true
    this.isLooping = this.sample.loop !== null
    this.sampleIndex = this.sample.sampleStart
    this.baseSpeed = Math.pow(
      2,
      ((pitch - this.sample.pitch) / 12) * this.sample.scaleTuning
    )
    this.pitchLFO.frequency = 5
    this.envelope.noteOn()
  }

  noteOff() {
    if (this.isHold) {
      return
    }

    this.envelope.noteOff()
    this._isNoteOff = true
  }

  forceStop() {
    this.envelope.forceStop()
  }

  process(outputs: Float32Array[]) {
    if (!this._isPlaying) {
      return
    }

    const speed =
      (this.baseSpeed * this.speed * this.sample.sampleRate) / sampleRate
    const volume = this.velocity * this.volume * this.sample.volume

    // zero to pi/2
    const panTheta =
      ((Math.min(1, Math.max(-1, this.pan + this.sample.pan)) + 1) * Math.PI) /
      4
    const leftPanVolume = Math.cos(panTheta)
    const rightPanVolume = Math.sin(panTheta)
    const gain = this.envelope.getAmplitude(outputs[0].length)
    const leftGain = gain * volume * leftPanVolume
    const rightGain = gain * volume * rightPanVolume

    const pitchLFOValue = this.pitchLFO.getValue(outputs[0].length)
    const pitchModulation =
      pitchLFOValue * this.modulation * (this.modulationDepthRange / 1200)

    for (let i = 0; i < outputs[0].length; ++i) {
      const index = Math.floor(this.sampleIndex)
      const advancedIndex = this.sampleIndex + speed * (1 + pitchModulation)
      let loopIndex: number | null = null

      if (
        this.sample.loop !== null &&
        advancedIndex >= this.sample.loop.end &&
        this.isLooping
      ) {
        loopIndex =
          this.sample.loop.start + (advancedIndex - Math.floor(advancedIndex))
      }

      const nextIndex =
        loopIndex !== null
          ? Math.floor(loopIndex)
          : Math.min(index + 1, this.sample.sampleEnd - 1)

      // linear interpolation
      const current = this.sample.buffer[index]
      const next = this.sample.buffer[nextIndex]
      const level = current + (next - current) * (this.sampleIndex - index)

      outputs[0][i] += level * leftGain
      outputs[1][i] += level * rightGain

      this.sampleIndex = loopIndex ?? advancedIndex

      if (this.sampleIndex >= this.sample.sampleEnd) {
        this._isPlaying = false
        break
      }
    }
  }

  setHold(hold: boolean) {
    this.isHold = hold

    if (!hold && !this._isNoteOff) {
      this.noteOff()
    }
  }

  get isPlaying() {
    return this._isPlaying && this.envelope.isPlaying
  }

  get isNoteOff() {
    return this._isNoteOff
  }

  get exclusiveClass() {
    return this.sample.exclusiveClass
  }
}
