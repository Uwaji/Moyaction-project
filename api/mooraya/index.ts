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

/** /api/mooraya - GET: 一覧取得, POST: 作成 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method === 'POST') return handleCreate(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** GET /api/mooraya - モヤモヤ一覧取得（アーカイブ済み除外） */
async function handleList(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase
      .from('mooraya')
      .select('id, content, tag, created_at, updated_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: '/api/mooraya [GET]',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
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
      endpoint: '/api/mooraya [GET]',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** POST /api/mooraya - モヤモヤ作成 */
async function handleCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId

    const { content, tag } = req.body

    if (!content) {
      return res.status(400).json({ success: false, message: 'テキスト内容は必須です' })
    }
    if (!tag || !['worry', 'idea', 'question'].includes(tag)) {
      return res.status(400).json({
        success: false,
        message: 'タグは「worry」「idea」「question」のいずれかを指定してください',
      })
    }

    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase
      .from('mooraya')
      .insert({ user_id: auth.userId, content, tag })
      .select('id, content, tag, created_at')
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: '/api/mooraya [POST]',
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '保存に失敗しました' })
    }

    return res.status(201).json({ success: true, data })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: '/api/mooraya [POST]',
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
