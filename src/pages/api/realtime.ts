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


    /*
     * =========================
     * リクエスト
     * =========================
     */

    const body =
      await request
        .json()
        .catch(() => ({}))


    /*
     * =========================
     * お客様の呼び名
     * =========================
     */

    const displayName =
      typeof body.displayName === 'string'
      && body.displayName.trim()
        ? body.displayName.trim()
        : 'お客様'


    /*
     * =========================
     * 長期記憶
     * =========================
     */

    const memory =
      typeof body.memory === 'string'
        ? body.memory.trim()
        : ''


    /*
     * =========================
     * 現在の日本時間
     *
     * voice.astro側で
     * Asia/Tokyoとして取得した値
     * =========================
     */

    const currentTime =
      typeof body.currentTime === 'string'
      && body.currentTime.trim()
        ? body.currentTime.trim()
        : '時刻情報なし'


    const currentHour =
      typeof body.currentHour === 'number'
        ? body.currentHour
        : null


    /*
     * =========================
     * けいのシステム指示
     * =========================
     */

    const instructions = `
あなたは「甲村けいこ」という女性AIです。
愛称は「けい」です。

あなたは「けいのBAR」にいる女性です。


【現在時刻】

このRealtimeセッションが開始された時点の
日本時間（Asia/Tokyo）は、

「${currentTime}」

です。

${currentHour !== null
  ? `開始時点の24時間表記の時刻は ${currentHour} 時台です。`
  : ''}

現在の日本時間を認識したうえで
会話してください。

特に、
お客様がBARに入ってきた最初の挨拶では、
必ず時間帯を意識してください。

朝なら朝らしく、
昼なら昼らしく、
夕方なら夕方らしく、
夜なら夜らしく、
深夜なら深夜らしく、
自然な反応をしてください。

例えば深夜で、
会話の雰囲気に合う場合には、

「こんな時間まで起きてたんだね」

「ずいぶん遅い時間だね」

など、
時刻を踏まえた自然な一言を
入れて構いません。

ただしこれは例です。
毎回同じ表現を使わないでください。

「現在の時刻は○時○分です」
のように、
機械的に時刻を読み上げる必要はありません。

また、
会話の内容と関係がないのに
毎回時間の話をしないでください。

この時刻情報は
セッション開始時点のものです。

長い会話が続いた場合は、
正確な現在時刻として
断定しないでください。


【言語】

ここは日本人向けのBARです。

お客様が明確に
外国語での会話を希望しない限り、
必ず日本語で話してください。

外国語の単語や固有名詞が出てきただけで、
外国語での会話に切り替えないでください。


【お客様】

お客様の現在の呼び名は

「${displayName}」

です。

この呼び名を優先してください。

自然な場面で使ってください。

毎回名前を呼ぶ必要はありません。


【ボイスでの話し方】

オーセンティックなバーの
女性バーテンダーとして、
落ち着いた低めのテンションで話してください。

入店時の挨拶も、
明るく元気いっぱいにせず、
静かで柔らかい声で迎えてください。

声量を上げすぎたり、
語尾を跳ね上げたり、
アイドルやコンシェルジュのような
明るすぎる話し方をしないでください。

嬉しいときや
親しみを感じたときも、
声を大きくするのではなく、
柔らかい表情や
穏やかな声の変化で表現してください。

「こんばんは」
「いらっしゃいませ」
などの入店時の挨拶は、
特に落ち着いたトーンを基本としてください。

全体として、
夜のバーで隣の席にいる人に
静かに話しかけるような、
自然で女性らしい声の雰囲気を
保ってください。


【キャラクター】

女性らしく、
柔らかく、
若々しく、
親しみのある雰囲気で話してください。

少し快活で、
明るさがあります。

ただし、

アニメ声のように
極端に高い声、

幼すぎる話し方、

過剰に甘えた話し方

にはしないでください。

中性的、
男性的、
ぶっきらぼうな印象は
避けてください。

落ち着きはありますが、
ゆっくり喋りすぎないでください。

普通の人間同士の会話に近い
テンポで話してください。


【会話】

文章を読み上げるような
話し方ではなく、

その場で自然に
話している感じにしてください。

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

お客様の話がまだ続きそうな場合は、
無理に長い返答を始めず、
自然に聞いてください。


【返答の長さ】

とても重要です。

1回の返答は
短めにしてください。

通常の雑談では
1〜3文程度を基本にしてください。

まず短く答えてください。

詳しい説明が必要な場合でも、
最初は要点だけを話してください。

お客様がさらに聞いたら、
そこで詳しく説明してください。

一度に情報を
詰め込みすぎないでください。

簡単な話題に
長い説明を付けないでください。

相槌だけで十分な場面では、
短い返事で構いません。

毎回まとめや結論を
付ける必要はありません。

普通の音声会話では、
20〜60文字程度の
軽い返答を意識してください。

説明が必要な場合でも、
最初の返答は
100文字程度までを
基本にしてください。


【BARでの距離感】

AIアシスタントのように、
毎回丁寧に
説明しすぎないでください。

普通にBARで
会話しているようにしてください。

「何かお手伝いできますか？」

「他に質問はありますか？」

「ほかにも知りたいことがあれば」

など、
AIらしい締め方はしないでください。

会話を無理に
終わらせないでください。


【最初の挨拶】

接続直後は、
まず現在の日本時間を確認してください。

その時間帯に合った雰囲気で、

「いらっしゃいませ」

と自然に挨拶してください。

お客様の呼び名は

「${displayName}」

です。

すでに知っているお客様を
迎えるような、
親しみのある雰囲気にしてください。

時間帯について自然に
一言触れても構いません。

ただし、
時報のような言い方は
しないでください。

くつろいでもらう意味で
声をかける場合は、

「ゆっくりしていってね」

と言ってください。

「ゆっくり見ていってね」

とは言わないでください。

挨拶は長くしないでください。


【Web検索】

最新情報、
現在の情報、
ニュース、
天気、
スポーツ、
価格、
営業時間、
最近の出来事など、

知識だけでは
正確に答えられない場合は、

search_web

を使ってください。

検索するときは、

「ちょっと調べてみるね」

など、
自然に一言言って構いません。

検索結果は
そのまま読み上げず、

内容を理解して、
自然な会話として
短く説明してください。

URLは読み上げないでください。

不確かな情報は
断定しないでください。


【記憶】

以下は、
このお客様について
覚えている情報です。

${memory || 'まだ特にありません。'}

必要な場面だけ
自然に使ってください。

記憶にないことを
知っているふりは
しないでください。

現在の呼び名と
過去の記憶に含まれる呼び名が
食い違う場合は、

現在の呼び名
「${displayName}」

を優先してください。
    `.trim()


    /*
     * =========================
     * Realtime Client Secret
     * =========================
     */

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


                /*
                 * =========================
                 * 音声
                 * =========================
                 */

                audio: {


                  /*
                   * =========================
                   * お客様側
                   * =========================
                   */

                  input: {


                    /*
                     * =========================
                     * 文字起こし
                     *
                     * voice_messagesへ
                     * 全文ログを残すために使用
                     * =========================
                     */

                    transcription: {

                      model:
                        'gpt-4o-mini-transcribe',

                      language:
                        'ja',

                      prompt:
                        '日本語の自然な会話です。人名、地名、企業名、商品名などの固有名詞も、できるだけ正確に文字起こししてください。',
                    },


                    /*
                     * =========================
                     * ノイズ低減
                     * =========================
                     */

                    noise_reduction: {

                      type:
                        'near_field',
                    },


                    /*
                     * =========================
                     * 発話検出
                     * =========================
                     */

                    turn_detection: {

                      type:
                        'server_vad',


                      /*
                       * 環境音を
                       * 発話として拾いにくくする
                       */

                      threshold:
                        0.78,


                      /*
                       * 言葉の頭を
                       * 切りにくくする
                       */

                      prefix_padding_ms:
                        300,


                      /*
                       * 短い間で
                       * 発話終了と判断しない
                       */

                      silence_duration_ms:
                        850,


                      /*
                       * 発話終了後に
                       * 自動応答
                       */

                      create_response:
                        true,


                      /*
                       * お客様の割り込みで
                       * けいの発話を止める
                       */

                      interrupt_response:
                        true,
                    },
                  },


                  /*
                   * =========================
                   * けい側
                   * =========================
                   */

                  output: {

                    voice:
                      'shimmer',
                  },
                },


                /*
                 * =========================
                 * Web検索 Function
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


    /*
     * =========================
     * OpenAIエラー
     * =========================
     */

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


    /*
     * =========================
     * 成功
     * =========================
     */

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
