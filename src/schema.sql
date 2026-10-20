-- 직원의 전체 원본 필드 및 변경된 필드는 JSONB 로 보존하고,
-- 자주 찾는 식별자·소속·정렬 순서는 독립 컬럼으로 관리합니다.
-- 1차 연동판이므로 업무분장 원문·과거 이력을 손실 없이 이전하는 것이 우선입니다.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  name TEXT PRIMARY KEY,
  parent_name TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL REFERENCES departments(name),
  seed_index INTEGER NOT NULL,
  payload JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_manual_entry BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 기존에 등록한 직원·관리자 신규 등록 기록을 삭제 없이 안전하게 이관합니다.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_manual_entry BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_by TEXT;
-- 최종 수정일은 초기 명단 적재일과 구별합니다. 한 번도 수정하지 않은 직원은 NULL 입니다.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_modified_by TEXT;
UPDATE employees SET is_manual_entry=TRUE
  WHERE is_manual_entry=FALSE AND payload->>'sourceSection'='관리자 신규 등록';
CREATE INDEX IF NOT EXISTS employees_active_department_idx ON employees (department, seed_index) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS employees_department_order_idx ON employees (department, seed_index);
CREATE TABLE IF NOT EXISTS historical_snapshots (
  archive_id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  source_index INTEGER NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS historical_period_idx ON historical_snapshots (period DESC);
CREATE INDEX IF NOT EXISTS historical_name_idx ON historical_snapshots (name);
CREATE TABLE IF NOT EXISTS department_orders (
  department TEXT PRIMARY KEY REFERENCES departments(name),
  employee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(employee_ids) = 'array')
);
CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 시안에서 요청하신 1인 관리자 운영 정책: 관리자 계정 하나만 허용.
CREATE UNIQUE INDEX IF NOT EXISTS admin_single_account_idx ON admin_users ((true));
-- 조회 전용 계정도 하나만 허용합니다. 기존 관리자 계정은 유지합니다.
CREATE TABLE IF NOT EXISTS viewer_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS viewer_single_account_idx ON viewer_users ((true));
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  department TEXT,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_recent_idx ON audit_logs (created_at DESC);
-- 직원별 전체 변경 이력 검색 (퇴직/논리 삭제된 직원의 로그도 보존).
CREATE INDEX IF NOT EXISTS audit_logs_employee_revision_idx ON audit_logs (target_id,id DESC)
  WHERE action IN ('employee.create','employee.update','employee.delete');
-- 이전 버전에서 이미 변경한 직원의 최종 수정일/수정자를 과거 로그로 복원합니다.
-- 단순 초기 데이터 등록은 최종 수정일로 간주하지 않습니다.
UPDATE employees AS emp
SET last_modified_at=recent.created_at, last_modified_by=recent.actor
FROM (
 SELECT DISTINCT ON (target_id) target_id,created_at,actor
 FROM audit_logs
 WHERE action='employee.update' AND target_id IS NOT NULL
 ORDER BY target_id,id DESC
) AS recent
WHERE emp.id=recent.target_id
  AND (emp.last_modified_at IS NULL OR emp.last_modified_at<recent.created_at);

