'use strict';
require('dotenv').config();
const fs=require('node:fs');
const path=require('node:path');
const bcrypt=require('bcryptjs');
const {pool}=require('../src/db');
const seed=require('../data/initial_staff.json');
const archive=require('../data/initial_archive.json');
const {PROFILE,refreshSyntheticContent}=require('../src/synthetic-content-refresh');
const DEMO_TAG='contest_synthetic_v1';
function requiredAccount(env,prefix){
  const username=env['DEMO_'+prefix+'_USERNAME'];
  const password=env['DEMO_'+prefix+'_PASSWORD'];
  if(!username||!/^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/.test(username))throw Error('DEMO_'+prefix+'_USERNAME을 설정하세요.');
  if(!password||password.length<14||password.length>256||/replace_with|password|비밀번호/i.test(password))throw Error('DEMO_'+prefix+'_PASSWORD를 14자 이상으로 설정하세요.');
  return {username,password};
}
async function bootstrap(){
  if(seed.demo_mode!==DEMO_TAG||archive.demo_mode!==DEMO_TAG||seed.staff.length!==140||archive.records.length!==708){
    throw Error('시연 전용 가상 데이터 140명/708건이 아닙니다. 초기화하지 않습니다.');
  }
  if(seed.staff.some(p=>!/^가상직원\d{3}$/.test(p.name)||!/^staff\d{3}@example\.com$/.test(p.email)) ||
     archive.records.some(r=>!/^가상직원\d{3}$/.test(r.name)))throw Error('가상 직원정보 검증에 실패했습니다.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname,'../src/schema.sql'),'utf8'));
    const meta=await client.query("SELECT payload FROM app_meta WHERE key='root'");
    const count=await client.query('SELECT count(*)::int AS n FROM employees');
    if(meta.rowCount){
      if(meta.rows[0].payload?.demo_mode!==DEMO_TAG){throw Error('가상 시연용이 아닌 기존 DB가 감지되어 접속을 중단합니다.');}
    }else if(count.rows[0].n>0){throw Error('이미 다른 직원 데이터가 있는 DB에는 초기화할 수 없습니다.');}
    if(meta.rowCount && meta.rows[0].payload?.content_profile!==PROFILE){
      const result=await refreshSyntheticContent(client,seed,archive);
      if(result==='updated')console.log('KIRD 기관명·부서명·업무명 적용 완료 (기존 계정 암호 유지)');
    }
    if(!meta.rowCount){
      const root={...seed};delete root.staff;
      const archived={...archive};delete archived.records;
      await client.query('INSERT INTO app_meta (key,payload) VALUES ($1,$2::jsonb)', ['root',JSON.stringify(root)]);
      await client.query('INSERT INTO app_meta (key,payload) VALUES ($1,$2::jsonb)', ['archive',JSON.stringify(archived)]);
      const branches=['원장',...(seed.organizationHierarchy?.원장||[])];
      const names=[...branches,...seed.departments];
      for(const [i,name] of names.entries()){
        const parent=name==='원장'?null:branches.includes(name)?'원장':seed.parentMap[name];
        await client.query('INSERT INTO departments(name,parent_name,sort_index) VALUES($1,$2,$3)',[name,parent,i]);
      }
      for(const [i,p] of seed.staff.entries()){
        await client.query('INSERT INTO employees(id,department,seed_index,payload) VALUES($1,$2,$3,$4::jsonb)',[p.id,p.department,i,JSON.stringify(p)]);
      }
      for(const [i,r] of archive.records.entries()){
        await client.query('INSERT INTO historical_snapshots(archive_id,period,name,department,source_index,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
         [r.archive_id,r.period,r.name,r.department,i,JSON.stringify(r)]);
      }
      console.log('가상 직원정보 초기 등록: 직원 140명, 과거 기록 708건');
    }
    const counts=await client.query('SELECT (SELECT count(*)::int FROM admin_users) AS admins,(SELECT count(*)::int FROM viewer_users) AS viewers');
    if(counts.rows[0].admins>1||counts.rows[0].viewers>1)throw Error('시연용 계정이 각각 1개를 초과합니다.');
    const createAdmin=counts.rows[0].admins===0;
    const createViewer=counts.rows[0].viewers===0;
    if(createAdmin||createViewer){
      const admin=createAdmin?requiredAccount(process.env,'ADMIN'):null;
      const viewer=createViewer?requiredAccount(process.env,'VIEWER'):null;
      if(admin&&viewer&&admin.password===viewer.password)throw Error('관리자와 조회 계정의 비밀번호가 같습니다.');
      if(admin&&viewer&&admin.username===viewer.username)throw Error('관리자와 조회 계정 ID가 같으면 안 됩니다.');
      if(admin){
        await client.query('INSERT INTO admin_users(username,password_hash) VALUES($1,$2)',[admin.username,await bcrypt.hash(admin.password,12)]);
      }
      if(viewer){
        const admins=await client.query('SELECT username FROM admin_users');
        if(admins.rows.some(row=>row.username===viewer.username))throw Error('기존 관리자와 조회 계정의 ID가 같습니다.');
        await client.query('INSERT INTO viewer_users(username,password_hash) VALUES($1,$2)',[viewer.username,await bcrypt.hash(viewer.password,12)]);
      }
      console.log('사용자 계정 생성 완료 (비밀번호는 출력하지 않음)');
    }
    await client.query('COMMIT');
    console.log('업무분장 DB 및 계정 확인 완료');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
bootstrap().catch(err=>{console.error('웹앱 실행 준비 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
