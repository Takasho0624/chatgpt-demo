// Seconds from order confirmation. Add the optional local asset before enabling SE.
export const COCKTAIL_TIMING = Object.freeze({
  preparationSeconds: 7,
  iceSoundAtSeconds: 3,
  iceSoundSrc: null, // '/sounds/ice-clink.mp3' → public/sounds/ice-clink.mp3
})

export function waitForPreparation(signal, playIce, timing = COCKTAIL_TIMING) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    let iceTimer
    let endTimer
    let abort
    const finish = (completed) => {
      clearTimeout(iceTimer)
      clearTimeout(endTimer)
      signal.removeEventListener('abort', abort)
      resolve(completed)
    }
    abort = () => finish(false)
    iceTimer = setTimeout(() => {
      // A missing/unplayable optional sound must never block serving.
      Promise.resolve().then(() => {
        if (!signal.aborted)
          return playIce()
      }).catch(() => {})
    }, Math.min(timing.iceSoundAtSeconds, timing.preparationSeconds) * 1000)
    endTimer = setTimeout(() => finish(true), timing.preparationSeconds * 1000)
    signal.addEventListener('abort', abort, { once: true })
  })
}

// Playback is tracked separately from generation: response.done is too early
// to reopen the microphone when WebRTC audio is still buffered.
export class VoiceConversation {
  constructor(send, setMicrophone) {
    this.send = send
    this.setMicrophone = setMicrophone
    this.state = 'OPENING'
    this.pending = false
    this.generating = new Set()
    this.playing = new Set()
    this.finishedAudio = new Set()
    this.rejectedInput = new Set()
    this.policy = undefined
  }

  get canInterrupt() {
    return this.state === 'SERVING' || this.state === 'FREE_TALK'
  }

  get canListen() {
    return this.state !== 'MAKING_COCKTAIL'
      && (this.canInterrupt || (!this.pending && !this.generating.size && !this.playing.size))
  }

  sync() {
    const listen = this.canListen
    // Mute at the source, before changing server VAD, to discard ambient audio.
    this.setMicrophone(listen)
    const policy = listen ? (this.canInterrupt ? 'free' : 'order') : 'off'
    if (policy === this.policy)
      return
    this.policy = policy
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        audio: {
          input: {
            turn_detection: listen
              ? {
                  type: 'server_vad',
                  threshold: 0.78,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 850,
                  create_response: true,
                  interrupt_response: this.canInterrupt,
                }
              : null,
          },
        },
      },
    })
    this.send({ type: 'input_audio_buffer.clear' })
  }

  transition(state) {
    this.state = state
    this.sync()
  }

  requestResponse() {
    if (this.state === 'MAKING_COCKTAIL')
      return false
    this.pending = true
    this.sync()
    return true
  }

  stopOutput() {
    for (const responseId of this.generating)
      this.send({ type: 'response.cancel', response_id: responseId })
    this.send({ type: 'output_audio_buffer.clear' })
  }

  handle(message) {
    const id = message.response_id || message.response?.id
    if (message.type === 'input_audio_buffer.speech_started' && !this.canListen)
      this.rejectedInput.add(message.item_id)
    if (message.type === 'error')
      this.pending = false
    if (message.type === 'response.created') {
      this.pending = false
      this.generating.add(id)
      if (this.state === 'MAKING_COCKTAIL')
        this.stopOutput()
    }
    if (message.type === 'output_audio_buffer.started') {
      this.playing.add(id)
      if (this.state === 'MAKING_COCKTAIL')
        this.stopOutput()
    }
    if (message.type === 'response.done') {
      this.generating.delete(id)
      const hasAudio = message.response?.output?.some(item =>
        item.content?.some(content => content.type === 'audio' || content.type === 'output_audio'))
      if (hasAudio && message.response.status === 'completed' && !this.finishedAudio.has(id))
        this.playing.add(id)
    }
    if (message.type === 'output_audio_buffer.stopped' || message.type === 'output_audio_buffer.cleared') {
      this.playing.delete(id)
      this.finishedAudio.add(id)
    }
    if (!this.pending && !this.generating.size && !this.playing.size) {
      if (this.state === 'OPENING')
        this.state = 'WAITING_FOR_ORDER'
      if (this.state === 'SERVING')
        this.state = 'FREE_TALK'
    }
    this.sync()
  }
}
