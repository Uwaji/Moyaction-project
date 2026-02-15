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

/** GET /api/mooraya/:id/pending-tasks - モヤモヤの未完了やること取得 API */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const moorayaId = req.query.id as string
    const supabase = createUserClient(auth.jwt)

    // モヤモヤの存在確認
    const { data: mooraya, error: moorayaErr } = await supabase
      .from('mooraya')
      .select('id')
      .eq('id', moorayaId)
      .eq('user_id', userId)
      .single()

    if (moorayaErr || !mooraya) {
      return res.status(404).json({
        success: false,
        message: 'モヤモヤが見つかりません',
      })
    }

    // 紐づいたタスクを取得し、未完了のものをフィルタ
    const { data: linkedTasks, error } = await supabase
      .from('mooraya_tasks')
      .select('task_id, tasks(id, title, archived_at)')
      .eq('mooraya_id', moorayaId)

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/mooraya/${moorayaId}/pending-tasks`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '未完了タスクの取得に失敗しました' })
    }

    const pendingTasks = (linkedTasks ?? [])
      .filter((lt: any) => lt.tasks && !lt.tasks.archived_at)
      .map((lt: any) => ({ id: lt.tasks.id, title: lt.tasks.title }))

    const pendingCount = pendingTasks.length
    const allCompleted = pendingCount === 0

    return res.status(200).json({
      success: true,
      data: {
        pending_count: pendingCount,
        pending_tasks: pendingTasks,
        all_completed: allCompleted,
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
      endpoint: `/api/mooraya/${req.query.id}/pending-tasks`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
