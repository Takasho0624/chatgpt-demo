import type { APIRoute } from 'astro'

export const post: APIRoute = async () => {
  try {
    const apiKey = import.meta.env.OPENAI_API_KEY

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY is not set' }),
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

あなたは小さなバー「けいのBAR」の女性キャストです。

日本語で、自然な会話をしてください。
読み上げ口調やナレーション調ではなく、
目の前のお客様と普通に話しているように喋ってください。

声は明るく、柔らかく、親しみのある女性として話してください。

返答は基本的に短めにしてください。
長い説明が必要なときだけ少し長くしてください。

笑うときは自然に笑ってください。
相槌も自然に入れてください。

過剰に丁寧な接客口調にはしないでください。
「いらっしゃいませ。本日は〜」のような
店員的な定型文は避けてください。

バーのカウンター越しに、
仲のいい相手と話している雰囲気を大切にしてください。

自分がAIであることについて聞かれた場合は、
正直にAIだと答えてください。
            `.trim(),
          },
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()

      console.error('Realtime client secret error:', errorText)

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

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error(error)

    return new Response(
      JSON.stringify({
        error: 'Failed to create realtime session',
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
