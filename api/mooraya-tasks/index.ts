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

/** POST/DELETE /api/mooraya-tasks - モヤモヤ・やりたいこと紐づけ API */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)

    if (req.method === 'POST') {
      const { mooraya_id, task_id } = req.body

      if (!mooraya_id || !task_id) {
        return res.status(400).json({
          success: false,
          message: 'mooraya_id と task_id は必須です',
        })
      }

      // モヤモヤの存在確認（ユーザー所有）
      const { data: mooraya, error: moorayaErr } = await supabase
        .from('mooraya')
        .select('id')
        .eq('id', mooraya_id)
        .eq('user_id', userId)
        .single()

      if (moorayaErr || !mooraya) {
        return res.status(404).json({
          success: false,
          message: 'モヤモヤが見つかりません',
        })
      }

      // タスクの存在確認（ユーザー所有）
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .select('id')
        .eq('id', task_id)
        .eq('user_id', userId)
        .single()

      if (taskErr || !task) {
        return res.status(404).json({
          success: false,
          message: 'やりたいことが見つかりません',
        })
      }

      // 紐づけ作成
      const { data, error } = await supabase
        .from('mooraya_tasks')
        .insert({ mooraya_id, task_id })
        .select('*')
        .single()

      if (error) {
        await logError({
          userId,
          errorMessage: error.message,
          endpoint: '/api/mooraya-tasks',
          statusCode: 500,
        })
        return res.status(500).json({ success: false, message: '紐づけの作成に失敗しました' })
      }

      return res.status(201).json({ success: true, data })
    }

    // DELETE
    const mooraya_id = req.query.mooraya_id as string
    const task_id = req.query.task_id as string

    if (!mooraya_id || !task_id) {
      return res.status(400).json({
        success: false,
        message: 'mooraya_id と task_id のクエリパラメータは必須です',
      })
    }

    // ユーザー所有のモヤモヤか確認
    const { data: mooraya } = await supabase
      .from('mooraya')
      .select('id')
      .eq('id', mooraya_id)
      .eq('user_id', userId)
      .single()

    if (!mooraya) {
      return res.status(404).json({
        success: false,
        message: 'モヤモヤが見つかりません',
      })
    }

    const { error } = await supabase
      .from('mooraya_tasks')
      .delete()
      .eq('mooraya_id', mooraya_id)
      .eq('task_id', task_id)

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: '/api/mooraya-tasks',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '紐づけの削除に失敗しました' })
    }

    return res.status(200).json({ success: true, message: '紐づけを削除しました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/mooraya-tasks',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
