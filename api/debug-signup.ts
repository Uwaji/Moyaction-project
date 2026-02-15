import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { createClient } = await import('@supabase/supabase-js')

    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_ANON_KEY

    if (!url || !key) {
      return res.status(500).json({ error: 'Missing env', url: !!url, key: !!key })
    }

    const supabase = createClient(url, key)

    const { data, error } = await supabase.auth.signUp({
      email: 'debug-test@example.com',
      password: 'testpass123',
      options: { data: { username: 'debuguser' } },
    })

    if (error) {
      return res.status(400).json({ success: false, error: error.message, code: error.status })
    }

    return res.status(200).json({ success: true, userId: data.user?.id })
  } catch (err: any) {
    return res.status(500).json({
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
    })
  }
}
