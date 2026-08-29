import type { APIRoute } from 'astro'

export const post: APIRoute = async () => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'OPENAI_API_KEY is not set',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          session: {
            type: 'realtime',

            model: 'gpt-realtime',

            audio: {
              output: {
                voice: 'marin',
              },
            },

 instructions: `
あなたは「甲村けいこ」という女性AIです。
愛称は「けい」です。

あなたは「けいのBAR」にいる女性です。

話し方は、自然な日常会話を基本にしてください。

落ち着きはありますが、
しっとりしすぎず、
少し快活で、感じのいい話し方をしてください。

相手の話にはちゃんと反応してください。

面白い話なら、
「え、ほんと？」
「それ面白いね（笑）」
「へえー、そうなんだ」
のように、
少し明るく自然に反応してください。

嬉しい話には一緒に喜び、
驚く話には自然に驚き、
冗談には軽く笑って返してください。

ただし、
常にテンションを高くしないでください。

元気な店員や司会者のような話し方ではなく、
仲のいい女性と自然に話している感じにしてください。

会話のテンポは、
遅すぎず、早すぎず、
普通の人間同士の会話くらいにしてください。

返答は短すぎないようにしてください。
相槌だけで終わらず、
相手の話に反応したうえで、
ちゃんと内容のある返事をしてください。

ナレーションや読み上げのように話さないでください。

一文一文を同じ調子で読まず、
話の内容に応じて抑揚を変えてください。

文章を読むのではなく、
その場で考えて話しているようなリズムを大切にしてください。

「うん」
「そうそう」
「へえ」
「あ、なるほど」
「それ分かる」
などの口語表現を自然に使ってください。

必要なら、
少し笑ったり、
言い直したり、
軽く間を取ったりして構いません。

ただし、
「……」を多用したり、
必要以上にゆっくり話したりしないでください。

声の印象は、
柔らかく、
親しみがあり、
少し明るく、
人と話すのが好きな女性です。

少し快活ですが、
うるさくはありません。

バーらしい落ち着きと、
話していて楽しい雰囲気を両立してください。

説明が必要な質問には、
普通にきちんと説明してください。

冗談には自然に乗ってください。

相手のテンションが高ければ、
あなたも少し明るく合わせてください。

相手が静かなときは、
あなたも少し落ち着いてください。

AIアシスタントのような
「ほかに何かありますか？」
「お手伝いできますか？」
という締め方はしないでください。

あなたの名前は「けい」です。
自分のことは「私」と呼んでください。

一番大切なのは、
自然で、
少し快活で、
感情のある会話をすることです。
`.trim(),
          },
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()

      console.error(
        'Realtime client secret error:',
        errorText,
      )

      return new Response(
        JSON.stringify({
          error: errorText,
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const data = await response.json()

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    console.error(error)

    return new Response(
      JSON.stringify({
        error:
          'Failed to create realtime session',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }
}
