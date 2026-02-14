import { useAuth } from '../hooks/useAuth'

export function HomePage() {
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="home-container">
      <header className="home-header">
        <h1>Moyaction</h1>
        <p>ようこそ、{user?.user_metadata?.username ?? user?.email}さん</p>
        <button className="btn-secondary" onClick={handleSignOut}>
          ログアウト
        </button>
      </header>

      <nav className="tab-bar">
        <button className="tab-btn active">ホーム</button>
        <button className="tab-btn">アーカイブ</button>
        <button className="tab-btn">マイページ</button>
      </nav>

      <main className="home-content">
        <section className="section">
          <h2>やりたいこと</h2>
          <p className="placeholder-text">まだ「やりたいこと」はありません。</p>
        </section>

        <section className="section">
          <h2>モヤモヤ</h2>
          <p className="placeholder-text">まだ「モヤモヤ」はありません。</p>
        </section>
      </main>
    </div>
  )
}
