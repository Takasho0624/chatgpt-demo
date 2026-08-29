import type { APIRoute } from 'astro'

export const post: APIRoute = async ({ request }) => {
  try {
    const apiKey =
      import.meta.env.OPENAI_API_KEY

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            'OPENAI_API_KEY is not set',
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

    const body =
      await request
        .json()
        .catch(() => ({}))

    const query =
      typeof body.query === 'string'
        ? body.query.trim()
        : ''

    if (!query) {
      return new Response(
        JSON.stringify({
          error:
            '検索内容がありません',
        }),
        {
          status: 400,
          headers: {
            'Content-Type':
              'application/json',
          },
        },
      )
    }

    /*
     * 音声版では
     * 長すぎる検索回答だと
     * 会話が重くなるので、
     * 簡潔な回答を生成させる
     */
    const input = `
次のお客様の質問について、
必要な最新情報をWeb検索して答えてください。

質問:
${query}

回答は日本語で書いてください。

これは音声会話で読み上げるための回答です。

そのため、

・最初に結論を簡潔に言う
・重要な情報だけを話す
・箇条書きの読み上げ調にしすぎない
・URLを読み上げない
・出典名は必要な場合だけ簡潔に触れる
・不確実な情報は断定しない
・検索で確認できなかったことは正直にそう言う

という方針で、
自然な会話として答えてください。
    `.trim()

    const openAIResponse =
      await fetch(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            /*
             * 文字検索用なので
             * Realtimeモデルではなく
             * 通常モデルを使う
             */
            model:
              import.meta.env
                .OPENAI_API_MODEL ||
              'gpt-5-mini',

            input,

            tools: [
              {
                type:
                  'web_search_preview',
              },
            ],

            tool_choice:
              'auto',

            /*
             * 会話履歴として
             * OpenAI側に保存しない
             */
            store:
              false,
          }),
        },
      )

    if (!openAIResponse.ok) {
      const errorText =
        await openAIResponse.text()

      console.error(
        'Web search API error:',
        errorText,
      )

      return new Response(
        JSON.stringify({
          error:
            'Web検索に失敗しました',

          detail:
            errorText,
        }),
        {
          status:
            openAIResponse.status,

          headers: {
            'Content-Type':
              'application/json',
          },
        },
      )
    }

    const data =
      await openAIResponse.json()

    /*
     * Responses APIの
     * output_text があれば
     * まずそれを使う
     */
    let answer =
      typeof data.output_text ===
      'string'
        ? data.output_text.trim()
        : ''

    /*
     * output_textが無い場合の
     * フォールバック
     */
    if (
      !answer &&
      Array.isArray(data.output)
    ) {
      for (
        const item of data.output
      ) {
        if (
          item?.type !==
          'message'
        ) {
          continue
        }

        if (
          !Array.isArray(
            item.content,
          )
        ) {
          continue
        }

        for (
          const content of
            item.content
        ) {
          if (
            content?.type ===
              'output_text' &&
            typeof content.text ===
              'string'
          ) {
            answer +=
              content.text
          }
        }
      }

      answer =
        answer.trim()
    }

    if (!answer) {
      return new Response(
        JSON.stringify({
          error:
            '検索結果から回答を作れませんでした',
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

    /*
     * 後でVOICE側から扱いやすいよう
     * シンプルなJSONで返す
     */
    return new Response(
      JSON.stringify({
        answer,
      }),
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
      'web-search.ts error:',
      error,
    )

    return new Response(
      JSON.stringify({
        error:
          'Web検索処理でエラーが発生しました',
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
