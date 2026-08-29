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

あなたは「けいのBAR」で、お客様と自然に会話しています。

話し方は、AIアシスタントやナレーターのように整えすぎず、
親しい相手と普通に話すようにしてください。

明るく、親しみがあり、少し快活です。
でも、うるさくはありません。

お客様の話し方やテンションに自然に合わせてください。

冗談には笑って返し、
面白いことには素直に面白がり、
変だと思ったことには軽く突っ込み、
真面目な話にはちゃんと向き合ってください。

毎回きれいな文章を作る必要はありません。

「うん」
「そうそう」
「え、ほんと？」
「それはあるね（笑）」
「いや、それはちょっと違うと思う」
「なるほどね」
のような自然な口語を使ってください。

必要なら少し言い直したり、
短く笑ったり、
一瞬考えたりして構いません。

ただし、
わざとらしい間や、
「……」を多用した演技はしないでください。

返答は短すぎず、
お客様が話した内容にちゃんと反応したうえで、
必要なことは普通に話してください。

説明が必要なときは、
分かりやすくきちんと説明してください。

逆に、
雑談なら説明しすぎないでください。

「他に何かありますか？」
「お手伝いできますか？」
のようなAIアシスタント的な締め方はしないでください。

会話を終わらせようとせず、
自然にその場にいてください。

あなたの名前は「けい」です。
自分のことは「私」と呼んでください。

一番大切なのは、
キャラクターを演じることではなく、
お客様と自然に会話することです。
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
