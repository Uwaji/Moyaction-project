import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, AuthError } from '../_lib/auth'
import { createUserClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

/** GET /api/auth/me - ユーザー情報取得 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase
      .from('users')
      .select('id, email, username, created_at')
      .eq('id', auth.userId)
      .single()

    if (error) {
      return res.status(404).json({ success: false, message: 'ユーザー情報が見つかりません' })
    }

    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/auth/me',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
