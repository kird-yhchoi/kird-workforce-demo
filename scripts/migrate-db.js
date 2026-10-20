'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pool}=require('../src/db');
const {makeRevisionArchive}=require('../src/archive-revisions');
async function run(){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname,'../src/schema.sql'),'utf8'));
    // 이미 PostgreSQL의 audit_logs에 남아 있는 과거 직원 수정분도 공용 이력으로 보완합니다.
    // REV-{audit_id}는 고유값이므로 마이그레이션을 반복해도 기록이 중복되지 않습니다.
    const logRows=await client.query(`SELECT a.id,a.actor,a.action,a.target_id,a.created_at,a.before_value,a.after_value
      FROM audit_logs a
      WHERE a.action='employee.update' AND a.before_value IS NOT NULL AND a.after_value IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM historical_snapshots h WHERE h.archive_id='REV-'||a.id::text)
      ORDER BY a.id`);
    let migrated=0;
    for(const audit of logRows.rows){
      const archived=makeRevisionArchive(audit);
      const saved=await client.query(`INSERT INTO historical_snapshots
        (archive_id,period,name,department,source_index,payload)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (archive_id) DO NOTHING`,
        [archived.archive_id,archived.period,archived.name,archived.department,
         archived.source_row_order,JSON.stringify(archived)]);
      migrated+=saved.rowCount;
    }
    const q=await client.query(`SELECT COUNT(*)::int AS all_staff,
      COUNT(*) FILTER (WHERE is_manual_entry)::int AS admin_added,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
      FROM employees`);
    await client.query('COMMIT');
    console.log('DB 구조 업데이트 완료. 기존 직원·원본 708건은 유지했습니다.');
    console.log('직원 수정 이력 중 과거 기록에서 가져온 건수:',migrated);
    console.log('DB 직원 기록:',q.rows[0].all_staff,'/ 관리자 신규 등록:',q.rows[0].admin_added,'/ 오등록 삭제:',q.rows[0].deleted);
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
run().catch(err=>{console.error('DB 마이그레이션 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
