import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// ===== 型定義 =====
type Mooraya = {
  id: number
  content: string
  tag: 'worry' | 'idea' | 'question'
  created_at: string
  updated_at: string
  archived_at: string | null
  archive_reason: string | null
}

type TaskStepTodo = {
  id: number
  step_id: number
  title: string
  completed: boolean
}

type TaskStep = {
  id: number
  task_id: number
  step_number: number
  title: string
  completed: boolean
  task_step_todos: TaskStepTodo[]
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
  completed_at: string | null
  completion_note: string | null
  archived_at: string | null
  task_steps: TaskStep[]
}

type MoorayaTaskLink = {
  id: number
  mooraya_id: number
  task_id: number
  task?: Task
}

type Stats = {
  active_mooraya: number
  active_tasks: number
  archived_mooraya: number
  archived_tasks: number
  completed_steps: number
  total_steps: number
}

type TabType = 'home' | 'archive' | 'mypage'
type HomeContentTab = 'tasks' | 'mooraya'

// ===== 定数 =====
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

// ===== API ヘルパー =====
const getToken = async () => {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

const apiFetch = async (path: string, options?: RequestInit) => {
  const token = await getToken()
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  })
  return res.json()
}

// ===== メインコンポーネント =====
export function HomePage() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('home')
  const [homeContentTab, setHomeContentTab] = useState<HomeContentTab>('tasks')

  // --- モヤモヤ state ---
  const [moorayaList, setMoorayaList] = useState<Mooraya[]>([])
  const [showMoorayaForm, setShowMoorayaForm] = useState(false)
  const [moorayaContent, setMoorayaContent] = useState('')
  const [moorayaTag, setMoorayaTag] = useState<Mooraya['tag']>('worry')
  const [expandedMoorayaId, setExpandedMoorayaId] = useState<number | null>(null)
  const [moorayaLinks, setMoorayaLinks] = useState<Record<number, MoorayaTaskLink[]>>({})

  // --- やりたいこと state ---
  const [taskList, setTaskList] = useState<Task[]>([])
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskDeadlineType, setTaskDeadlineType] = useState('someday')
  const [taskDeadlineDate, setTaskDeadlineDate] = useState('')
  const [taskWeight, setTaskWeight] = useState(1)
  const [taskReason, setTaskReason] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null)

  // --- 作成フォームのステップ state ---
  const [formSteps, setFormSteps] = useState<string[]>([])

  // --- ステップ追加 state (モーダル内) ---
  const [addingStepTaskId, setAddingStepTaskId] = useState<number | null>(null)
  const [newStepTitle, setNewStepTitle] = useState('')

  // --- Todo追加 state (モーダル内) ---
  const [addingTodoStepId, setAddingTodoStepId] = useState<number | null>(null)
  const [newTodoTitle, setNewTodoTitle] = useState('')

  // --- モヤモヤ紐づけ state ---
  const [linkingMoorayaId, setLinkingMoorayaId] = useState<number | null>(null)

  // --- アーカイブ state ---
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([])
  const [archivedMooraya, setArchivedMooraya] = useState<Mooraya[]>([])

  // --- 統計 state ---
  const [stats, setStats] = useState<Stats | null>(null)

  // --- 共通 state ---
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // --- モーダル state ---
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingMooraya, setEditingMooraya] = useState<Mooraya | null>(null)

  // --- モーダル内編集 state ---
  const [modalTaskTitle, setModalTaskTitle] = useState('')
  const [modalTaskDescription, setModalTaskDescription] = useState('')
  const [modalTaskDeadlineType, setModalTaskDeadlineType] = useState('')
  const [modalTaskDeadlineDate, setModalTaskDeadlineDate] = useState('')
  const [modalTaskWeight, setModalTaskWeight] = useState(1)
  const [modalTaskReason, setModalTaskReason] = useState('')
  const [modalMoorayaContent, setModalMoorayaContent] = useState('')

  // ===== データ取得 =====
  const fetchMooraya = useCallback(async () => {
    const { data } = await supabase
      .from('mooraya')
      .select('id, content, tag, created_at, updated_at, archived_at, archive_reason')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (data) setMoorayaList(data)
  }, [])

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, deadline_type, deadline_date, weight, reason, created_at, completed_at, completion_note, archived_at, task_steps(id, task_id, step_number, title, completed, task_step_todos(id, step_id, title, completed))')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    if (data) {
      const sorted = data.map((t: Task) => ({
        ...t,
        task_steps: (t.task_steps ?? [])
          .sort((a: TaskStep, b: TaskStep) => a.step_number - b.step_number)
      }))
      setTaskList(sorted)
      // モーダルで開いているタスクも更新
      if (editingTask) {
        const updated = sorted.find((t: Task) => t.id === editingTask.id)
        if (updated) setEditingTask(updated)
      }
    }
  }, [editingTask])

  const fetchMoorayaLinks = useCallback(async (moorayaId: number) => {
    const { data } = await supabase
      .from('mooraya_tasks')
      .select('id, mooraya_id, task_id, task:tasks(id, title, completed_at, archived_at)')
      .eq('mooraya_id', moorayaId)
    if (data) {
      setMoorayaLinks(prev => ({ ...prev, [moorayaId]: data as unknown as MoorayaTaskLink[] }))
    }
  }, [])

  const fetchArchivedTasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, deadline_type, deadline_date, weight, reason, created_at, completed_at, completion_note, archived_at, task_steps(id, task_id, step_number, title, completed, task_step_todos(id, step_id, title, completed))')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (data) setArchivedTasks(data as Task[])
  }, [])

  const fetchArchivedMooraya = useCallback(async () => {
    const { data } = await supabase
      .from('mooraya')
      .select('id, content, tag, created_at, updated_at, archived_at, archive_reason')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
    if (data) setArchivedMooraya(data)
  }, [])

  const fetchStats = useCallback(async () => {
    const res = await apiFetch('stats')
    if (res.success) setStats(res.data)
  }, [])

  useEffect(() => {
    fetchMooraya()
    fetchTasks()
  }, [fetchMooraya, fetchTasks])

  useEffect(() => {
    if (activeTab === 'archive') {
      fetchArchivedTasks()
      fetchArchivedMooraya()
    } else if (activeTab === 'mypage') {
      fetchStats()
    }
  }, [activeTab, fetchArchivedTasks, fetchArchivedMooraya, fetchStats])

  // ===== モヤモヤ操作 =====
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

  const handleArchiveMooraya = async (id: number) => {
    const reason = window.prompt('なぜモヤモヤが晴れましたか？（アーカイブ理由）')
    if (!reason) return

    await supabase
      .from('mooraya')
      .update({ archived_at: new Date().toISOString(), archive_reason: reason })
      .eq('id', id)

    await fetchMooraya()
  }

  const handleExpandMooraya = async (id: number) => {
    if (expandedMoorayaId === id) {
      setExpandedMoorayaId(null)
      return
    }
    setExpandedMoorayaId(id)
    await fetchMoorayaLinks(id)
  }

  // --- モヤモヤ紐づけ ---
  const handleLinkTaskToMooraya = async (moorayaId: number, taskId: number) => {
    setSubmitting(true)
    await apiFetch('mooraya-tasks', {
      method: 'POST',
      body: JSON.stringify({ mooraya_id: moorayaId, task_id: taskId }),
    })
    await fetchMoorayaLinks(moorayaId)
    setLinkingMoorayaId(null)
    setSubmitting(false)
  }

  const handleUnlinkTask = async (linkId: number, moorayaId: number) => {
    if (!window.confirm('この紐づけを解除しますか？')) return
    await supabase.from('mooraya_tasks').delete().eq('id', linkId)
    await fetchMoorayaLinks(moorayaId)
  }

  // --- モヤモヤ解消確認 ---
  const handleResolveMooraya = async (moorayaId: number) => {
    const res = await apiFetch(`mooraya/${moorayaId}/pending-tasks`)
    if (res.success && res.data && res.data.length > 0) {
      alert(`まだ未完了のやることが${res.data.length}件あります。全て完了してからモヤモヤを解消してください。`)
      return
    }
    if (window.confirm('このモヤモヤは解消されましたか？\n「はい」を選ぶと、紐づくやることと共にアーカイブされます。')) {
      const resolveRes = await apiFetch(`mooraya/${moorayaId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolved: true }),
      })
      if (resolveRes.success) {
        await fetchMooraya()
        await fetchTasks()
      } else {
        alert(resolveRes.message || 'エラーが発生しました')
      }
    }
  }

  // ===== やりたいこと操作 =====
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
      // フォームで入力されたステップを保存（なければタイトルをデフォルトステップに）
      const stepsToInsert = formSteps.filter(s => s.trim()).length > 0
        ? formSteps.filter(s => s.trim()).map((s, i) => ({
            task_id: newTask.id,
            step_number: i + 1,
            title: s.trim(),
          }))
        : [{ task_id: newTask.id, step_number: 1, title: taskTitle.trim() }]

      await supabase.from('task_steps').insert(stepsToInsert)

      setTaskTitle('')
      setTaskDescription('')
      setTaskDeadlineType('someday')
      setTaskDeadlineDate('')
      setTaskWeight(1)
      setTaskReason('')
      setFormSteps([])
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

  // --- ステップ操作 ---
  const handleToggleStep = async (step: TaskStep) => {
    await supabase
      .from('task_steps')
      .update({ completed: !step.completed })
      .eq('id', step.id)
    await fetchTasks()
  }

  const handleAddStep = async (taskId: number) => {
    if (!newStepTitle.trim()) return
    setSubmitting(true)

    const task = taskList.find(t => t.id === taskId)
    const maxStep = task?.task_steps?.reduce((max, s) => Math.max(max, s.step_number), 0) ?? 0

    await supabase
      .from('task_steps')
      .insert({ task_id: taskId, step_number: maxStep + 1, title: newStepTitle.trim() })

    setNewStepTitle('')
    setAddingStepTaskId(null)
    await fetchTasks()
    setSubmitting(false)
  }

  const handleDeleteStep = async (stepId: number) => {
    if (!window.confirm('このステップを削除しますか？')) return
    await supabase.from('task_steps').delete().eq('id', stepId)
    await fetchTasks()
  }

  // --- Todo操作 ---
  const handleToggleTodo = async (todo: TaskStepTodo) => {
    await supabase
      .from('task_step_todos')
      .update({ completed: !todo.completed })
      .eq('id', todo.id)
    await fetchTasks()
  }

  const handleAddTodo = async (stepId: number) => {
    if (!newTodoTitle.trim()) return
    setSubmitting(true)

    await supabase
      .from('task_step_todos')
      .insert({ step_id: stepId, title: newTodoTitle.trim() })

    setNewTodoTitle('')
    setAddingTodoStepId(null)
    await fetchTasks()
    setSubmitting(false)
  }

  const handleDeleteTodo = async (todoId: number) => {
    if (!window.confirm('このTodoを削除しますか？')) return
    await supabase.from('task_step_todos').delete().eq('id', todoId)
    await fetchTasks()
  }

  // --- タスク完了 ---
  const handleCompleteTask = async (task: Task) => {
    const note = window.prompt('完了おめでとう！感想を一言どうぞ（任意）') ?? ''
    setSubmitting(true)

    const res = await apiFetch(`tasks/${task.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completion_note: note }),
    })

    if (res.success) {
      await fetchTasks()
      await fetchMooraya()
    } else {
      alert(res.message || 'エラーが発生しました')
    }
    setSubmitting(false)
  }

  // ===== モーダル操作 =====
  const openTaskModal = (task: Task) => {
    setEditingTask(task)
    setModalTaskTitle(task.title)
    setModalTaskDescription(task.description ?? '')
    setModalTaskDeadlineType(task.deadline_type)
    setModalTaskDeadlineDate(task.deadline_date ?? '')
    setModalTaskWeight(task.weight)
    setModalTaskReason(task.reason ?? '')
    setAddingStepTaskId(null)
    setAddingTodoStepId(null)
  }

  const closeTaskModal = () => {
    setEditingTask(null)
    setAddingStepTaskId(null)
    setAddingTodoStepId(null)
    setNewStepTitle('')
    setNewTodoTitle('')
  }

  const openMoorayaModal = async (m: Mooraya) => {
    setEditingMooraya(m)
    setModalMoorayaContent(m.content)
    setLinkingMoorayaId(null)
    await fetchMoorayaLinks(m.id)
  }

  const closeMoorayaModal = () => {
    setEditingMooraya(null)
    setLinkingMoorayaId(null)
  }

  // --- モーダル内保存 ---
  const handleSaveTaskField = async (field: string, value: unknown) => {
    if (!editingTask) return
    await supabase
      .from('tasks')
      .update({ [field]: value })
      .eq('id', editingTask.id)
    await fetchTasks()
  }

  const handleSaveMoorayaContent = async () => {
    if (!editingMooraya || !modalMoorayaContent.trim()) return
    await supabase
      .from('mooraya')
      .update({ content: modalMoorayaContent.trim() })
      .eq('id', editingMooraya.id)
    setEditingMooraya({ ...editingMooraya, content: modalMoorayaContent.trim() })
    await fetchMooraya()
  }

  // ===== ユーティリティ =====
  const getTagLabel = (tag: string) => TAG_OPTIONS.find(t => t.value === tag)?.label ?? tag
  const getDeadlineLabel = (type: string) => DEADLINE_OPTIONS.find(d => d.value === type)?.label ?? type

  const getTaskProgress = (task: Task) => {
    const steps = task.task_steps ?? []
    if (steps.length === 0) return { completed: 0, total: 0 }
    const completed = steps.filter(s => s.completed).length
    return { completed, total: steps.length }
  }

  const isAllStepsCompleted = (task: Task) => {
    const steps = task.task_steps ?? []
    return steps.length > 0 && steps.every(s => s.completed)
  }

  const isDeadlineOverdue = (task: Task) => {
    if (task.deadline_date) {
      return new Date(task.deadline_date) < new Date()
    }
    return false
  }

  const getStepStatus = (step: TaskStep, index: number, steps: TaskStep[]) => {
    if (step.completed) return 'completed'
    if (index === 0 || steps[index - 1]?.completed) return 'active'
    return 'pending'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  // ===== レンダリング =====

  // --- やること編集モーダル ---
  const renderTaskModal = () => {
    if (!editingTask) return null
    const task = editingTask
    return (
      <div className="modal-overlay" onClick={closeTaskModal}>
        <div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button className="modal-close-btn" onClick={closeTaskModal}>× 閉じる</button>
            <span className="modal-title">やること編集</span>
          </div>
          <div className="modal-body">
            {/* タイトル編集 */}
            <div className="modal-section">
              <label className="modal-label">タイトル</label>
              <input
                type="text"
                className="modal-input"
                value={modalTaskTitle}
                onChange={e => setModalTaskTitle(e.target.value)}
                onBlur={() => {
                  if (modalTaskTitle.trim() && modalTaskTitle !== task.title) {
                    handleSaveTaskField('title', modalTaskTitle.trim())
                  }
                }}
              />
            </div>

            {/* 概要編集 */}
            <div className="modal-section">
              <label className="modal-label">概要</label>
              <textarea
                className="modal-textarea"
                value={modalTaskDescription}
                onChange={e => setModalTaskDescription(e.target.value)}
                onBlur={() => {
                  const val = modalTaskDescription.trim() || null
                  if (val !== (task.description ?? '')) {
                    handleSaveTaskField('description', val)
                  }
                }}
                rows={2}
                placeholder="詳しい説明（任意）"
              />
            </div>

            {/* 期限・重み・理由 */}
            <div className="modal-row">
              <div className="modal-section modal-section-half">
                <label className="modal-label">期限</label>
                <select
                  className="modal-select"
                  value={modalTaskDeadlineType}
                  onChange={e => {
                    setModalTaskDeadlineType(e.target.value)
                    handleSaveTaskField('deadline_type', e.target.value)
                    if (e.target.value !== 'specific_date') {
                      handleSaveTaskField('deadline_date', null)
                      setModalTaskDeadlineDate('')
                    }
                  }}
                >
                  {DEADLINE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-section modal-section-half">
                <label className="modal-label">重み</label>
                <select
                  className="modal-select"
                  value={modalTaskWeight}
                  onChange={e => {
                    const w = Number(e.target.value)
                    setModalTaskWeight(w)
                    handleSaveTaskField('weight', w)
                  }}
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}{w >= 4 ? ' (監査対象)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {modalTaskDeadlineType === 'specific_date' && (
              <div className="modal-section">
                <label className="modal-label">期限日付</label>
                <input
                  type="date"
                  className="modal-input"
                  value={modalTaskDeadlineDate}
                  onChange={e => {
                    setModalTaskDeadlineDate(e.target.value)
                    handleSaveTaskField('deadline_date', e.target.value || null)
                  }}
                />
              </div>
            )}

            <div className="modal-section">
              <label className="modal-label">やる理由</label>
              <input
                type="text"
                className="modal-input"
                value={modalTaskReason}
                onChange={e => setModalTaskReason(e.target.value)}
                onBlur={() => {
                  if (modalTaskReason !== (task.reason ?? '')) {
                    handleSaveTaskField('reason', modalTaskReason.trim() || null)
                  }
                }}
                placeholder="やる理由を入力"
              />
            </div>

            {/* ステップ一覧 */}
            <div className="modal-section">
              <label className="modal-label">ステップ</label>
              <div className="steps-list">
                {(task.task_steps ?? []).map((step, idx) => {
                  const stepStatus = getStepStatus(step, idx, task.task_steps)
                  return (
                    <div key={step.id} className={`step-item step-${stepStatus}`}>
                      <div className="step-header">
                        <label className="step-checkbox-label">
                          <input
                            type="checkbox"
                            checked={step.completed}
                            onChange={() => handleToggleStep(step)}
                            disabled={stepStatus === 'pending'}
                          />
                          <span className={step.completed ? 'step-title-done' : ''}>
                            {step.step_number}. {step.title}
                          </span>
                        </label>
                        <button
                          className="btn-tiny btn-danger"
                          onClick={() => handleDeleteStep(step.id)}
                          title="ステップ削除"
                        >
                          x
                        </button>
                      </div>

                      {/* Todo一覧 */}
                      {step.task_step_todos && step.task_step_todos.length > 0 && (
                        <div className="todos-list">
                          {step.task_step_todos.map(todo => (
                            <div key={todo.id} className="todo-item">
                              <label className="todo-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={todo.completed}
                                  onChange={() => handleToggleTodo(todo)}
                                />
                                <span className={todo.completed ? 'todo-title-done' : ''}>
                                  {todo.title}
                                </span>
                              </label>
                              <button
                                className="btn-tiny btn-danger"
                                onClick={() => handleDeleteTodo(todo.id)}
                                title="Todo削除"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Todo追加 */}
                      {addingTodoStepId === step.id ? (
                        <div className="add-inline">
                          <input
                            type="text"
                            value={newTodoTitle}
                            onChange={e => setNewTodoTitle(e.target.value)}
                            placeholder="Todoタイトル"
                            onKeyDown={e => e.key === 'Enter' && handleAddTodo(step.id)}
                          />
                          <button className="btn-tiny btn-save" onClick={() => handleAddTodo(step.id)} disabled={submitting}>追加</button>
                          <button className="btn-tiny" onClick={() => setAddingTodoStepId(null)}>取消</button>
                        </div>
                      ) : (
                        <button
                          className="btn-tiny btn-add-inline"
                          onClick={() => { setAddingTodoStepId(step.id); setNewTodoTitle('') }}
                        >
                          + Todo
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ステップ追加 */}
              {addingStepTaskId === task.id ? (
                <div className="add-inline" style={{ marginTop: '0.5rem', marginLeft: 0 }}>
                  <input
                    type="text"
                    value={newStepTitle}
                    onChange={e => setNewStepTitle(e.target.value)}
                    placeholder="ステップタイトル"
                    onKeyDown={e => e.key === 'Enter' && handleAddStep(task.id)}
                  />
                  <button className="btn-tiny btn-save" onClick={() => handleAddStep(task.id)} disabled={submitting}>追加</button>
                  <button className="btn-tiny" onClick={() => setAddingStepTaskId(null)}>取消</button>
                </div>
              ) : (
                <button
                  className="btn-small btn-add-step"
                  onClick={() => { setAddingStepTaskId(task.id); setNewStepTitle('') }}
                  style={{ marginTop: '0.5rem' }}
                >
                  + ステップ追加
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- モヤモヤ編集モーダル ---
  const renderMoorayaModal = () => {
    if (!editingMooraya) return null
    const m = editingMooraya
    return (
      <div className="modal-overlay" onClick={closeMoorayaModal}>
        <div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <button className="modal-close-btn" onClick={closeMoorayaModal}>× 閉じる</button>
            <span className="modal-title">モヤモヤ編集</span>
          </div>
          <div className="modal-body">
            {/* テキスト編集 */}
            <div className="modal-section">
              <label className="modal-label">テキスト</label>
              <textarea
                className="modal-textarea"
                value={modalMoorayaContent}
                onChange={e => setModalMoorayaContent(e.target.value)}
                rows={3}
              />
              <button
                className="btn-small btn-save"
                onClick={handleSaveMoorayaContent}
                disabled={submitting}
                style={{ marginTop: '0.5rem' }}
              >
                保存
              </button>
            </div>

            {/* タグ表示（変更不可） */}
            <div className="modal-section">
              <label className="modal-label">タグ</label>
              <span className={`tag-badge tag-${m.tag}`}>{getTagLabel(m.tag)}</span>
            </div>

            {/* 紐づくやること一覧 */}
            <div className="modal-section">
              <label className="modal-label">紐づくやること</label>
              {(moorayaLinks[m.id] ?? []).length === 0 ? (
                <p className="detail-empty">まだ紐づくやることはありません</p>
              ) : (
                <div className="linked-tasks-list">
                  {(moorayaLinks[m.id] ?? []).map(link => (
                    <div key={link.id} className="linked-task-item">
                      <span className={`linked-task-title ${(link.task as unknown as Task)?.completed_at ? 'done' : ''}`}>
                        {(link.task as unknown as Task)?.title ?? `Task #${link.task_id}`}
                      </span>
                      {(link.task as unknown as Task)?.completed_at && <span className="done-badge">完了</span>}
                      <button className="btn-tiny btn-danger" onClick={() => handleUnlinkTask(link.id, m.id)}>解除</button>
                    </div>
                  ))}
                </div>
              )}

              {/* やること紐づけUI */}
              {linkingMoorayaId === m.id ? (
                <div className="link-task-picker">
                  <p className="picker-label">紐づけるやることを選択:</p>
                  {taskList.filter(t => !(moorayaLinks[m.id] ?? []).some(l => l.task_id === t.id)).length === 0 ? (
                    <p className="detail-empty">紐づけ可能なやることがありません</p>
                  ) : (
                    taskList
                      .filter(t => !(moorayaLinks[m.id] ?? []).some(l => l.task_id === t.id))
                      .map(t => (
                        <button
                          key={t.id}
                          className="btn-small link-task-btn"
                          onClick={() => handleLinkTaskToMooraya(m.id, t.id)}
                          disabled={submitting}
                        >
                          {t.title}
                        </button>
                      ))
                  )}
                  <button className="btn-tiny" onClick={() => setLinkingMoorayaId(null)}>閉じる</button>
                </div>
              ) : (
                <button
                  className="btn-small btn-add-step"
                  onClick={() => setLinkingMoorayaId(m.id)}
                  style={{ marginTop: '0.5rem' }}
                >
                  + やることを紐づける
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- ホームタブ ---
  const renderHome = () => (
    <>
      <div className="content-tabs">
        <button
          className={`content-tab ${homeContentTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setHomeContentTab('tasks')}
        >
          やりたいこと
        </button>
        <button
          className={`content-tab ${homeContentTab === 'mooraya' ? 'active' : ''}`}
          onClick={() => setHomeContentTab('mooraya')}
        >
          モヤモヤ
        </button>
      </div>
      <main className="home-content">
      {error && <p className="form-error">{error}</p>}

      {/* ===== やりたいこと セクション ===== */}
      {homeContentTab === 'tasks' && <section className="section">
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

            {/* ステップ入力セクション */}
            <div className="form-group">
              <label>ステップ（任意）</label>
              {formSteps.map((step, idx) => (
                <div key={idx} className="form-step-row">
                  <input
                    type="text"
                    value={step}
                    onChange={e => {
                      const newSteps = [...formSteps]
                      newSteps[idx] = e.target.value
                      setFormSteps(newSteps)
                    }}
                    placeholder={`ステップ ${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="btn-tiny btn-danger"
                    onClick={() => setFormSteps(formSteps.filter((_, i) => i !== idx))}
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-small btn-add-step"
                onClick={() => setFormSteps([...formSteps, ''])}
              >
                + ステップ追加
              </button>
            </div>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? '作成中...' : 'やりたいことを作成'}
            </button>
          </form>
        )}

        {taskList.length === 0 && !showTaskForm && (
          <p className="placeholder-text">まだ「やりたいこと」はありません。</p>
        )}

        <div className="item-list">
          {taskList.map(task => {
            const progress = getTaskProgress(task)
            const expanded = expandedTaskId === task.id
            const overdue = isDeadlineOverdue(task)
            const allDone = isAllStepsCompleted(task)

            return (
              <div key={task.id} className={`item-card ${overdue ? 'overdue' : ''}`}>
                <div
                  className="item-card-header clickable"
                  onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                >
                  <div className="item-header-left">
                    <span className="item-title">{task.title}</span>
                    {overdue && <span className="overdue-mark">期限超過</span>}
                  </div>
                  <div className="item-header-right">
                    <span className="progress-text">{progress.completed}/{progress.total}</span>
                    <span className={`weight-badge weight-${task.weight}`}>{task.weight}</span>
                    <span className="expand-icon">{expanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* 進捗バー */}
                {progress.total > 0 && (
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                    />
                  </div>
                )}

                {task.description && <p className="item-description">{task.description}</p>}
                <div className="item-meta">
                  <span className="tag-badge">{getDeadlineLabel(task.deadline_type)}</span>
                  {task.deadline_date && <span className="meta-text">{task.deadline_date}</span>}
                  {task.reason && task.reason !== '理由なんてなくても' && (
                    <span className="meta-text">理由: {task.reason}</span>
                  )}
                </div>

                {/* 展開時: チェックモード（ステップチェックのみ + 編集ボタン） */}
                {expanded && (
                  <div className="task-detail">
                    <div className="detail-header-row">
                      <h4 className="detail-heading">ステップ</h4>
                      <button className="btn-small btn-edit" onClick={() => openTaskModal(task)}>編集</button>
                    </div>
                    <div className="steps-list">
                      {(task.task_steps ?? []).map((step, idx) => {
                        const stepStatus = getStepStatus(step, idx, task.task_steps)
                        return (
                          <div key={step.id} className={`step-item step-${stepStatus}`}>
                            <div className="step-header">
                              <label className="step-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={step.completed}
                                  onChange={() => handleToggleStep(step)}
                                  disabled={stepStatus === 'pending'}
                                />
                                <span className={step.completed ? 'step-title-done' : ''}>
                                  {step.step_number}. {step.title}
                                </span>
                              </label>
                            </div>

                            {/* Todo一覧（チェックのみ） */}
                            {step.task_step_todos && step.task_step_todos.length > 0 && (
                              <div className="todos-list">
                                {step.task_step_todos.map(todo => (
                                  <div key={todo.id} className="todo-item">
                                    <label className="todo-checkbox-label">
                                      <input
                                        type="checkbox"
                                        checked={todo.completed}
                                        onChange={() => handleToggleTodo(todo)}
                                      />
                                      <span className={todo.completed ? 'todo-title-done' : ''}>
                                        {todo.title}
                                      </span>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* アクションボタン */}
                    <div className="item-actions" style={{ marginTop: '0.75rem' }}>
                      {allDone && !task.completed_at && (
                        <button
                          className="btn-small btn-complete"
                          onClick={() => handleCompleteTask(task)}
                          disabled={submitting}
                        >
                          完了する
                        </button>
                      )}
                      <button className="btn-small btn-danger" onClick={() => handleDeleteTask(task)}>削除</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>}

      {/* ===== モヤモヤ セクション ===== */}
      {homeContentTab === 'mooraya' && <section className="section">
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
              <div
                className="item-card-header clickable"
                onClick={() => handleExpandMooraya(m.id)}
              >
                <span className="item-content">{m.content}</span>
                <div className="item-header-right">
                  <span className={`tag-badge tag-${m.tag}`}>{getTagLabel(m.tag)}</span>
                  <span className="expand-icon">{expandedMoorayaId === m.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* 展開時: チェックモード（紐づくやること一覧 読み取り専用 + 編集ボタン） */}
              {expandedMoorayaId === m.id && (
                <div className="mooraya-detail">
                  <div className="detail-header-row">
                    <h4 className="detail-heading">紐づくやること</h4>
                    <button className="btn-small btn-edit" onClick={() => openMoorayaModal(m)}>編集</button>
                  </div>
                  {(moorayaLinks[m.id] ?? []).length === 0 ? (
                    <p className="detail-empty">まだ紐づくやることはありません</p>
                  ) : (
                    <div className="linked-tasks-list">
                      {(moorayaLinks[m.id] ?? []).map(link => (
                        <div key={link.id} className="linked-task-item">
                          <span className={`linked-task-title ${(link.task as unknown as Task)?.completed_at ? 'done' : ''}`}>
                            {(link.task as unknown as Task)?.title ?? `Task #${link.task_id}`}
                          </span>
                          {(link.task as unknown as Task)?.completed_at && <span className="done-badge">完了</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="item-actions">
                    <button className="btn-small btn-archive" onClick={() => handleArchiveMooraya(m.id)}>解消</button>
                    {(moorayaLinks[m.id] ?? []).length > 0 && (
                      <button className="btn-small btn-resolve" onClick={() => handleResolveMooraya(m.id)}>解消確認</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>}
    </main>
    </>
  )

  // --- アーカイブタブ ---
  const renderArchive = () => (
    <main className="home-content">
      <section className="section">
        <h2>完了したやりたいこと</h2>
        {archivedTasks.length === 0 ? (
          <p className="placeholder-text">まだアーカイブされたやることはありません。</p>
        ) : (
          <div className="item-list">
            {archivedTasks.map(task => (
              <div key={task.id} className="item-card archived">
                <div className="item-card-header">
                  <span className="item-title">{task.title}</span>
                  <span className={`weight-badge weight-${task.weight}`}>{task.weight}</span>
                </div>
                {task.description && <p className="item-description">{task.description}</p>}
                {task.completion_note && (
                  <p className="completion-note">感想: {task.completion_note}</p>
                )}
                <div className="item-meta">
                  <span className="tag-badge">{getDeadlineLabel(task.deadline_type)}</span>
                  {task.completed_at && <span className="meta-text">完了: {formatDate(task.completed_at)}</span>}
                  {task.archived_at && <span className="meta-text">アーカイブ: {formatDate(task.archived_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>昇華したモヤモヤ</h2>
        {archivedMooraya.length === 0 ? (
          <p className="placeholder-text">まだアーカイブされたモヤモヤはありません。</p>
        ) : (
          <div className="item-list">
            {archivedMooraya.map(m => (
              <div key={m.id} className="item-card archived">
                <div className="item-card-header">
                  <span className="item-content">{m.content}</span>
                  <span className={`tag-badge tag-${m.tag}`}>{getTagLabel(m.tag)}</span>
                </div>
                {m.archive_reason && (
                  <p className="archive-reason">解消理由: {m.archive_reason}</p>
                )}
                <div className="item-meta">
                  {m.archived_at && <span className="meta-text">アーカイブ: {formatDate(m.archived_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )

  // --- マイページタブ ---
  const renderMyPage = () => (
    <main className="home-content">
      <section className="section">
        <h2>ステータス</h2>
        {stats ? (
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-number">{stats.active_tasks}</span>
              <span className="stat-label">進行中のやること</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{stats.active_mooraya}</span>
              <span className="stat-label">抱えているモヤモヤ</span>
            </div>
            <div className="stat-card stat-card-accent">
              <span className="stat-number">{stats.archived_tasks}</span>
              <span className="stat-label">完了したやること</span>
            </div>
            <div className="stat-card stat-card-accent">
              <span className="stat-number">{stats.archived_mooraya}</span>
              <span className="stat-label">昇華したモヤモヤ</span>
            </div>
            <div className="stat-card stat-card-wide">
              <span className="stat-number">{stats.completed_steps} / {stats.total_steps}</span>
              <span className="stat-label">ステップ完了</span>
            </div>
          </div>
        ) : (
          <p className="placeholder-text">読み込み中...</p>
        )}
      </section>

      <section className="section">
        <h2>アカウント</h2>
        <div className="account-info">
          <p><strong>メール:</strong> {user?.email}</p>
          <p><strong>ユーザー名:</strong> {user?.user_metadata?.username ?? '未設定'}</p>
        </div>
      </section>
    </main>
  )

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

      {activeTab === 'home' && renderHome()}
      {activeTab === 'archive' && renderArchive()}
      {activeTab === 'mypage' && renderMyPage()}

      {/* モーダル */}
      {renderTaskModal()}
      {renderMoorayaModal()}

      <nav className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <span className="tab-icon">{'\u2302'}</span>
          ホーム
        </button>
        <button
          className={`tab-btn ${activeTab === 'archive' ? 'active' : ''}`}
          onClick={() => setActiveTab('archive')}
        >
          <span className="tab-icon">{'\u2610'}</span>
          アーカイブ
        </button>
        <button
          className={`tab-btn ${activeTab === 'mypage' ? 'active' : ''}`}
          onClick={() => setActiveTab('mypage')}
        >
          <span className="tab-icon">{'\u25CB'}</span>
          マイページ
        </button>
      </nav>
    </div>
  )
}
