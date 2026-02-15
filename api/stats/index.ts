import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// --- Inlined helpers ---
class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authenticateRequest(req: VercelRequest) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) throw new AuthError(401, '認証トークンが必要です')
  const jwt = authHeader.slice(7)
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: { user }, error } = await supabase.auth.getUser(jwt)
  if (error || !user) throw new AuthError(401, '認証トークンが無効です')
  return { userId: user.id, jwt }
}

function createUserClient(jwt: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
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

/** GET /api/stats - ユーザー統計情報取得 API（マイページ用） */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)

    // アクティブなタスク数
    const { count: activeTasksCount, error: e1 } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('archived_at', null)

    // アクティブなモヤモヤ数
    const { count: activeMoorayaCount, error: e2 } = await supabase
      .from('mooraya')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('archived_at', null)

    // アーカイブ済みタスク数
    const { count: archivedTasksCount, error: e3 } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('archived_at', 'is', null)

    // アーカイブ済みモヤモヤ数
    const { count: archivedMoorayaCount, error: e4 } = await supabase
      .from('mooraya')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('archived_at', 'is', null)

    const firstError = e1 || e2 || e3 || e4
    if (firstError) {
      await logError({
        userId,
        errorMessage: firstError.message,
        endpoint: '/api/stats',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '統計情報の取得に失敗しました' })
    }

    return res.status(200).json({
      success: true,
      data: {
        active_tasks_count: activeTasksCount ?? 0,
        active_mooraya_count: activeMoorayaCount ?? 0,
        archived_tasks_count: archivedTasksCount ?? 0,
        archived_mooraya_count: archivedMoorayaCount ?? 0,
      },
    })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/stats',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
