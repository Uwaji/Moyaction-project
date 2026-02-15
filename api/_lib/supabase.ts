import { createClient } from '@supabase/supabase-js'

function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`環境変数 ${key} が設定されていません`)
  return value
}

/** RLS を尊重する匿名クライアント（ログ記録用） */
export function createAnonClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'))
}

/** ユーザーのJWTでRLSを適用するクライアント */
export function createUserClient(jwt: string) {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_ANON_KEY'), {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  })
}

/** RLS をバイパスする管理者クライアント（サーバーサイド専用） */
export function createAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
}
