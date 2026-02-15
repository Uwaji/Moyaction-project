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

/** /api/steps/:id - DELETE: ステップ削除, POST: ステップ完了/未完了切替 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') return handleDelete(req, res)
  if (req.method === 'POST') return handleToggleComplete(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** DELETE /api/steps/:id - ステップ削除（後続ステップ番号を調整） */
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const stepId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // ステップ取得
    const { data: step, error: fetchError } = await supabase
      .from('task_steps')
      .select('id, task_id, step_number')
      .eq('id', stepId)
      .single()

    if (fetchError || !step) {
      return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    }

    // タスクのアーカイブチェック
    const { data: task } = await supabase
      .from('tasks')
      .select('id, archived_at')
      .eq('id', step.task_id)
      .single()

    if (task?.archived_at) {
      return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことのステップは削除できません' })
    }

    // ステップ削除
    const { error: deleteError } = await supabase
      .from('task_steps')
      .delete()
      .eq('id', stepId)

    if (deleteError) {
      await logError({
        userId,
        errorMessage: deleteError.message,
        endpoint: `/api/steps/${stepId} [DELETE]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップの削除に失敗しました' })
    }

    // 後続ステップの番号を調整
    const { data: remainingSteps, error: remainError } = await supabase
      .from('task_steps')
      .select('id, step_number')
      .eq('task_id', step.task_id)
      .gt('step_number', step.step_number)
      .order('step_number', { ascending: true })

    if (!remainError && remainingSteps) {
      for (const rs of remainingSteps) {
        await supabase
          .from('task_steps')
          .update({ step_number: rs.step_number - 1 })
          .eq('id', rs.id)
      }
    }

    return res.status(200).json({ success: true, message: 'ステップを削除しました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/steps/${req.query.id} [DELETE]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** POST /api/steps/:id - ステップ完了/未完了切替 */
async function handleToggleComplete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const stepId = req.query.id as string

    const { completed } = req.body ?? {}

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ success: false, message: 'completed（true/false）は必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // ステップ取得
    const { data: step, error: fetchError } = await supabase
      .from('task_steps')
      .select('id, task_id, completed')
      .eq('id', stepId)
      .single()

    if (fetchError || !step) {
      return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    }

    // 完了にする場合、todoが全て完了しているかチェック
    if (completed) {
      const { data: todos, error: todosError } = await supabase
        .from('task_step_todos')
        .select('id, completed')
        .eq('step_id', stepId)

      if (todosError) {
        await logError({
          userId,
          errorMessage: todosError.message,
          endpoint: `/api/steps/${stepId} [POST]`,
          statusCode: 500,
        })
        return res.status(500).json({ success: false, message: 'Todo情報の取得に失敗しました' })
      }

      if (todos && todos.length > 0) {
        const incompleteTodos = todos.filter((t: any) => !t.completed)
        if (incompleteTodos.length > 0) {
          return res.status(400).json({
            success: false,
            message: `未完了のTodoが${incompleteTodos.length}件あります。全てのTodoを完了してからステップを完了してください`,
          })
        }
      }
    }

    // ステップの完了状態を更新
    const { data: updatedStep, error: updateError } = await supabase
      .from('task_steps')
      .update({ completed })
      .eq('id', stepId)
      .select()
      .single()

    if (updateError) {
      await logError({
        userId,
        errorMessage: updateError.message,
        endpoint: `/api/steps/${stepId} [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップの更新に失敗しました' })
    }

    return res.status(200).json({ success: true, data: updatedStep })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/steps/${req.query.id} [POST]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
