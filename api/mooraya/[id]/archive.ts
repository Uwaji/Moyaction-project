import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, AuthError } from '../../_lib/auth'
import { createUserClient } from '../../_lib/supabase'
import { logError } from '../../_lib/logger'

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
