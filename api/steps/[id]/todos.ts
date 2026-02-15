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

/** /api/steps/:id/todos - GET: Todo一覧, POST: Todo追加 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method === 'POST') return handleCreate(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** GET /api/steps/:id/todos - ステップ内のTodo一覧取得 */
async function handleList(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const stepId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // ステップ存在確認（RLS経由でオーナーシップも確認）
    const { data: step, error: stepError } = await supabase
      .from('task_steps')
      .select('id')
      .eq('id', stepId)
      .single()

    if (stepError || !step) {
      return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    }

    const { data: todos, error } = await supabase
      .from('task_step_todos')
      .select('id, step_id, title, completed, created_at, updated_at')
      .eq('step_id', stepId)
      .order('created_at', { ascending: true })

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/steps/${stepId}/todos [GET]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'Todo一覧の取得に失敗しました' })
    }

    return res.status(200).json({ success: true, data: todos })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/steps/${req.query.id}/todos [GET]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** POST /api/steps/:id/todos - Todo追加 */
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const stepId = req.query.id as string

    const { title } = req.body ?? {}

    if (!title || (typeof title === 'string' && title.trim() === '')) {
      return res.status(400).json({ success: false, message: 'Todoタイトルは必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // ステップ存在確認
    const { data: step, error: stepError } = await supabase
      .from('task_steps')
      .select('id')
      .eq('id', stepId)
      .single()

    if (stepError || !step) {
      return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    }

    const { data: todo, error } = await supabase
      .from('task_step_todos')
      .insert({
        step_id: stepId,
        title,
        completed: false,
      })
      .select()
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/steps/${stepId}/todos [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'Todoの作成に失敗しました' })
    }

    return res.status(201).json({ success: true, data: todo })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/steps/${req.query.id}/todos [POST]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
