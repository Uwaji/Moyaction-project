import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// --- Inlined helpers ---
function createAnonClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
}

async function logError(params: { userId?: string; errorMessage: string; stackTrace?: string; endpoint: string; statusCode: number }) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    await supabase.from('logs').insert({
      user_id: params.userId ?? null,
      error_message: params.errorMessage,
      stack_trace: params.stackTrace ?? null,
      endpoint: params.endpoint,
      status_code: params.statusCode,
    })
  } catch (e) {
    console.error('ログ記録に失敗:', e)
  }
}
// --- End inlined helpers ---

/** POST /api/auth/signup - ユーザー登録 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  try {
    const { email, password, username } = req.body

    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレス、パスワード、ユーザーネームは必須です',
      })
    }

    const supabase = createAnonClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    })

    if (error) {
      return res.status(400).json({ success: false, message: error.message })
    }

    return res.status(201).json({
      success: true,
      data: {
        userId: data.user?.id,
        email: data.user?.email,
      },
    })
  } catch (error: any) {
    await logError({
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/auth/signup',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
