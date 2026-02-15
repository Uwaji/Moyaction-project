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

/** POST /api/tasks/:id/steps - ステップ追加 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const { title, insert_after } = req.body ?? {}

    if (!title || (typeof title === 'string' && title.trim() === '')) {
      return res.status(400).json({ success: false, message: 'ステップタイトルは必須です' })
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
      return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことにはステップを追加できません' })
    }

    // 既存ステップ取得
    const { data: existingSteps, error: stepsError } = await supabase
      .from('task_steps')
      .select('id, step_number')
      .eq('task_id', taskId)
      .order('step_number', { ascending: true })

    if (stepsError) {
      await logError({
        userId,
        errorMessage: stepsError.message,
        endpoint: `/api/tasks/${taskId}/steps [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップ情報の取得に失敗しました' })
    }

    const steps = existingSteps ?? []
    let newStepNumber: number

    if (insert_after !== undefined && insert_after !== null) {
      // insert_after で指定されたstep_numberの後に挿入
      newStepNumber = insert_after + 1

      // 後続ステップの番号を繰り上げ
      const stepsToUpdate = steps.filter((s: any) => s.step_number >= newStepNumber)
      for (const step of stepsToUpdate) {
        await supabase
          .from('task_steps')
          .update({ step_number: step.step_number + 1 })
          .eq('id', step.id)
      }
    } else {
      // 末尾に追加
      newStepNumber = steps.length > 0
        ? Math.max(...steps.map((s: any) => s.step_number)) + 1
        : 1
    }

    // 新しいステップ作成
    const { data: newStep, error: insertError } = await supabase
      .from('task_steps')
      .insert({
        task_id: taskId,
        step_number: newStepNumber,
        title,
        completed: false,
      })
      .select()
      .single()

    if (insertError) {
      await logError({
        userId,
        errorMessage: insertError.message,
        endpoint: `/api/tasks/${taskId}/steps [POST]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'ステップの作成に失敗しました' })
    }

    return res.status(201).json({ success: true, data: newStep })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/tasks/${req.query.id}/steps [POST]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
