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

/** /api/tasks - GET: 一覧取得, POST: 作成 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method === 'POST') return handleCreate(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** GET /api/tasks - やりたいこと一覧取得（アーカイブ済み除外） */
async function handleList(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    const supabase = createUserClient(auth.jwt)
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, title, description, deadline_type, deadline_date, weight, reason, created_at, updated_at, task_steps(id, completed)')
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: '/api/tasks [GET]',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
    }

    // 進捗情報を付与
    const data = (tasks ?? []).map((task: any) => {
      const steps = task.task_steps ?? []
      const totalSteps = steps.length
      const completedSteps = steps.filter((s: any) => s.completed).length
      const { task_steps, ...taskWithoutSteps } = task
      return {
        ...taskWithoutSteps,
        total_steps: totalSteps,
        completed_steps: completedSteps,
      }
    })

    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/tasks [GET]',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** POST /api/tasks - やりたいこと作成 */
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    const { title, description, deadline_type, deadline_date, weight, reason, steps, mooraya_id } = req.body

    // バリデーション
    if (!title) {
      return res.status(400).json({ success: false, message: 'タイトルは必須です' })
    }

    const validDeadlineTypes = ['specific_date', 'within_2weeks', 'within_2months', 'within_1year', 'someday']
    if (!deadline_type || !validDeadlineTypes.includes(deadline_type)) {
      return res.status(400).json({
        success: false,
        message: '期限タイプは「specific_date」「within_2weeks」「within_2months」「within_1year」「someday」のいずれかを指定してください',
      })
    }

    if (deadline_type === 'specific_date' && !deadline_date) {
      return res.status(400).json({ success: false, message: '期限タイプが「specific_date」の場合、期限日付は必須です' })
    }

    const taskWeight = weight ?? 1
    if (taskWeight < 1 || taskWeight > 5) {
      return res.status(400).json({ success: false, message: '重み付けは1〜5の範囲で指定してください' })
    }

    const taskReason = reason ?? '理由なんてなくても'
    if (taskWeight >= 4 && (!reason || reason.trim() === '')) {
      return res.status(400).json({ success: false, message: '重み付けが4以上の場合、やる理由は必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // タスク作成
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: auth.userId,
        title,
        description: description ?? null,
        deadline_type,
        deadline_date: deadline_date ?? null,
        weight: taskWeight,
        reason: taskReason,
      })
      .select()
      .single()

    if (taskError || !task) {
      await logError({
        userId,
        errorMessage: taskError?.message ?? 'タスク作成失敗',
        endpoint: '/api/tasks [POST]',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'タスクの作成に失敗しました' })
    }

    // ステップ作成
    const stepsToCreate = (steps && Array.isArray(steps) && steps.length > 0)
      ? steps.map((s: any, i: number) => ({
          task_id: task.id,
          step_number: i + 1,
          title: s.title,
          completed: false,
        }))
      : [{
          task_id: task.id,
          step_number: 1,
          title: title,
          completed: false,
        }]

    const { data: createdSteps, error: stepsError } = await supabase
      .from('task_steps')
      .insert(stepsToCreate)
      .select()

    if (stepsError) {
      await logError({
        userId,
        errorMessage: stepsError.message,
        endpoint: '/api/tasks [POST]',
        statusCode: 500,
      })
      // タスクは作成済みだがステップ作成に失敗
      return res.status(500).json({ success: false, message: 'ステップの作成に失敗しました' })
    }

    // mooraya_id が指定されている場合、紐づけ作成
    if (mooraya_id) {
      const { error: linkError } = await supabase
        .from('mooraya_tasks')
        .insert({ mooraya_id, task_id: task.id })

      if (linkError) {
        await logError({
          userId,
          errorMessage: linkError.message,
          endpoint: '/api/tasks [POST]',
          statusCode: 500,
        })
        // 紐づけ失敗はログのみ、タスク自体は作成済み
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        ...task,
        task_steps: createdSteps,
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
      endpoint: '/api/tasks [POST]',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
