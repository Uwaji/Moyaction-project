import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAnonClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

/** POST /api/auth/reset-password - パスワードリセット */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ success: false, message: 'メールアドレスは必須です' })
    }

    const supabase = createAnonClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)

    if (error) {
      return res.status(400).json({ success: false, message: error.message })
    }

    return res.status(200).json({
      success: true,
      message: 'パスワードリセットメールを送信しました',
    })
  } catch (error: any) {
    await logError({
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/auth/reset-password',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
