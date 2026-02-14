-- ============================================
-- Moyaction Project - Database Schema
-- Phase 2: 7 Tables + RLS
-- ============================================

-- 1. users テーブル（Supabase Auth と連動）
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. mooraya テーブル（モヤモヤ）
CREATE TABLE mooraya (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tag VARCHAR(50) NOT NULL CHECK (tag IN ('worry', 'idea', 'question')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archive_reason TEXT
);

-- 3. tasks テーブル（やりたいこと）
CREATE TABLE tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deadline_type VARCHAR(20) NOT NULL CHECK (deadline_type IN ('specific_date', 'within_2weeks', 'within_2months', 'within_1year', 'someday')),
  deadline_date DATE,
  weight INT NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 5),
  reason TEXT DEFAULT '理由なんてなくても',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completion_note TEXT,
  archived_at TIMESTAMPTZ
);

-- 4. task_steps テーブル（ステップ・パス）
CREATE TABLE task_steps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. task_step_todos テーブル（ステップ内のtodo）
CREATE TABLE task_step_todos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step_id BIGINT NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. mooraya_tasks テーブル（モヤモヤ × やりたいこと 中間テーブル）
CREATE TABLE mooraya_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mooraya_id BIGINT NOT NULL REFERENCES mooraya(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mooraya_id, task_id)
);

-- 7. logs テーブル（エラーログ）
CREATE TABLE logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  endpoint TEXT,
  status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- インデックス
-- ============================================
CREATE INDEX idx_mooraya_user_id ON mooraya(user_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_task_step_todos_step_id ON task_step_todos(step_id);
CREATE INDEX idx_mooraya_tasks_mooraya_id ON mooraya_tasks(mooraya_id);
CREATE INDEX idx_mooraya_tasks_task_id ON mooraya_tasks(task_id);
CREATE INDEX idx_logs_user_id ON logs(user_id);

-- ============================================
-- updated_at 自動更新トリガー
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_mooraya_updated_at
  BEFORE UPDATE ON mooraya
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_task_steps_updated_at
  BEFORE UPDATE ON task_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_task_step_todos_updated_at
  BEFORE UPDATE ON task_step_todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ユーザー自動作成トリガー（Supabase Auth 連動）
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- RLS（Row Level Security）設定
-- ============================================

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- mooraya
ALTER TABLE mooraya ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mooraya_select_own" ON mooraya
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mooraya_insert_own" ON mooraya
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mooraya_update_own" ON mooraya
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "mooraya_delete_own" ON mooraya
  FOR DELETE USING (auth.uid() = user_id);

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_own" ON tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tasks_insert_own" ON tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_update_own" ON tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tasks_delete_own" ON tasks
  FOR DELETE USING (auth.uid() = user_id);

-- task_steps（親taskのuser_idで制御）
ALTER TABLE task_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_steps_select_own" ON task_steps
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_steps.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "task_steps_insert_own" ON task_steps
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_steps.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "task_steps_update_own" ON task_steps
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_steps.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "task_steps_delete_own" ON task_steps
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM tasks WHERE tasks.id = task_steps.task_id AND tasks.user_id = auth.uid())
  );

-- task_step_todos（親step→taskのuser_idで制御）
ALTER TABLE task_step_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_step_todos_select_own" ON task_step_todos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM task_steps
      JOIN tasks ON tasks.id = task_steps.task_id
      WHERE task_steps.id = task_step_todos.step_id AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "task_step_todos_insert_own" ON task_step_todos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_steps
      JOIN tasks ON tasks.id = task_steps.task_id
      WHERE task_steps.id = task_step_todos.step_id AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "task_step_todos_update_own" ON task_step_todos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM task_steps
      JOIN tasks ON tasks.id = task_steps.task_id
      WHERE task_steps.id = task_step_todos.step_id AND tasks.user_id = auth.uid()
    )
  );

CREATE POLICY "task_step_todos_delete_own" ON task_step_todos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM task_steps
      JOIN tasks ON tasks.id = task_steps.task_id
      WHERE task_steps.id = task_step_todos.step_id AND tasks.user_id = auth.uid()
    )
  );

-- mooraya_tasks（両親テーブルのuser_idで制御）
ALTER TABLE mooraya_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mooraya_tasks_select_own" ON mooraya_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM mooraya WHERE mooraya.id = mooraya_tasks.mooraya_id AND mooraya.user_id = auth.uid())
  );

CREATE POLICY "mooraya_tasks_insert_own" ON mooraya_tasks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM mooraya WHERE mooraya.id = mooraya_tasks.mooraya_id AND mooraya.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = mooraya_tasks.task_id AND tasks.user_id = auth.uid())
  );

CREATE POLICY "mooraya_tasks_delete_own" ON mooraya_tasks
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM mooraya WHERE mooraya.id = mooraya_tasks.mooraya_id AND mooraya.user_id = auth.uid())
  );

-- logs（自分のログのみ閲覧可、挿入は誰でも可）
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs_select_own" ON logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "logs_insert_any" ON logs
  FOR INSERT WITH CHECK (true);
