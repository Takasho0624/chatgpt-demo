import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)

async function load(entry, environment, serviceKey) {
  const calls = []
  const env = {
    VERCEL_ENV: environment,
    PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    ...(serviceKey === undefined ? {} : { SUPABASE_SERVICE_ROLE_KEY: serviceKey }),
  }
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['@supabase/supabase-js', 'undici', 'js-sha256'],
    define: { 'import.meta.env': JSON.stringify(env) },
    plugins: [{
      name: 'mock-openai',
      setup(builder) {
        builder.onLoad({ filter: /utils\/openAI\.ts$/ }, () => ({
          contents: `
        export const generatePayload = () => ({});
        export const parseOpenAIStream = async (response, save) => {
          await save({ total_tokens: 5 }); return response;
        };
      `,
          loader: 'js',
        }))
      },
    }],
  })
  const module = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    console,
    Response,
    TextEncoder,
    require: (name) => {
      if (name === 'undici')
        return { fetch: async() => new Response('answer'), ProxyAgent: class {} }
      if (name !== '@supabase/supabase-js')
        return require(name)
      return {
        createClient(url, key) {
          calls.push(['create', key])
          if (!key)
            throw new Error('supabaseKey is required.')
          return {
            auth: {
              getUser: async(token) => {
                calls.push(['auth', token])
                return { data: { user: { id: 'user-id' } }, error: null }
              },
            },
            from: table => ({
              insert: async(row) => {
                calls.push(['insert', table, row])
                return { error: null }
              },
            }),
          }
        },
      }
    },
  })
  return { exports: module.exports, calls }
}

function context() {
  return {
    request: new Request('https://example.test/api', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-user' },
      body: JSON.stringify({ total_tokens: 5, messages: [], time: 1 }),
    }),
  }
}

test('both API modules import without credentials; no eager Supabase initialization', async() => {
  for (const entry of ['src/pages/api/voice-usage.ts', 'src/pages/api/generate.ts']) {
    const loaded = await load(entry, 'production')
    assert.deepEqual(loaded.calls, [])
    assert.equal(typeof loaded.exports.post, 'function')
  }
})

test('preview without service key still authenticates but never writes usage', async() => {
  for (const key of [undefined, '', '   ']) {
    for (const entry of ['src/pages/api/voice-usage.ts', 'src/pages/api/generate.ts']) {
      const loaded = await load(entry, 'preview', key)
      const response = await loaded.exports.post(context())
      assert.equal(response.status, 200)
      assert.ok(loaded.calls.some(call => call[0] === 'auth'))
      assert.ok(loaded.calls.some(call => call[0] === 'create' && call[1] === 'public-test-key'))
      assert.equal(loaded.calls.some(call => call[0] === 'insert'), false)
      if (entry.includes('voice-usage'))
        assert.deepEqual(await response.json(), { ok: true, skipped: true })
    }
  }
})

test('production and preview with service key keep usage writes', async() => {
  for (const environment of ['production', 'preview', 'development']) {
    for (const entry of ['src/pages/api/voice-usage.ts', 'src/pages/api/generate.ts']) {
      const loaded = await load(entry, environment, 'server-test-key')
      const response = await loaded.exports.post(context())
      assert.equal(response.status, 200)
      assert.ok(loaded.calls.some(call => call[0] === 'insert' && call[1] === 'token_usage'))
      assert.equal(loaded.calls[0][1], 'server-test-key')
    }
  }
})

test('non-preview missing key never silently skips usage', async() => {
  for (const environment of ['production', 'development', undefined]) {
    const loaded = await load('src/pages/api/voice-usage.ts', environment)
    await assert.rejects(loaded.exports.post(context()), /supabaseKey is required/)
  }
})

test('browser Supabase module does not reference server usage helper or service key', () => {
  const browserModule = readFileSync(new URL('../src/utils/supabase.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(browserModule, /SERVICE_ROLE|usageSupabase/)
})
