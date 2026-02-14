import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, AuthError } from '../_lib/auth'
import { createUserClient } from '../_lib/supabase'
import { logError } from '../_lib/logger'

/** /api/mooraya/:id - PATCH: テキスト修正, DELETE: 完全削除 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'PATCH') return handleUpdate(req, res)
  if (req.method === 'DELETE') return handlePermanentDelete(req, res)
  return res.status(405).json({ success: false, message: 'Method Not Allowed' })
}

/** PATCH /api/mooraya/:id - モヤモヤ修正（テキストのみ、タグ変更不可） */
async function handleUpdate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const moorayaId = req.query.id as string

    const { content } = req.body

    if (!content) {
      return res.status(400).json({ success: false, message: '修正テキストは必須です' })
    }

    const supabase = createUserClient(auth.jwt)

    // アーカイブ済みの場合は修正不可
    const { data: existing } = await supabase
      .from('mooraya')
      .select('archived_at')
      .eq('id', moorayaId)
      .single()

    if (existing?.archived_at) {
      return res.status(400).json({
        success: false,
        message: 'アーカイブ済みのモヤモヤは修正できません',
      })
    }

    const { data, error } = await supabase
      .from('mooraya')
      .update({ content })
      .eq('id', moorayaId)
      .select('id, content, tag, updated_at')
      .single()

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/mooraya/${moorayaId} [PATCH]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '修正に失敗しました' })
    }

    if (!data) {
      return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
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
      endpoint: `/api/mooraya/${req.query.id} [PATCH]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

/** DELETE /api/mooraya/:id - アーカイブ済みモヤモヤの完全削除 */
async function handlePermanentDelete(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined

  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const moorayaId = req.query.id as string

    const supabase = createUserClient(auth.jwt)

    // アーカイブ済みかチェック（完全削除はアーカイブ後のみ）
    const { data: existing } = await supabase
      .from('mooraya')
      .select('archived_at')
      .eq('id', moorayaId)
      .single()

    if (!existing) {
      return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    }

    if (!existing.archived_at) {
      return res.status(400).json({
        success: false,
        message: '完全削除はアーカイブ済みのモヤモヤのみ可能です。先にアーカイブしてください。',
      })
    }

    const { error } = await supabase
      .from('mooraya')
      .delete()
      .eq('id', moorayaId)

    if (error) {
      await logError({
        userId,
        errorMessage: error.message,
        endpoint: `/api/mooraya/${moorayaId} [DELETE]`,
        statusCode: 500,
      })
      return res.status(500).json({ success: false, message: '削除に失敗しました' })
    }

    return res.status(200).json({ success: true, message: '完全に削除しました' })
  } catch (error: any) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ success: false, message: error.message })
    }
    await logError({
      userId,
      errorMessage: error.message,
      stackTrace: error.stack,
      endpoint: `/api/mooraya/${req.query.id} [DELETE]`,
      statusCode: 500,
    })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
