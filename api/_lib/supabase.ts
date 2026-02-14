import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** RLS を尊重する匿名クライアント（ログ記録用） */
export function createAnonClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

/** ユーザーのJWTでRLSを適用するクライアント */
export function createUserClient(jwt: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  })
}

/** RLS をバイパスする管理者クライアント（サーバーサイド専用） */
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}
