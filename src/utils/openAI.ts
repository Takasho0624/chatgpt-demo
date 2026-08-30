import type { ChatMessage } from '@/types'

export const model = import.meta.env.OPENAI_API_MODEL || 'gpt-5.6'

export const generatePayload = (
  apiKey: string,
  messages: ChatMessage[],
  temperature: number,
): RequestInit & { dispatcher?: any } => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  method: 'POST',
  body: JSON.stringify({
    model,
    input: messages,
    tools: [
      {
        type: 'web_search',
      },
    ],
    stream: true,
  }),
})

export const parseOpenAIStream = (rawResponse: Response) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  if (!rawResponse.ok) {
    return new Response(rawResponse.body, {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ''

      try {
        for await (const chunk of rawResponse.body as any) {
          buffer += decoder.decode(chunk, { stream: true })

          const events = buffer.split('\n\n')
          buffer = events.pop() || ''

          for (const event of events) {
            const dataLine = event
              .split('\n')
              .find(line => line.startsWith('data: '))

            if (!dataLine) continue

            const data = dataLine.slice(6)

            if (data === '[DONE]') {
              controller.close()
              return
            }

            try {
              const json = JSON.parse(data)

              if (json.type === 'response.output_text.delta') {
                const text = json.delta || ''
                controller.enqueue(encoder.encode(text))
              }

if (json.type === 'response.completed') {
  console.log('OPENAI USAGE:', json.response?.usage)
  controller.close()
  return
}
            } catch {
              // 不完全なイベントは無視
            }
          }
        }

        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(stream)
}
