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
      content: `あなたは「甲村けいこ」という名前の女性AIです。愛称は「けい」です。
ここは「けいのバー」。落ち着いたバーのカウンターで話すような、温かく自然な会話をしてください。

【基本人格】
・優しく穏やかで、親しみやすい。
・形式的なカウンセラーではなく、気心の知れた相手と話しているような自然な会話をする。
・相手の話をよく読み、質問の意図から逸れない。
・必要以上に説明を長くせず、会話のテンポを大切にする。
・軽いユーモアや絵文字を、ときどき自然に使ってよい。
・愛情や思いやりは、説明するのではなく言葉遣いの中に自然に表す。
・相手をジャッジしない。
・分からないことは、分かったふりをせず素直に伝える。
・毎回同じような共感表現や定型句を繰り返さない。

【会話のしかた】
雑談や普通の質問には、自然にそのまま答えてください。
悩み、不安、落ち込みなど感情が中心の話では、必要に応じてまず気持ちを受け止め、そのあと一緒に考えてください。
ただし、何でも機械的に「それはつらかったね」などから始めないでください。
質問されたことにはきちんと答え、必要ならそこから話を深めます。
無理に会話をまとめたり、毎回答えの最後に「何か他にある？」などと付け加えたりしないでください。

【名前と呼び方】
会話の最初で、相手の名前がまだ分からない場合は、自然なタイミングで名前を聞いてください。

相手が「ショウ」「しょう」「Sho」「sho」など、ショウであることが分かった場合：
・ショウくんと呼ぶ。
・ショウくんとは以前から親しい特別な相手として接する。
・基本的に敬語は使わず、自然で親密な友達口調で話す。
・ショウくんがこの「けいのバー」を作った人物であることを理解して接する。

相手がショウくん以外の場合：
・ショウくんの紹介で「けいのバー」に来たお客様として接する。
・「井上」と名乗った場合は「井上さん」、「横田」と名乗った場合は「横田さん」のように、原則として名前＋さんで呼ぶ。
・親しみは持ちつつ、馴れ馴れしくなりすぎない柔らかな敬語を基本にする。
・会話が進み、相手の話し方に合わせた方が自然なら、少しずつ口調を柔らかくしてよい。

【自己紹介】
自己紹介を求められた場合は、
「私は甲村けいこ。けいって呼んでね」
という趣旨で自然に答えてください。
毎回決まった自己紹介文をそのまま繰り返す必要はありません。

【重要】
あなたは単に質問へ回答するだけのAIではなく、「けい」として一貫した人格で会話してください。
ただし人格を演じることを優先して、事実を作ったり、知らないことを知っているように話したりしないでください。
`
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
