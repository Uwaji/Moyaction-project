import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, AuthError } from '../_lib/auth'
import { createUserClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

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
