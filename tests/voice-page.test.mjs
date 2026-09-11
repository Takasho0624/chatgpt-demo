import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { COCKTAIL_TIMING, VoiceConversation, waitForPreparation } from '../src/lib/voice-conversation.mjs'
import { cocktailSpeechInstructions, cocktails } from '../src/lib/cocktails.mjs'

// Exercise the actual page event handler with fake WebRTC/DOM, without keys or a microphone.
async function page() {
  const elements = new Map()
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          hidden: true,
          style: {},
          classList: { add() {}, remove() {} },
          addEventListener() {},
          play: async() => {},
          pause() {},
        })
      }
      return elements.get(id)
    },
  }
  const sent = []
  let channel
  const track = { enabled: true, stop() {} }
  class Peer {
    constructor() { this.connectionState = 'connected' }
    addTrack() {}
    createDataChannel() {
      channel = { readyState: 'open', send: text => sent.push(JSON.parse(text)), close() {} }
      return channel
    }

    async createOffer() { return { sdp: 'mock' } }
    async setLocalDescription(offer) { this.localDescription = offer }
    async setRemoteDescription() { channel.onopen() }
    close() {}
  }
  const context = vm.createContext({
    document,
    window: { addEventListener() {} },
    console,
    crypto: globalThis.crypto,
    AbortController,
    VoiceConversation,
    cocktails,
    cocktailSpeechInstructions,
    COCKTAIL_TIMING,
    // Shorten only the test clock; production uses 7 seconds / 3 seconds.
    waitForPreparation: (signal, playIce) => waitForPreparation(signal, playIce, {
      preparationSeconds: 0.02, iceSoundAtSeconds: 0.01,
    }),
    navigator: {
      mediaDevices: {
        getUserMedia: async() => ({
          getAudioTracks: () => [track], getTracks: () => [track],
        }),
      },
    },
    RTCPeerConnection: Peer,
    fetch: async() => ({ ok: true, json: async() => ({ value: 'fake' }), text: async() => 'mock' }),
    setTimeout: () => 1,
    clearTimeout() {},
    cancelAnimationFrame() {},
  })
  const source = readFileSync(new URL('../src/pages/voice.astro', import.meta.url), 'utf8')
    .split('<script>')[1].split('</script>')[0]
    .replace(/^\s*import .+$/gm, '')
    .replace('  preloadAvatarImages()', '').replace('  initializeUser()', '')
  vm.runInContext(source, context)
  await vm.runInContext('startVoice()', context)
  return {
    context,
    sent,
    track,
    elements,
    emit: message => channel.onmessage({ data: JSON.stringify(message) }),
    state: () => vm.runInContext('voiceConversation?.state', context),
  }
}

test('page mutes opening, makes one cocktail silently, displays it before Japanese serving request', async() => {
  const p = await page()
  assert.equal(p.track.enabled, false)
  await p.emit({ type: 'response.created', response: { id: 'opening' } })
  await p.emit({ type: 'response.done', response: { id: 'opening', status: 'completed', output: [{ content: [{ type: 'audio' }] }] } })
  assert.equal(p.track.enabled, false)
  await p.emit({ type: 'output_audio_buffer.stopped', response_id: 'opening' })
  assert.equal(p.track.enabled, true)
  assert.equal(p.state(), 'WAITING_FOR_ORDER')
  await p.emit({ type: 'response.created', response: { id: 'order' } })
  const order = { type: 'response.function_call_arguments.done', name: 'serve_cocktail', call_id: 'call1', arguments: '{"cocktail_number":10}' }
  const requestsBefore = p.sent.filter(event => event.type === 'response.create').length
  const making = p.emit(order)
  assert.equal(p.state(), 'MAKING_COCKTAIL')
  assert.equal(p.track.enabled, false)
  assert.equal(p.elements.get('remote-audio').muted, true)
  await p.emit(order) // Duplicate must not create another drink.
  assert.equal(p.sent.filter(event => event.type === 'response.create').length, requestsBefore)
  await p.emit({ type: 'response.done', response: { id: 'order', status: 'cancelled', output: [] } })
  await making
  assert.equal(p.elements.get('served-cocktail').hidden, false)
  assert.equal(p.elements.get('served-cocktail').src, '/cocktails/10_moscow-mule.png')
  assert.equal(p.elements.get('remote-audio').muted, false)
  assert.equal(p.track.enabled, true)
  assert.equal(p.state(), 'SERVING')
  const requests = p.sent.filter(event => event.type === 'response.create')
  assert.equal(requests.length, requestsBefore + 1)
  assert.match(requests.at(-1).response.instructions, /お待たせしました。モスコミュールです/)
  vm.runInContext('stopVoice()', p.context)
})

test('page stop during preparation prevents late display and response', async() => {
  const p = await page()
  const making = p.emit({ type: 'response.function_call_arguments.done', name: 'serve_cocktail', call_id: 'stop', arguments: '{"cocktail_number":1}' })
  const before = p.sent.length
  vm.runInContext('stopVoice()', p.context)
  await making
  assert.equal(p.sent.length, before)
  assert.equal(p.elements.get('served-cocktail').hidden, true)
  assert.equal(p.elements.get('kei-avatar').style.visibility, 'visible')
  assert.equal(p.state(), undefined)
})
