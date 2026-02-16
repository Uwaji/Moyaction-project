import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// =============================================
// Shared Helpers
// =============================================

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

function createAnonClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
}

function createUserClient(jwt: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

function createAdminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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

function handleAuthError(error: any, res: VercelResponse) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ success: false, message: error.message })
  }
  return null
}

// =============================================
// Router
// =============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path
  if (!rawPath) {
    return res.status(404).json({ success: false, message: 'Not Found' })
  }

  // Vercel may pass path as string (single segment) or array (multiple segments)
  const p: string[] = Array.isArray(rawPath) ? rawPath : [rawPath]
  const method = req.method ?? 'GET'

  try {
    // --- Health ---
    if (p[0] === 'health' && p.length === 1) {
      return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
    }

    // --- Auth ---
    if (p[0] === 'auth') {
      if (p[1] === 'signup' && p.length === 2 && method === 'POST') return authSignup(req, res)
      if (p[1] === 'login' && p.length === 2 && method === 'POST') return authLogin(req, res)
      if (p[1] === 'reset-password' && p.length === 2 && method === 'POST') return authResetPassword(req, res)
      if (p[1] === 'me' && p.length === 2 && method === 'GET') return authMe(req, res)
      if (p[1] === 'logout' && p.length === 2 && method === 'POST') return authLogout(req, res)
    }

    // --- Mooraya ---
    if (p[0] === 'mooraya') {
      if (p.length === 1 && method === 'GET') return moorayaList(req, res)
      if (p.length === 1 && method === 'POST') return moorayaCreate(req, res)
      if (p.length === 2 && method === 'PATCH') return moorayaUpdate(req, res, p[1])
      if (p.length === 2 && method === 'DELETE') return moorayaDelete(req, res, p[1])
      if (p.length === 3 && p[2] === 'archive' && method === 'POST') return moorayaArchive(req, res, p[1])
      if (p.length === 3 && p[2] === 'resolve' && method === 'POST') return moorayaResolve(req, res, p[1])
      if (p.length === 3 && p[2] === 'pending-tasks' && method === 'GET') return moorayaPendingTasks(req, res, p[1])
    }

    // --- Tasks ---
    if (p[0] === 'tasks') {
      if (p.length === 1 && method === 'GET') return tasksList(req, res)
      if (p.length === 1 && method === 'POST') return tasksCreate(req, res)
      if (p.length === 2 && method === 'GET') return tasksGet(req, res, p[1])
      if (p.length === 2 && method === 'PATCH') return tasksUpdate(req, res, p[1])
      if (p.length === 2 && method === 'DELETE') return tasksDelete(req, res, p[1])
      if (p.length === 3 && p[2] === 'complete' && method === 'POST') return tasksComplete(req, res, p[1])
      if (p.length === 3 && p[2] === 'note' && method === 'PATCH') return tasksNote(req, res, p[1])
      if (p.length === 3 && p[2] === 'steps' && method === 'POST') return tasksAddStep(req, res, p[1])
      if (p.length === 4 && p[2] === 'steps' && p[3] === 'reorder' && method === 'PATCH') return tasksReorderSteps(req, res, p[1])
    }

    // --- Steps ---
    if (p[0] === 'steps') {
      if (p.length === 2 && method === 'DELETE') return stepsDelete(req, res, p[1])
      if (p.length === 2 && method === 'POST') return stepsToggleComplete(req, res, p[1])
      if (p.length === 3 && p[2] === 'todos' && method === 'GET') return stepsTodosList(req, res, p[1])
      if (p.length === 3 && p[2] === 'todos' && method === 'POST') return stepsTodosCreate(req, res, p[1])
    }

    // --- Todos ---
    if (p[0] === 'todos') {
      if (p.length === 2 && method === 'DELETE') return todosDelete(req, res, p[1])
      if (p.length === 2 && method === 'POST') return todosToggleComplete(req, res, p[1])
    }

    // --- Mooraya-Tasks ---
    if (p[0] === 'mooraya-tasks') {
      if (p.length === 1 && method === 'POST') return moorayaTasksLink(req, res)
      if (p.length === 1 && method === 'DELETE') return moorayaTasksUnlink(req, res)
    }

    // --- Stats ---
    if (p[0] === 'stats' && p.length === 1 && method === 'GET') return statsGet(req, res)

    // --- Archive ---
    if (p[0] === 'archive') {
      if (p.length === 2 && p[1] === 'tasks' && method === 'GET') return archiveTasks(req, res)
      if (p.length === 2 && p[1] === 'mooraya' && method === 'GET') return archiveMooraya(req, res)
      if (p.length === 2 && method === 'GET') return archiveDetail(req, res, p[1])
    }

    // --- Logs ---
    if (p[0] === 'logs' && p.length === 1 && method === 'POST') return logsCreate(req, res)

    // Method Not Allowed or Not Found
    return res.status(404).json({ success: false, message: 'Not Found' })
  } catch (error: any) {
    console.error('Unhandled router error:', error)
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Auth Handlers
// =============================================

async function authSignup(req: VercelRequest, res: VercelResponse) {
  try {
    const { email, password, username } = req.body
    if (!email || !password || !username) {
      return res.status(400).json({ success: false, message: 'メールアドレス、パスワード、ユーザーネームは必須です' })
    }
    const supabase = createAnonClient()
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
    if (error) return res.status(400).json({ success: false, message: error.message })
    return res.status(201).json({ success: true, data: { userId: data.user?.id, email: data.user?.email } })
  } catch (error: any) {
    await logError({ errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/auth/signup', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function authLogin(req: VercelRequest, res: VercelResponse) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'メールアドレスとパスワードは必須です' })
    }
    const supabase = createAnonClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ success: false, message: 'メールアドレスまたはパスワードが正しくありません' })
    return res.status(200).json({
      success: true,
      data: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, userId: data.user.id, email: data.user.email },
    })
  } catch (error: any) {
    await logError({ errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/auth/login', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function authResetPassword(req: VercelRequest, res: VercelResponse) {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ success: false, message: 'メールアドレスは必須です' })
    const supabase = createAnonClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) return res.status(400).json({ success: false, message: error.message })
    return res.status(200).json({ success: true, message: 'パスワードリセットメールを送信しました' })
  } catch (error: any) {
    await logError({ errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/auth/reset-password', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function authMe(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase.from('users').select('id, email, username, created_at').eq('id', auth.userId).single()
    if (error) return res.status(404).json({ success: false, message: 'ユーザー情報が見つかりません' })
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/auth/me', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function authLogout(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createAdminClient()
    await supabase.auth.admin.signOut(auth.jwt)
    return res.status(200).json({ success: true, message: 'ログアウトしました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/auth/logout', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Mooraya Handlers
// =============================================

async function moorayaList(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase.from('mooraya').select('id, content, tag, created_at, updated_at').is('archived_at', null).order('created_at', { ascending: false })
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/mooraya [GET]', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/mooraya [GET]', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { content, tag } = req.body
    if (!content) return res.status(400).json({ success: false, message: 'テキスト内容は必須です' })
    if (!tag || !['worry', 'idea', 'question'].includes(tag)) {
      return res.status(400).json({ success: false, message: 'タグは「worry」「idea」「question」のいずれかを指定してください' })
    }
    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase.from('mooraya').insert({ user_id: auth.userId, content, tag }).select('id, content, tag, created_at').single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/mooraya [POST]', statusCode: 500 })
      return res.status(500).json({ success: false, message: '保存に失敗しました' })
    }
    return res.status(201).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/mooraya [POST]', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaUpdate(req: VercelRequest, res: VercelResponse, moorayaId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { content } = req.body
    if (!content) return res.status(400).json({ success: false, message: '修正テキストは必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: existing } = await supabase.from('mooraya').select('archived_at').eq('id', moorayaId).single()
    if (existing?.archived_at) return res.status(400).json({ success: false, message: 'アーカイブ済みのモヤモヤは修正できません' })
    const { data, error } = await supabase.from('mooraya').update({ content }).eq('id', moorayaId).select('id, content, tag, updated_at').single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/mooraya/${moorayaId} [PATCH]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '修正に失敗しました' })
    }
    if (!data) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/mooraya/${moorayaId} [PATCH]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaDelete(req: VercelRequest, res: VercelResponse, moorayaId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: existing } = await supabase.from('mooraya').select('archived_at').eq('id', moorayaId).single()
    if (!existing) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    if (!existing.archived_at) return res.status(400).json({ success: false, message: '完全削除はアーカイブ済みのモヤモヤのみ可能です。先にアーカイブしてください。' })
    const { error } = await supabase.from('mooraya').delete().eq('id', moorayaId)
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/mooraya/${moorayaId} [DELETE]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '削除に失敗しました' })
    }
    return res.status(200).json({ success: true, message: '完全に削除しました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/mooraya/${moorayaId} [DELETE]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaArchive(req: VercelRequest, res: VercelResponse, moorayaId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { archive_reason } = req.body
    if (!archive_reason) return res.status(400).json({ success: false, message: 'アーカイブ理由（なぜモヤモヤが晴れたのか）を記述してください' })
    const supabase = createUserClient(auth.jwt)
    const { data: existing } = await supabase.from('mooraya').select('archived_at').eq('id', moorayaId).single()
    if (!existing) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    if (existing.archived_at) return res.status(400).json({ success: false, message: '既にアーカイブ済みです' })
    const { data, error } = await supabase.from('mooraya').update({ archived_at: new Date().toISOString(), archive_reason }).eq('id', moorayaId).select('id, content, tag, archived_at, archive_reason').single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/mooraya/${moorayaId}/archive`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'アーカイブに失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/mooraya/${moorayaId}/archive`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaResolve(req: VercelRequest, res: VercelResponse, moorayaId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { resolved } = req.body
    if (typeof resolved !== 'boolean') return res.status(400).json({ success: false, message: 'resolved（真偽値）は必須です' })
    const { data: mooraya, error: moorayaErr } = await supabase.from('mooraya').select('id, archived_at').eq('id', moorayaId).eq('user_id', userId).single()
    if (moorayaErr || !mooraya) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    if (mooraya.archived_at) return res.status(400).json({ success: false, message: '既にアーカイブ済みです' })
    const { data: linkedTasks, error: linkedErr } = await supabase.from('mooraya_tasks').select('task_id, tasks(id, archived_at)').eq('mooraya_id', moorayaId)
    if (linkedErr) {
      await logError({ userId, errorMessage: linkedErr.message, endpoint: `/api/mooraya/${moorayaId}/resolve`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '紐づきタスクの確認に失敗しました' })
    }
    const incompleteTasks = (linkedTasks ?? []).filter((lt: any) => { const task = lt.tasks; return task && !task.archived_at })
    if (incompleteTasks.length > 0) return res.status(400).json({ success: false, message: '紐づいたやることがまだ完了していません' })
    if (resolved) {
      const { data, error } = await supabase.from('mooraya').update({ archived_at: new Date().toISOString(), archive_reason: '関連するやることが全て完了したため' }).eq('id', moorayaId).select('id, content, tag, archived_at, archive_reason').single()
      if (error) {
        await logError({ userId, errorMessage: error.message, endpoint: `/api/mooraya/${moorayaId}/resolve`, statusCode: 500 })
        return res.status(500).json({ success: false, message: 'アーカイブに失敗しました' })
      }
      return res.status(200).json({ success: true, data, message: 'モヤモヤを解消済みとしてアーカイブしました' })
    }
    return res.status(200).json({ success: true, message: 'モヤモヤは未解消のままです' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/mooraya/${moorayaId}/resolve`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaPendingTasks(req: VercelRequest, res: VercelResponse, moorayaId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: mooraya, error: moorayaErr } = await supabase.from('mooraya').select('id').eq('id', moorayaId).eq('user_id', userId).single()
    if (moorayaErr || !mooraya) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    const { data: linkedTasks, error } = await supabase.from('mooraya_tasks').select('task_id, tasks(id, title, archived_at)').eq('mooraya_id', moorayaId)
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/mooraya/${moorayaId}/pending-tasks`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '未完了タスクの取得に失敗しました' })
    }
    const pendingTasks = (linkedTasks ?? []).filter((lt: any) => lt.tasks && !lt.tasks.archived_at).map((lt: any) => ({ id: lt.tasks.id, title: lt.tasks.title }))
    return res.status(200).json({ success: true, data: { pending_count: pendingTasks.length, pending_tasks: pendingTasks, all_completed: pendingTasks.length === 0 } })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/mooraya/${moorayaId}/pending-tasks`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Tasks Handlers
// =============================================

async function tasksList(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: tasks, error } = await supabase.from('tasks').select('id, title, description, deadline_type, deadline_date, weight, reason, created_at, updated_at, task_steps(id, completed)').is('archived_at', null).order('created_at', { ascending: false })
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/tasks [GET]', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
    }
    const data = (tasks ?? []).map((task: any) => {
      const steps = task.task_steps ?? []
      const totalSteps = steps.length
      const completedSteps = steps.filter((s: any) => s.completed).length
      const { task_steps, ...taskWithoutSteps } = task
      return { ...taskWithoutSteps, total_steps: totalSteps, completed_steps: completedSteps }
    })
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/tasks [GET]', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { title, description, deadline_type, deadline_date, weight, reason, steps, mooraya_id } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'タイトルは必須です' })
    const validDeadlineTypes = ['specific_date', 'within_2weeks', 'within_2months', 'within_1year', 'someday']
    if (!deadline_type || !validDeadlineTypes.includes(deadline_type)) {
      return res.status(400).json({ success: false, message: '期限タイプは「specific_date」「within_2weeks」「within_2months」「within_1year」「someday」のいずれかを指定してください' })
    }
    if (deadline_type === 'specific_date' && !deadline_date) {
      return res.status(400).json({ success: false, message: '期限タイプが「specific_date」の場合、期限日付は必須です' })
    }
    const taskWeight = weight ?? 1
    if (taskWeight < 1 || taskWeight > 5) return res.status(400).json({ success: false, message: '重み付けは1〜5の範囲で指定してください' })
    const taskReason = reason ?? '理由なんてなくても'
    if (taskWeight >= 4 && (!reason || reason.trim() === '')) {
      return res.status(400).json({ success: false, message: '重み付けが4以上の場合、やる理由は必須です' })
    }
    const supabase = createUserClient(auth.jwt)
    const { data: task, error: taskError } = await supabase.from('tasks').insert({ user_id: auth.userId, title, description: description ?? null, deadline_type, deadline_date: deadline_date ?? null, weight: taskWeight, reason: taskReason }).select().single()
    if (taskError || !task) {
      await logError({ userId, errorMessage: taskError?.message ?? 'タスク作成失敗', endpoint: '/api/tasks [POST]', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'タスクの作成に失敗しました' })
    }
    const stepsToCreate = (steps && Array.isArray(steps) && steps.length > 0)
      ? steps.map((s: any, i: number) => ({ task_id: task.id, step_number: i + 1, title: s.title, completed: false }))
      : [{ task_id: task.id, step_number: 1, title: title, completed: false }]
    const { data: createdSteps, error: stepsError } = await supabase.from('task_steps').insert(stepsToCreate).select()
    if (stepsError) {
      await logError({ userId, errorMessage: stepsError.message, endpoint: '/api/tasks [POST]', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップの作成に失敗しました' })
    }
    if (mooraya_id) {
      const { error: linkError } = await supabase.from('mooraya_tasks').insert({ mooraya_id, task_id: task.id })
      if (linkError) await logError({ userId, errorMessage: linkError.message, endpoint: '/api/tasks [POST]', statusCode: 500 })
    }
    return res.status(201).json({ success: true, data: { ...task, task_steps: createdSteps } })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/tasks [POST]', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksGet(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: task, error } = await supabase.from('tasks').select(`*, task_steps(id, task_id, step_number, title, completed, created_at, updated_at, task_step_todos(id, step_id, title, completed, created_at, updated_at)), mooraya_tasks(id, mooraya_id, mooraya(id, content, tag, created_at))`).eq('id', taskId).single()
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
      await logError({ userId, errorMessage: error.message, endpoint: `/api/tasks/${taskId} [GET]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'データ取得に失敗しました' })
    }
    if (!task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (task.task_steps) task.task_steps.sort((a: any, b: any) => a.step_number - b.step_number)
    const isOverdue = task.deadline_date ? new Date(task.deadline_date) < new Date() && !task.completed_at : false
    return res.status(200).json({ success: true, data: { ...task, is_overdue: isOverdue } })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId} [GET]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksUpdate(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: existing, error: fetchError } = await supabase.from('tasks').select('id, archived_at, weight').eq('id', taskId).single()
    if (fetchError || !existing) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (existing.archived_at) return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことは編集できません' })
    const allowedFields = ['title', 'description', 'deadline_type', 'deadline_date', 'weight', 'reason']
    const updates: Record<string, any> = {}
    for (const field of allowedFields) { if (req.body[field] !== undefined) updates[field] = req.body[field] }
    if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: '更新するフィールドを指定してください' })
    if (updates.deadline_type) {
      const validDeadlineTypes = ['specific_date', 'within_2weeks', 'within_2months', 'within_1year', 'someday']
      if (!validDeadlineTypes.includes(updates.deadline_type)) return res.status(400).json({ success: false, message: '期限タイプは「specific_date」「within_2weeks」「within_2months」「within_1year」「someday」のいずれかを指定してください' })
    }
    if (updates.weight !== undefined && (updates.weight < 1 || updates.weight > 5)) return res.status(400).json({ success: false, message: '重み付けは1〜5の範囲で指定してください' })
    const newWeight = updates.weight ?? existing.weight
    if (newWeight >= 4) {
      const newReason = updates.reason ?? req.body.reason
      if (!newReason || (typeof newReason === 'string' && newReason.trim() === '')) {
        if (updates.weight !== undefined && updates.reason === undefined) {
          const { data: taskWithReason } = await supabase.from('tasks').select('reason').eq('id', taskId).single()
          if (!taskWithReason?.reason || taskWithReason.reason === '理由なんてなくても') return res.status(400).json({ success: false, message: '重み付けが4以上の場合、やる理由は必須です' })
        }
      }
    }
    const { data, error } = await supabase.from('tasks').update(updates).eq('id', taskId).select().single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/tasks/${taskId} [PATCH]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '更新に失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId} [PATCH]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksDelete(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: existing, error: fetchError } = await supabase.from('tasks').select('id, weight').eq('id', taskId).single()
    if (fetchError || !existing) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (existing.weight >= 4) {
      const { delete_reason } = req.body ?? {}
      if (!delete_reason || (typeof delete_reason === 'string' && delete_reason.trim() === '')) {
        return res.status(400).json({ success: false, message: '重み付けが4以上のやりたいことを削除するには、やらない理由を記述してください' })
      }
    }
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/tasks/${taskId} [DELETE]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '削除に失敗しました' })
    }
    return res.status(200).json({ success: true, message: 'やりたいことを削除しました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId} [DELETE]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksComplete(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: task, error: taskError } = await supabase.from('tasks').select('id, archived_at').eq('id', taskId).single()
    if (taskError || !task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (task.archived_at) return res.status(400).json({ success: false, message: 'このやりたいことは既にアーカイブ済みです' })
    const { data: steps, error: stepsError } = await supabase.from('task_steps').select('id, completed').eq('task_id', taskId)
    if (stepsError) {
      await logError({ userId, errorMessage: stepsError.message, endpoint: `/api/tasks/${taskId}/complete [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップの確認に失敗しました' })
    }
    const incompleteSteps = (steps ?? []).filter((s: any) => !s.completed)
    if (incompleteSteps.length > 0) {
      return res.status(400).json({ success: false, message: `未完了のステップが${incompleteSteps.length}件あります。全てのステップを完了してから完了操作を行ってください` })
    }
    const now = new Date().toISOString()
    const { completion_note } = req.body ?? {}
    const updateData: Record<string, any> = { completed_at: now, archived_at: now }
    if (completion_note) updateData.completion_note = completion_note
    const { data: completedTask, error: updateError } = await supabase.from('tasks').update(updateData).eq('id', taskId).select().single()
    if (updateError) {
      await logError({ userId, errorMessage: updateError.message, endpoint: `/api/tasks/${taskId}/complete [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '完了処理に失敗しました' })
    }
    return res.status(200).json({ success: true, data: completedTask })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId}/complete [POST]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksNote(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { completion_note } = req.body ?? {}
    if (!completion_note || (typeof completion_note === 'string' && completion_note.trim() === '')) {
      return res.status(400).json({ success: false, message: '感想テキストは必須です' })
    }
    const supabase = createUserClient(auth.jwt)
    const { data: task, error: fetchError } = await supabase.from('tasks').select('id, archived_at').eq('id', taskId).single()
    if (fetchError || !task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (!task.archived_at) return res.status(400).json({ success: false, message: '感想の追記はアーカイブ済みのやりたいことのみ可能です' })
    const { data, error } = await supabase.from('tasks').update({ completion_note }).eq('id', taskId).select().single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/tasks/${taskId}/note [PATCH]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: '感想の更新に失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId}/note [PATCH]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksAddStep(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { title, insert_after } = req.body ?? {}
    if (!title || (typeof title === 'string' && title.trim() === '')) return res.status(400).json({ success: false, message: 'ステップタイトルは必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: task, error: taskError } = await supabase.from('tasks').select('id, archived_at').eq('id', taskId).single()
    if (taskError || !task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (task.archived_at) return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことにはステップを追加できません' })
    const { data: existingSteps, error: stepsError } = await supabase.from('task_steps').select('id, step_number').eq('task_id', taskId).order('step_number', { ascending: true })
    if (stepsError) {
      await logError({ userId, errorMessage: stepsError.message, endpoint: `/api/tasks/${taskId}/steps [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップ情報の取得に失敗しました' })
    }
    const steps = existingSteps ?? []
    let newStepNumber: number
    if (insert_after !== undefined && insert_after !== null) {
      newStepNumber = insert_after + 1
      const stepsToUpdate = steps.filter((s: any) => s.step_number >= newStepNumber)
      for (const step of stepsToUpdate) {
        await supabase.from('task_steps').update({ step_number: step.step_number + 1 }).eq('id', step.id)
      }
    } else {
      newStepNumber = steps.length > 0 ? Math.max(...steps.map((s: any) => s.step_number)) + 1 : 1
    }
    const { data: newStep, error: insertError } = await supabase.from('task_steps').insert({ task_id: taskId, step_number: newStepNumber, title, completed: false }).select().single()
    if (insertError) {
      await logError({ userId, errorMessage: insertError.message, endpoint: `/api/tasks/${taskId}/steps [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップの作成に失敗しました' })
    }
    return res.status(201).json({ success: true, data: newStep })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId}/steps [POST]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function tasksReorderSteps(req: VercelRequest, res: VercelResponse, taskId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { order } = req.body ?? {}
    if (!order || !Array.isArray(order) || order.length === 0) return res.status(400).json({ success: false, message: 'ステップIDの配列（order）は必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: task, error: taskError } = await supabase.from('tasks').select('id, archived_at').eq('id', taskId).single()
    if (taskError || !task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    if (task.archived_at) return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことのステップは並び替えできません' })
    for (let i = 0; i < order.length; i++) {
      const { error: updateError } = await supabase.from('task_steps').update({ step_number: i + 1 }).eq('id', order[i]).eq('task_id', taskId)
      if (updateError) {
        await logError({ userId, errorMessage: updateError.message, endpoint: `/api/tasks/${taskId}/steps/reorder [PATCH]`, statusCode: 500 })
        return res.status(500).json({ success: false, message: 'ステップの並び替えに失敗しました' })
      }
    }
    const { data: updatedSteps, error: fetchError } = await supabase.from('task_steps').select('*').eq('task_id', taskId).order('step_number', { ascending: true })
    if (fetchError) {
      await logError({ userId, errorMessage: fetchError.message, endpoint: `/api/tasks/${taskId}/steps/reorder [PATCH]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップ情報の取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data: updatedSteps })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/tasks/${taskId}/steps/reorder [PATCH]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Steps Handlers
// =============================================

async function stepsDelete(req: VercelRequest, res: VercelResponse, stepId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: step, error: fetchError } = await supabase.from('task_steps').select('id, task_id, step_number').eq('id', stepId).single()
    if (fetchError || !step) return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    const { data: task } = await supabase.from('tasks').select('id, archived_at').eq('id', step.task_id).single()
    if (task?.archived_at) return res.status(400).json({ success: false, message: 'アーカイブ済みのやりたいことのステップは削除できません' })
    const { error: deleteError } = await supabase.from('task_steps').delete().eq('id', stepId)
    if (deleteError) {
      await logError({ userId, errorMessage: deleteError.message, endpoint: `/api/steps/${stepId} [DELETE]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップの削除に失敗しました' })
    }
    const { data: remainingSteps, error: remainError } = await supabase.from('task_steps').select('id, step_number').eq('task_id', step.task_id).gt('step_number', step.step_number).order('step_number', { ascending: true })
    if (!remainError && remainingSteps) {
      for (const rs of remainingSteps) {
        await supabase.from('task_steps').update({ step_number: rs.step_number - 1 }).eq('id', rs.id)
      }
    }
    return res.status(200).json({ success: true, message: 'ステップを削除しました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/steps/${stepId} [DELETE]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function stepsToggleComplete(req: VercelRequest, res: VercelResponse, stepId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { completed } = req.body ?? {}
    if (typeof completed !== 'boolean') return res.status(400).json({ success: false, message: 'completed（true/false）は必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: step, error: fetchError } = await supabase.from('task_steps').select('id, task_id, completed').eq('id', stepId).single()
    if (fetchError || !step) return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    if (completed) {
      const { data: todos, error: todosError } = await supabase.from('task_step_todos').select('id, completed').eq('step_id', stepId)
      if (todosError) {
        await logError({ userId, errorMessage: todosError.message, endpoint: `/api/steps/${stepId} [POST]`, statusCode: 500 })
        return res.status(500).json({ success: false, message: 'Todo情報の取得に失敗しました' })
      }
      if (todos && todos.length > 0) {
        const incompleteTodos = todos.filter((t: any) => !t.completed)
        if (incompleteTodos.length > 0) return res.status(400).json({ success: false, message: `未完了のTodoが${incompleteTodos.length}件あります。全てのTodoを完了してからステップを完了してください` })
      }
    }
    const { data: updatedStep, error: updateError } = await supabase.from('task_steps').update({ completed }).eq('id', stepId).select().single()
    if (updateError) {
      await logError({ userId, errorMessage: updateError.message, endpoint: `/api/steps/${stepId} [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'ステップの更新に失敗しました' })
    }
    return res.status(200).json({ success: true, data: updatedStep })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/steps/${stepId} [POST]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function stepsTodosList(req: VercelRequest, res: VercelResponse, stepId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: step, error: stepError } = await supabase.from('task_steps').select('id').eq('id', stepId).single()
    if (stepError || !step) return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    const { data: todos, error } = await supabase.from('task_step_todos').select('id, step_id, title, completed, created_at, updated_at').eq('step_id', stepId).order('created_at', { ascending: true })
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/steps/${stepId}/todos [GET]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'Todo一覧の取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data: todos })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/steps/${stepId}/todos [GET]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function stepsTodosCreate(req: VercelRequest, res: VercelResponse, stepId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { title } = req.body ?? {}
    if (!title || (typeof title === 'string' && title.trim() === '')) return res.status(400).json({ success: false, message: 'Todoタイトルは必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: step, error: stepError } = await supabase.from('task_steps').select('id').eq('id', stepId).single()
    if (stepError || !step) return res.status(404).json({ success: false, message: 'ステップが見つかりません' })
    const { data: todo, error } = await supabase.from('task_step_todos').insert({ step_id: stepId, title, completed: false }).select().single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: `/api/steps/${stepId}/todos [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'Todoの作成に失敗しました' })
    }
    return res.status(201).json({ success: true, data: todo })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/steps/${stepId}/todos [POST]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Todos Handlers
// =============================================

async function todosDelete(req: VercelRequest, res: VercelResponse, todoId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data: todo, error: fetchError } = await supabase.from('task_step_todos').select('id, step_id').eq('id', todoId).single()
    if (fetchError || !todo) return res.status(404).json({ success: false, message: 'Todoが見つかりません' })
    const stepId = todo.step_id
    const { error: deleteError } = await supabase.from('task_step_todos').delete().eq('id', todoId)
    if (deleteError) {
      await logError({ userId, errorMessage: deleteError.message, endpoint: `/api/todos/${todoId} [DELETE]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'Todoの削除に失敗しました' })
    }
    const { data: remainingTodos, error: remainError } = await supabase.from('task_step_todos').select('id, completed').eq('step_id', stepId)
    if (!remainError && remainingTodos && remainingTodos.length > 0) {
      const allCompleted = remainingTodos.every((t: any) => t.completed)
      if (allCompleted) await supabase.from('task_steps').update({ completed: true }).eq('id', stepId)
    }
    return res.status(200).json({ success: true, message: 'Todoを削除しました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/todos/${todoId} [DELETE]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function todosToggleComplete(req: VercelRequest, res: VercelResponse, todoId: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const { completed } = req.body ?? {}
    if (typeof completed !== 'boolean') return res.status(400).json({ success: false, message: 'completed（true/false）は必須です' })
    const supabase = createUserClient(auth.jwt)
    const { data: todo, error: fetchError } = await supabase.from('task_step_todos').select('id, step_id').eq('id', todoId).single()
    if (fetchError || !todo) return res.status(404).json({ success: false, message: 'Todoが見つかりません' })
    const stepId = todo.step_id
    const { data: updatedTodo, error: updateError } = await supabase.from('task_step_todos').update({ completed }).eq('id', todoId).select().single()
    if (updateError) {
      await logError({ userId, errorMessage: updateError.message, endpoint: `/api/todos/${todoId} [POST]`, statusCode: 500 })
      return res.status(500).json({ success: false, message: 'Todoの更新に失敗しました' })
    }
    if (completed) {
      const { data: allTodos, error: todosError } = await supabase.from('task_step_todos').select('id, completed').eq('step_id', stepId)
      if (!todosError && allTodos) {
        const allCompleted = allTodos.every((t: any) => t.completed)
        if (allCompleted) await supabase.from('task_steps').update({ completed: true }).eq('id', stepId)
      }
    } else {
      const { data: step } = await supabase.from('task_steps').select('id, completed').eq('id', stepId).single()
      if (step?.completed) await supabase.from('task_steps').update({ completed: false }).eq('id', stepId)
    }
    return res.status(200).json({ success: true, data: updatedTodo })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/todos/${todoId} [POST]`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Mooraya-Tasks Handlers
// =============================================

async function moorayaTasksLink(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { mooraya_id, task_id } = req.body
    if (!mooraya_id || !task_id) return res.status(400).json({ success: false, message: 'mooraya_id と task_id は必須です' })
    const { data: mooraya, error: moorayaErr } = await supabase.from('mooraya').select('id').eq('id', mooraya_id).eq('user_id', userId).single()
    if (moorayaErr || !mooraya) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    const { data: task, error: taskErr } = await supabase.from('tasks').select('id').eq('id', task_id).eq('user_id', userId).single()
    if (taskErr || !task) return res.status(404).json({ success: false, message: 'やりたいことが見つかりません' })
    const { data, error } = await supabase.from('mooraya_tasks').insert({ mooraya_id, task_id }).select('*').single()
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/mooraya-tasks', statusCode: 500 })
      return res.status(500).json({ success: false, message: '紐づけの作成に失敗しました' })
    }
    return res.status(201).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/mooraya-tasks', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function moorayaTasksUnlink(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const mooraya_id = req.query.mooraya_id as string
    const task_id = req.query.task_id as string
    if (!mooraya_id || !task_id) return res.status(400).json({ success: false, message: 'mooraya_id と task_id のクエリパラメータは必須です' })
    const { data: mooraya } = await supabase.from('mooraya').select('id').eq('id', mooraya_id).eq('user_id', userId).single()
    if (!mooraya) return res.status(404).json({ success: false, message: 'モヤモヤが見つかりません' })
    const { error } = await supabase.from('mooraya_tasks').delete().eq('mooraya_id', mooraya_id).eq('task_id', task_id)
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/mooraya-tasks', statusCode: 500 })
      return res.status(500).json({ success: false, message: '紐づけの削除に失敗しました' })
    }
    return res.status(200).json({ success: true, message: '紐づけを削除しました' })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/mooraya-tasks', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Stats Handler
// =============================================

async function statsGet(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { count: activeTasksCount, error: e1 } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('archived_at', null)
    const { count: activeMoorayaCount, error: e2 } = await supabase.from('mooraya').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('archived_at', null)
    const { count: archivedTasksCount, error: e3 } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('archived_at', 'is', null)
    const { count: archivedMoorayaCount, error: e4 } = await supabase.from('mooraya').select('*', { count: 'exact', head: true }).eq('user_id', userId).not('archived_at', 'is', null)
    const firstError = e1 || e2 || e3 || e4
    if (firstError) {
      await logError({ userId, errorMessage: firstError.message, endpoint: '/api/stats', statusCode: 500 })
      return res.status(500).json({ success: false, message: '統計情報の取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data: { active_tasks_count: activeTasksCount ?? 0, active_mooraya_count: activeMoorayaCount ?? 0, archived_tasks_count: archivedTasksCount ?? 0, archived_mooraya_count: archivedMoorayaCount ?? 0 } })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/stats', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Archive Handlers
// =============================================

async function archiveTasks(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase.from('tasks').select('id, title, completed_at, archived_at, completion_note, weight').eq('user_id', userId).not('archived_at', 'is', null).order('archived_at', { ascending: false })
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/archive/tasks', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'アーカイブ済みタスクの取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/archive/tasks', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function archiveMooraya(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { data, error } = await supabase.from('mooraya').select('id, content, tag, archived_at, archive_reason').eq('user_id', userId).not('archived_at', 'is', null).order('archived_at', { ascending: false })
    if (error) {
      await logError({ userId, errorMessage: error.message, endpoint: '/api/archive/mooraya', statusCode: 500 })
      return res.status(500).json({ success: false, message: 'アーカイブ済みモヤモヤの取得に失敗しました' })
    }
    return res.status(200).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: '/api/archive/mooraya', statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

async function archiveDetail(req: VercelRequest, res: VercelResponse, id: string) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const type = req.query.type as string
    const supabase = createUserClient(auth.jwt)
    if (!type || (type !== 'task' && type !== 'mooraya')) {
      return res.status(400).json({ success: false, message: 'type クエリパラメータ（task または mooraya）は必須です' })
    }
    if (type === 'task') {
      const { data, error } = await supabase.from('tasks').select('id, title, weight, completed_at, archived_at, completion_note, created_at').eq('id', id).eq('user_id', userId).not('archived_at', 'is', null).single()
      if (error || !data) return res.status(404).json({ success: false, message: 'アーカイブ済みタスクが見つかりません' })
      const createdAt = new Date(data.created_at)
      const archivedAt = new Date(data.archived_at)
      const durationDays = Math.floor((archivedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      return res.status(200).json({ success: true, data: { ...data, duration_days: durationDays } })
    }
    const { data, error } = await supabase.from('mooraya').select('id, content, tag, archived_at, archive_reason, created_at').eq('id', id).eq('user_id', userId).not('archived_at', 'is', null).single()
    if (error || !data) return res.status(404).json({ success: false, message: 'アーカイブ済みモヤモヤが見つかりません' })
    const createdAt = new Date(data.created_at)
    const archivedAt = new Date(data.archived_at)
    const durationDays = Math.floor((archivedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    return res.status(200).json({ success: true, data: { ...data, duration_days: durationDays } })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    await logError({ userId, errorMessage: error.message, stackTrace: error.stack, endpoint: `/api/archive/${id}`, statusCode: 500 })
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}

// =============================================
// Logs Handler
// =============================================

async function logsCreate(req: VercelRequest, res: VercelResponse) {
  let userId: string | undefined
  try {
    const auth = await authenticateRequest(req)
    userId = auth.userId
    const supabase = createUserClient(auth.jwt)
    const { error_message, stack_trace, endpoint, status_code } = req.body
    if (!error_message) return res.status(400).json({ success: false, message: 'error_message は必須です' })
    const { data, error } = await supabase.from('logs').insert({ user_id: userId, error_message, stack_trace: stack_trace ?? null, endpoint: endpoint ?? null, status_code: status_code ?? 0 }).select('*').single()
    if (error) {
      console.error('ログ記録に失敗:', error)
      return res.status(500).json({ success: false, message: 'エラーログの記録に失敗しました' })
    }
    return res.status(201).json({ success: true, data })
  } catch (error: any) {
    const authRes = handleAuthError(error, res)
    if (authRes) return authRes
    console.error('ログAPIでサーバーエラー:', error)
    return res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' })
  }
}
