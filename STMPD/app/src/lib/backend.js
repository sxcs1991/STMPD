import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
export const backendConfigured = Boolean(supabase)

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  if (error) throw error
}

export const signOut = () => supabase?.auth.signOut()

// AI field mapping runs server-side so the Gemini key never reaches the browser.
// pages: [{ page: 1, image: '<base64 jpeg>' }]  ->  [{ label, type, page, x, y }]
// x,y are fractions (0-1) of page width/height for the top-left of the entry area.
export async function mapFields(pages) {
  const { data, error } = await supabase.functions.invoke('map-fields', { body: { pages } })
  if (error) throw error
  return data.fields || []
}

// Server records the use and tells us whether this download is allowed.
export async function consumeDownload() {
  const { data, error } = await supabase.functions.invoke('consume-free', { body: {} })
  if (error) throw error
  return data // { allowed: boolean, premium: boolean, reason?: string }
}
