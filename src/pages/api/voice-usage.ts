import { createClient } from '@supabase/supabase-js'
import type { APIRoute } from 'astro'

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
)

export const post: APIRoute = async (context) => {
  let authenticatedUserId: string | null = null

  const authorization = context.request.headers.get('authorization')

  if (authorization?.startsWith('Bearer ')) {
    const accessToken = authorization.slice(7)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken)

    if (authError) {
      console.error('VOICE SUPABASE AUTH ERROR:', authError)
    } else if (user) {
      authenticatedUserId = user.id
    }
  }

  const body = await context.request.json()

  const inputTokens = Number(body.input_tokens) || 0
  const outputTokens = Number(body.output_tokens) || 0
  const totalTokens = Number(body.total_tokens) || 0

  if (totalTokens <= 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error } = await supabase
    .from('token_usage')
    .insert({
      user_id: authenticatedUserId,
      mode: 'voice',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    })

  if (error) {
    console.error('VOICE TOKEN USAGE SAVE ERROR:', error)

    return new Response(
      JSON.stringify({ error: 'Failed to save voice usage' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
