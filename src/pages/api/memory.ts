import type { APIRoute } from 'astro'
import { verifySignature } from '@/utils/auth'

const apiKey = import.meta.env.OPENAI_API_KEY
const baseUrl = (
  import.meta.env.OPENAI_API_BASE_URL
  || 'https://api.openai.com'
).trim().replace(/\/$/, '')

const model
  = import.meta.env.OPENAI_API_MODEL
  || 'gpt-5-mini'

export const post: APIRoute = async(context) => {
  try {
    const body = await context.request.json()

    const {
      sign,
      time,
      latestMessage,
      currentMemory,
      recentMessages,
    } = body

    if (!latestMessage) {
      return new Response(JSON.stringify({
        error: 'No latest message.',
      }), {
        status: 400,
      })
    }

    if (
      import.meta.env.PROD
      && !await verifySignature({
        t: time,
        m: latestMessage,
      }, sign)
    ) {
      return new Response(JSON.stringify({
        error: 'Invalid signature.',
      }), {
        status: 401,
      })
    }

    const memoryPrompt = `
あなたは「けいのBAR」の長期記憶を整理する係です。

以下の会話から、
次回以降も覚えておく価値のある情報だけを抽出し、
既存の記憶と統合してください。

【覚えてよいもの】
・本人が希望した呼び名
・本人が明示したプロフィール
・好きなもの、嫌いなもの、趣味
・仕事や活動について継続的に役立つ情報
・家族や友人など、今後の会話で重要になりそうな人物
・過去の重要な出来事
・本人が「覚えておいて」と言ったこと
・今後また話題になりそうな計画や関心
・会話上、長期間覚えておくと自然な情報

【覚えないもの】
・単なる挨拶
・一時的な雑談
・その場だけの質問
・AI側が推測した情報
・本人が明言していない事実

【重要】
事実を作らないでください。
分からないことを補完しないでください。
既存の記憶を不用意に消さず、新しい情報と矛盾する場合のみ更新してください。
呼び名が変更された場合は、新しい呼び名を優先してください。

出力は説明文ではなく、
けいが次回読むための簡潔な記憶メモだけにしてください。

【現在の記憶】
${currentMemory || 'まだありません'}

【最近の会話】
${JSON.stringify(recentMessages || [], null, 2)}

【最新のユーザー発言】
${latestMessage}
`.trim()

    const response = await fetch(
      `${baseUrl}/v1/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: memoryPrompt,
          store: false,
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()

      console.error('Memory API error:', errorText)

      return new Response(JSON.stringify({
        error: errorText,
      }), {
        status: response.status,
      })
    }

    const data: any = await response.json()

    let memory = ''

    if (typeof data.output_text === 'string') {
      memory = data.output_text
    }
    else if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content))
          continue

        for (const content of item.content) {
          if (content.type === 'output_text' && content.text)
            memory += content.text
        }
      }
    }

    return new Response(JSON.stringify({
      memory: memory.trim(),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
  catch (err) {
    console.error(err)

    return new Response(JSON.stringify({
      error: 'Failed to update memory.',
    }), {
      status: 500,
    })
  }
}
