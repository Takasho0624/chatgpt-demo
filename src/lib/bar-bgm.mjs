export const BGM_SETTINGS = Object.freeze({
  src: '/sounds/JAZZ_pixta_117014742.m4a',
  volume: 0.035,
})

// A decoded buffer loops without HTMLAudio ended/restart gaps. Voice and ice
// never touch this context. Only ending the voice session stops the music.
export class BarBgm {
  constructor(createContext = () => new window.AudioContext(), fetchAudio = fetch) {
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
