export const BGM_SETTINGS = Object.freeze({
  src: '/sounds/JAZZ_pixta_117014742.m4a',
  volume: 0.18,
})

// A decoded buffer loops without HTMLAudio ended/restart gaps. Voice and ice
// never touch this context. Only ending the voice session stops the music.
export class BarBgm {
  constructor(createContext = () => new window.AudioContext(), fetchAudio = (...args) => fetch(...args)) {
    this.createContext = createContext
    this.fetchAudio = fetchAudio
    this.generation = 0
  }

  async start() {
    if (this.context)
      return
    const generation = ++this.generation
    const context = this.createContext()
    this.context = context
    // Preview diagnosis: no credentials or conversation content are logged.
    // eslint-disable-next-line no-console
    context.onstatechange = () => console.info('BGM context:', JSON.stringify({
      state: context.state, currentTime: context.currentTime,
    }))
    try {
      await context.resume()
      const response = await this.fetchAudio(BGM_SETTINGS.src)
      if (!response.ok)
        throw new Error(`BGM HTTP ${response.status}`)
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      if (generation !== this.generation)
        return
      const gain = context.createGain()
      gain.gain.value = BGM_SETTINGS.volume
      gain.connect(context.destination)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(gain)
      this.source = source
      source.start()
      // eslint-disable-next-line no-console
      console.info('BGM playback started:', JSON.stringify({
        state: context.state,
        currentTime: context.currentTime,
        duration: buffer.duration,
        volume: gain.gain.value,
        loop: source.loop,
      }))
    } catch (error) {
      if (generation === this.generation)
        this.stop()
      throw error
    }
  }

  stop() {
    this.generation++
    this.source?.stop()
    this.source = null
    this.context?.close().catch(() => {})
    this.context = null
  }
}
