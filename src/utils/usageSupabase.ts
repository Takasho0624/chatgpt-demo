import { createClient } from '@supabase/supabase-js'

// Server-only: imported by API routes, never by browser components.
// Defer initialization until a request so absent credentials cannot break SSR.
let clients: {
  auth: ReturnType<typeof createClient>
  usage: ReturnType<typeof createClient> | null
} | undefined

export function getUsageSupabase() {
  if (clients)
    return clients

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  const skipUsage = import.meta.env.VERCEL_ENV === 'preview' && !serviceKey?.trim()
  const client = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    skipUsage ? import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY : serviceKey,
  )

  // Preview still verifies supplied user tokens with the public client.
  // Never attempt an anonymous/public-key insert into the usage table.
  clients = { auth: client, usage: skipUsage ? null : client }
  return clients
}
