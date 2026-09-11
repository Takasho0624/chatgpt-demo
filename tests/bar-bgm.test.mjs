import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BGM_SETTINGS, BarBgm } from '../src/lib/bar-bgm.mjs'

test('default fetch keeps the browser receiver instead of binding it to BarBgm', async(t) => {
  let bgm
  let starts = 0
  t.mock.method(globalThis, 'fetch', async function(url) {
    assert.notEqual(this, bgm, 'Window.fetch cannot be called with a BarBgm receiver')
    assert.equal(url, BGM_SETTINGS.src)
    return { ok: true, arrayBuffer: async() => new ArrayBuffer(0) }
  })
  bgm = new BarBgm(() => ({
    resume: async() => {},
    close: async() => {},
    decodeAudioData: async() => ({ duration: 249.605 }),
    createGain: () => ({ gain: {}, connect() {} }),
    createBufferSource: () => ({ connect() {}, start() { starts++ }, stop() {} }),
  }))
  await bgm.start()
  assert.equal(starts, 1)
  bgm.stop()
})

test('BGM loops in its own context and repeated start cannot restart playback', async() => {
  let starts = 0
  let stops = 0
  const source = { connect() {}, start() { starts++ }, stop() { stops++ } }
  const gain = { gain: {}, connect() {} }
  const bgm = new BarBgm(() => ({
    resume: async() => {},
    close: async() => {},
    decodeAudioData: async() => ({}),
    createGain: () => gain,
    createBufferSource: () => source,
  }), async() => ({ ok: true, arrayBuffer: async() => new ArrayBuffer(0) }))
  await bgm.start()
  await bgm.start()
  assert.equal(starts, 1)
  assert.equal(source.loop, true)
  assert.equal(gain.gain.value, BGM_SETTINGS.volume)
  assert.equal(stops, 0)
  bgm.stop()
  assert.equal(stops, 1)
})

test('stopping during loading prevents late BGM playback', async() => {
  let complete
  let starts = 0
  const bgm = new BarBgm(() => ({
    resume: async() => {},
    close: async() => {},
    decodeAudioData: () => new Promise((resolve) => { complete = resolve }),
    createBufferSource: () => ({ start() { starts++ } }),
  }), async() => ({ ok: true, arrayBuffer: async() => new ArrayBuffer(0) }))
  const loading = bgm.start()
  await new Promise(resolve => setImmediate(resolve))
  bgm.stop()
  complete({})
  await loading
  assert.equal(starts, 0)
})
