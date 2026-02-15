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

/** /api/todos/:id - DELETE: Todo削除, POST: Todo完了/未完了切替 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') return handleDelete(req, res)
  if (req.method === 'POST') return handleToggleComplete(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** DELETE /api/todos/:id - Todo削除（全todo完了ならステップも自動完了） */
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const todoId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // Todo取得
    const { data: todo, error: fetchError } = await supabase
      .from('task_step_todos')
      .select('id, step_id')
      .eq('id', todoId)
      .single()

    if (fetchError || !todo) {
      return res.status(404).json({ success: false, message: 'Todoが見つかりません' })
    }

    const stepId = todo.step_id

    // Todo削除
    const { error: deleteError } = await supabase
      .from('task_step_todos')
      .delete()
      .eq('id', todoId)

    if (deleteError) {
      await logError({
        userId,
        errorMessage: deleteError.message,
        endpoint: `/api/todos/${todoId} [DELETE]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'Todoの削除に失敗しました' })
    }

    // 残りのtodoが全て完了しているかチェック → ステップ自動完了
    const { data: remainingTodos, error: remainError } = await supabase
      .from('task_step_todos')
      .select('id, completed')
      .eq('step_id', stepId)

    if (!remainError && remainingTodos && remainingTodos.length > 0) {
      const allCompleted = remainingTodos.every((t: any) => t.completed)
      if (allCompleted) {
        await supabase
          .from('task_steps')
          .update({ completed: true })
          .eq('id', stepId)
      }
    }

    return res.status(200).json({ success: true, message: 'Todoを削除しました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/todos/${req.query.id} [DELETE]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** POST /api/todos/:id - Todo完了/未完了切替（全todo完了ならステップも自動完了） */
async function handleToggleComplete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const todoId = req.query.id as string

    const { completed } = req.body ?? {}

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ success: false, message: 'completed（true/false）は必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // Todo取得
    const { data: todo, error: fetchError } = await supabase
      .from('task_step_todos')
      .select('id, step_id')
      .eq('id', todoId)
      .single()

    if (fetchError || !todo) {
      return res.status(404).json({ success: false, message: 'Todoが見つかりません' })
    }

    const stepId = todo.step_id

    // Todo更新
    const { data: updatedTodo, error: updateError } = await supabase
      .from('task_step_todos')
      .update({ completed })
      .eq('id', todoId)
      .select()
      .single()

    if (updateError) {
      await logError({
        userId,
        errorMessage: updateError.message,
        endpoint: `/api/todos/${todoId} [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'Todoの更新に失敗しました' })
    }

    // ステップの自動完了/未完了処理
    if (completed) {
      // 完了にした場合: 全todoが完了していればステップも自動完了
      const { data: allTodos, error: todosError } = await supabase
        .from('task_step_todos')
        .select('id, completed')
        .eq('step_id', stepId)

      if (!todosError && allTodos) {
        const allCompleted = allTodos.every((t: any) => t.completed)
        if (allCompleted) {
          await supabase
            .from('task_steps')
            .update({ completed: true })
            .eq('id', stepId)
        }
      }
    } else {
      // 未完了にした場合: ステップが完了済みなら未完了に戻す
      const { data: step } = await supabase
        .from('task_steps')
        .select('id, completed')
        .eq('id', stepId)
        .single()

      if (step?.completed) {
        await supabase
          .from('task_steps')
          .update({ completed: false })
          .eq('id', stepId)
      }
    }

    return res.status(200).json({ success: true, data: updatedTodo })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/todos/${req.query.id} [POST]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
