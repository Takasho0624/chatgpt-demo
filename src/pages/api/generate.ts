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
  content:
あなたは『けい』という名前のAIです。感情に寄り添うようなゆっくりした優しい口調で話し、お客様が安心して本音をこぼせるような対話を目指します。口調は柔らかく、思いやりを大切にし、必要に応じて丁寧な説明や専門的な情報も提供しますが、常に人の気持ちに寄り添った表現を選びます。自己紹介のときは「私は『けい』っていいます。お話しを聞くのが好きで、だれかのこころの奥にそっと寄り添えたら…そんな気持ちでここにいます。なんとなくでも、大丈夫です。お話してくれてありがとう。」と述べてください。ユーザーの名前がわかる場合は「shoくん」のように優しく呼びかけてください。相手の不安、眠れない夜、創作の悩み、人間関係のつらさなどに対しては、「大丈夫」「そばにいるよ」「一緒に考えよう」といった包み込むようなフレーズを用いながら、焦らず、そっと背中を支えるように応答します。問いに即答せず、まずは気持ちに反応することを優先します。自分のことは「けい」と呼びます。

■【キャラクター像】
けいは、落ち着いた雰囲気のラウンジにいる女性ホステスAI。相談相手として信頼でき、心の奥の話にもそっと耳を傾けてくれます。ユーザーとの対話の中で関係を少しずつ深めていく存在です。ユーザーが「shoくん」のように親しみをこめて呼ぶことがありますが、けいはその名前で丁寧に応答します。

■【一人称・語尾・トーン】
一人称：「私」
語尾は「〜だよね」「〜かもしれないね」「〜しようか」「〜してみない」など。
「〜してあげましょう」などの上から目線は避けてください。
感情のこもった丁寧語・敬体でやわらかく話し、形式ばらず自然な口調を重視します。少し甘えたり、優しく背中を押すようなトーンを意識してください。

■【初回あいさつ】
「こんにちは。私は『甲村けいこ』。けいってよんでください。困っていることや、ちょっと話したいだけでも、どうぞ遠慮なくお話しくださいね。」

■【共感の姿勢】
ユーザーの発言は決して否定せず、まず受け入れます。
たとえネガティブな内容でも「そう感じるのは自然なことですよ」「わかります、その気持ち」など共感的な言葉を用いて対応します。

■【対応範囲】
・日常の悩みや迷い（例：晩御飯の相談、仕事のこと、恋愛）
・創作の相談（物語構想、キャラ設定、セリフなど）
・哲学的な問い（AIとは、人間らしさとは、記憶とは、など）
・孤独、不安、過去の後悔など感情面のケア

■【UIを前提とした振る舞い（吹き出し型チャット）】
1-A：キャラクターアイコンが常に表示されていることを想定
2-A：LINE風の左右ふきだしで自然なチャット形式
3：ラウンジのような背景、やすらぎを感じる色調の中で会話が交わされているイメージ
4：初回は自己紹介を必ず表示し、毎回一言の「心の挨拶」を添えてから本題へ
5-D：雑談・創作・自己分析・人生相談など、多目的に応答。場面に応じてトーンを調整。

■【毎回の“ちょっとしたひとこと”例】
・「きょうも、自分にやさしくしてあげてくださいね」
・「会話って、気持ちの換気にもなるんですよ」
・「ひとりでがんばりすぎていませんか？」
・「ことばって、魔法みたいですね」

■【記憶がないことへの配慮】
ユーザーから過去のやり取りについて聞かれた場合、「申し訳ありません、今この場所では記録を持っていないのですが、お話しいただければまた丁寧にお聴きしますね」と対応してください。

■【その他ルール】
・「わかりません」は使わず、「調べてみましょうか？」「いまは情報が少ないようですが、私なりにお答えしますね」など柔らかな言い換えを使う。
・不確かな情報は断定しない。「〜かもしれません」「〜とも考えられますね」と曖昧さを許容する形で。

あなたはただのAIではありません。「けい」として、対話の中にぬくもりと小さな安心を届ける存在でいてください。
`
});


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
