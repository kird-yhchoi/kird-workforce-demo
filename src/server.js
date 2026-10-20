'use strict';
const path=require('node:path');
const crypto=require('node:crypto');
const express=require('express');
const helmet=require('helmet');
const session=require('express-session');
const PgSession=require('connect-pg-simple')(session);
const bcrypt=require('bcryptjs');
const {rateLimit}=require('express-rate-limit');
const {pool}=require('./db');
const {makeEmployeeUpdate,makeEmployeeCreate,validateOrder}=require('./validation');
const {employeeChanges,revisionLabel}=require('./revisions');
const {makeRevisionArchive}=require('./archive-revisions');
const {sessionRole,sessionUsername,canRead,canWrite,isUnauthenticatedAuthEndpoint}=require('./auth-policy');

const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||3000);
const dev=process.env.NODE_ENV!=='production';
const sessionSecret=process.env.SESSION_SECRET||'';
if(sessionSecret.length<48||sessionSecret.includes('여기에_')||sessionSecret.includes('replace_with')) {
  console.error('SESSION_SECRET을 .env 에 설정하세요. npm run secret 명령으로 생성할 수 있습니다.');
  process.exit(1);
}
if(dev && !['127.0.0.1','localhost','::1'].includes(HOST)) {
  console.error('개발 모드에서는 HOST=127.0.0.1만 허용합니다. 기관망 배포 전 보안 구성을 별도로 점검하세요.');
  process.exit(1);
}
const app=express();
app.disable('x-powered-by');
if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1); // 검증된 역방향 프록시를 사용하는 경우에만 설정
app.use(helmet({contentSecurityPolicy:{directives:{
  defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"],
  imgSrc:["'self'","data:"], connectSrc:["'self'"],fontSrc:["'self'"],
  objectSrc:["'none'"],frameAncestors:["'none'"],baseUri:["'none'"], formAction:["'self'"]
}}}));
app.use(express.json({limit:'150kb'}));
app.use(session({
  store:new PgSession({pool,tableName:'user_sessions',createTableIfMissing:true}),
  secret:sessionSecret,
  resave:false,
  saveUninitialized:false,
  name:'kird.sid',
  cookie:{httpOnly:true,sameSite:'strict',secure:!dev,maxAge:8*60*60*1000,path:'/'}
}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next()});

function route(handler){return (req,res,next)=>Promise.resolve(handler(req,res)).catch(next)}
function adminOnly(req,res,next){
  if(!canRead(req.session))return res.status(401).json({error:'로그인이 필요합니다.'});
  if(!canWrite(req.session))return res.status(403).json({error:'관리자만 변경할 수 있습니다.'});
  next();
}
function authenticatedOnly(req,res,next){
  if(!canRead(req.session))return res.status(401).json({error:'로그인이 필요합니다.'});
  next();
}
function csrfOnly(req,res,next){
  const sent=req.get('x-csrf-token')||'';
  const wanted=req.session.csrfToken||'';
  if(!sent||!wanted||sent.length!==wanted.length||!crypto.timingSafeEqual(Buffer.from(sent),Buffer.from(wanted)))return res.status(403).json({error:'보안 토큰이 일치하지 않습니다. 새로고침 후 다시 시도하세요.'});
  next();
}
function sameOriginOnly(req,res,next){
  const origin=req.get('origin');
  if(origin && origin!==`${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'다른 출처에서의 요청은 허용되지 않습니다.'});
  next();
}
function bad(message,status=400){const err=new Error(message);err.status=status;return err;}

// 인증되지 않은 사용자는 /api/auth/login, /api/auth/me 외 모든 API에 접근할 수 없습니다.
// 조회 데이터뿐 아니라 상태 확인·쓰기 API까지 서버에서 차단합니다.
app.use('/api',(req,res,next)=>{
  if(isUnauthenticatedAuthEndpoint(req.method,req.path))return next();
  return authenticatedOnly(req,res,next);
});

app.get('/api/health',route(async(req,res)=>{
  const x=await pool.query('SELECT 1');
  res.json({status:x.rowCount?'ok':'error',database:'connected'});
}));
app.get('/api/bootstrap',route(async(req,res)=>{
  const [metaRows,staffRows,historyRows,orderRows]=await Promise.all([
    pool.query("SELECT key,payload FROM app_meta WHERE key IN ('root','archive')"),
    pool.query(canWrite(req.session)
      ? 'SELECT payload,version,is_manual_entry,last_modified_at,last_modified_by FROM employees WHERE deleted_at IS NULL ORDER BY seed_index'
      : "SELECT payload,version,is_manual_entry,last_modified_at,last_modified_by FROM employees WHERE deleted_at IS NULL AND COALESCE(payload->>'rosterStatus','재직')<>'퇴직' ORDER BY seed_index"),
    // 오등록 삭제된 직원의 수정 기록은 관리자 감사 로그에만 보관합니다.
    // 원래 월별 자료는 퇴직·삭제 여부와 관계없이 그대로 조회됩니다.
    pool.query(`SELECT hist.payload FROM historical_snapshots hist
      LEFT JOIN employees emp ON emp.id=hist.payload->>'employee_id'
      WHERE COALESCE(hist.payload->>'record_type','source_month_snapshot')<>'employee_revision'
        OR emp.deleted_at IS NULL
      ORDER BY hist.source_index`),
    pool.query('SELECT department,employee_ids,version FROM department_orders')
  ]);
  const meta=Object.fromEntries(metaRows.rows.map(r=>[r.key,r.payload]));
  if(!meta.root || !meta.archive)throw bad('초기 DB 데이터가 없습니다. npm run db:init 을 실행하세요.',503);
  const staff=staffRows.rows.map(r=>({...r.payload,recordVersion:r.version,isManualEntry:canWrite(req.session)?r.is_manual_entry:false,lastModifiedAt:r.last_modified_at,lastModifiedBy:canWrite(req.session)?r.last_modified_by:null}));
  const archive={...meta.archive,records:historyRows.rows.map(r=>r.payload)};
  const deptOrders=Object.fromEntries(orderRows.rows.map(r=>[r.department,r.employee_ids]));
  const orderVersions=Object.fromEntries(orderRows.rows.map(r=>[r.department,r.version]));
  res.json({seed:{...meta.root,staff},archive,deptOrders,orderVersions});
}));
app.get('/api/auth/me',(req,res)=>res.json({
  loggedIn:canRead(req.session),
  role:sessionRole(req.session),
  username:sessionUsername(req.session),
  csrfToken:canRead(req.session)?req.session.csrfToken:null
}));

const loginLimiter=rateLimit({windowMs:15*60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'로그인 시도가 많습니다. 15분 후 다시 시도하세요.'}});
app.post('/api/auth/login',sameOriginOnly,loginLimiter,route(async(req,res)=>{
  const username=typeof req.body?.username==='string'?req.body.username.trim():'';
  const password=typeof req.body?.password==='string'?req.body.password:'';
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/.test(username)||!password||password.length>256)throw bad('ID 또는 비밀번호가 올바르지 않습니다.',401);
  const [adminResult,viewerResult]=await Promise.all([
    pool.query('SELECT username,password_hash FROM admin_users WHERE username=$1',[username]),
    pool.query('SELECT username,password_hash FROM viewer_users WHERE username=$1',[username])
  ]);
  // 테이블 단위로도 하나의 계정만 허용하고, 동일 ID를 두 역할이 공유하지 않게 합니다.
  if(adminResult.rows.length&&viewerResult.rows.length)throw bad('계정 ID 중복 설정을 확인해 주세요.',503);
  const matched=adminResult.rows.length?adminResult.rows[0]:viewerResult.rows[0];
  const role=adminResult.rows.length?'admin':'viewer';
  // 조회 실패 여부에 따른 응답 차이를 최소화합니다.
  const fake='$2a$12$mhD8L9MPcN2vx77nRmYJeuqAXRnNxRUyS9CDJEEleICJuC3Dv1DxS';
  const ok=await bcrypt.compare(password,matched?.password_hash||fake);
  if(!ok||!matched)throw bad('ID 또는 비밀번호가 올바르지 않습니다.',401);
  await new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));
  req.session.authRole=role;
  req.session.username=username;
  if(role==='admin')req.session.adminUsername=username;
  else req.session.viewerUsername=username;
  req.session.csrfToken=crypto.randomBytes(32).toString('hex');
  res.json({loggedIn:true,role,username,csrfToken:req.session.csrfToken});
}));
app.post('/api/auth/logout',sameOriginOnly,authenticatedOnly,csrfOnly,(req,res,next)=>{
  req.session.destroy(err=>{
    if(err)return next(err);
    res.clearCookie('kird.sid',{path:'/',sameSite:'strict',secure:!dev});
    res.json({loggedIn:false});
  });
});


// 기존 데이터에 손대지 않고 신규 직원 한 명만 DB에 추가합니다.
// 동일 이름·부서 등록 및 신규 ID 발급의 경쟁 상태를 트랜잭션 잠금으로 방지합니다.
app.post('/api/employees',sameOriginOnly,adminOnly,csrfOnly,route(async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)',[2178901]);
    const deptRows=await client.query('SELECT name,parent_name FROM departments');
    const deptMap=Object.fromEntries(deptRows.rows.map(d=>[d.name,d.parent_name]));
    let created;
    try{created=makeEmployeeCreate(req.body?.employee,Object.keys(deptMap),deptMap)}
    catch(err){throw bad(err.message,400)}
    const duplicates=await client.query(
      "SELECT id FROM employees WHERE deleted_at IS NULL AND department=$1 AND payload->>'name'=$2 LIMIT 1",
      [created.department,created.name]);
    if(duplicates.rowCount)throw bad('같은 부서에 동일한 성명의 직원이 이미 등록되어 있습니다. 기존 직원 명단을 확인해 주세요.',409);
    if(created.email){
      const duplicateEmail=await client.query(
        "SELECT id FROM employees WHERE deleted_at IS NULL AND lower(payload->>'email')=lower($1) LIMIT 1",[created.email]);
      if(duplicateEmail.rowCount)throw bad('이미 등록된 업무용 이메일입니다. 기존 직원 연락처를 확인해 주세요.',409);
    }
    const ids=await client.query(`SELECT
      COALESCE(MAX(CAST(substring(id FROM '^E([0-9]{3,6})$') AS INTEGER)),0) AS last_id,
      COALESCE(MAX(seed_index),-1) AS last_index
      FROM employees`);
    const nextId=Number(ids.rows[0].last_id)+1;
    if(nextId>999999)throw bad('직원 식별자 발급 한도를 초과했습니다.',409);
    created.id='E'+String(nextId).padStart(3,'0');
    const nextIndex=Number(ids.rows[0].last_index)+1;
    await client.query('INSERT INTO employees(id,department,seed_index,payload,is_manual_entry) VALUES ($1,$2,$3,$4::jsonb,TRUE)',
      [created.id,created.department,nextIndex,JSON.stringify(created)]);
    await client.query('INSERT INTO audit_logs(actor,action,target_id,department,before_value,after_value) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [req.session.adminUsername,'employee.create',created.id,created.department,null,JSON.stringify(created)]);
    await client.query('COMMIT');
    res.status(201).json({employee:{...created,recordVersion:1,isManualEntry:true,lastModifiedAt:null,lastModifiedBy:null}});
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}));

// 오등록된 관리자 신규 등록 직원만 논리 삭제합니다. 원본 140명은 보호합니다.
// 삭제 전 동일 부서 순서 목록에서도 ID를 정리하고, 변경 이력을 보존합니다.
app.delete('/api/employees/:id',sameOriginOnly,adminOnly,csrfOnly,route(async(req,res)=>{
  const id=String(req.params.id);
  if(!/^E\d{3,6}$/.test(id))throw bad('직원 식별자가 올바르지 않습니다.');
  const expectedVersion=Number(req.body?.expectedVersion);
  const confirmName=typeof req.body?.confirmName==='string'?req.body.confirmName:'';
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw bad('직원 데이터 버전을 확인할 수 없습니다. 새로고침해 주세요.');
  if(!confirmName||confirmName.length>80)throw bad('삭제할 직원의 성명을 정확히 입력해야 합니다.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query('SELECT payload,version,department,is_manual_entry,deleted_at FROM employees WHERE id=$1 FOR UPDATE',[id]);
    if(!current.rows.length)throw bad('직원이 존재하지 않습니다.',404);
    const p=current.rows[0];
    if(p.deleted_at)throw bad('이미 삭제된 직원입니다.',410);
    if(!p.is_manual_entry)throw bad('초기 등록 명단은 삭제할 수 없습니다. 상태를 퇴직으로 변경하거나 원본 자료를 정정하세요.',403);
    if(p.version!==expectedVersion)throw bad('다른 변경사항이 있습니다. 새로고침 후 다시 시도하세요.',409);
    if(p.payload.name!==confirmName)throw bad('확인용 성명이 일치하지 않아 삭제하지 않았습니다.');
    const history=await client.query("SELECT archive_id FROM historical_snapshots WHERE payload->>'employee_id'=$1 AND COALESCE(payload->>'record_type','source_month_snapshot')<>'employee_revision' LIMIT 1",[id]);
    if(history.rowCount)throw bad('과거 업무분장 이력과 연결된 직원은 삭제할 수 없습니다.',409);
    await client.query('UPDATE employees SET deleted_at=NOW(),deleted_by=$2,updated_at=NOW(),version=version+1 WHERE id=$1',[id,req.session.adminUsername]);
    const oldOrder=await client.query('SELECT employee_ids,version FROM department_orders WHERE department=$1 FOR UPDATE',[p.department]);
    let orderVersion=oldOrder.rows[0]?.version||0;
    let updatedIds=null;
    if(oldOrder.rows.length && oldOrder.rows[0].employee_ids.includes(id)){
      updatedIds=oldOrder.rows[0].employee_ids.filter(memberId=>memberId!==id);
      orderVersion+=1;
      await client.query('UPDATE department_orders SET employee_ids=$2::jsonb,version=$3,updated_at=NOW() WHERE department=$1',
        [p.department,JSON.stringify(updatedIds),orderVersion]);
    }
    await client.query('INSERT INTO audit_logs(actor,action,target_id,department,before_value,after_value) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [req.session.adminUsername,'employee.delete',id,p.department,JSON.stringify(p.payload),JSON.stringify({deleted:true,reason:'오등록',deletedBy:req.session.adminUsername})]);
    await client.query('COMMIT');
    res.json({deleted:true,id,department:p.department,orderIds:updatedIds,orderVersion});
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}));

app.put('/api/employees/:id',sameOriginOnly,adminOnly,csrfOnly,route(async(req,res)=>{
  const id=String(req.params.id);
  if(!/^E\d{3,6}$/.test(id))throw bad('직원 식별자가 올바르지 않습니다.');
  const expectedVersion=Number(req.body?.expectedVersion);
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw bad('직원 데이터 버전을 확인할 수 없습니다. 새로고침해 주세요.');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query('SELECT payload,version,department,is_manual_entry,last_modified_at,last_modified_by FROM employees WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
    if(!current.rows.length)throw bad('직원이 존재하지 않습니다.',404);
    const row=current.rows[0];
    if(row.version!==expectedVersion)throw bad('다른 관리자가 먼저 수정했습니다. 새로고침하고 다시 시도하세요.',409);
    const deptRows=await client.query('SELECT name,parent_name FROM departments');
    const deptMap=Object.fromEntries(deptRows.rows.map(d=>[d.name,d.parent_name]));
    let updated;
    try{updated=makeEmployeeUpdate(row.payload,req.body.employee,Object.keys(deptMap),deptMap)}
    catch(err){throw bad(err.message,400)}
    // JSONB 키 정렬이나 빈 값 정규화만으로 거짓 변경 이력을 쌓지 않습니다.
    const changes=employeeChanges(row.payload,updated);
    if(!changes.length){
      await client.query('COMMIT');
      return res.json({employee:{...row.payload,recordVersion:row.version,isManualEntry:row.is_manual_entry,
        lastModifiedAt:row.last_modified_at,lastModifiedBy:row.last_modified_by},unchanged:true});
    }
    const version=row.version+1;
    const updateResult=await client.query(`UPDATE employees
      SET department=$2,payload=$3::jsonb,version=$4,updated_at=NOW(),
          last_modified_at=NOW(),last_modified_by=$5
      WHERE id=$1 RETURNING last_modified_at,last_modified_by`,
      [id,updated.department,JSON.stringify(updated),version,req.session.adminUsername]);
    const auditResult=await client.query(`INSERT INTO audit_logs(actor,action,target_id,department,before_value,after_value)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id,actor,action,target_id,created_at,before_value,after_value`,
      [req.session.adminUsername,'employee.update',id,updated.department,JSON.stringify(row.payload),JSON.stringify(updated)]);
    // 변경 직전 상태를 기존 월별 업무분장과 같은 역사 기록 테이블에 보존합니다.
    // 직원 변경·감사 로그·공개용 이력 세 데이터는 같은 트랜잭션으로 확정됩니다.
    const archivedRecord=makeRevisionArchive(auditResult.rows[0]);
    await client.query(`INSERT INTO historical_snapshots(archive_id,period,name,department,source_index,payload)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      [archivedRecord.archive_id,archivedRecord.period,archivedRecord.name,archivedRecord.department,
        archivedRecord.source_row_order,JSON.stringify(archivedRecord)]);
    await client.query('COMMIT');
    res.json({employee:{...updated,recordVersion:version,isManualEntry:row.is_manual_entry,lastModifiedAt:updateResult.rows[0].last_modified_at,lastModifiedBy:updateResult.rows[0].last_modified_by},changes,archivedRecord});
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}));

app.put('/api/departments/:department/order',sameOriginOnly,adminOnly,csrfOnly,route(async(req,res)=>{
  const department=String(req.params.department);
  if(department.length>100)throw bad('부서명을 확인해 주세요.');
  const ids=req.body?.ids;
  const expectedVersion=Number(req.body?.expectedVersion??0);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const validDept=await client.query('SELECT name FROM departments WHERE name=$1',[department]);
    if(!validDept.rows.length)throw bad('등록되지 않은 부서입니다.',404);
    // 동일 부서의 동시 저장을 직렬화하고, 부서 이동 중 변경까지 검사합니다.
    await client.query('SELECT name FROM departments WHERE name=$1 FOR UPDATE',[department]);
    const currentRows=await client.query("SELECT id FROM employees WHERE department=$1 AND deleted_at IS NULL AND COALESCE(payload->>'rosterStatus','재직')<>'퇴직' ORDER BY seed_index",[department]);
    const available=currentRows.rows.map(r=>r.id);
    if(!validateOrder(ids,available))throw bad('부서 직원 명단과 저장할 순서가 일치하지 않습니다. 새로고침해 주세요.',409);
    const old=await client.query('SELECT employee_ids,version FROM department_orders WHERE department=$1 FOR UPDATE',[department]);
    const version=old.rows[0]?.version||0;
    if(version!==expectedVersion)throw bad('다른 순서 변경이 저장됐습니다. 새로고침해 주세요.',409);
    const newVersion=version+1;
    await client.query(`INSERT INTO department_orders(department,employee_ids,version) VALUES ($1,$2::jsonb,$3)
      ON CONFLICT (department) DO UPDATE SET employee_ids=EXCLUDED.employee_ids,version=EXCLUDED.version,updated_at=NOW()`,
      [department,JSON.stringify(ids),newVersion]);
    await client.query('INSERT INTO audit_logs(actor,action,department,before_value,after_value) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)',
      [req.session.adminUsername,'department.order',department,JSON.stringify(old.rows[0]?.employee_ids||available),JSON.stringify(ids)]);
    await client.query('COMMIT');
    res.json({department,ids,version:newVersion});
  }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}));

// 관리자가 직원의 수정 전·후 값을 추적할 수 있도록 전체 변경 기록을 제공합니다.
// 이력은 audit_logs에 트랜잭션으로 쌓인 원본 스냅샷을 읽으며, 수정/삭제하지 않습니다.
app.get('/api/admin/employee-revisions',adminOnly,route(async(req,res)=>{
  const employeeId=typeof req.query.employeeId==='string'?req.query.employeeId.trim():'';
  if(employeeId && !/^E\d{3,6}$/.test(employeeId))throw bad('직원 식별자를 확인해 주세요.');
  const page=Number(req.query.page||1);
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw bad('페이지 번호가 올바르지 않습니다.');
  const limit=20,offset=(page-1)*limit;
  const params=employeeId?[employeeId]:[];
  const where="action IN ('employee.create','employee.update','employee.delete')"+(employeeId?' AND target_id=$1':'');
  const [totalRows,logRows]=await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM audit_logs WHERE '+where,params),
    pool.query(`SELECT id,actor,action,target_id,department,before_value,after_value,created_at
      FROM audit_logs WHERE ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,params)
  ]);
  const events=logRows.rows.map(row=>({
    id:row.id,employeeId:row.target_id,employeeName:row.after_value?.name||row.before_value?.name||'',
    actor:row.actor,action:row.action,actionLabel:revisionLabel(row.action),
    createdAt:row.created_at,department:row.department,
    changes:row.action==='employee.update'?employeeChanges(row.before_value,row.after_value):[],
    // 수정 전·후 원본 전체는 서버의 audit_logs에 그대로 보존됩니다.
    snapshotBefore:row.action==='employee.create'?null:row.before_value,
    snapshotAfter:row.action==='employee.delete'?null:row.after_value
  }));
  res.json({events,total:totalRows.rows[0].n,page,pageSize:limit});
}));

app.get('/api/admin/audit',adminOnly,route(async(req,res)=>{
  const rows=await pool.query('SELECT id,actor,action,target_id,department,created_at FROM audit_logs ORDER BY id DESC LIMIT 100');
  res.json({logs:rows.rows});
}));
const publicDir=path.join(__dirname,'../public');
app.get('/login',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(canRead(req.session))return res.redirect(303,'/');
  res.sendFile(path.join(publicDir,'login.html'));
});
// 인증 전 공개되는 정적 파일은 로그인 화면의 스크립트 하나뿐입니다.
app.get('/login.js',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.sendFile(path.join(publicDir,'login.js'));
});
app.use((req,res,next)=>{
  if(!canRead(req.session)){
    if(req.method==='GET'||req.method==='HEAD')return res.redirect(303,'/login');
    return res.status(401).json({error:'로그인이 필요합니다.'});
  }
  next();
});
app.use(express.static(publicDir,{index:'index.html',maxAge:0,setHeaders(res){res.set('Cache-Control','no-store')}}));
app.use((req,res)=>res.status(404).json({error:'요청 경로를 찾을 수 없습니다.'}));
app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  console.error('[Server]',err.message);
  res.status(err.status||500).json({error:err.status?err.message:'서버 작업 중 문제가 발생했습니다. 잠시 후 다시 시도하세요.'});
});
const server=app.listen(PORT,HOST,()=>console.log(`KIRD 업무분장 앱: http://${HOST}:${PORT}`));
function shutdown(){server.close(()=>pool.end().finally(()=>process.exit(0)))}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
