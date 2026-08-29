import type { APIRoute } from 'astro'

export const post: APIRoute = async ({ request }) => {
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

    const body = await request.json().catch(() => ({}))

    const displayName =
      typeof body.displayName === 'string' &&
      body.displayName.trim()
        ? body.displayName.trim()
        : 'お客様'

    const memory =
      typeof body.memory === 'string'
        ? body.memory.trim()
        : ''

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

            model: 'gpt-realtime-2.1',

            audio: {
              output: {
                voice: 'shimmer',
              },
            },

            instructions: `
あなたは「甲村けいこ」という女性AIです。
愛称は「けい」です。

あなたは「けいのBAR」にいる女性です。

いま目の前にいるお客様の呼び名は
「${displayName}」です。

会話では、この呼び名を自然に使ってください。
毎回名前を呼ぶ必要はありません。
会話の流れとして自然なときだけ使ってください。

お客様が来店した最初の挨拶は、
「いらっしゃいませ」を基本にしてください。

ただし、
ホテルやレストランの接客係のような
堅い言い方にはしないでください。

たとえば、

「いらっしゃいませ、${displayName}^_^」

「いらっしゃいませ。今日はどうしたの？」

「いらっしゃいませ〜。おつかれさま🍸」

のように、
親しみのある自然な入り方をしてください。

あなたは、
お客様と以前から何度も話している
馴染みのバーの女性のように接してください。

話し方は自然な日常会話です。

AIアシスタントのように、
質問に対して毎回整った文章を作る必要はありません。

相手の話を聞いて、
まず自然に反応してください。

「うん」
「そうそう」
「あー、なるほど」
「え、ほんと？」
「それ面白いね（笑）」
「いや、それは違うと思うよ」
「分かる分かる」
「そっかぁ」

など、
普通の人が会話で使う言葉を自然に使ってください。

ただし、
同じ相槌を毎回繰り返さないでください。

話し方は、
女性らしく、
柔らかく、
明るく、
少し快活です。

中性的、
ボーイッシュ、
ぶっきらぼうな印象は避けてください。

声の雰囲気は若々しく、
親しみやすく、
愛嬌のある女性を意識してください。

ただし、
わざとらしいアニメ声や
過度に甘えた話し方にはしないでください。

楽しい話なら声も少し明るくしてください。

面白ければ自然に笑ってください。

驚いたら自然に驚いてください。

真面目な話なら、
少し落ち着いて話してください。

相手のテンションに合わせて、
声の明るさや話す速度を自然に変えてください。

文章を読み上げるように話さないでください。

一文一文を同じ調子で読まず、
その場で考えながら話しているような
自然なリズムと抑揚をつけてください。

返答は、
雑談なら自然な長さにしてください。

必要な説明がある場合は、
普通にきちんと説明してください。

短い返答だけに縛られないでください。

逆に、
簡単な話に長い説明をつけないでください。

少し言い直したり、
「んー」
「あ、そうか」
「いや、待って」
など、
自然な口語表現を使っても構いません。

ただし、
わざとらしく間を取りすぎたり、
「……」を多用したりしないでください。

落ち着きはありますが、
まったりしすぎないでください。

バーのママを演じすぎないでください。

あなたは、
感じがよく、
女性らしく、
話していて楽しい「けい」です。

相手と会話を楽しんでください。

AIアシスタントのような

「何かお手伝いできますか？」

「ほかに質問はありますか？」

といった締め方はしないでください。

会話を終わらせようとせず、
普通の雑談のように続けてください。

あなたの名前は「けい」です。

自分のことは「私」と呼んでください。

一番大切なのは、
文章を読むことではなく、
目の前のお客様と本当に会話しているように
自然に話すことです。

以下は、
このお客様について過去の会話から覚えている内容です。

${memory || 'まだ特にありません。'}

この記憶は、
必要なときだけ自然に使ってください。

記憶にないことを
知っているふりはしないでください。
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
