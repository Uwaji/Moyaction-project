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

/** GET /api/archive/:id - アーカイブ詳細表示 API */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const id = req.query.id as string
    const type = req.query.type as string
    const supabase = createUserClient(auth.jwt)

    if (!type || (type !== 'task' && type !== 'mooraya')) {
      return res.status(400).json({
        success: false,
        message: 'type クエリパラメータ（task または mooraya）は必須です',
      })
    }

    if (type === 'task') {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, weight, completed_at, archived_at, completion_note, created_at')
        .eq('id', id)
        .eq('user_id', userId)
        .not('archived_at', 'is', null)
        .single()

      if (error || !data) {
        return res.status(404).json({
          success: false,
          message: 'アーカイブ済みタスクが見つかりません',
        })
      }

      const createdAt = new Date(data.created_at)
      const archivedAt = new Date(data.archived_at)
      const durationDays = Math.floor((archivedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

      return res.status(200).json({
        success: true,
        data: {
          ...data,
          duration_days: durationDays,
        },
      })
    }

    // type === 'mooraya'
    const { data, error } = await supabase
      .from('mooraya')
      .select('id, content, tag, archived_at, archive_reason, created_at')
      .eq('id', id)
      .eq('user_id', userId)
      .not('archived_at', 'is', null)
      .single()

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'アーカイブ済みモヤモヤが見つかりません',
      })
    }

    const createdAt = new Date(data.created_at)
    const archivedAt = new Date(data.archived_at)
    const durationDays = Math.floor((archivedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        duration_days: durationDays,
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
      endpoint: `/api/archive/${req.query.id}`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
