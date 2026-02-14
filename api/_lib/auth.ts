import type { VercelRequest } from '@vercel/node'
import { createUserClient } from './supabase'

export interface AuthResult {
  userId: string
  jwt: string
}

/** リクエストからJWTを抽出し、ユーザーを認証する */
export async function authenticateRequest(req: VercelRequest): Promise<AuthResult> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('認証トークンが必要です', 401)
  }

  const jwt = authHeader.slice(7)
  const supabase = createUserClient(jwt)
  const { data: { user }, error } = await supabase.auth.getUser(jwt)

  if (error || !user) {
    throw new AuthError('認証トークンが無効です', 401)
  }

  return { userId: user.id, jwt }
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
