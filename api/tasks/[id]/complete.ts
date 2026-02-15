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

/** POST /api/tasks/:id/complete - やりたいこと完了 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // タスク存在確認
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, archived_at')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    if (task.archived_at) {
      return res.status(400).json({ success: false, message: 'このやりたいことは既にアーカイブ済みです' })
    }

    // 全ステップ完了チェック
    const { data: steps, error: stepsError } = await supabase
      .from('task_steps')
      .select('id, completed')
      .eq('task_id', taskId)

    if (stepsError) {
      await logError({
        userId,
        errorMessage: stepsError.message,
        endpoint: `/api/tasks/${taskId}/complete [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップの確認に失敗しました' })
    }

    const incompleteSteps = (steps ?? []).filter((s: any) => !s.completed)
    if (incompleteSteps.length > 0) {
      return res.status(400).json({
        success: false,
        message: `未完了のステップが${incompleteSteps.length}件あります。全てのステップを完了してから完了操作を行ってください`,
      })
    }

    // 完了処理
    const now = new Date().toISOString()
    const { completion_note } = req.body ?? {}

    const updateData: Record<string, any> = {
      completed_at: now,
      archived_at: now,
    }
    if (completion_note) {
      updateData.completion_note = completion_note
    }

    const { data: completedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single()

    if (updateError) {
      await logError({
        userId,
        errorMessage: updateError.message,
        endpoint: `/api/tasks/${taskId}/complete [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '完了処理に失敗しました' })
    }

    return res.status(200).json({ success: true, data: completedTask })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/tasks/${req.query.id}/complete [POST]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
