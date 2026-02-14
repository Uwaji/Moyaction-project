import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

type AuthMode = 'login' | 'signup' | 'reset'

export function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) setError(error.message)
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password, username)
        if (error) {
          setError(error.message)
        } else {
          setMessage('確認メールを送信しました。メールを確認してください。')
        }
      } else if (mode === 'reset') {
        const { error } = await resetPassword(email)
        if (error) {
          setError(error.message)
        } else {
          setMessage('パスワードリセットメールを送信しました。')
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'ログイン'
      case 'signup': return '新規登録'
      case 'reset': return 'パスワードリセット'
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Moyaction</h1>
        <p className="login-subtitle">やりたいこと × モヤモヤ管理ツール</p>

        <h2 className="login-mode-title">{getTitle()}</h2>

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'signup' && (
            <div className="form-group">
              <label htmlFor="username">ユーザーネーム</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ユーザーネームを入力"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">メールアドレス</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレスを入力"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div className="form-group">
              <label htmlFor="password">パスワード</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                required
                minLength={6}
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-message">{message}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? '処理中...' : getTitle()}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button className="link-btn" onClick={() => setMode('signup')}>
                アカウントを作成
              </button>
              <button className="link-btn" onClick={() => setMode('reset')}>
                パスワードを忘れた方
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button className="link-btn" onClick={() => setMode('login')}>
              ログインに戻る
            </button>
          )}
          {mode === 'reset' && (
            <button className="link-btn" onClick={() => setMode('login')}>
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
