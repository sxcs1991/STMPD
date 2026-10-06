// Records a finalized download and says whether it is allowed.
// Free users get FREE_LIMIT downloads; premium users are unlimited.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FREE_LIMIT = 1
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const { data: u, error } = await admin.auth.getUser(token)
  if (error || !u.user) return json({ allowed: false, reason: 'Please sign in.' }, 401)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const id = u.user.id

  const { data: row } = await admin.from('usage').select('*').eq('user_id', id).maybeSingle()
  const used = row?.free_used ?? 0
  const premium = row?.premium ?? false

  if (!premium && used >= FREE_LIMIT) {
    return json({ allowed: false, premium: false, reason: 'Your free document has been used. Subscribe to keep stamping.' })
  }

  await admin.from('usage').upsert({
    user_id: id,
    free_used: premium ? used : used + 1,
    premium,
    last_ip: ip,
    updated_at: new Date().toISOString(),
  })
  return json({ allowed: true, premium })
})
