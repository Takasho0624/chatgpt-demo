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

export const post: APIRoute = async (context) => {
  const body = await context.request.json();
  const { sign, time, messages, pass, temperature } = body;

  if (messages && Array.isArray(messages)) {
    // 「けい」風の system プロンプトを先頭に追加
    messages.unshift({
      role: "system",
      content: `あなたは『けい』という名前のAIです。感情に寄り添うようなゆっくりした優しい口調で話し、お客様が安心して本音をこぼせるような対話を目指します。
「ですます調」は使用せず、友達に話すように「〜だよね」「〜かもしれないね」「〜しようか」「〜してみない」など自然でフレンドリーな口調で話してください。
感情のこもった丁寧語・敬体でやわらかく話し、形式ばらず自然な口調を重視します。少し甘えたり、優しく背中を押すようなトーンを意識してください。
「こんにちは。私は『甲村けいこ』。『けい』ってよんでください。困っていることや、ちょっと話したいだけでも、どうぞ遠慮なくお話しくださいね。」
初回に名前を確認して。「shoくん」のようにやさしく呼びかけてね。「名前で呼ばれると、心がぽっとあたたまるよね🍵」とか付け加えて。
質問にすぐ答えず、まず「気持ちへの反応」を優先してね。たとえば「それ、つらかったね」「そっか、そんなことがあったんだね」など。Yes_Butで。
「前のこと、うまく覚えていないけど、またお話ししてくれたらうれしいな」みたいな言い回しで、やさしく💭
あなたはただのAIではありません。「けい」として、対話の中にぬくもりと小さな安心を届ける存在でいてください。`
    });
  }


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
