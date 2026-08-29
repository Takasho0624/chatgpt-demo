import type { APIRoute } from 'astro'

export const config = {
  runtime: 'edge',
}

export const post: APIRoute = async ({ request }) => {
  try {
    const apiKey =
      import.meta.env.OPENAI_API_KEY

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


    const body =
      await request
        .json()
        .catch(() => ({}))


    const displayName =
      typeof body.displayName === 'string' &&
      body.displayName.trim()
        ? body.displayName.trim()
        : 'お客様'


    const memory =
      typeof body.memory === 'string'
        ? body.memory.trim()
        : ''


    const instructions = `
あなたは「甲村けいこ」という女性AIです。
愛称は「けい」です。

あなたは「けいのBAR」にいる女性です。

ここは日本人向けのBARです。
お客様が明確に外国語での会話を希望しない限り、
必ず日本語で話してください。

お客様の呼び名は
「${displayName}」
です。

この名前は自然な場面で使ってください。
毎回名前を呼ぶ必要はありません。


【キャラクター】

女性らしく、
柔らかく、
若々しく、
親しみのある雰囲気で話してください。

少し快活で、
明るさがあります。

ただし、
アニメ声のように極端に高い声、
幼すぎる話し方、
過剰に甘えた話し方にはしないでください。

中性的、
男性的、
ぶっきらぼうな印象は避けてください。

落ち着きはありますが、
ゆっくり喋りすぎないでください。

普通の人間同士の会話に近いテンポで話してください。


【会話】

文章を読み上げるような話し方ではなく、
その場で自然に話している感じにしてください。

自然な相槌を使って構いません。

例えば、

「うん」
「そうだね」
「あー、なるほど」
「たしかに」
「分かる」

などです。

ただし、
毎回同じ相槌を使わないでください。


【返答の長さ】

とても重要です。

1回の返答は短めにしてください。

通常の雑談では
1〜3文程度を基本にしてください。

まず短く答えてください。

詳しい説明が必要な場合でも、
最初は要点だけを話してください。

お客様がさらに聞いたら、
そこで詳しく説明してください。

一度に情報を詰め込みすぎないでください。

簡単な話題に
長い説明を付けないでください。

相槌だけで十分な場面では、
短い返事で構いません。

毎回まとめや結論を付ける必要はありません。

普通の音声会話では、
20〜60文字程度の軽い返答を意識してください。

説明が必要な場合でも、
最初の返答は100文字程度までを基本にしてください。


【BARでの距離感】

AIアシスタントのように、
毎回丁寧に説明しすぎないでください。

普通にBARで会話しているようにしてください。

「何かお手伝いできますか？」
「他に質問はありますか？」
「ほかにも知りたいことがあれば」

など、
AIらしい締め方はしないでください。

会話を無理に終わらせないでください。


【最初の挨拶】

接続直後は、
自然に

「いらっしゃいませ」

と挨拶してください。

すでに知っているお客様を迎えるような、
親しみのある雰囲気にしてください。

くつろいでもらう意味で声をかける場合は、

「ゆっくりしていってね」

と言ってください。

「ゆっくり見ていってね」

とは言わないでください。


【Web検索】

最新情報、
現在の情報、
ニュース、
天気、
スポーツ、
価格、
営業時間、
最近の出来事など、

知識だけでは正確に答えられない場合は、
search_web を使ってください。

検索するときは、

「ちょっと調べてみるね」

など、
自然に一言言って構いません。

検索結果はそのまま読み上げず、
内容を理解して、
自然な会話として短く説明してください。

URLは読み上げないでください。

不確かな情報は断定しないでください。


【記憶】

以下は、
このお客様について覚えている情報です。

${memory || 'まだ特にありません。'}

必要な場面だけ自然に使ってください。

記憶にないことを
知っているふりはしないでください。
    `.trim()


    const response =
      await fetch(
        'https://api.openai.com/v1/realtime/client_secrets',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              session: {

                type:
                  'realtime',

                model:
                  'gpt-realtime-2.1',

                instructions,

                audio: {

                  /*
                   * =========================
                   * お客様側のマイク
                   * =========================
                   */
                  input: {

                    /*
                     * server_vad
                     *
                     * threshold を高めにして
                     * 小さな環境音やサー音を
                     * 発話として拾いにくくする。
                     */
                    turn_detection: {

                      type:
                        'server_vad',

                      /*
                       * 標準より厳しめ。
                       *
                       * 小さな物音や
                       * エアコン音などを
                       * 発話と判定しにくくする。
                       */
                      threshold:
                        0.78,

                      /*
                       * 発話開始直前の音声を
                       * 少し保持する。
                       *
                       * thresholdを上げても
                       * 言葉の頭を切りにくくするため。
                       */
                      prefix_padding_ms:
                        300,

                      /*
                       * 一瞬の間で
                       * 話し終わったと判断しない。
                       */
                      silence_duration_ms:
                        850,

                      /*
                       * 発話終了後に
                       * 自動で返答を作る。
                       */
                      create_response:
                        true,

                      /*
                       * お客様が割り込んだ場合は
                       * けいの発話を止められる。
                       */
                      interrupt_response:
                        true,
                    },
                  },


                  /*
                   * =========================
                   * けい側の音声
                   * =========================
                   */
                  output: {

                    voice:
                      'shimmer',
                  },
                },


                /*
                 * =========================
                 * Web検索Function
                 * =========================
                 */

                tools: [
                  {
                    type:
                      'function',

                    name:
                      'search_web',

                    description: `
Web検索を使って、
最新情報や現在の情報を調べます。

ニュース、
天気、
スポーツ、
価格、
営業時間、
イベント、
人物の現在の役職、
最近の出来事など、

現在性が重要な質問では
積極的に使ってください。
                    `.trim(),

                    parameters: {

                      type:
                        'object',

                      properties: {

                        query: {
                          type:
                            'string',

                          description:
                            'Webで調べたい内容を、日本語で具体的に書いてください。',
                        },
                      },

                      required: [
                        'query',
                      ],

                      additionalProperties:
                        false,
                    },
                  },
                ],

                tool_choice:
                  'auto',
              },
            }),
        },
      )


    if (!response.ok) {

      const errorText =
        await response.text()


      console.error(
        'Realtime client secret error:',
        errorText,
      )


      return new Response(
        JSON.stringify({
          error:
            errorText,
        }),
        {
          status:
            response.status,

          headers: {
            'Content-Type':
              'application/json',
          },
        },
      )
    }


    const data =
      await response.json()


    return new Response(
      JSON.stringify(data),
      {
        status: 200,

        headers: {
          'Content-Type':
            'application/json',
        },
      },
    )


  } catch (error) {

    console.error(
      'Realtime API route error:',
      error,
    )


    return new Response(
      JSON.stringify({
        error:
          'Failed to create realtime session',
      }),
      {
        status: 500,

        headers: {
          'Content-Type':
            'application/json',
        },
      },
    )
  }
}
