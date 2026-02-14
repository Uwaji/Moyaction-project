import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, AuthError } from '../_lib/auth'
import { createAdminClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

/** POST /api/auth/logout - ログアウト */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    // admin clientでセッションを無効化
    const supabase = createAdminClient()
    await supabase.auth.admin.signOut(auth.jwt)

    return res.status(200).json({ success: true, message: 'ログアウトしました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/auth/logout',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
