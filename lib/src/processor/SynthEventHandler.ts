import { ControllerEvent, MIDIControlEvents } from "midifile-ts"
import {
  ImmediateEvent,
  MIDIEvent,
  MIDIEventBody,
  SynthEvent,
} from "../SynthEvent"
import { DistributiveOmit } from "../types"
import { logger } from "./logger"
import { SynthProcessor } from "./SynthProcessor"

type DelayedEvent = MIDIEvent & { receivedFrame: number }
type RPNControllerEvent = DistributiveOmit<ControllerEvent, "deltaTime">

interface RPN {
  rpnMSB?: RPNControllerEvent
  rpnLSB?: RPNControllerEvent
  dataMSB?: RPNControllerEvent
  dataLSB?: RPNControllerEvent
}

export class SynthEventHandler {
  private processor: SynthProcessor
  private scheduledEvents: DelayedEvent[] = []
  private rpnEvents: { [channel: number]: RPN | undefined } = {}
  private bankSelectMSB: { [channel: number]: number | undefined } = {}

  constructor(processor: SynthProcessor) {
    this.processor = processor
  }

  addEvent(e: SynthEvent) {
    logger.log(e)

    if ("delayTime" in e) {
      // handle in process
      this.scheduledEvents.unshift({ ...e, receivedFrame: currentFrame })
    } else {
      this.handleImmediateEvent(e)
    }
  }

  processScheduledEvents() {
    arrayRemove(this.scheduledEvents, (e) => {
      if (e.receivedFrame + e.delayTime <= currentFrame) {
        this.handleDelayableEvent(e.midi)
        return true
      }
      return false
    })
  }

  handleImmediateEvent(e: ImmediateEvent) {
    switch (e.type) {
      case "loadSample":
        this.processor.loadSample(
          e.sample,
          e.bank,
          e.instrument,
          e.keyRange,
          e.velRange
        )
        break
    }
  }

  handleDelayableEvent(e: MIDIEventBody) {
    logger.log("handle delayable event", e)

    switch (e.type) {
      case "channel": {
        switch (e.subtype) {
          case "noteOn":
            this.processor.noteOn(e.channel, e.noteNumber, e.velocity)
            break
          case "noteOff":
            this.processor.noteOff(e.channel, e.noteNumber)
            break
          case "pitchBend":
            this.processor.pitchBend(e.channel, e.value)
            break
          case "programChange":
            this.processor.programChange(e.channel, e.value)
            break
          case "controller": {
            switch (e.controllerType) {
              case MIDIControlEvents.NONREG_PARM_NUM_MSB:
              case MIDIControlEvents.NONREG_PARM_NUM_LSB: // NRPN LSB
                // Delete the rpn for do not send NRPN data events
                delete this.rpnEvents[e.channel]
                break
              case MIDIControlEvents.REGIST_PARM_NUM_MSB: {
                if (e.value === 127) {
                  delete this.rpnEvents[e.channel]
                } else {
                  this.rpnEvents[e.channel] = {
                    ...this.rpnEvents[e.channel],
                    rpnMSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.REGIST_PARM_NUM_LSB: {
                if (e.value === 127) {
                  delete this.rpnEvents[e.channel]
                } else {
                  this.rpnEvents[e.channel] = {
                    ...this.rpnEvents[e.channel],
                    rpnLSB: e,
                  }
                }
                break
              }
              case MIDIControlEvents.MSB_DATA_ENTRY: {
                const rpn = {
                  ...this.rpnEvents[e.channel],
                  dataMSB: e,
                }
                this.rpnEvents[e.channel] = rpn

                // In case of pitch bend sensitivity,
                // send without waiting for Data LSB event
                if (rpn.rpnLSB?.value === 0) {
                  this.processor.setPitchBendSensitivity(
                    e.channel,
                    rpn.dataMSB.value
                  )
                }
                break
              }
              case MIDIControlEvents.LSB_DATA_ENTRY: {
                this.rpnEvents[e.channel] = {
                  ...this.rpnEvents[e.channel],
                  dataLSB: e,
                }
                // TODO: Send other RPN events
                break
              }
              case MIDIControlEvents.MSB_MAIN_VOLUME:
                this.processor.setMainVolume(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_EXPRESSION:
                this.processor.expression(e.channel, e.value)
                break
              case MIDIControlEvents.ALL_SOUNDS_OFF:
                this.removeScheduledEvents(e.channel)
                this.processor.allSoundsOff(e.channel)
                break
              case MIDIControlEvents.SUSTAIN:
                this.processor.hold(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_PAN:
                this.processor.setPan(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_MODWHEEL:
                this.processor.modulation(e.channel, e.value)
                break
              case MIDIControlEvents.MSB_BANK:
                this.bankSelectMSB[e.channel] = e.value
                break
              case MIDIControlEvents.LSB_BANK: {
                const msb = this.bankSelectMSB[e.channel]
                if (msb !== undefined) {
                  const bank = (msb << 7) + e.value
                  this.processor.bankSelect(e.channel, bank)
                }
                break
              }
            }
            break
          }
        }
        break
      }
    }
  }

  private removeScheduledEvents(channel: number) {
    arrayRemove(this.scheduledEvents, (e) => e.midi.channel === channel)
  }
}

function arrayRemove<T>(arr: T[], test: (e: T) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const ev = arr[i]
    if (test(ev)) {
      arr.splice(i, 1)
    }
  }
}
