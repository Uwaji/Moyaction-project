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

/** PATCH /api/tasks/:id/steps/reorder - ステップ並び替え */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const { order } = req.body ?? {}

    if (!order || !Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ success: false, message: 'ステップIDの配列（order）は必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // タスク存在・アーカイブチェック
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, archived_at')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    if (task.archived_at) {
      return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことのステップは並び替えできません' })
    }

    // 各ステップのstep_numberを更新
    for (let i = 0; i < order.length; i++) {
      const { error: updateError } = await supabase
        .from('task_steps')
        .update({ step_number: i + 1 })
        .eq('id', order[i])
        .eq('task_id', taskId)

      if (updateError) {
        await logError({
          userId,
          errorMessage: updateError.message,
          endpoint: `/api/tasks/${taskId}/steps/reorder [PATCH]`,
          statusCode: 500,
        })
        return res.status(500).json({ success: false, message: 'ステップの並び替えに失敗しました' })
      }
    }

    // 更新後のステップを返す
    const { data: updatedSteps, error: fetchError } = await supabase
      .from('task_steps')
      .select('*')
      .eq('task_id', taskId)
      .order('step_number', { ascending: true })

    if (fetchError) {
      await logError({
        userId,
        errorMessage: fetchError.message,
        endpoint: `/api/tasks/${taskId}/steps/reorder [PATCH]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップ情報の取得に失敗しました' })
    }

    return res.status(200).json({ success: true, data: updatedSteps })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/tasks/${req.query.id}/steps/reorder [PATCH]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
