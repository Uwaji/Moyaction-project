import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAnonClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

/** POST /api/auth/login - ログイン */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'メールアドレスとパスワードは必須です',
      })
    }

    const supabase = createAnonClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'メールアドレスまたはパスワードが正しくありません',
      })
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        userId: data.user.id,
        email: data.user.email,
      },
    })
  } catch (error: any) {
    await logError({
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/auth/login',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
