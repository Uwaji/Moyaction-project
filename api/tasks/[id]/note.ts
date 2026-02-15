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

/** PATCH /api/tasks/:id/note - 完了感想の追記・更新（アーカイブ済みタスクのみ） */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const taskId = req.query.id as string

    const { completion_note } = req.body ?? {}

    if (!completion_note || (typeof completion_note === 'string' && completion_note.trim() === '')) {
      return res.status(400).json({ success: false, message: '感想テキストは必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // アーカイブ済みチェック
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('id, archived_at')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    }

    if (!task.archived_at) {
      return res.status(400).json({ success: false, message: '感想の追記はアーカイブ済みのやりたいことのみ可能です' })
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ completion_note })
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/tasks/${taskId}/note [PATCH]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '感想の更新に失敗しました' })
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
      endpoint: `/api/tasks/${req.query.id}/note [PATCH]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
