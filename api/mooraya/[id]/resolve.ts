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

/** POST /api/mooraya/:id/resolve - モヤモヤ解消確認 API */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const moorayaId = req.query.id as string
    const supabase = createUserClient(auth.jwt)

    const { resolved } = req.body

    if (typeof resolved !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'resolved（真偽値）は必須です',
      })
    }

    // モヤモヤの存在確認
    const { data: mooraya, error: moorayaErr } = await supabase
      .from('mooraya')
      .select('id, archived_at')
      .eq('id', moorayaId)
      .eq('user_id', userId)
      .single()

    if (moorayaErr || !mooraya) {
      return res.status(404).json({
        success: false,
        message: 'モヤモヤが見つかりません',
      })
    }

    if (mooraya.archived_at) {
      return res.status(400).json({
        success: false,
        message: '既にアーカイブ済みです',
      })
    }

    // 紐づいたタスクが全て完了しているか確認
    const { data: linkedTasks, error: linkedErr } = await supabase
      .from('mooraya_tasks')
      .select('task_id, tasks(id, archived_at)')
      .eq('mooraya_id', moorayaId)

    if (linkedErr) {
      await logError({
        userId,
        errorMessage: linkedErr.message,
        endpoint: `/api/mooraya/${moorayaId}/resolve`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '紐づきタスクの確認に失敗しました' })
    }

    // 紐づいたタスクの中で未完了のものがあるかチェック
    const incompleteTasks = (linkedTasks ?? []).filter((lt: any) => {
      const task = lt.tasks
      return task && !task.archived_at
    })

    if (incompleteTasks.length > 0) {
      return res.status(400).json({
        success: false,
        message: '紐づいたやることがまだ完了していません',
      })
    }

    if (resolved) {
      // モヤモヤをアーカイブ
      const { data, error } = await supabase
        .from('mooraya')
        .update({
          archived_at: new Date().toISOString(),
          archive_reason: '関連するやることが全て完了したため',
        })
        .eq('id', moorayaId)
        .select('id, content, tag, archived_at, archive_reason')
        .single()

      if (error) {
        await logError({
          userId,
          errorMessage: error.message,
          endpoint: `/api/mooraya/${moorayaId}/resolve`,
          statusCode: 500,
        })
        return res.status(500).json({ success: false, message: 'アーカイブに失敗しました' })
      }

      return res.status(200).json({
        success: true,
        data,
        message: 'モヤモヤを解消済みとしてアーカイブしました',
      })
    }

    // resolved が false の場合: 何もしない
    return res.status(200).json({
      success: true,
      message: 'モヤモヤは未解消のままです',
    })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/mooraya/${req.query.id}/resolve`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
