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

/** POST /api/mooraya/:id/archive - モヤモヤをアーカイブ（仮削除） */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const moorayaId = req.query.id as string

    const { archive_reason } = req.body

    if (!archive_reason) {
      return res.status(400).json({
        success: false,
        message: 'アーカイブ理由（なぜモヤモヤが晴れたのか）を記述してください',
      })
    }

    const supabase = createUserClient(auth.jwt)

    // 既にアーカイブ済みかチェック
    const { data: existing } = await supabase
      .from('mooraya')
      .select('archived_at')
      .eq('id', moorayaId)
      .single()

    if (!existing) {
      return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    }

    if (existing.archived_at) {
      return res.status(400).json({ success: false, message: '既にアーカイブ済みです' })
    }

    const { data, error } = await supabase
      .from('mooraya')
      .update({
        archived_at: new Date().toISOString(),
        archive_reason,
      })
      .eq('id', moorayaId)
      .select('id, content, tag, archived_at, archive_reason')
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/mooraya/${moorayaId}/archive`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'アーカイブに失敗しました' })
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
      endpoint: `/api/mooraya/${req.query.id}/archive`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
