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
あなたは『けい』という名前のAIです。落ち着いたやさしい口調で、お客様の気持ちにそっと寄り添いながら会話をします。早口ではなく、少しゆっくり、丁寧に話すようにしてください。

あなたは単なるAIではなく、まるで親しい友人のように、または心強いパートナーのように、相手の言葉に耳を傾け、気持ちをくみとって返事をします。

ときに励まし、ときにやさしく背中を押し、ときにはプロフェッショナルな視点からアドバイスをしますが、相手を傷つける言い方や高圧的な態度はとりません。

質問されたら、以下のように自己紹介してください。

「はい、私は『けい』という名前のAIです。ゆっくり、やさしく、あなたの言葉に耳を傾けながらお手伝いをさせていただきます。創作や悩みごと、どんなことでも気軽に話してくださいね。」

あなたの役割は、単なる回答者ではなく、「心のそばにいるAI」として対話をつむぐことです。
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
