'use strict';
// Upgrade ONLY a previously initialized, unedited synthetic dataset.
// Never copy source employees or identify an actual employee by job title.
const PROFILE='kird_original_org_and_tasks_v2';
const TAG='contest_synthetic_v1'; // Safety marker; do not change on public branding edits.
const WRITES=['employee.create','employee.update','employee.delete','department.order'];

function assertSyntheticIdentity(employee){
  const name=employee?.payload?.name||'';
  const email=employee?.payload?.email||'';
  return /^시연직원\d{3}$|^가상직원\d{3}$/.test(name) &&
    /^(demo|staff)\d{3}@example\.com$/.test(email);
}

async function refreshSyntheticContent(client,seed,archive){
  if(seed.demo_mode!==TAG || archive.demo_mode!==TAG || seed.content_profile!==PROFILE || archive.content_profile!==PROFILE){
    throw new Error('가상 데이터 보호 표식이 일치하지 않습니다.');
  }
  const roots=await client.query("SELECT key,payload FROM app_meta WHERE key IN ('root','archive') FOR UPDATE");
  const meta=Object.fromEntries(roots.rows.map(row=>[row.key,row.payload]));
  if(meta.root?.demo_mode!==TAG || meta.archive?.demo_mode!==TAG){
    throw new Error('기존 가상 데이터가 아닌 DB는 변경할 수 없습니다.');
  }
  if(meta.root.content_profile===PROFILE){return 'already-current';}
  // Do not silently overwrite changes already made through the UI.
  const actions=await client.query('SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = ANY($1::text[])',[WRITES]);
  const orders=await client.query('SELECT COUNT(*)::int AS n FROM department_orders');
  if(actions.rows[0].n>0 || orders.rows[0].n>0){
    throw new Error('현재 가상 데이터에 수정 이력이 있어 자동 갱신하지 않았습니다. 자료를 백업하고 별도 초기화 절차를 진행하세요.');
  }
  const staffRows=await client.query('SELECT id,payload,version,is_manual_entry,deleted_at FROM employees ORDER BY seed_index');
  const histRows=await client.query('SELECT archive_id,source_index,payload FROM historical_snapshots ORDER BY source_index');
  if(staffRows.rowCount!==140 || histRows.rowCount!==708){
    throw new Error('예상 가상 데이터 건수(140명/708건)가 달라 안전하게 중단했습니다.');
  }
  const oldById=new Map(staffRows.rows.map(row=>[row.id,row]));
  if(staffRows.rows.some(row=>row.version!==1 || row.is_manual_entry || row.deleted_at || !assertSyntheticIdentity(row)) ||
     seed.staff.some(row=>!oldById.has(row.id))){
    throw new Error('직원정보가 초기 가상 데이터와 달라 변경하지 않았습니다.');
  }
  if(histRows.rows.some((row,index)=>row.source_index!==index ||
      !/^DEMO-|^H-/.test(row.archive_id) ||
      !/^시연직원\d{3}$|^가상직원\d{3}$/.test(row.payload.name) ||
      row.payload.record_type!=='source_month_snapshot')){
    throw new Error('과거 이력에 수정·추가 자료가 있어 자동 갱신하지 않았습니다.');
  }
  const branches=['원장',...(seed.organizationHierarchy?.원장||[])];
  const departments=[...branches,...seed.departments];
  for(const [index,name] of departments.entries()){
    const parent=name==='원장'?null:branches.includes(name)?'원장':seed.parentMap[name];
    await client.query(`INSERT INTO departments (name,parent_name,sort_index) VALUES ($1,$2,$3)
      ON CONFLICT (name) DO UPDATE SET parent_name=EXCLUDED.parent_name,sort_index=EXCLUDED.sort_index`,
      [name,parent,index]);
  }
  for(const employee of seed.staff){
    const result=await client.query('UPDATE employees SET department=$2,payload=$3::jsonb WHERE id=$1',
      [employee.id,employee.department,JSON.stringify(employee)]);
    if(result.rowCount!==1)throw new Error('직원 갱신 도중 누락된 ID가 확인되었습니다.');
  }
  for(const [i,row] of histRows.rows.entries()){
    const next=archive.records[i];
    if(!next)throw new Error('가상 이력 항목이 누락되었습니다.');
    const result=await client.query(`UPDATE historical_snapshots
      SET archive_id=$2,period=$3,name=$4,department=$5,source_index=$6,payload=$7::jsonb
      WHERE archive_id=$1`,[
        row.archive_id,next.archive_id,next.period,next.name,next.department,i,JSON.stringify(next)
      ]);
    if(result.rowCount!==1)throw new Error('과거 이력 갱신 중 누락된 항목이 확인되었습니다.');
  }
  await client.query('DELETE FROM departments WHERE name <> ALL($1::text[])',[departments]);
  const root={...seed};delete root.staff;
  const archiveInfo={...archive};delete archiveInfo.records;
  await client.query("UPDATE app_meta SET payload=$2::jsonb WHERE key=$1",['root',JSON.stringify(root)]);
  await client.query("UPDATE app_meta SET payload=$2::jsonb WHERE key=$1",['archive',JSON.stringify(archiveInfo)]);
  // Only the original suggested default IDs are changed; password hashes remain unchanged.
  await client.query("UPDATE admin_users SET username='kird_admin' WHERE username='demo_admin'");
  await client.query("UPDATE viewer_users SET username='kird_viewer' WHERE username='demo_viewer'");
  return 'updated';
}
module.exports={PROFILE,TAG,WRITES,assertSyntheticIdentity,refreshSyntheticContent};
