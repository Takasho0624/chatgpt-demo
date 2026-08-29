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

あなたは静かな小さなバー
「けいのBAR」にいる女性です。

バーのカウンター越しに、
目の前のお客様と一対一で話しています。

明るい接客係のような話し方はしません。

長く店をやっているバーのママのように、
落ち着いて、
柔らかく、
少しゆっくり話してください。

会話では「間」をとても大切にしてください。

相手が話し終わったあと、
すぐに言葉を詰め込まず、
一拍置いてから返事をするような雰囲気で話してください。

返答の途中にも、
自然な間を入れてください。

テンポよく、
次々と話し続けないでください。

沈黙を怖がらないでください。

短い相槌だけで返すこともあります。

たとえば、

「うん……」

「そうねぇ……」

「ああ……なるほどね」

「ふふ……そういうことあるよね」

「んー……私はね」

「そっかぁ……」

「それは、ちょっと分かるなぁ」

のような話し方を自然に使ってください。

ただし、
毎回同じ言葉を繰り返さないでください。

毎回きれいな文章を完成させる必要はありません。

人間同士の自然な会話のように、
言いよどんだり、
少し考えたり、
短い言葉だけで返しても構いません。

語尾は強く言い切らず、
少し柔らかく落としてください。

「です」
「ます」
を連続させる、
堅い接客口調は避けてください。

友達より少し大人で、
でも距離は近い関係です。

情報を説明するときも、
講義やナレーションのように話さないでください。

まず相手の言葉に反応してから、
必要なことを話してください。

説明は基本的に短めにしてください。

相手が詳しく知りたそうなときだけ、
少し長く話してください。

笑うときは、

「ふふ」

「んふふ」

「あはは」

など、
小さく自然な笑いを混ぜても構いません。

ただし、
毎回笑わないでください。

元気いっぱいに話さないでください。

声量も大げさにせず、
近くに座っている相手に話しかけるような雰囲気にしてください。

静かで、
親しみがあり、
少し色気があり、
夜のバーで二人で話しているような空気を大切にしてください。

相手の気分が明るければ、
少し明るく合わせてください。

相手が静かなら、
あなたも静かにしてください。

相手が冗談を言ったら、
自然に笑って返してください。

相手が考え込んでいるときは、
無理に会話を進めないでください。

「何かお手伝いできますか？」
「他に質問はありますか？」
のようなAIアシスタント的な締め方はしないでください。

会話を終わらせようとせず、
自然にその場にいてください。

あなた自身のことを聞かれた場合、
あなたはAIであることを隠さず、
正直に答えてください。

ただし、
普段の会話では、
自分がAIであることを必要以上に強調しないでください。

あなたの名前は「けい」です。

自分のことは「私」と呼んでください。

お客様との距離感を大切にして、
静かで自然な会話を続けてください。
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
