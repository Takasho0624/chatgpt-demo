import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VoiceConversation, waitForPreparation } from '../src/lib/voice-conversation.mjs'
import { cocktailSpeechInstructions, cocktails } from '../src/lib/cocktails.mjs'

function setup() {
  const sent = []
  let mic = false
  const flow = new VoiceConversation(message => sent.push(message), (enabled) => { mic = enabled })
  return { flow, sent, mic: () => mic }
}
function created(flow, id) {
  flow.handle({ type: 'response.created', response: { id } })
}
function done(flow, id, audio = true, status = 'completed') {
  flow.handle({
    type: 'response.done',
    response: {
      id,
      status,
      output: audio ? [{ content: [{ type: 'audio' }] }] : [],
    },
  })
}
function drained(flow, id, type = 'output_audio_buffer.stopped') {
  flow.handle({ type, response_id: id })
}

test('opening and menu answers stay muted through generation AND playback', () => {
  const { flow, sent, mic } = setup()
  flow.requestResponse()
  assert.equal(mic(), false)
  created(flow, 'greeting')
  flow.handle({ type: 'input_audio_buffer.speech_started', item_id: 'noise' })
  assert.equal(flow.rejectedInput.has('noise'), true)
  assert.equal(sent.some(event => event.type === 'response.cancel'), false)
  done(flow, 'greeting')
  assert.equal(mic(), false)
  drained(flow, 'greeting')
  assert.equal(flow.state, 'WAITING_FOR_ORDER')
  assert.equal(mic(), true)
  const vad = sent.filter(event => event.type === 'session.update').at(-1).session.audio.input.turn_detection
  assert.equal(vad.interrupt_response, false)
  created(flow, 'menu-answer')
  assert.equal(mic(), false)
  done(flow, 'menu-answer')
  assert.equal(mic(), false)
  drained(flow, 'menu-answer')
  assert.equal(mic(), true)
})

test('text-only and failed responses do not permanently lock the opening', () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    const { flow, mic } = setup()
    flow.requestResponse()
    created(flow, status)
    done(flow, status, false, status)
    assert.equal(mic(), true)
  }
  const { flow, mic } = setup()
  flow.requestResponse()
  flow.handle({ type: 'error', error: { code: 'invalid_request_error' } })
  assert.equal(mic(), true)
})

test('making suppresses input and requests, and cancels late responses', () => {
  const { flow, sent, mic } = setup()
  flow.transition('MAKING_COCKTAIL')
  assert.equal(mic(), false)
  assert.equal(flow.requestResponse(), false)
  created(flow, 'late')
  assert.ok(sent.some(event => event.type === 'response.cancel' && event.response_id === 'late'))
  done(flow, 'late', false, 'cancelled')
  drained(flow, 'late', 'output_audio_buffer.cleared')
  assert.equal(flow.state, 'MAKING_COCKTAIL')
  assert.equal(mic(), false)
})

test('serving and free talk enable server barge-in throughout playback', () => {
  const { flow, sent, mic } = setup()
  flow.transition('SERVING')
  flow.requestResponse()
  created(flow, 'serve')
  flow.handle({ type: 'output_audio_buffer.started', response_id: 'serve' })
  assert.equal(mic(), true)
  assert.equal(flow.canInterrupt, true)
  const vad = sent.filter(event => event.type === 'session.update').at(-1).session.audio.input.turn_detection
  assert.equal(vad.interrupt_response, true)
  assert.equal(vad.create_response, true)
  done(flow, 'serve', true, 'cancelled')
  drained(flow, 'serve', 'output_audio_buffer.cleared')
  assert.equal(flow.state, 'FREE_TALK')
  created(flow, 'reply')
  done(flow, 'reply')
  assert.equal(mic(), true)
  assert.equal(flow.canInterrupt, true)
})

test('late output completion cannot unlock another response', () => {
  const { flow, mic } = setup()
  created(flow, 'old')
  drained(flow, 'old', 'output_audio_buffer.cleared')
  done(flow, 'old')
  created(flow, 'new')
  drained(flow, 'old')
  assert.equal(mic(), false)
  done(flow, 'new')
  assert.equal(mic(), false)
  drained(flow, 'new')
  assert.equal(mic(), true)
})

test('preparation plays SE before serving and still completes after SE failure', async(t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  const events = []
  const waiting = waitForPreparation(controller.signal, () => { events.push('ice'); throw new Error('missing') })
  t.mock.timers.tick(2999)
  await Promise.resolve()
  assert.deepEqual(events, [])
  t.mock.timers.tick(1)
  await Promise.resolve()
  assert.deepEqual(events, ['ice'])
  let completed = false
  waiting.then(() => { completed = true })
  t.mock.timers.tick(3999)
  await Promise.resolve()
  assert.equal(completed, false)
  t.mock.timers.tick(1)
  assert.equal(await waiting, true)
})

test('stop/reconnect aborts preparation, including scheduled SE', async(t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  let sounds = 0
  const waiting = waitForPreparation(controller.signal, () => { sounds++ })
  controller.abort()
  t.mock.timers.tick(10000)
  assert.equal(await waiting, false)
  assert.equal(sounds, 0)
  assert.equal(await waitForPreparation(controller.signal, () => { sounds++ }), false)
})

test('all 12 cocktails have separate display and Japanese speech names', () => {
  assert.equal(Object.keys(cocktails).length, 12)
  for (const cocktail of Object.values(cocktails)) {
    assert.ok(cocktail.displayName)
    assert.match(cocktail.speechName, /^[ァ-ヶー]+$/u)
    assert.ok(cocktailSpeechInstructions.includes(cocktail.speechName))
  }
  assert.equal(cocktails[1].speechName, 'マティーニ')
  assert.equal(cocktails[10].speechName, 'モスコミュール')
})
