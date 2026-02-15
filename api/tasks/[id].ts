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

/** /api/tasks/:id - GET: 詳細取得, PATCH: 更新, DELETE: 削除 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'PATCH') return handleUpdate(req, res)
  if (req.method === 'DELETE') return handleDelete(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** GET /api/tasks/:id - やりたいこと詳細取得 */
async function handleGet(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const supabase = createUserClient(auth.jwt)
    const { data: task, error } = await supabase
      .from('tasks')
      .select(`
        *,
        task_steps(
          id, task_id, step_number, title, completed, created_at, updated_at,
          task_step_todos(id, step_id, title, completed, created_at, updated_at)
        ),
        mooraya_tasks(
          id, mooraya_id,
          mooraya(id, content, tag, created_at)
        )
      `)
      .eq('id', taskId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
      }
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/tasks/${taskId} [GET]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
    }

    if (!task) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    // ステップをstep_numberで並び替え
    if (task.task_steps) {
      task.task_steps.sort((a: any, b: any) => a.step_number - b.step_number)
    }

    // 期限超過判定
    const isOverdue = task.deadline_date
      ? new Date(task.deadline_date) < new Date() && !task.completed_at
      : false

    return res.status(200).json({
      success: true,
      data: {
        ...task,
        is_overdue: isOverdue,
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
      endpoint: `/api/tasks/${req.query.id} [GET]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** PATCH /api/tasks/:id - やりたいこと更新（アーカイブ前のみ） */
async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // アーカイブ済みチェック
    const { data: existing, error: fetchError } = await supabase
      .from('tasks')
      .select('id, archived_at, weight')
      .eq('id', taskId)
      .single()

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    if (existing.archived_at) {
      return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことは編集できません' })
    }

    // 更新可能フィールドのみ抽出
    const allowedFields = ['title', 'description', 'deadline_type', 'deadline_date', 'weight', 'reason']
    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: '更新するフィールドを指定してください' })
    }

    // deadline_type バリデーション
    if (updates.deadline_type) {
      const validDeadlineTypes = ['specific_date', 'within_2weeks', 'within_2months', 'within_1year', 'someday']
      if (!validDeadlineTypes.includes(updates.deadline_type)) {
        return res.status(400).json({
          success: false,
          message: '期限タイプは「specific_date」「within_2weeks」「within_2months」「within_1year」「someday」のいずれかを指定してください',
        })
      }
    }

    // weight バリデーション
    if (updates.weight !== undefined) {
      if (updates.weight < 1 || updates.weight > 5) {
        return res.status(400).json({ success: false, message: '重み付けは1〜5の範囲で指定してください' })
      }
    }

    // 重み付け4以上の場合、理由必須チェック
    const newWeight = updates.weight ?? existing.weight
    if (newWeight >= 4) {
      const newReason = updates.reason ?? req.body.reason
      if (!newReason || (typeof newReason === 'string' && newReason.trim() === '')) {
        // 既存の理由があるかチェック（weightのみ変更の場合）
        if (updates.weight !== undefined && updates.reason === undefined) {
          const { data: taskWithReason } = await supabase
            .from('tasks')
            .select('reason')
            .eq('id', taskId)
            .single()
          if (!taskWithReason?.reason || taskWithReason.reason === '理由なんてなくても') {
            return res.status(400).json({ success: false, message: '重み付けが4以上の場合、やる理由は必須です' })
          }
        }
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/tasks/${taskId} [PATCH]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '更新に失敗しました' })
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
      endpoint: `/api/tasks/${req.query.id} [PATCH]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** DELETE /api/tasks/:id - やりたいこと削除（重み4以上は理由必須） */
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // タスク取得
    const { data: existing, error: fetchError } = await supabase
      .from('tasks')
      .select('id, weight')
      .eq('id', taskId)
      .single()

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    // 重み4以上の場合、削除理由必須
    if (existing.weight >= 4) {
      const { delete_reason } = req.body ?? {}
      if (!delete_reason || (typeof delete_reason === 'string' && delete_reason.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: '重み付けが4以上のやりたいことを削除するには、やらない理由を記述してください',
        })
      }
    }

    // 削除実行（カスケードでステップ・todoも削除される）
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/tasks/${taskId} [DELETE]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '削除に失敗しました' })
    }

    return res.status(200).json({ success: true, message: 'やりたいことを削除しました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/tasks/${req.query.id} [DELETE]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
