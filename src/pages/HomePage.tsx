import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

type Mooraya = {
  id: number
  content: string
  tag: 'worry' | 'idea' | 'question'
  created_at: string
  updated_at: string
}

type Task = {
  id: number
  title: string
  description: string | null
  deadline_type: string
  deadline_date: string | null
  weight: number
  reason: string | null
  created_at: string
}

type TagLabel = { value: Mooraya['tag']; label: string }
const TAG_OPTIONS: TagLabel[] = [
  { value: 'worry', label: '悩み' },
  { value: 'idea', label: 'アイデア' },
  { value: 'question', label: '疑問' },
]

const DEADLINE_OPTIONS = [
  { value: 'specific_date', label: '日付指定' },
  { value: 'within_2weeks', label: '2週間以内' },
  { value: 'within_2months', label: '2ヶ月以内' },
  { value: 'within_1year', label: '1年以内' },
  { value: 'someday', label: 'いつか' },
]

export function HomePage() {
  const { user, signOut } = useAuth()

  // --- モヤモヤ state ---
  const [moorayaList, setMoorayaList] = useState<Mooraya[]>([])
  const [showMoorayaForm, setShowMoorayaForm] = useState(false)
  const [moorayaContent, setMoorayaContent] = useState('')
  const [moorayaTag, setMoorayaTag] = useState<Mooraya['tag']>('worry')
  const [editingMoorayaId, setEditingMoorayaId] = useState<number | null>(null)
  const [editingMoorayaContent, setEditingMoorayaContent] = useState('')

  // --- やりたいこと state ---
  const [taskList, setTaskList] = useState<Task[]>([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDeadlineType, setTaskDeadlineType] = useState('someday')
  const [taskDeadlineDate, setTaskDeadlineDate] = useState('')
  const [taskWeight, setTaskWeight] = useState(1)
  const [taskReason, setTaskReason] = useState('')

  // --- 共通 state ---
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // --- データ取得 ---
  const fetchMooraya = useCallback(async () => {
    const { data } = await supabase
      .from('mooraya')
      .select('id, content, tag, created_at, updated_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (data) setMoorayaList(data)
  }, [])

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, deadline_type, deadline_date, weight, reason, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (data) setTaskList(data)
  }, [])

  useEffect(() => {
    fetchMooraya()
    fetchTasks()
  }, [fetchMooraya, fetchTasks])

  // --- モヤモヤ操作 ---
  const handleCreateMooraya = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!moorayaContent.trim()) return
    setSubmitting(true)
    setError('')

    const { error: err } = await supabase
      .from('mooraya')
      .insert({ user_id: user!.id, content: moorayaContent.trim(), tag: moorayaTag })

    if (err) {
      setError(err.message)
    } else {
      setMoorayaContent('')
      setMoorayaTag('worry')
      setShowMoorayaForm(false)
      await fetchMooraya()
    }
    setSubmitting(false)
  }

  const handleUpdateMooraya = async (id: number) => {
    if (!editingMoorayaContent.trim()) return
    setSubmitting(true)

    await supabase
      .from('mooraya')
      .update({ content: editingMoorayaContent.trim() })
      .eq('id', id)

    setEditingMoorayaId(null)
    setEditingMoorayaContent('')
    await fetchMooraya()
    setSubmitting(false)
  }

  const handleArchiveMooraya = async (id: number) => {
    const reason = window.prompt('なぜモヤモヤが晴れましたか？（アーカイブ理由）')
    if (!reason) return

    await supabase
      .from('mooraya')
      .update({ archived_at: new Date().toISOString(), archive_reason: reason })
      .eq('id', id)

    await fetchMooraya()
  }

  // --- やりたいこと操作 ---
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setSubmitting(true)
    setError('')

    const insertData: Record<string, unknown> = {
      user_id: user!.id,
      title: taskTitle.trim(),
      description: taskDescription.trim() || null,
      deadline_type: taskDeadlineType,
      deadline_date: taskDeadlineType === 'specific_date' ? taskDeadlineDate : null,
      weight: taskWeight,
      reason: taskReason.trim() || '理由なんてなくても',
    }

    const { data: newTask, error: err } = await supabase
      .from('tasks')
      .insert(insertData)
      .select('id')
      .single()

    if (err) {
      setError(err.message)
    } else if (newTask) {
      // デフォルトのステップを1つ作成（タイトルと同じ）
      await supabase
        .from('task_steps')
        .insert({ task_id: newTask.id, step_number: 1, title: taskTitle.trim() })

      setTaskTitle('')
      setTaskDescription('')
      setTaskDeadlineType('someday')
      setTaskDeadlineDate('')
      setTaskWeight(1)
      setTaskReason('')
      setShowTaskForm(false)
      await fetchTasks()
    }
    setSubmitting(false)
  }

  const handleDeleteTask = async (task: Task) => {
    if (task.weight >= 4) {
      const reason = window.prompt('重み4以上のやることです。やらない理由を教えてください。')
      if (!reason) return
    } else {
      if (!window.confirm('このやりたいことを削除しますか？')) return
    }

    await supabase.from('tasks').delete().eq('id', task.id)
    await fetchTasks()
  }

  const getTagLabel = (tag: string) => TAG_OPTIONS.find(t => t.value === tag)?.label ?? tag
  const getDeadlineLabel = (type: string) => DEADLINE_OPTIONS.find(d => d.value === type)?.label ?? type

  return (
    <div className="home-container">
      <header className="home-header">
        <div>
          <h1>Moyaction</h1>
          <p>ようこそ、{user?.user_metadata?.username ?? user?.email}さん</p>
        </div>
        <button className="btn-secondary" onClick={() => signOut()}>
          ログアウト
        </button>
      </header>

      <nav className="tab-bar">
        <button className="tab-btn active">ホーム</button>
        <button className="tab-btn">アーカイブ</button>
        <button className="tab-btn">マイページ</button>
      </nav>

      <main className="home-content">
        {error && <p className="form-error">{error}</p>}

        {/* ===== やりたいこと セクション ===== */}
        <section className="section">
          <div className="section-header">
            <h2>やりたいこと</h2>
            <button className="btn-add" onClick={() => setShowTaskForm(!showTaskForm)}>
              {showTaskForm ? '閉じる' : '+ 追加'}
            </button>
          </div>

          {showTaskForm && (
            <form onSubmit={handleCreateTask} className="create-form">
              <div className="form-group">
                <label>タイトル *</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="やりたいことを入力"
                  required
                />
              </div>
              <div className="form-group">
                <label>概要</label>
                <textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  placeholder="詳しい説明（任意）"
                  rows={2}
                />
              </div>
              <div className="form-row">
                <div className="form-group form-group-half">
                  <label>期限 *</label>
                  <select value={taskDeadlineType} onChange={e => setTaskDeadlineType(e.target.value)}>
                    {DEADLINE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group form-group-half">
                  <label>重み（1〜5）*</label>
                  <select value={taskWeight} onChange={e => setTaskWeight(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map(w => (
                      <option key={w} value={w}>{w}{w >= 4 ? ' (監査対象)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              {taskDeadlineType === 'specific_date' && (
                <div className="form-group">
                  <label>期限日付 *</label>
                  <input
                    type="date"
                    value={taskDeadlineDate}
                    onChange={e => setTaskDeadlineDate(e.target.value)}
                    required
                  />
                </div>
              )}
              {taskWeight >= 4 && (
                <div className="form-group">
                  <label>やる理由 *（重み4以上は必須）</label>
                  <input
                    type="text"
                    value={taskReason}
                    onChange={e => setTaskReason(e.target.value)}
                    placeholder="やる理由を入力"
                    required
                  />
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? '作成中...' : 'やりたいことを作成'}
              </button>
            </form>
          )}

          {taskList.length === 0 && !showTaskForm && (
            <p className="placeholder-text">まだ「やりたいこと」はありません。</p>
          )}

          <div className="item-list">
            {taskList.map(task => (
              <div key={task.id} className="item-card">
                <div className="item-card-header">
                  <span className="item-title">{task.title}</span>
                  <span className={`weight-badge weight-${task.weight}`}>{task.weight}</span>
                </div>
                {task.description && <p className="item-description">{task.description}</p>}
                <div className="item-meta">
                  <span className="tag-badge">{getDeadlineLabel(task.deadline_type)}</span>
                  {task.deadline_date && <span className="meta-text">{task.deadline_date}</span>}
                </div>
                <div className="item-actions">
                  <button className="btn-small btn-danger" onClick={() => handleDeleteTask(task)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== モヤモヤ セクション ===== */}
        <section className="section">
          <div className="section-header">
            <h2>モヤモヤ</h2>
            <button className="btn-add" onClick={() => setShowMoorayaForm(!showMoorayaForm)}>
              {showMoorayaForm ? '閉じる' : '+ 追加'}
            </button>
          </div>

          {showMoorayaForm && (
            <form onSubmit={handleCreateMooraya} className="create-form">
              <div className="form-group">
                <label>テキスト *</label>
                <textarea
                  value={moorayaContent}
                  onChange={e => setMoorayaContent(e.target.value)}
                  placeholder="モヤモヤを書き出してみよう..."
                  rows={3}
                  required
                />
              </div>
              <div className="form-group">
                <label>タグ *</label>
                <div className="tag-selector">
                  {TAG_OPTIONS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`tag-option ${moorayaTag === t.value ? 'active' : ''}`}
                      onClick={() => setMoorayaTag(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? '作成中...' : 'モヤモヤを記録'}
              </button>
            </form>
          )}

          {moorayaList.length === 0 && !showMoorayaForm && (
            <p className="placeholder-text">まだ「モヤモヤ」はありません。</p>
          )}

          <div className="item-list">
            {moorayaList.map(m => (
              <div key={m.id} className="item-card">
                {editingMoorayaId === m.id ? (
                  <div className="edit-inline">
                    <textarea
                      value={editingMoorayaContent}
                      onChange={e => setEditingMoorayaContent(e.target.value)}
                      rows={2}
                    />
                    <div className="item-actions">
                      <button className="btn-small btn-save" disabled={submitting} onClick={() => handleUpdateMooraya(m.id)}>保存</button>
                      <button className="btn-small" onClick={() => setEditingMoorayaId(null)}>キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="item-card-header">
                      <span className="item-content">{m.content}</span>
                      <span className={`tag-badge tag-${m.tag}`}>{getTagLabel(m.tag)}</span>
                    </div>
                    <div className="item-actions">
                      <button className="btn-small" onClick={() => { setEditingMoorayaId(m.id); setEditingMoorayaContent(m.content) }}>編集</button>
                      <button className="btn-small btn-archive" onClick={() => handleArchiveMooraya(m.id)}>解消</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
