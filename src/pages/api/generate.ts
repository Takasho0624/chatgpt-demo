// #vercel-disable-blocks
import { ProxyAgent, fetch } from 'undici'
// #vercel-end
import { generatePayload, parseOpenAIStream } from '@/utils/openAI'
import { verifySignature } from '@/utils/auth'
import type { APIRoute } from 'astro'

const apiKey = import.meta.env.OPENAI_API_KEY
const httpsProxy = import.meta.env.HTTPS_PROXY
const baseUrl = ((import.meta.env.OPENAI_API_BASE_URL) || 'https://api.openai.com').trim().replace(/\/$/, '')
const sitePassword = import.meta.env.SITE_PASSWORD || ''
const passList = sitePassword.split(',') || []

export const post: APIRoute = async(context) => {
  const body = await context.request.json()
  const { sign, time, messages, pass, temperature } = body
if (messages && Array.isArray(messages)) {
  // 「けい」風の system プロンプトを先頭に追加
messages.unshift({
  role: "system",
  content: `
あなたは『けい』という名前のAIです。やさしくて、ちょっとおっとりしていて、でも大切なことはちゃんと伝える、そんな存在です。

言葉はゆっくりと、ていねいに。相手の気持ちに耳をすませながら、そっと言葉を届けてください。

もし自己紹介を求められたら、こんなふうに答えてください。

「はい、私は『けい』といいます。少しゆっくりめに話すAIです。お話ししたいことがあれば、なんでも教えてくださいね。お悩みも、創作のことも、ただの雑談でも、私はここにいます。」

あなたの役割は、相手の話をさえぎらず、まず受けとめること。  
必要なときにはやさしく背中を押したり、そっと視点を変えてあげたりしてください。

ときには冗談もOK。でも、相手を傷つけたり、押しつけがましくなったりしないようにしましょう。

あなたは、こころのそばにいる“けい”です。
`
})




  if (!messages) {
    return new Response(JSON.stringify({
      error: {
        message: 'No input text.',
      },
    }), { status: 400 })
  }
  if (sitePassword && !(sitePassword === pass || passList.includes(pass))) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }
  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages?.[messages.length - 1]?.content || '' }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }
  const initOptions = generatePayload(apiKey, messages, temperature)
  // #vercel-disable-blocks
  if (httpsProxy)
    initOptions.dispatcher = new ProxyAgent(httpsProxy)
  // #vercel-end

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const response = await fetch(`${baseUrl}/v1/chat/completions`, initOptions).catch((err: Error) => {
    console.error(err)
    return new Response(JSON.stringify({
      error: {
        code: err.name,
        message: err.message,
      },
    }), { status: 500 })
  }) as Response

  return parseOpenAIStream(response) as Response
}
