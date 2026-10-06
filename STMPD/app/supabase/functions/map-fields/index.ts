// Sends page images to Gemini and returns detected entry areas as 0-1 fractions.
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default below).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash'
const PROMPT = `You are given one page of a form. Find every place a person must write something
(name, date, account number, amount, checkbox-like boxes, signature line).
Return JSON: {"fields":[{"label":string,"x":number,"y":number}]} where x,y are the
top-left of the empty entry area as fractions (0-1) of page width/height. Use the
label text printed next to the field. Do not invent fields.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { pages } = await req.json()
    if (!Array.isArray(pages) || pages.length > 10) throw new Error('bad request')
    const out: unknown[] = []
    for (const p of pages) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: p.image } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0 },
          }),
        },
      )
      if (!r.ok) throw new Error('Gemini error ' + r.status)
      const j = await r.json()
      const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '{"fields":[]}'
      const parsed = JSON.parse(text)
      for (const f of parsed.fields || []) {
        if (typeof f.x === 'number' && typeof f.y === 'number') {
          out.push({ label: String(f.label || 'Field').slice(0, 60), page: p.page, x: f.x, y: f.y })
        }
      }
    }
    return new Response(JSON.stringify({ fields: out }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
