'use strict';
const {pool} = require('../src/db');
(async()=>{
  const q = await pool.query(`SELECT
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND COALESCE(payload->>'rosterStatus','재직')<>'퇴직')::int AS current_staff,
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND payload->>'rosterStatus'='퇴직')::int AS retired_staff,
    (SELECT count(*) FROM employees WHERE deleted_at IS NOT NULL)::int AS deleted_entries,
    (SELECT count(*) FROM employees)::int AS total_records,
    (SELECT count(*) FROM historical_snapshots)::int AS history,
    (SELECT count(*) FROM historical_snapshots WHERE COALESCE(payload->>'record_type','source_month_snapshot') <> 'employee_revision')::int AS original_monthly_history,
    (SELECT count(*) FROM historical_snapshots WHERE payload->>'record_type' = 'employee_revision')::int AS public_staff_change_history,
    (SELECT count(*) FROM departments)::int AS departments,
    (SELECT count(*) FROM admin_users)::int AS admins,
    (SELECT count(*) FROM viewer_users)::int AS viewers,
    (SELECT count(*) FROM employees WHERE last_modified_at IS NOT NULL)::int AS staff_with_changes,
    (SELECT count(*) FROM audit_logs WHERE action IN ('employee.create','employee.update','employee.delete'))::int AS employee_revisions,
    (SELECT count(*) FROM audit_logs)::int AS audit_logs`);
  console.table(q.rows);
})().catch(err=>{console.error('접속 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
