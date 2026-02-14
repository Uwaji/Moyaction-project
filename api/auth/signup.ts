import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAnonClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

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
