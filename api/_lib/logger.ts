import { createAnonClient } from './supabase'

/** エラーをlogsテーブルに記録する */
export async function logError(params: {
  userId?: string
  errorMessage: string
  stackTrace?: string
  endpoint: string
  statusCode: number
}) {
  try {
    const supabase = createAnonClient()
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
