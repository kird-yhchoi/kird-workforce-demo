/* KIRD 업무분장 UI - Node.js / PostgreSQL 연결 버전.
   직원·과거 이력은 서버 API에서 읽고, 관리자 수정·정렬은 인증된 서버에 저장합니다.
*/
(() => {
'use strict';
const ROOT = window.DEMO_SEED;
if(!ROOT || !Array.isArray(ROOT.staff)) { document.body.textContent='초기 데이터(staff.js)를 불러올 수 없습니다.';return; }
const copy=x=>JSON.parse(JSON.stringify(x));
let auth=window.DEMO_AUTH||{loggedIn:false,role:null,username:null,csrfToken:null};
const isAdmin=()=>auth.role==='admin';
const ARCHIVE=window.DEMO_ARCHIVE||{records:[],source_documents:[],review_items:[]};
async function apiRequest(endpoint,options={}){
  const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(auth.csrfToken?{'X-CSRF-Token':auth.csrfToken}:{}),...(options.headers||{})};
  const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',...options,headers});
  const body=await response.json().catch(()=>({}));
  if(response.status===401){
    window.DEMO_SEED=null;window.DEMO_ARCHIVE=null;
    window.location.replace('/login');
    throw new Error('로그인 세션이 만료되었습니다.');
  }
  if(!response.ok)throw new Error(body.error||`서버 오류 (${response.status})`);
  return body;
}
const archiveRows = ARCHIVE.records || [];
const archivedByName = new Map();
for(const r of archiveRows){if(!archivedByName.has(r.name))archivedByName.set(r.name,[]);archivedByName.get(r.name).push(r);}
// 수정 후 페이지를 새로고침하지 않아도 '과거 업무분장'에 직전 이력을 반영합니다.
function appendArchiveRecord(record){
 if(!record||archiveRows.some(r=>r.archive_id===record.archive_id))return;
 archiveRows.push(record);
 if(!archivedByName.has(record.name))archivedByName.set(record.name,[]);
 archivedByName.get(record.name).push(record);
 if(record.period && !periodValues.includes(record.period)){
   periodValues.push(record.period);
   periodValues.sort((a,b)=>b.localeCompare(a));
 }
}
const periodValues = [...new Set([...(ARCHIVE.source_documents||[]).map(x=>x.period),...archiveRows.map(x=>x.period)])].sort((a,b)=>b.localeCompare(a));
const archiveDepartments = [...new Set(archiveRows.map(x=>x.department))].sort((a,b)=>a.localeCompare(b,'ko'));
const originals=copy(ROOT.staff);
let allStaff=copy(ROOT.staff);
// 퇴직은 DB에 보관하되 현행 직원/통계/PDF/챗봇 JSON에는 포함하지 않습니다.
const currentStaff=()=>allStaff.filter(person=>person.rosterStatus!=='퇴직');
let history=[];
let deptOrders=copy(window.DEMO_ORDERS||{});
let deptOrderVersions=copy(window.DEMO_ORDER_VERSIONS||{});
let state={page:'dashboard',query:'',dept:'전체 부서',job:'전체 직종',gradeTab:'연구직',personPage:1,detailId:null,adminPreview:isAdmin(),adminPerson:'E007', archivePeriod:'all', archiveQuery:'', archiveType:'all', archivePage:1, archiveId:null, dashboardExpanded:true,adminTab:'edit',adminOrderDept:'스마트교육실',orderDraft:[],orderSort:'manual',revisionTarget:'',revisionPage:1,revisionEvents:null,revisionTotal:0,revisionLoading:false,revisionError:''};
const deptNames=["원장","경영전략본부","경영기획실","인사총무실","인프라운영실","인재개발본부","경력연구실","경력기반실","경력성장실","인재교육본부","교육기반실","기본교육실","전문교육실","스마트교육실","인재혁신센터","정책협력실"];
const orgs=['경영전략본부','인재개발본부','인재교육본부','인재혁신센터'];
const jobGroups=['연구직','행정직','전문관리원','교육사무원','시설관리원','기관장'];
const grades=['선임연구위원','연구위원','부연구위원','연구원','책임행정원','선임행정원','행정원','책임전문관리원','선임전문관리원','전문관리원','교육사무원','시설관리원','원장','직급 미확인'];
const gradeGroups={'연구직':['선임연구위원','연구위원','부연구위원','연구원'],'행정직':['책임행정원','선임행정원','행정원'],'전문관리원':['책임전문관리원','선임전문관리원','전문관리원'],'교육사무원':['교육사무원'],'시설관리원':['시설관리원'],'기관장':['원장'],'직종 미확인':['직급 미확인']};
const jobColors={'연구직':'#356cc6','행정직':'#7b63b7','전문관리원':'#079f95','교육사무원':'#f0a43d','시설관리원':'#7386a5','기관장':'#c57a37'};
const count=(arr,predicate)=>arr.filter(predicate).length;
const e=(text)=>String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sourceTitleForDisplay=(title)=>String(title||'').replace(/\([0-9]+\)$/,'');
const icon=(name)=>`<svg aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#ico-${name}"></use></svg>`;
const formatNum=n=>Number(n).toLocaleString('ko-KR');
const formatWhen=(value)=>{
 if(!value)return '수정 이력 없음';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '날짜 확인 필요';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
};
const displayRevisionValue=(value)=>{
 if(Array.isArray(value))return value.length?`<ul class="revision-task-list">${value.map(v=>`<li>${e(v)}</li>`).join('')}</ul>`:'<span class="help-text">없음</span>';
 if(value===true)return '예';if(value===false)return '아니요';
 return value==null||value===''?'<span class="help-text">없음</span>':`<span class="revision-long-text">${e(value)}</span>`;
};
const allDepts=()=>['전체 부서',...deptNames];
const opts=(values,selected)=>values.map(v=>`<option value="${e(v)}" ${v===selected?'selected':''}>${e(v)}</option>`).join('');
const labelDept=d=>d;
const parent=d=>ROOT.parentMap[d]||null;

// 표시 순서는 업무분장 데이터와 분리하여 '부서별 직원 ID 배열'로 관리합니다.
// 직원 편집/부서이동/연락처/담당업무에는 영향을 주지 않습니다.
const gradePriority=['원장','선임연구위원','연구위원','부연구위원','연구원',
 '책임행정원','선임행정원','행정원','책임전문관리원','선임전문관리원','전문관리원',
 '교육사무원','시설관리원','직급 미확인'];
function positionPriority(p){
 const t=String(p.position||'');
 const note=String(p.note||'');
 if(t.includes('원장'))return 0;
 if(t.includes('본부장')||t.includes('센터장'))return 1;
 if(t.includes('실장'))return 2;
 if(t.includes('팀장'))return 3;
 if(t.includes('주무')||note==='주무'||note.includes('(주무)'))return 4;
 return 5;
}
function departmentMembers(dept){
 const candidates=currentStaff().filter(p=>p.department===dept);
 const savedOrder=Array.isArray(deptOrders[dept])?deptOrders[dept]:[];
 const idx=new Map(savedOrder.map((id,i)=>[id,i]));
 const seedIdx=new Map(candidates.map((p,i)=>[p.id,i]));
 return candidates.sort((a,b)=>{
   const ra=idx.has(a.id)?idx.get(a.id):savedOrder.length+seedIdx.get(a.id);
   const rb=idx.has(b.id)?idx.get(b.id):savedOrder.length+seedIdx.get(b.id);
   return ra-rb;
 });
}
function orderedStaff(rows){
 const departmentRank=new Map(deptNames.map((d,i)=>[d,i]));
 const localRank=new Map();
 for(const dept of deptNames){departmentMembers(dept).forEach((p,i)=>localRank.set(p.id,i));}
 return rows.slice().sort((a,b)=>
   (departmentRank.get(a.department)??999)-(departmentRank.get(b.department)??999)||
   (localRank.get(a.id)??9999)-(localRank.get(b.id)??9999)||a.name.localeCompare(b.name,'ko'));
}
function ensureOrderDraft(){
 const members=departmentMembers(state.adminOrderDept);
 const ids=members.map(p=>p.id);
 if(!Array.isArray(state.orderDraft)||state.orderDraft.length!==ids.length||
    state.orderDraft.some(id=>!ids.includes(id))){state.orderDraft=ids;state.orderSort='manual';}
}
function isOrderDirty(){
 ensureOrderDraft();
 return state.orderDraft.join('|')!==departmentMembers(state.adminOrderDept).map(p=>p.id).join('|');
}
function reorderDraft(fromId,targetId,after=false){
 ensureOrderDraft();
 if(fromId===targetId||!state.orderDraft.includes(fromId)||!state.orderDraft.includes(targetId))return false;
 const items=state.orderDraft.slice();items.splice(items.indexOf(fromId),1);
 const at=items.indexOf(targetId)+(after?1:0);items.splice(at,0,fromId);
 if(items.join('|')===state.orderDraft.join('|'))return false;
 state.orderDraft=items;state.orderSort='manual';renderApp();return true;
}
function moveOrderDraft(id,direction){
 ensureOrderDraft();
 const i=state.orderDraft.indexOf(id),j=i+direction;
 if(i<0||j<0||j>=state.orderDraft.length)return;
 const ids=state.orderDraft.slice();[ids[i],ids[j]]=[ids[j],ids[i]];
 state.orderDraft=ids;state.orderSort='manual';renderApp();
 document.querySelector(`[data-order-up="${id}"], [data-order-down="${id}"]`)?.focus();
}
function applyOrderPreset(mode){
 if(!['position','grade','name'].includes(mode))return;
 ensureOrderDraft();
 const byId=new Map(currentStaff().map(p=>[p.id,p]));
 const rows=state.orderDraft.map(id=>byId.get(id)).filter(Boolean);
 rows.sort((a,b)=>{
   if(mode==='position')return positionPriority(a)-positionPriority(b);
   if(mode==='grade')return (gradePriority.indexOf(a.grade)<0?999:gradePriority.indexOf(a.grade))-
       (gradePriority.indexOf(b.grade)<0?999:gradePriority.indexOf(b.grade))||a.name.localeCompare(b.name,'ko');
   return a.name.localeCompare(b.name,'ko');
 });
 state.orderDraft=rows.map(p=>p.id);state.orderSort=mode;renderApp();
}
async function saveDeptOrder(){
 if(!isAdmin()){toast('관리자 로그인이 필요합니다.');return;}
 ensureOrderDraft();
 if(!isOrderDirty()){toast('저장할 순서 변경사항이 없습니다.');return;}
 const dept=state.adminOrderDept;
 const ids=state.orderDraft.slice();
 try{
   const answer=await apiRequest('/api/departments/'+encodeURIComponent(dept)+'/order',{
     method:'PUT',body:JSON.stringify({ids,expectedVersion:deptOrderVersions[dept]||0})
   });
   deptOrders={...deptOrders,[dept]:answer.ids};
   deptOrderVersions={...deptOrderVersions,[dept]:answer.version};
   renderApp();toast(`${dept} 명단 ${ids.length}명의 표시 순서를 데이터베이스에 저장했습니다.`);
 }catch(err){toast('순서 저장 실패: '+err.message);}
}
function renderAdminTabs(){return `<div class="tabs admin-tabs" role="tablist" aria-label="관리자 작업 선택">
 <button class="tab ${state.adminTab==='edit'?'active':''}" role="tab" aria-selected="${state.adminTab==='edit'}" data-admin-tab="edit">${icon('pencil')} 직원 정보 수정</button>
 <button class="tab ${state.adminTab==='create'?'active':''}" role="tab" aria-selected="${state.adminTab==='create'}" data-admin-tab="create">${icon('users')} 신규 직원 등록</button>
 <button class="tab ${state.adminTab==='order'?'active':''}" role="tab" aria-selected="${state.adminTab==='order'}" data-admin-tab="order">${icon('network')} 명단 순서 관리</button>
 <button class="tab ${state.adminTab==='revisions'?'active':''}" role="tab" aria-selected="${state.adminTab==='revisions'}" data-admin-tab="revisions">${icon('history')} 직원 변경 이력</button>
 </div>`;}
let revisionsRequestToken=0;
async function loadRevisions(){
 if(!isAdmin())return;
 const token=++revisionsRequestToken;
 state.revisionLoading=true;state.revisionError='';state.revisionEvents=null;
 renderApp();
 try{
   const query=new URLSearchParams({page:String(state.revisionPage)});
   if(state.revisionTarget)query.set('employeeId',state.revisionTarget);
   const payload=await apiRequest('/api/admin/employee-revisions?'+query);
   if(token!==revisionsRequestToken)return;
   state.revisionEvents=payload.events;state.revisionTotal=payload.total;
 }catch(err){if(token!==revisionsRequestToken)return;state.revisionError=err.message;}
 finally{if(token===revisionsRequestToken){state.revisionLoading=false;renderApp();}}
}
function renderAdminRevisions(){
 const selected=state.revisionTarget;
 const staff=orderedStaff(allStaff);
 const hasKnown=staff.some(p=>p.id===selected);
 const pages=Math.max(1,Math.ceil(state.revisionTotal/20));
 const options=staff.map(p=>`<option value="${e(p.id)}" ${selected===p.id?'selected':''}>${e(p.department)} · ${e(p.name)} (${e(p.id)})${p.rosterStatus==='퇴직'?' [퇴직]':''}</option>`).join('');
 const rows=(state.revisionEvents||[]).map(event=>{
   const changes=event.changes||[];
   const details=event.action==='employee.update'
    ?(changes.length?`<div class="revision-diffs">${changes.map(c=>`<div class="revision-diff"><div class="revision-field">${e(c.label)}</div><div class="revision-values"><div><span class="revision-side-label">변경 전</span>${displayRevisionValue(c.before)}</div><div><span class="revision-side-label">변경 후</span>${displayRevisionValue(c.after)}</div></div></div>`).join('')}</div>`:'<p class="help-text">데이터 정규화 변경 등으로 표시할 업무 필드 차이가 없습니다.</p>')
    :`<p class="help-text">${event.action==='employee.create'?'신규 등록한 직원의 초기 정보가 기록되었습니다.':'오등록 직원이 삭제 처리되었으며, 삭제 전 원본은 유지됩니다.'}</p>`;
   return `<details class="revision-event"><summary><span class="revision-event-date">${e(formatWhen(event.createdAt))}</span><span class="revision-event-person">${e(event.employeeName||event.employeeId)} <span class="help-text">${e(event.employeeId)}</span></span><span class="badge ${event.action==='employee.delete'?'badge-warn':'badge-grey'}">${e(event.actionLabel)}</span><span class="revision-event-actor">관리자 ${e(event.actor)}</span><span class="revision-event-count">${event.action==='employee.update'?`${changes.length}개 항목`:''}</span></summary><div class="revision-event-body">${details}<div class="revision-snapshots">${event.snapshotBefore?`<details><summary>이전 전체 데이터 보기</summary><pre>${e(JSON.stringify(event.snapshotBefore,null,2))}</pre></details>`:''}${event.snapshotAfter?`<details><summary>${event.action==='employee.create'?'신규 등록':'수정 후'} 전체 데이터 보기</summary><pre>${e(JSON.stringify(event.snapshotAfter,null,2))}</pre></details>`:''}</div></div></details>`;
 }).join('');
 return `<div class="card revision-panel"><div class="card-head"><div><div class="card-title">직원정보 변경 이력</div><div class="card-desc">변경 전·후 원본을 PostgreSQL 감사 기록에서 확인합니다. 이전 업무분장은 일반 직원도 ‘과거 업무분장’ 페이지에서 조회할 수 있습니다.</div></div><span class="badge badge-grey">관리자만 조회 가능</span></div><div class="revision-toolbar"><div class="field"><label for="revisionEmployee">조회 대상</label><select id="revisionEmployee" class="form-control"><option value="" ${selected?'':'selected'}>전체 직원 · 최근 변경순</option>${options}${selected&&!hasKnown?`<option value="${e(selected)}" selected>삭제된 직원 (${e(selected)})</option>`:''}</select></div><button type="button" class="btn" data-revisions-refresh="true">${icon('refresh')} 새로고침</button></div><div class="help-text revision-note">기존 기록도 함께 조회하며, 직원정보가 실제 변경된 경우에만 최종 수정일이 갱신됩니다. 최초 등록일이나 단순 조회는 최종 수정일에 포함하지 않습니다.</div>${state.revisionLoading?'<div class="empty">변경 이력을 불러오는 중입니다.</div>':state.revisionError?`<div class="archive-warning">조회 실패: ${e(state.revisionError)}</div>`:`<div class="revision-list">${rows||'<div class="empty">조회된 변경 이력이 없습니다. 초기 적재한 직원은 첫 이전까지 기록이 없을 수 있습니다.</div>'}</div>`}<div class="table-footer"><span>변경 기록 ${formatNum(state.revisionTotal)}건 · ${state.revisionPage} / ${pages}페이지</span><div class="pagination"><button class="btn btn-small" data-revisions-page="prev" ${state.revisionPage<=1?'disabled':''}>이전</button><button class="btn btn-small" data-revisions-page="next" ${state.revisionPage>=pages?'disabled':''}>다음</button></div></div></div>`;
}
function openEmployeeRevisions(id){
 state.adminPerson=id;state.adminTab='revisions';state.revisionTarget=id;
 state.revisionPage=1;renderApp();loadRevisions();
}

function renderAdminOrder(){
 ensureOrderDraft();
 const members=currentStaff().filter(p=>p.department===state.adminOrderDept);
 const byId=new Map(members.map(p=>[p.id,p]));
 const dirty=isOrderDirty();
 const preset=[['position','직위순'],['grade','직급순'],['name','성명 가나다순']];
 return `<div class="restricted"><strong>관리자 전용 명단 순서 관리</strong> — 순서를 변경한 후 '순서 저장'을 누르면 PostgreSQL에 저장되며, 다른 직원에게도 새로고침 후 동일하게 표시됩니다.</div>
 <div class="card order-management">
  <div class="card-head"><div><div class="card-title">부서별 명단 순서 관리</div><div class="card-desc">직원을 끌어 이동하거나 위·아래 버튼으로 순서를 바꿀 수 있습니다. 자동 정렬을 적용한 후에도 수동으로 조정할 수 있습니다.</div></div><span class="badge ${dirty?'badge-warn':'badge-green'}">${dirty?'변경사항 있음 · 저장 필요':'저장된 순서'}</span></div>
  <div class="order-toolbar"><div class="field"><label for="adminOrderDept">관리할 부서</label><select id="adminOrderDept" class="form-control">${opts(deptNames,state.adminOrderDept)}</select></div>
   <div class="field order-sort-field"><label>자동 정렬 <span class="help-text">(미리 적용 · 저장 전 확정되지 않음)</span></label><div class="order-sort-buttons">${preset.map(([mode,title])=>`<button type="button" class="btn btn-small ${state.orderSort===mode?'btn-light':''}" data-order-preset="${mode}">${e(title)}</button>`).join('')}</div></div></div>
  <div class="order-list-head"><strong>${e(state.adminOrderDept)} · ${members.length}명</strong><span class="help-text">드래그하거나 화살표 버튼으로 이동</span></div>
  <div id="adminOrderList" class="order-list" role="list" aria-label="${e(state.adminOrderDept)} 직원 표시순서">
   ${state.orderDraft.map((id,i)=>{const p=byId.get(id);if(!p)return '';return `<div class="order-item" role="listitem" draggable="true" data-order-row="${e(id)}">
     <span class="order-drag" title="드래그하여 이동" aria-hidden="true">☷</span><span class="order-index">${String(i+1).padStart(2,'0')}</span>
     <div class="order-person"><strong>${e(p.name)}</strong>${p.position?`<span class="order-position">${e(p.position)}</span>`:(p.note==='주무'?'<span class="order-position">주무</span>':'')}${p.rosterStatus!=='재직'?`<span class="badge badge-warn">${e(p.rosterStatus)}</span>`:''}<div class="order-grade">${e(p.grade)} · ${e(p.jobGroup)}</div></div>
     <div class="order-arrows"><button type="button" class="btn btn-small order-arrow" data-order-up="${e(id)}" aria-label="${e(p.name)} 위로 이동" ${i===0?'disabled':''}>↑</button><button type="button" class="btn btn-small order-arrow" data-order-down="${e(id)}" aria-label="${e(p.name)} 아래로 이동" ${i===state.orderDraft.length-1?'disabled':''}>↓</button></div>
    </div>`;}).join('')}
  </div>
  <div class="order-footer"><span class="help-text">직원 데이터·담당 업무·연락처·과거 이력은 변경되지 않습니다. 저장 후 조회 목록, PDF, JSON의 배열 순서에 적용됩니다.</span><div class="order-footer-actions"><button class="btn" type="button" data-order-revert ${dirty?'':'disabled'}>${icon('refresh')} 저장된 순서 복원</button><button class="btn btn-primary" type="button" data-order-save ${dirty?'':'disabled'}>${icon('check')} 순서 저장</button></div></div>
 </div>`;
}

function statusBadge(p){
  const dates=p.leaveStart&&p.leaveEnd?`<span class="person-sub">${e(p.leaveStart)} ~ ${e(p.leaveEnd)}</span>`:'';
  return p.rosterStatus==='휴직'?`<span class="badge badge-warn">휴직</span>${dates}`:p.rosterStatus==='파견'?'<span class="badge badge-warn">파견</span>':p.rosterStatus==='퇴직'?'<span class="badge badge-red">퇴직</span>':'';
}
function filteredStaff(){const q=state.query.trim().toLowerCase();return orderedStaff(currentStaff().filter(p=>(state.dept==='전체 부서'||p.department===state.dept)&& (state.job==='전체 직종'||p.jobGroup===state.job) && (!q||[p.name,p.department,p.lastKnownDepartment,p.rosterStatus,p.position,p.grade,p.note,p.leaveStart,p.leaveEnd,p.extension,p.phone,p.email,...p.responsibilities].filter(Boolean).join(' ').toLowerCase().includes(q))));}
function iconCard(iconName,theme){return `<span class="kpi-icon ${theme||''}">${icon(iconName)}</span>`}
function taskOf(p){return p.responsibilities?.[0] || '업무 내용 미기재';}
function contactOf(p){return (p.phone||p.email)?`${p.phone||'번호 없음'} · ${p.email||'이메일 없음'}`:'연락처 미등록';}
function pageTitle(){return {dashboard:['업무분장 조회','부서·성명·담당 업무 검색 및 조직·인력 통계 확인'],org:['조직별 현황','본부에서 실까지 조직 구성 확인'],history:['과거 업무분장 · 이력 조회','이전 정보 시점별 확인 가능'],export:['AI챗봇 학습자료','현행 업무분장을 기관 전체 단일 PDF 및 JSON으로 추출'],admin:['관리자 전용','']}[state.page];}
function renderSidebar(){const nav=[['dashboard','users','업무분장 조회'],['org','network','조직별 현황'],['history','history','과거 업무분장'],['export','file','챗봇 학습자료'],...(isAdmin()?[['admin','shield','관리자']]:[])];return `<aside class="sidebar" id="sidebar">
 <div class="brand"><div class="brand-mark">K</div><div><div class="brand-name">KIRD<br>업무분장 관리</div><div style="font-size:10px;color:#aec6de;margin-top:3px">국가과학기술인력개발원</div></div></div>
 <div class="nav-list">${nav.map(([key,ic,name])=>`<button class="nav-link ${state.page===key?'active':''}" data-nav="${key}" ${state.page===key?'aria-current="page"':''}>${icon(ic)}<span>${name}</span>${key==='admin'?'<span class="nav-pill">관리</span>':''}</button>`).join('')}</div>
 <div class="sidebar-bottom"><div class="sidebar-server"><i class="online-dot"></i><div><strong style="color:#e0edf9;font-size:11px">업무분장 관리 시스템</strong><br>PostgreSQL 연결 · 관리자 권한 적용</div></div><div class="sidebar-foot">국가과학기술인력개발원<br>직원 성명·연락처·업무 배정은 가상 정보</div></div></aside>`;}
function renderHeader(){return `<header class="topbar"><div style="display:flex;gap:11px;align-items:center"><button class="mobile-menu" id="mobileMenu" aria-label="메뉴 열기">${icon('menu')}</button><div class="breadcrumb">DEMO 인사·업무 관리&nbsp; / &nbsp;<strong>${pageTitle()[0]}</strong></div></div><div class="user-tools"><span class="top-caption">2026.09 업무분장 · 직원 전화번호부</span><span class="badge badge-grey">${isAdmin()?'관리자':'조회 전용'}</span><span class="user-avatar">K</span><span class="user-name">${e(auth.username||'')}</span><button type="button" class="btn btn-small" data-logout="true" aria-label="로그아웃">로그아웃</button></div></header>`;}
function renderHeading(){const [title,desc]=pageTitle();
 const action=state.page==='admin'&&isAdmin()?`<button class="btn" data-nav="dashboard">${icon('search')} 담당자 찾기</button>`:'';
 return `<div class="page-heading"><div><h1 class="page-title">${title}</h1>${desc?`<div class="page-desc">${desc}</div>`:''}</div>${action?`<div class="page-actions">${action}</div>`:''}</div>`;}
function renderQuickSearch(){return `<form id="quickSearch" class="search-panel"><div class="search-panel-title">${icon('search')} 직원 조회 <span class="subtle" style="font-weight:450;margin-left:5px">부서 및 성명으로 검색</span></div><div class="search-fields"><div class="field"><label for="topDepartment">부서</label><select id="topDepartment" class="form-control">${opts(allDepts(),state.dept)}</select></div><div class="field"><label for="topKeyword">성명 / 담당 업무</label><input id="topKeyword" class="form-control" value="${e(state.query)}" placeholder="예: 스마트교육실, AI 챗봇, 시연직원042" autocomplete="off"></div><div class="search-actions"><button class="btn btn-primary search-btn" type="submit">${icon('search')} 검색</button><button class="btn btn-light" type="button" data-quick-reset="true">${icon('refresh')} 초기화</button></div></div></form>`;}
function phoneAreaCode(p){return String(p.phone||'').replace(/\D/g,'').slice(0,3);}
function overviewCards(){
 const ochang=count(currentStaff(),p=>phoneAreaCode(p)==='043');
 const daejeon=count(currentStaff(),p=>phoneAreaCode(p)==='042');
  const onLeave=count(currentStaff(),p=>p.rosterStatus==='휴직');
  const secondment=count(currentStaff(),p=>p.rosterStatus==='파견');
 return `<div class="kpi-grid">
  <div class="kpi-card">${iconCard('users','')}<div class="kpi-heading">전체 명단</div><div class="kpi-value">${formatNum(currentStaff().length)}<span class="kpi-unit">명</span></div><div class="kpi-note">현재 등록된 직원 전체</div></div>
  <div class="kpi-card">${iconCard('network','teal')}<div class="kpi-heading">조직 현황</div><div class="kpi-value">11<span class="kpi-unit">개 실</span></div><div class="kpi-note">원장 · 3개 본부 · 1개 센터</div></div>
  <div class="kpi-card">${iconCard('location','orange')}<div class="kpi-heading">오창근무</div><div class="kpi-value">${ochang}<span class="kpi-unit">명</span></div><div class="kpi-note">내선 지역번호 043 기준</div></div>
  <div class="kpi-card">${iconCard('location','purple')}<div class="kpi-heading">대전근무</div><div class="kpi-value">${daejeon}<span class="kpi-unit">명</span></div><div class="kpi-note">내선 지역번호 042 기준</div></div>
  <div class="kpi-card">${iconCard('users','orange')}<div class="kpi-heading">휴직</div><div class="kpi-value">${onLeave}<span class="kpi-unit">명</span></div></div>
  <div class="kpi-card">${iconCard('users','teal')}<div class="kpi-heading">파견</div><div class="kpi-value">${secondment}<span class="kpi-unit">명</span></div></div>
 </div>`;
}
function departmentBars(){
  const rows=ROOT.departments.map(d=>[d,count(currentStaff(),p=>p.department===d)]).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...rows.map(x=>x[1]));
  return `<div class="card"><div class="card-head"><div><div class="card-title">부서별 인원 현황</div><div class="card-desc">11개 실 기준 · 시설관리원은 인프라운영실에 포함</div></div><button data-nav="org" class="card-link">조직 전체 보기 →</button></div><div class="chart-bars">${rows.map(([dept,n])=>`<div class="bar-row" role="button" tabindex="0" data-deptclick="${e(dept)}" title="${e(dept)} 직원 조회"><span class="bar-label">${e(dept)}</span><div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div><span class="bar-val">${n}명</span></div>`).join('')}</div></div>`;
}
function jobDonut(){const rows=jobGroups.map(name=>({name,value:count(currentStaff(),p=>p.jobGroup===name),color:jobColors[name]})).filter(x=>x.value>0);let current=0;const segments=rows.map(r=>{let a=current;current+=r.value/currentStaff().length*100;return `${r.color} ${a}% ${current}%`}).join(', ');return `<div class="card"><div class="card-head"><div><div class="card-title">직종별 인원</div></div><span class="badge badge-green">${jobGroups.length}개 분류</span></div><div class="donut-layout"><div class="donut" style="background:conic-gradient(${segments})"><div class="donut-hole"><span class="donut-number">${currentStaff().length}</span><span class="donut-caption">전체 인원</span></div></div><div class="donut-legend">${rows.map(r=>`<div class="donut-line"><span class="dot" style="background:${r.color}"></span><span>${r.name}</span><strong>${r.value}명</strong></div>`).join('')}</div></div><div class="summary-foot">위촉 인원 ${count(currentStaff(),p=>p.contract)}명 · 직급 미확인 ${count(currentStaff(),p=>p.grade==='직급 미확인')}명</div></div>`;}
function gradeStats(){const gs=gradeGroups[state.gradeTab]||gradeGroups['연구직'];const rows=gs.map(name=>[name,count(currentStaff(),p=>p.grade===name)]);const max=Math.max(...rows.map(r=>r[1]),1);return `<div class="card"><div class="card-head"><div><div class="card-title">직급별 인원</div><div class="card-desc">직종 선택에 따라 세부 직급 통계를 확인할 수 있습니다</div></div><span class="badge">${count(currentStaff(),p=>p.jobGroup===state.gradeTab)}명</span></div><div class="segment-switch">${jobGroups.map(name=>`<button class="chip ${state.gradeTab===name?'active':''}" data-jobtab="${name}">${name}</button>`).join('')}</div><div class="grade-stats">${rows.map(([name,n])=>`<div class="grade-row"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div><strong style="color:#3d5570;text-align:right">${n}명</strong></div>`).join('')}</div></div>`;}
function renderDashboard(){
 const expanded=state.dashboardExpanded;
 return `<section class="stats-section" aria-label="조직 인력 통계">
  <div class="stats-heading">
   <div><h2 class="stats-heading-title">조직·인력 통계</h2><div class="stats-heading-sub">직종·직급·부서 및 전화번호 기준 근무지 현황</div></div>
   <button class="btn stats-toggle" type="button" data-dashboard-toggle aria-expanded="${expanded}" aria-controls="dashboardStats">${icon('chevron-down')} <span>${expanded?'통계 접기':'통계 펼치기'}</span></button>
  </div>
  <div id="dashboardStats" class="stats-content" ${expanded?'':'hidden'}>
   ${overviewCards()}
   <div class="dashboard-grid dashboard-chart-triple">${jobDonut()}${gradeStats()}${departmentBars()}</div>
  </div>
 </section>
 <section class="results-section" id="searchResults" aria-label="직원 검색 결과">${renderPeople()}</section>`;
}
function renderPeople(){const filtered=filteredStaff(),pageSize=30,pages=Math.max(1,Math.ceil(filtered.length/pageSize));state.personPage=Math.min(state.personPage,pages);const slice=filtered.slice((state.personPage-1)*pageSize,state.personPage*pageSize);return `<div class="card table-panel"><div class="table-head"><div><div class="card-title">직원별 업무분장 목록</div><div class="card-desc">검색 결과 ${filtered.length}명 · 행 선택시 상세 업무 확인 가능</div></div><span class="badge badge-grey">등록 명단 · 현행 여부 표시</span></div><div class="table-scroll"><table class="table"><thead><tr><th>성명 / 상태</th><th>부서</th><th>직급 / 직위</th><th>담당 업무</th><th>내선 / 이메일</th><th>최종 수정일</th><th></th></tr></thead><tbody>${slice.length?slice.map(p=>`<tr data-open="${e(p.id)}"><td><span class="person-name">${e(p.name)}</span>${statusBadge(p)}${p.contract?'<span class="person-sub">위촉</span>':''}</td><td>${e(labelDept(p.department))}${p.lastKnownDepartment?`<span class="person-sub">과거 기록: ${e(p.lastKnownDepartment)} (${e(p.lastKnownPeriod)})</span>`:''}</td><td>${e(p.grade)}${p.gradeVerified===false?'<span class="person-sub">마지막 문서 기준(현행 미확인)</span>':''}${p.position?`<span class="person-sub">${e(p.position)}</span>`:''}</td><td><span class="ellipsis" title="${e(taskOf(p))}">${e(p.currentAssignmentVerified===false?'현재 담당 업무 미등록':taskOf(p))}</span></td><td><span style="font-weight:760">${p.extension?'내선 '+e(p.extension):'미등록'}</span><span class="person-sub">${e(p.email||'이메일 미등록')}</span></td><td class="person-edited-at">${e(p.lastModifiedAt?formatWhen(p.lastModifiedAt):'수정 이력 없음')}</td><td>${icon('chevron')}</td></tr>`).join(''):`<tr><td colspan="7"><div class="empty">검색 결과가 없습니다. 부서나 검색어를 변경해 주세요.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>총 ${filtered.length}명 중 ${filtered.length?(state.personPage-1)*pageSize+1:0}–${Math.min(state.personPage*pageSize,filtered.length)}명 표시</span><div class="pagination"><button class="btn btn-small" data-personpage="prev" ${state.personPage===1?'disabled':''}>이전</button><span style="min-width:36px;text-align:center">${state.personPage} / ${pages}</span><button class="btn btn-small" data-personpage="next" ${state.personPage===pages?'disabled':''}>다음</button></div></div></div>`;}
function renderOrgs(){const groups=orgs.map(org=>{const depts=ROOT.departments.filter(d=>ROOT.parentMap[d]===org);const topN=count(currentStaff(),p=>p.department===org);const tot=topN+depts.reduce((a,d)=>a+count(currentStaff(),p=>p.department===d),0);return {org,depts,topN,tot}});return `<div class="col2"><div class="card"><div class="card-head"><div><div class="card-title">원장 → 본부·센터 → 실</div></div></div><div class="org-hierarchy"><div class="org-group"><div class="org-group-head" role="button" tabindex="0" data-deptclick="원장"><span>원장 · 가상직원001 (가상)</span><span class="org-n">1명</span></div><div class="help-text" style="padding:8px 15px">하위부서: 경영전략본부, 인재개발본부, 인재교육본부, 인재혁신센터</div></div>${groups.map(g=>`<div class="org-group"><div class="org-group-head"><span>${e(g.org)}</span><span class="org-n">${g.tot}명</span></div>${g.depts.map(d=>`<div class="org-child" role="button" tabindex="0" data-deptclick="${e(d)}"><span>↳ &nbsp;${e(d)}</span><span class="org-n">${count(currentStaff(),p=>p.department===d)}명</span></div>`).join('')}</div>`).join('')}</div></div><div><div class="card"><div class="card-head"><div><div class="card-title">조직 구성 요약</div></div></div><div class="keyvals"><span class="key">원장</span><span class="val">1명</span></div><div class="keyvals"><span class="key">본부</span><span class="val">3개</span></div><div class="keyvals"><span class="key">센터</span><span class="val">1개</span></div><div class="keyvals"><span class="key">본부장·센터장</span><span class="val">4명</span></div><div class="keyvals"><span class="key">실</span><span class="val">11개 · ${ROOT.departments.reduce((v,d)=>v+count(currentStaff(),p=>p.department===d),0)}명</span></div><div class="keyvals"><span class="key">인프라운영실 시설관리원</span><span class="val">${count(currentStaff(),p=>p.department==='인프라운영실'&&p.jobGroup==='시설관리원')}명(부서 인원에 포함)</span></div><div class="keyvals"><span class="key">전체 명단</span><span class="val">${currentStaff().length}명</span></div></div></div></div>`;}
function archiveFiltered(){
 const q=state.archiveQuery.trim().toLocaleLowerCase('ko-KR');
 return archiveRows.filter(r=>{
   const isRevision=r.record_type==='employee_revision';
   const validType=state.archiveType==='all' ||
     (state.archiveType==='changes' && isRevision) ||
     (state.archiveType==='original' && !isRevision) ||
     (!isRevision && (
       (state.archiveType==='matched' && ['name_exact','roster_added_nonretired'].includes(r.match_status)) ||
       (state.archiveType==='past' && r.match_status==='past_only') ||
       (state.archiveType==='review' && String(r.match_status||'').includes('review'))));
   const text=[r.name,r.department,r.grade,r.position,...(r.responsibilities||[]),
       ...(isRevision?(r.changes||[]).flatMap(c=>[c.label,c.before,c.after].flat()):[])].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
   return (state.archivePeriod==='all'||r.period===state.archivePeriod) && validType && (!q||text.includes(q));
 }).sort((a,b)=>b.period.localeCompare(a.period) ||
   (b.record_type==='employee_revision'?1:0)-(a.record_type==='employee_revision'?1:0) ||
   String(b.recorded_at||'').localeCompare(String(a.recorded_at||'')) ||
   (Number(a.source_row_order)||0)-(Number(b.source_row_order)||0));
}
function archiveLabel(r){
 if(r.record_type==='employee_revision')return '<span class="badge badge-warn">관리자 수정 · 이전 정보</span>';
 const nowEmployee=r.employee_id?allStaff.find(p=>p.id===r.employee_id):allStaff.find(p=>p.name===r.name);
 if(nowEmployee?.rosterStatus==='퇴직')return '<span class="badge badge-grey">퇴직 · 이력 보관</span>';
 if(r.match_status==='roster_added_nonretired'){
   const now=allStaff.find(p=>p.name===r.name);
   return `<span class="badge badge-warn">${now?.rosterStatus==='재직'?'현행':e(r.roster_decision)} · 명단 등록</span>`;
 }
 if(r.roster_decision==='퇴직')return '<span class="badge badge-grey">퇴직 · 이력 보관</span>';
 if(r.match_status==='past_only')return '<span class="badge badge-gold">현행 명단 미등재</span>';
 if(String(r.match_status||'').includes('review'))return '<span class="badge badge-warn">중복 확인 필요</span>';
 return '<span class="badge badge-green">성명 일치</span>';
}
function archiveForPerson(p){
 return archiveRows.filter(r=>r.employee_id?r.employee_id===p.id:r.name===p.name)
   .sort((a,b)=>b.period.localeCompare(a.period)||String(b.recorded_at||'').localeCompare(String(a.recorded_at||'')));
}
function archiveShortDate(r){return r.record_type==='employee_revision'?formatWhen(r.recorded_at):r.period;}
function renderPersonArchiveSummary(p){
 const records=archiveForPerson(p);
 if(!records.length)return '<div class="history-brief"><div class="card-desc">등록된 이전 업무분장 기록이 없습니다.</div></div>';
 return `<div class="history-brief"><div class="drawer-history-head"><strong>과거 업무분장 · 수정 이력</strong><span class="badge badge-grey">${records.length}건</span></div><div class="archive-mini-list">${records.map(r=>`<button class="archive-mini" data-archive-open="${e(r.archive_id)}"><span class="archive-mini-period">${e(archiveShortDate(r))}</span><span class="archive-mini-dept">${e(r.department)}</span>${String(r.match_status||'').includes('review')?'<span class="badge badge-warn">확인 필요</span>':''}${icon('chevron')}</button>`).join('')}</div><div class="help-text">월별 문서의 날짜는 자료 기준 월이며, 관리자 이력의 날짜는 수정 저장일입니다. 실제 인사발령일과는 다릅니다.</div></div>`;
}
function renderRevisionArchiveDetail(r){
 const current=r.employee_id?allStaff.find(x=>x.id===r.employee_id):null;
 const drawer=document.getElementById('drawer'),overlay=document.getElementById('overlay');
 const related=archiveRows.filter(x=>r.employee_id?x.employee_id===r.employee_id:x.name===r.name)
   .sort((a,b)=>b.period.localeCompare(a.period)||String(b.recorded_at||'').localeCompare(String(a.recorded_at||'')));
 const changes=Array.isArray(r.changes)?r.changes:[];
 drawer.innerHTML=`<div class="drawer-top"><div><div class="overline">직원정보 수정 이력 · 공개 조회</div><div class="archive-person-title">${e(r.name)} <span>${e(r.position||r.grade||'')}</span></div><div class="archive-person-sub">${e(formatWhen(r.recorded_at))} 저장 · ${e(r.department)}</div></div><button class="btn btn-small" data-closedrawer aria-label="닫기">${icon('close')}</button></div>
 <div class="drawer-body"><div class="archive-state-line"><span class="badge badge-warn">과거이력</span>${r.grade?`<span class="badge badge-grey">${e(r.grade)}</span>`:''}</div>
 <div class="archive-source"><strong>수정일시</strong> ${e(formatWhen(r.recorded_at))}<div><strong>수정자</strong> ${e(r.changed_by||'관리자')}</div><p>기록 시각은 인사발령 효력일이 아님</p></div>
 <div class="archive-field-grid"><div><label>이전 소속 부서</label><strong>${e(r.department)}</strong></div><div><label>이전 직위 / 직급</label><strong>${e([r.position,r.grade].filter(Boolean).join(' / ')||'미등록')}</strong></div><div><label>이전 인력 상태</label><strong>${e(r.roster_status||'재직')}</strong></div><div><label>이전 비고</label><strong>${e((r.notes||[]).join(', ')||'없음')}</strong></div></div>
 <div class="archive-block-title">이전 담당 업무 <span class="badge badge-grey">${(r.responsibilities||[]).length}건</span></div>
 ${(r.responsibilities||[]).length?`<ol class="task-list">${r.responsibilities.map((task,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><span style="font-weight:500;color:#435a74">${e(task)}</span></li>`).join('')}</ol>`:'<div class="help-text">이전에 등록된 담당 업무가 없습니다.</div>'}
 <div class="archive-block-title">이때 변경한 항목 <span class="badge badge-grey">${changes.length}건</span></div>
 <div class="revision-diffs">${changes.map(c=>`<div class="revision-diff"><div class="revision-field">${e(c.label)}</div><div class="revision-values"><div><span class="revision-side-label">변경 전</span>${displayRevisionValue(c.before)}</div><div><span class="revision-side-label">변경 후</span>${displayRevisionValue(c.after)}</div></div></div>`).join('')||'<div class="help-text">표시할 변경 항목이 없습니다.</div>'}</div>
 <div class="archive-block-title">직원별 관련 이력</div><div class="archive-mini-list">${related.map(x=>`<button class="archive-mini ${r.archive_id===x.archive_id?'active':''}" data-archive-open="${e(x.archive_id)}"><span class="archive-mini-period">${e(archiveShortDate(x))}</span><span class="archive-mini-dept">${e(x.department)}</span>${icon('chevron')}</button>`).join('')}</div></div>
 <div class="drawer-footer"><button class="btn" data-closedrawer>닫기</button>${current?`<button class="btn btn-primary" data-current-open="${e(current.id)}">${icon('users')} 현재 업무 보기</button>`:'<span class="help-text">현재 명단 미등재(이력 보관)</span>'}</div>`;
 overlay.classList.add('open');drawer.classList.add('open');drawer.focus();document.body.style.overflow='hidden';
}
function renderArchiveDetail(){
 const r=archiveRows.find(x=>x.archive_id===state.archiveId);
 if(!r)return;
 if(r.record_type==='employee_revision')return renderRevisionArchiveDetail(r);
 const related=(archivedByName.get(r.name)||[]).slice().sort((a,b)=>b.period.localeCompare(a.period));
 const current=r.employee_id?allStaff.find(x=>x.id===r.employee_id):null;
 const drawer=document.getElementById('drawer'),overlay=document.getElementById('overlay');
 drawer.innerHTML=`<div class="drawer-top"><div><div class="overline">ARCHIVED WORK ASSIGNMENT</div><div class="archive-person-title">${e(r.name)} <span>${e(r.position||r.grade||'직급 기록 없음')}</span></div><div class="archive-person-sub">${e(r.period)} 문서 · ${e(r.department)}</div></div><button class="btn btn-small" data-closedrawer aria-label="닫기">${icon('close')}</button></div>
 <div class="drawer-body"><div class="archive-state-line"><span class="badge">${e(r.period)}</span>${archiveLabel(r)}${r.grade?`<span class="badge badge-grey">${e(r.grade)}</span>`:''}</div>
 ${r.match_status.includes('review')?'<div class="archive-warning">같은 월별 문서에 동일한 이름이 복수 기재되어 있습니다. 동일인으로 확정하거나 현행 직원 ID에 자동 연결하지 않았습니다.</div>':''}
 <div class="archive-field-grid"><div><label>소속 부서</label><strong>${e(r.department)}</strong></div><div><label>직위 / 직급</label><strong>${e([r.position,r.grade_original||r.grade].filter(Boolean).join(' / ')||'미표기')}</strong></div></div>
 <div class="archive-block-title">해당 월 문서의 담당 업무 <span class="badge badge-grey">${r.responsibilities.length}건</span></div>
 <ol class="task-list">${r.responsibilities.map((task,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><span style="font-weight:500;color:#435a74">${e(task)}</span></li>`).join('')}</ol>
 <div class="archive-block-title">동일 성명 문서 기록</div><div class="archive-mini-list">${related.map(x=>`<button class="archive-mini ${r.archive_id===x.archive_id?'active':''}" data-archive-open="${e(x.archive_id)}"><span class="archive-mini-period">${e(x.period)}</span><span class="archive-mini-dept">${e(x.department)}</span>${x.match_status.includes('review')?'<span class="badge badge-warn">중복</span>':''}${icon('chevron')}</button>`).join('')}</div>
 <div class="archive-source"><strong>원문 출처</strong><div>${e(r.source_file)} · ${e(r.source_row_order)}번째 추출 직원 기록</div></div></div>
 <div class="drawer-footer"><button class="btn" data-closedrawer>닫기</button>${current?`<button class="btn btn-primary" data-current-open="${e(current.id)}">${icon('users')} ${current.currentAssignmentVerified===false?'명단 정보 보기':'현재 업무 보기'}</button>`:'<span class="help-text">현재 명단 미등재(이력 보관)</span>'}</div>`;
 overlay.classList.add('open');drawer.classList.add('open');drawer.focus();document.body.style.overflow='hidden';
}
function renderHistory(){
 const rows=archiveFiltered(),pages=Math.max(1,Math.ceil(rows.length/14));
 state.archivePage=Math.min(Math.max(1,state.archivePage),pages);
 const displayed=rows.slice((state.archivePage-1)*14,state.archivePage*14);
 const originals=archiveRows.filter(r=>r.record_type!=='employee_revision');
 const revisions=archiveRows.filter(r=>r.record_type==='employee_revision');
 const unique=new Set(originals.map(r=>r.name)).size;
 return `<div class="archive-kpis">
 <div class="kpi-card">${iconCard('file','')}<div class="kpi-heading">과거 문서</div><div class="kpi-value">${(ARCHIVE.source_documents||[]).length}<span class="kpi-unit">건</span></div><div class="kpi-note">기존 월별 업무분장 원문</div></div>
 <div class="kpi-card">${iconCard('history','teal')}<div class="kpi-heading">월별 직원 기록</div><div class="kpi-value">${originals.length}<span class="kpi-unit">건</span></div><div class="kpi-note">원문 기준 자료는 변경 없이 보존</div></div>
 <div class="kpi-card">${iconCard('users','purple')}<div class="kpi-heading">과거 등장 성명</div><div class="kpi-value">${unique}<span class="kpi-unit">명</span></div><div class="kpi-note">기존 업무분장 문서에 등장한 이름</div></div>
 <div class="kpi-card">${iconCard('history','orange')}<div class="kpi-heading">직원정보 수정 이력</div><div class="kpi-value">${revisions.length}<span class="kpi-unit">건</span></div><div class="kpi-note">관리자 저장 시 이전 상태 자동 보존</div></div></div>
 <div class="card archive-panel"><div class="card-head"><div><div class="card-title">월별 업무분장 · 직원 수정 이력 조회</div></div><span class="badge badge-grey">전체 사용자 열람</span></div>
 <form id="archiveSearch" class="archive-filters"><div class="field"><label for="archivePeriod">기록 월</label><select class="form-control" id="archivePeriod"><option value="all" ${state.archivePeriod==='all'?'selected':''}>전체 기간</option>${periodValues.map(v=>`<option value="${e(v)}" ${state.archivePeriod===v?'selected':''}>${e(v)}</option>`).join('')}</select></div>
 <div class="field"><label for="archiveSearchInput">성명 / 부서 / 담당 업무</label><input class="form-control" id="archiveSearchInput" value="${e(state.archiveQuery)}" placeholder="예: 시연직원011, 경력연구실, 교육운영" autocomplete="off"></div>
 <div class="field"><label for="archiveType">이력 구분</label><select class="form-control" id="archiveType"><option value="all" ${state.archiveType==='all'?'selected':''}>전체 기록</option><option value="changes" ${state.archiveType==='changes'?'selected':''}>관리자 수정 기록</option><option value="original" ${state.archiveType==='original'?'selected':''}>월별 원문 기록</option><option value="matched" ${state.archiveType==='matched'?'selected':''}>원문: 현행 명단 성명 일치</option><option value="past" ${state.archiveType==='past'?'selected':''}>원문: 퇴직 · 이력만 보관</option><option value="review" ${state.archiveType==='review'?'selected':''}>원문: 중복 확인 필요</option></select></div>
 <button class="btn btn-primary" type="submit">${icon('search')} 검색</button><button class="btn" type="button" data-archive-reset>초기화</button></form>
 <div class="archive-helper">수정 기록일은 인사발령일과 다를 수 있음</div>
 <div class="table-scroll"><table class="table"><thead><tr><th>기록 월 / 저장일</th><th>성명</th><th>당시 부서</th><th>직위 / 직급</th><th>당시 주요 업무</th><th>기록 구분</th><th></th></tr></thead><tbody>${displayed.length?displayed.map(r=>`<tr data-archive-open="${e(r.archive_id)}" tabindex="0" role="button"><td class="archive-month">${e(r.period)}${r.record_type==='employee_revision'?`<span class="person-sub">${e(formatWhen(r.recorded_at))}</span>`:''}</td><td><strong>${e(r.name)}</strong></td><td>${e(r.department)}</td><td>${e([r.position,r.grade].filter(Boolean).join(' / ')||'미표기')}</td><td><span class="ellipsis" title="${e((r.responsibilities||[]).join(' / '))}">${e((r.responsibilities||[])[0]||'내용 미기재')}</span></td><td>${archiveLabel(r)}</td><td>${icon('chevron')}</td></tr>`).join(''):`<tr><td colspan="7"><div class="empty">조건에 맞는 과거 업무분장 기록이 없습니다.</div></td></tr>`}</tbody></table></div>
 <div class="table-footer"><span>총 ${rows.length}건 중 ${rows.length?(state.archivePage-1)*14+1:0}–${Math.min(state.archivePage*14,rows.length)}건 표시</span><div class="pagination"><button class="btn btn-small" data-archive-page="prev" ${state.archivePage===1?'disabled':''}>이전</button><span>${state.archivePage} / ${pages}</span><button class="btn btn-small" data-archive-page="next" ${state.archivePage===pages?'disabled':''}>다음</button></div></div></div>`;
}

function exportContext(){
  if(!window.DEMO_RAG_EXPORT)throw new Error('RAG JSON 생성 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
  const date=new Date();
  const pages=window.DEMO_RAG_EXPORT.makePrintPages(departmentMembers);
  const employees=currentStaff();
  window.DEMO_RAG_EXPORT.checkEmployeeCoverage(pages,employees);
  return {date,pages,employees,fileNames:window.DEMO_RAG_EXPORT.filenames(date)};
}
function generateRagData(ctx){
  return window.DEMO_RAG_EXPORT.buildRagJson({
    pages:ctx.pages,currentEmployees:ctx.employees,fileName:ctx.fileNames.pdf,
    sourceTitle:sourceTitleForDisplay(ROOT.sourceTitle),printDate:ctx.date
  });
}
function exportJson(){
  try{
    const ctx=exportContext();
    const data=generateRagData(ctx);
    const text=JSON.stringify(data,null,2)+'\n';
    const blob=new Blob([text],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=ctx.fileNames.json;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    toast(`PDF→JSON 규격으로 ${Object.keys(data).length}개 주제 항목을 생성했습니다. 현행 직원 ${ctx.employees.length}명 기준입니다.`);
  }catch(err){toast(`JSON 생성 실패: ${err.message}`);}
}
function renderExport(){
  let entryCount=0,preview={},pdfName='';
  try{
    const ctx=exportContext(),data=generateRagData(ctx);
    entryCount=Object.keys(data).length;
    pdfName=ctx.fileNames.pdf;
    const first=Object.keys(data)[0];
    const entry=data[first];
    preview={[first]:{...entry,origin_text:entry.origin_text.slice(0,850)+(entry.origin_text.length>850?'\n...(미리보기 생략)':'')}};
  }catch(err){preview={error:err.message};}
  return `<div class="col2"><div><div class="card"><div class="card-head"><div><div class="card-title">챗봇 학습용 RAG JSON 내보내기</div><div class="card-desc">돕고파 · PDF→JSON 프롬프트의 통합 객체 형식</div></div><span class="badge badge-green">구조 맞춤</span></div>
   <div class="setting-row"><div><div class="setting-title">출력 대상</div><div class="setting-hint">현행 직원, 퇴직자 및 과거 이력 제외</div></div><span class="setting-check">전체 ${currentStaff().length}명</span></div>
   <div class="setting-row"><div><div class="setting-title">본문 및 연락처</div><div class="setting-hint">원문형 텍스트에 담당 업무·전화번호·내선·이메일 포함 (미등록 값은 미등록으로 표기)</div></div><span class="setting-check">포함</span></div>
   <div class="setting-row"><div><div class="setting-title">문서 메타·검색 보강</div><div class="setting-hint">meta_info · keywords · expected_question · summation · supplement</div></div><span class="setting-check">포함</span></div>
   <div class="setting-row"><div><div class="setting-title">생성 단위</div><div class="setting-hint">PDF 인쇄 계획의 페이지·연속 부서별 묶음</div></div><span class="setting-check">${entryCount}개 항목</span></div>
   <div class="setting-row"><div><div class="setting-title">PDF 기준 파일명</div><div class="setting-hint">${e(pdfName)} (PDF 저장 시 동일하게 지정)</div></div><span class="badge badge-grey">페이지 대응</span></div>
   <div style="display:flex;gap:9px;margin-top:20px;flex-wrap:wrap"><button class="btn btn-primary" data-export="json">${icon('download')} RAG JSON 내려받기</button><button class="btn" data-export="pdf">${icon('print')} PDF 인쇄·저장</button></div>
   <p class="summary-foot">동일한 데이터와 인쇄 배치를 사용합니다. PDF는 Chrome/Edge의 실제 인쇄 결과에서 페이지 넘침이 없는지 확인하세요. 이 기능은 PDF를 시각 분석한 것이 아닌 DB 기반 변환입니다.</p></div></div>
   <div><div class="card"><div class="card-head"><div><div class="card-title">PDF→JSON 구조 미리보기</div><div class="card-desc">원문 텍스트는 앞부분만 표시 · 전체 내용은 파일에 포함</div></div></div><pre class="code-preview">${e(JSON.stringify(preview,null,2))}</pre><p class="summary-foot">파일명 Key마다 origin_text, meta_info, keywords, expected_question, summation, supplement를 제공합니다.</p></div><div class="card section-gap"><div class="card-head"><div class="card-title">돕고파 반영 절차</div></div>${[['PDF·JSON 생성','두 파일을 같은 날짜·데이터 기준으로 생성하고 실제 PDF 페이지 수 확인'],['기존 자료 교체','기존 업무분장 인덱싱 자료를 비활성화·제거'],['새 JSON 적재','돕고파 JSON 업로드 규격 검증 후 업로드 및 재인덱싱'],['응답 검증','담당 업무·직원명·내선번호로 질의해 결과 확인']].map(([name,body],i)=>`<div class="export-step"><span class="step-number">${i+1}</span><div><div class="step-title">${e(name)}</div><div class="step-desc">${e(body)}</div></div></div>`).join('')}</div></div></div>`;
}

function renderAdminCreate(){
 return `<div class="restricted"><strong>관리자 전용 신규 직원 등록</strong> — 필수 정보를 입력하고 등록하면 PostgreSQL에 신규 직원이 추가됩니다. 직원번호는 자동 발급되며 기존 명단과 과거 기록은 변경되지 않습니다.</div>
 <div class="card admin-create-card"><div class="card-head"><div><div class="card-title">신규 직원 등록</div><div class="card-desc">성명·소속 부서·직급은 필수입니다. 나머지는 확인된 정보만 입력하세요.</div></div><span class="badge badge-green">자동 직원번호 발급</span></div>
 <form id="adminCreateForm" class="form-grid" style="margin-top:18px">
  <div class="field"><label for="createName">성명 <span class="required-mark">*</span></label><input id="createName" class="form-control" name="name" maxlength="80" required autocomplete="off" placeholder="예: 홍길동"></div>
  <div class="field"><label for="createDepartment">소속 부서 <span class="required-mark">*</span></label><select id="createDepartment" class="form-control" name="department" required><option value="" selected disabled>부서 선택</option>${deptNames.map(d=>`<option value="${e(d)}">${e(d)}</option>`).join('')}</select></div>
  <div class="field"><label for="createPosition">직위</label><input id="createPosition" class="form-control" name="position" maxlength="100" placeholder="예: 실장, 주무"></div>
  <div class="field"><label for="createGrade">직급 <span class="required-mark">*</span></label><select id="createGrade" class="form-control" name="grade" required><option value="" selected disabled>직급 선택</option>${grades.filter(x=>x!=='직급 미확인').map(g=>`<option value="${e(g)}">${e(g)}</option>`).join('')}</select></div>
  <div class="field"><label for="createPhone">업무용 전화번호</label><input id="createPhone" class="form-control" name="phone" type="tel" maxlength="40" placeholder="예: 043-000-0000"></div>
  <div class="field"><label for="createEmail">업무용 이메일</label><input id="createEmail" class="form-control" name="email" type="email" maxlength="200" placeholder="예: demo@example.com"></div>
  <div class="field"><label for="createStatus">인력 상태</label><select id="createStatus" class="form-control" name="rosterStatus">${opts(['재직','휴직','파견','퇴직'],'재직')}</select></div>
  <div class="field create-contract"><label>채용 형태</label><label class="checkbox-row"><input name="contract" type="checkbox" value="yes"> 위촉 직원</label></div>
  <div class="field"><label for="createLeaveStart">휴직 시작일</label><input id="createLeaveStart" class="form-control" name="leaveStart" type="date" disabled></div>
  <div class="field"><label for="createLeaveEnd">휴직 종료일</label><input id="createLeaveEnd" class="form-control" name="leaveEnd" type="date" disabled></div>
  <div class="field"><label for="createRetiredAt">퇴직일 (선택)</label><input id="createRetiredAt" class="form-control" name="retiredAt" type="date" disabled></div>
  <div class="field wide"><label for="createNote">비고</label><input id="createNote" class="form-control" name="note" maxlength="1500" placeholder="필요한 사항만 기록"></div>
  <div class="field wide"><label for="createTasks">담당 업무 (한 줄에 1개씩)</label><textarea id="createTasks" class="form-control" name="responsibilities" placeholder="확인된 담당 업무만 입력하세요. 공란이면 업무 미등록으로 표시됩니다."></textarea></div>
  <div class="wide create-guidance">${icon('info')} 등록한 직원은 조회·조직별 현황과 챗봇 학습용 JSON·PDF에 포함됩니다. 휴직·파견 상태로 담당 업무가 없다면 챗봇에는 업무 미등록으로 표시합니다. 퇴직 상태는 현행 조회·PDF·JSON에서 제외되고, 관리자에서 기록을 확인할 수 있습니다. 같은 부서의 동일 성명 또는 동일 이메일은 중복 등록할 수 없습니다.</div>
  <div class="wide create-actions"><button type="reset" class="btn">${icon('refresh')} 입력 초기화</button><button type="submit" class="btn btn-primary">${icon('check')} 직원 등록</button></div>
 </form></div>`;
}

async function handleCreateEmployee(form){
 if(!isAdmin()){toast('관리자 로그인이 필요합니다.');return;}
 const submit=form.querySelector('button[type="submit"]');
 if(submit.disabled)return;
 const data=new FormData(form);
 const employee={
   name:String(data.get('name')||'').trim(),department:String(data.get('department')||''),
   position:String(data.get('position')||'').trim(),grade:String(data.get('grade')||''),
   phone:String(data.get('phone')||'').trim(),email:String(data.get('email')||'').trim(),
   rosterStatus:String(data.get('rosterStatus')||'재직'),note:String(data.get('note')||'').trim(),
   leaveStart:String(data.get('leaveStart')||''),leaveEnd:String(data.get('leaveEnd')||''),retiredAt:String(data.get('retiredAt')||''),
   contract:data.get('contract')==='yes',
   responsibilities:String(data.get('responsibilities')||'').split('\n').map(s=>s.trim()).filter(Boolean)
 };
 if(!employee.name||!employee.department||!employee.grade){toast('성명·소속 부서·직급을 입력해 주세요.');return;}
 if(Boolean(employee.leaveStart)!==Boolean(employee.leaveEnd)){toast('휴직 시작일과 종료일은 함께 입력해 주세요.');return;}
 if(!confirm(`${employee.department} · ${employee.name} (${employee.grade}) 직원을 신규 등록할까요?`))return;
 submit.disabled=true;
 try{
   const result=await apiRequest('/api/employees',{method:'POST',body:JSON.stringify({employee})});
   allStaff.push(result.employee);
   state.adminPerson=result.employee.id;
   state.adminTab='edit';
   state.personPage=1;
   state.orderDraft=[];
   renderApp();toast(`${result.employee.name} 직원이 등록되었습니다. 직원번호: ${result.employee.id} · 현행 ${currentStaff().length}명`);
 }catch(err){submit.disabled=false;toast('직원 등록 실패: '+err.message);}
}

function renderAdminEdit(){
 if(!isAdmin())return `<div class="card"><div class="restricted">이 계정은 조회만 가능하며 관리자 기능을 사용할 수 없습니다.</div></div>`;
 const p=allStaff.find(p=>p.id===state.adminPerson)||allStaff[0];return `<div class="restricted"><strong>PostgreSQL 실시간 관리</strong> — 로그인된 관리자만 정보를 수정할 수 있습니다. </div><div class="admin-grid"><div class="card"><div class="card-head"><div><div class="card-title">수정 대상 직원</div><div class="card-desc">직원을 선택하여 업무를 수정합니다</div></div></div><div class="field"><label>직원 선택</label><select id="adminSelect" class="form-control">${orderedStaff(allStaff).map(x=>`<option value="${e(x.id)}" ${x.id===p.id?'selected':''}>${e(x.department)} · ${e(x.name)}${x.rosterStatus==='퇴직'?' [퇴직]':''}${x.isManualEntry?' [신규등록]':''}</option>`).join('')}</select></div><div class="admin-preview-highlight section-gap"><div class="person-name" style="font-size:16px">${e(p.name)}</div><div class="help-text">${e(p.department)} · ${e(p.grade)} ${statusBadge(p)}</div><div class="help-text" style="margin-top:10px">현재 담당 업무: ${p.responsibilities.length}건</div><div class="help-text">업무용 연락처: ${p.extension?'내선 '+e(p.extension):'미등록'}</div><div class="admin-modified"><strong>최종 수정일</strong><span>${e(p.lastModifiedAt?formatWhen(p.lastModifiedAt):'수정 이력 없음 (초기 등록)')}</span></div>${p.lastModifiedBy?`<div class="help-text">최종 수정자: ${e(p.lastModifiedBy)}</div>`:''}</div></div><div class="card"><div class="card-head"><div><div class="card-title">직원 정보 및 담당 업무 수정</div><div class="card-desc">직위·직급·연락처·업무 내용을 변경</div></div><span class="demo-stamp">관리자 인증 · DB 저장</span></div><form id="adminForm" class="form-grid" style="margin-top:17px"><input type="hidden" name="employee_id" value="${e(p.id)}"><div class="field"><label>성명</label><input class="form-control" name="name" value="${e(p.name)}" required></div><div class="field"><label>부서</label><select class="form-control" name="department">${opts(deptNames,p.department)}</select></div><div class="field"><label>직위</label><input class="form-control" name="position" placeholder="예: 실장, 주무" value="${e(p.position||'')}"></div><div class="field"><label>직급</label><select class="form-control" name="grade">${opts(grades,p.grade)}</select></div><div class="field"><label>업무용 전화번호 (내선은 끝 4자리)</label><input class="form-control" name="phone" type="tel" placeholder="예: 000-0000-0000" value="${e(p.phone||'')}"></div><div class="field"><label>업무용 이메일</label><input class="form-control" name="email" type="email" placeholder="업무용 이메일" value="${e(p.email||'')}"></div><div class="field"><label>인력 상태</label><select class="form-control" id="editStatus" name="rosterStatus">${opts(['재직','휴직','파견','퇴직'],p.rosterStatus||'재직')}</select></div><div class="field"><label>비고</label><input class="form-control" name="note" value="${e(p.note||'')}" placeholder="예: 휴직"></div><div class="field"><label>휴직 시작일</label><input class="form-control" name="leaveStart" type="date" value="${e(p.leaveStart||'')}" ${p.rosterStatus==='휴직'?'':'disabled'}></div><div class="field"><label>휴직 종료일</label><input class="form-control" name="leaveEnd" type="date" value="${e(p.leaveEnd||'')}" ${p.rosterStatus==='휴직'?'':'disabled'}></div><div class="field"><label>퇴직일 (선택)</label><input class="form-control" name="retiredAt" type="date" value="${e(p.retiredAt||'')}" ${p.rosterStatus==='퇴직'?'':'disabled'}></div><div class="field wide"><label>담당 업무 (한 줄에 1개씩 입력)</label><textarea class="form-control" name="responsibilities">${e(p.responsibilities.join('\n'))}</textarea></div><div class="wide" style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">${p.isManualEntry?`<button type="button" class="btn btn-danger" data-employee-delete="${e(p.id)}">${icon('close')} 오등록 직원 삭제</button>`:''}<button type="button" data-employee-history="${e(p.id)}" class="btn">${icon('history')} 직원 변경 이력 조회</button><button type="submit" class="btn btn-primary">${icon('check')} 변경사항 저장</button></div></form></div></div>`;}
function renderAdmin(){return !isAdmin()?renderAdminEdit():renderAdminTabs()+(state.adminTab==='order'?renderAdminOrder():state.adminTab==='create'?renderAdminCreate():state.adminTab==='revisions'?renderAdminRevisions():renderAdminEdit());}
function renderApp(){let content=state.page==='dashboard'?renderDashboard():state.page==='org'?renderOrgs():state.page==='history'?renderHistory():state.page==='export'?renderExport():renderAdmin();document.getElementById('app').innerHTML=`${renderSidebar()}<div class="main">${renderHeader()}${renderHeading()}${(state.page==='dashboard'||state.page==='org')?renderQuickSearch():''}<main class="page-content" id="maincontent">${content}</main><div class="footer">© KIRD · 직원정보는 가상 구성</div><div class="print-report" id="printReport"></div></div><div class="overlay" id="overlay" aria-hidden="true"></div><section class="drawer" id="drawer" tabindex="-1" role="dialog" aria-modal="true" aria-label="직원 업무분장 상세"></section><div class="toaster" role="status" id="toast"></div>`;openDrawerIfNeeded();}
function openDrawerIfNeeded(){if(state.archiveId)return renderArchiveDetail();const p=allStaff.find(p=>p.id===state.detailId);if(!p)return;const drawer=document.getElementById('drawer'),overlay=document.getElementById('overlay');const pdept=parent(p.department);const valid=p.currentAssignmentVerified!==false;drawer.innerHTML=`<div class="drawer-top"><div><div class="overline">EMPLOYEE DETAILS</div><div style="font-size:22px;font-weight:850;color:#17304c;margin-bottom:7px">${e(p.name)} <span style="font-size:11px;color:#7c91a8;font-weight:650">${e(p.position||'')}</span></div><div style="font-size:12px;color:#70829a">${pdept?`${e(pdept)} / `:''}${e(labelDept(p.department))}</div></div><button class="btn btn-small" data-closedrawer aria-label="닫기">${icon('close')}</button></div><div class="drawer-body"><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><span class="badge">${e(p.jobGroup)}</span><span class="badge badge-grey">${e(p.grade)}${p.gradeVerified===false?' (과거 기록)':''}</span>${statusBadge(p)}${p.contract?'<span class="badge badge-gold">위촉</span>':''}</div>${!valid?(p.departmentVerified===true?`<div class="archive-warning"><strong>현재 담당 업무 미등록</strong> — 부서는 ${e(p.department)}로 확인되었습니다. 직급은 ${p.gradeVerified===false?'과거 문서에 기록된 '+e(p.grade)+'(현행 미확인)':e(p.grade)}입니다. ${p.leaveStart&&p.leaveEnd?`휴직 기간: ${e(p.leaveStart)} ~ ${e(p.leaveEnd)}. `:''}담당 업무는 제공되지 않아 비워 두었습니다.</div>`:`<div class="archive-warning"><strong>현재 소속·직급·담당 업무 미확인</strong> — ${e(p.rosterStatus)}으로 명단에 등록했습니다. 마지막 확인 부서는 ${e(p.lastKnownDepartment)} (${e(p.lastKnownPeriod)} 문서)이며, 아래 과거 이력에서 당시 업무를 조회할 수 있습니다. 현재 담당 업무로 안내하지 않습니다.</div>`):''}${p.subDepartments?.length?`<div class="status-box" style="margin-top:16px">원장 하위부서: ${e(p.subDepartments.join(', '))}</div>`:''}${p.leaveStart&&p.leaveEnd?`<div class="status-box" style="margin-top:12px">비고: 휴직 ${e(p.leaveStart)} ~ ${e(p.leaveEnd)}</div>`:''}<div class="drawer-contact"><div class="contact-cell"><div class="contact-name">${icon('phone')} 업무용 전화번호</div><div class="contact-value">${p.phone?`<a href="tel:${e(p.phone)}">${e(p.phone)}</a>`:'미등록'}</div>${p.extension?`<div class="help-text" style="margin-top:5px">내선 ${e(p.extension)}</div>`:''}</div><div class="contact-cell"><div class="contact-name">${icon('mail')} 업무용 이메일</div><div class="contact-value">${p.email?`<a href="mailto:${e(p.email)}">${e(p.email)}</a>`:'미등록'}</div></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 13px"><div style="font-weight:820;font-size:13px">${valid?'담당 업무':'현재 담당 업무(미확인)'}</div><span class="badge badge-grey">${valid?p.responsibilities.length:0}건</span></div><ol class="task-list">${valid&&p.responsibilities.length?p.responsibilities.map((t,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><span style="font-weight:500;color:#435a74">${e(t)}</span></li>`).join(''):`<li>현재 담당 업무는 등록되지 않았습니다.</li>`}</ol><div class="status-box" style="margin-top:17px">직원정보 최종 수정일: <strong>${e(p.lastModifiedAt?formatWhen(p.lastModifiedAt):'수정 이력 없음 (초기 등록)')}</strong></div>${renderPersonArchiveSummary(p)}<div class="summary-foot">자료 출처: ${e(p.departmentSource||(p.departmentVerified===true?(p.assignmentSource||'사용자 제공 추가 등록'):(valid?(p.assignmentSource||ROOT.sourceTitle):'시연용 가상 자료')))} · 상태 ${e(p.rosterStatus||'재직')}</div></div><div class="drawer-footer"><button class="btn" data-closedrawer>닫기</button>${isAdmin()?`<button class="btn btn-light" data-nav="admin">${icon('pencil')} 관리자 수정 화면</button>`:''}</div>`;overlay.classList.add('open');drawer.classList.add('open');drawer.focus();document.body.style.overflow='hidden';}
function closeDrawer(){state.archiveId=null;state.detailId=null;document.body.style.overflow='';document.getElementById('drawer')?.classList.remove('open');document.getElementById('overlay')?.classList.remove('open');}
let toastTimer;
function toast(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function navigate(page){if(!['dashboard','org','history','export','admin'].includes(page)||(page==='admin'&&!isAdmin()))return;state.page=page;state.personPage=1;closeDrawer();renderApp();window.scrollTo({top:0,behavior:'instant'});}
async function handleSave(form){const data=new FormData(form);const id=data.get('employee_id');const p=allStaff.find(p=>p.id===id);if(!p)return;const next={...p};for(const f of ['name','department','position','phone','email','note','leaveStart','leaveEnd','retiredAt','rosterStatus'])next[f]=String(data.get(f)||'').trim();if(!next.name){toast('성명을 입력해 주세요.');return;}next.position=next.position||null;next.phone=next.phone||null;next.email=next.email||null;next.extension=next.phone?.match(/([0-9]{4})$/)?.[1]||null;next.grade=String(data.get('grade'));next.jobGroup=next.grade==='원장'?'기관장':next.grade==='직급 미확인'?'직종 미확인':next.grade.includes('연구')?'연구직':next.grade.includes('행정')?'행정직':next.grade.includes('전문관리')?'전문관리원':next.grade==='교육사무원'?'교육사무원':'시설관리원';next.parentDepartment=parent(next.department);next.departmentVerified=next.department!=='소속 확인 필요';next.gradeVerified=p.gradeVerified===false&&next.grade===p.grade?false:next.grade!=='직급 미확인';next.responsibilities=String(data.get('responsibilities')||'').split('\n').map(x=>x.trim()).filter(Boolean);if(next.department!=='소속 확인 필요'&&next.responsibilities.length){next.currentAssignmentVerified=true;}const changedFields=['name','department','position','grade','extension','phone','email','responsibilities','currentAssignmentVerified','rosterStatus','note','leaveStart','leaveEnd','retiredAt'].filter(f=>JSON.stringify(p[f])!==JSON.stringify(next[f]));
 if(!changedFields.length){toast('변경된 내용이 없습니다.');return;}
 try{
   const result=await apiRequest('/api/employees/'+encodeURIComponent(id),{
     method:'PUT',body:JSON.stringify({employee:next,expectedVersion:p.recordVersion})
   });
   const index=allStaff.findIndex(x=>x.id===id);
   allStaff[index]=result.employee;
   if(result.archivedRecord)appendArchiveRecord(result.archivedRecord);
   renderApp();toast(result.unchanged?'변경된 내용이 없어 수정일과 이력을 유지했습니다.':`${result.employee.name} 직원 정보가 기록과 함께 PostgreSQL에 저장되었습니다.`);
 }catch(err){toast('직원 수정 실패: '+err.message);}
}
// 관리자가 직접 신규 등록한 오등록 직원만 논리 삭제할 수 있습니다.
async function handleDeleteEmployee(id){
 if(!isAdmin()){toast('관리자 로그인이 필요합니다.');return;}
 const p=allStaff.find(person=>person.id===id);
 if(!p||!p.isManualEntry){toast('삭제할 수 있는 신규 등록 직원이 아닙니다.');return;}
 const name=prompt(`오등록 직원 삭제\n${p.department} · ${p.name} (${p.id})\n\n삭제하면 현행 직원 조회·인원 통계·PDF·JSON에서 제외됩니다.\n과거 이력/감사 기록은 보존합니다.\n\n확인하려면 성명 '${p.name}'을 정확히 입력하세요.`);
 if(name===null)return;
 if(name!==p.name){toast('성명이 일치하지 않아 삭제하지 않았습니다.');return;}
 if(!confirm(`${p.name} (${p.id}) 직원의 신규 등록을 취소하시겠습니까?\n이 작업은 관리자 기록에 남습니다.`))return;
 try{
   const result=await apiRequest('/api/employees/'+encodeURIComponent(id),{
     method:'DELETE',body:JSON.stringify({expectedVersion:p.recordVersion,confirmName:name})
   });
   allStaff=allStaff.filter(person=>person.id!==id);
   if(Array.isArray(result.orderIds))deptOrders[result.department]=result.orderIds;
   if(result.orderVersion>0)deptOrderVersions[result.department]=result.orderVersion;
   state.adminPerson=allStaff.find(person=>person.id!==id)?.id||null;
   state.orderDraft=[];state.personPage=1;
   renderApp();toast(`${p.name} 직원 등록을 삭제 처리했습니다. 기존 자료와 감사 기록은 보존됩니다.`);
 }catch(err){toast('직원 삭제 실패: '+err.message);}
}

function printAll(){
  try{
    const ctx=exportContext();
    const container=document.getElementById('printReport');
    const currentPrintDate=new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'}).format(ctx.date);
    const personHtml=(p)=>{
      const taskText=window.DEMO_RAG_EXPORT.taskLabel(p);
      const leaveText=p.leaveStart&&p.leaveEnd?`${e(p.leaveStart)} ~ ${e(p.leaveEnd)}`:'';
      return `<div class="print-person" data-print-person="${e(p.id)}">
        <div class="print-person-identity">
          <div class="print-person-name"><strong>${e(p.name)}</strong> <span>${e(p.grade)}${p.position?' · '+e(p.position):''}</span></div>
          <div class="print-meta">${e(p.phone||'전화 미등록')}<span class="print-contact-sep"> · </span>${e(p.email||'이메일 미등록')}</div>
          ${p.rosterStatus&&p.rosterStatus!=='재직'?`<div class="print-status">${e(p.rosterStatus)}${leaveText?' · '+leaveText:''}</div>`:''}
        </div>
        <div class="print-tasks">${e(taskText)}</div>
      </div>`;
    };
    const divisionSection=(section)=>{
      const {department,members,continued,totalCount}=section;
      const title=continued?`${department} (계속)`:department;
      return `<section class="print-dept-section" data-print-dept="${e(department)}" ${continued?'data-print-continued="true"':''}>
        <h2 class="print-dept">${e(title)} <span class="print-dept-count">${totalCount}명</span></h2>
        <div class="print-person-list">${members.map(personHtml).join('')}</div>
      </section>`;
    };
    container.innerHTML=ctx.pages.map(pg=>`<div class="print-page" data-print-page="${pg.number}">
      <header class="print-page-header"><div class="print-title">국가과학기술인력개발원 업무분장표</div>
      <div class="print-subtitle">${e(sourceTitleForDisplay(ROOT.sourceTitle))} · 전체 ${ctx.employees.length}명 · ${e(currentPrintDate)} · ${pg.number} / ${ctx.pages.length}</div></header>
      ${pg.sections.map(divisionSection).join('')}
    </div>`).join('');
    const oldTitle=document.title;
    document.title=ctx.fileNames.base;
    const restoreTitle=()=>{document.title=oldTitle;window.removeEventListener('afterprint',restoreTitle);};
    window.addEventListener('afterprint',restoreTitle,{once:true});
    try{window.print();}catch(err){restoreTitle();throw err;}
  }catch(err){toast(`PDF 인쇄 준비 실패: ${err.message}`);}
}

// Globally delegated interactions
let draggingOrderId=null;
window.addEventListener('dragstart',(ev)=>{
 const row=ev.target.closest?.('[data-order-row]');if(!row||state.page!=='admin'||state.adminTab!=='order')return;
 draggingOrderId=row.dataset.orderRow;
 ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',draggingOrderId);
 row.classList.add('dragging');
});
window.addEventListener('dragover',(ev)=>{
 if(!draggingOrderId)return;
 const row=ev.target.closest?.('[data-order-row]');if(!row||row.dataset.orderRow===draggingOrderId)return;
 ev.preventDefault();ev.dataTransfer.dropEffect='move';
 document.querySelectorAll('.order-item.drop-target').forEach(x=>x.classList.remove('drop-target'));
 row.classList.add('drop-target');
});
window.addEventListener('drop',(ev)=>{
 if(!draggingOrderId)return;
 const row=ev.target.closest?.('[data-order-row]');
 if(row){ev.preventDefault();const r=row.getBoundingClientRect();const after=ev.clientY>=r.top+r.height/2;
    reorderDraft(draggingOrderId,row.dataset.orderRow,after);}
 draggingOrderId=null;
 document.querySelectorAll('.order-item').forEach(x=>x.classList.remove('dragging','drop-target'));
});
window.addEventListener('dragend',()=>{draggingOrderId=null;document.querySelectorAll('.order-item').forEach(x=>x.classList.remove('dragging','drop-target'));});
window.addEventListener('click',(ev)=>{
 const adminTab=ev.target.closest('[data-admin-tab]');
 if(adminTab){const tab=adminTab.dataset.adminTab;if(tab===state.adminTab)return;
   if(state.adminTab==='order'&&isOrderDirty()&&!confirm('저장하지 않은 명단 순서 변경을 취소할까요?'))return;
   state.adminTab=tab;if(tab==='order'){state.orderDraft=[];state.orderSort='manual';}renderApp();if(tab==='revisions')loadRevisions();return;}
 const orderUp=ev.target.closest('[data-order-up]');if(orderUp){moveOrderDraft(orderUp.dataset.orderUp,-1);return;}
 const orderDown=ev.target.closest('[data-order-down]');if(orderDown){moveOrderDraft(orderDown.dataset.orderDown,1);return;}
 const orderPreset=ev.target.closest('[data-order-preset]');if(orderPreset){applyOrderPreset(orderPreset.dataset.orderPreset);return;}
 if(ev.target.closest('[data-order-revert]')){state.orderDraft=departmentMembers(state.adminOrderDept).map(p=>p.id);state.orderSort='manual';renderApp();return;}
 if(ev.target.closest('[data-order-save]')){saveDeptOrder();return;}

 const historyButton=ev.target.closest('[data-employee-history]');if(historyButton){openEmployeeRevisions(historyButton.dataset.employeeHistory);return;}
 if(ev.target.closest('[data-revisions-refresh]')){loadRevisions();return;}
 const revPage=ev.target.closest('[data-revisions-page]');if(revPage){state.revisionPage+=revPage.dataset.revisionsPage==='next'?1:-1;loadRevisions();return;}
 const deleteButton=ev.target.closest('[data-employee-delete]');if(deleteButton){handleDeleteEmployee(deleteButton.dataset.employeeDelete);return;}
 const link=ev.target.closest('[data-nav]');if(link){navigate(link.dataset.nav);return;}
 const histOpen=ev.target.closest('[data-archive-open]');if(histOpen){state.archiveId=histOpen.dataset.archiveOpen;state.detailId=null;openDrawerIfNeeded();return;}
 const currentOpen=ev.target.closest('[data-current-open]');if(currentOpen){state.archiveId=null;state.detailId=currentOpen.dataset.currentOpen;openDrawerIfNeeded();return;}
 const arcPeriod=ev.target.closest('[data-archive-period]');if(arcPeriod){state.archivePeriod=arcPeriod.dataset.archivePeriod;state.archivePage=1;renderApp();return;}
 const arcPage=ev.target.closest('[data-archive-page]');if(arcPage){state.archivePage+=arcPage.dataset.archivePage==='next'?1:-1;renderApp();return;}
 if(ev.target.closest('[data-archive-reset]')){state.archivePeriod='all';state.archiveQuery='';state.archiveType='all';state.archivePage=1;renderApp();return;}
 const clicked=ev.target.closest('[data-open]');if(clicked){state.detailId=clicked.dataset.open;openDrawerIfNeeded();return;}
 const dept=ev.target.closest('[data-deptclick]');if(dept){state.dept=dept.dataset.deptclick;state.query='';state.job='전체 직종';state.dashboardExpanded=false;navigate('dashboard');return;}
 if(ev.target.closest('[data-dashboard-toggle]')){state.dashboardExpanded=!state.dashboardExpanded;renderApp();document.querySelector('[data-dashboard-toggle]')?.focus();return;}
 const tab=ev.target.closest('[data-jobtab]');if(tab){state.gradeTab=tab.dataset.jobtab;renderApp();return;}
 const pag=ev.target.closest('[data-personpage]');if(pag){state.personPage+=pag.dataset.personpage==='next'?1:-1;renderApp();return;}
 if(ev.target.closest('[data-logout]')){
  apiRequest('/api/auth/logout',{method:'POST',body:JSON.stringify({})})
   .then(()=>{
     allStaff=[];archiveRows.length=0;window.DEMO_SEED=null;window.DEMO_ARCHIVE=null;
     window.location.replace('/login');
   })
   .catch(err=>toast('로그아웃 실패: '+err.message));
  return;
 }
 if(ev.target.closest('[data-closedrawer]')||ev.target.id==='overlay'){closeDrawer();return;}
 if(ev.target.closest('[data-quick-reset]')){state.dept='전체 부서';state.query='';state.job='전체 직종';state.personPage=1;renderApp();return;}
 const output=ev.target.closest('[data-export]');if(output){if(output.dataset.export==='json')exportJson();else printAll();return;}
 if(ev.target.closest('#mobileMenu')){document.getElementById('sidebar')?.classList.toggle('mobile-open');return;}
 if(ev.target.closest('.main')&&!ev.target.closest('.sidebar'))document.getElementById('sidebar')?.classList.remove('mobile-open');
});
window.addEventListener('submit',(ev)=>{
 if(ev.target.getAttribute('id')==='archiveSearch'){ev.preventDefault();state.archivePeriod=document.getElementById('archivePeriod').value;state.archiveType=document.getElementById('archiveType').value;state.archiveQuery=document.getElementById('archiveSearchInput').value;state.archivePage=1;renderApp();return;}
 if(ev.target.getAttribute('id')==='quickSearch'){ev.preventDefault();state.dept=document.getElementById('topDepartment').value;state.query=document.getElementById('topKeyword').value;state.job='전체 직종';state.dashboardExpanded=false;navigate('dashboard');}
 if(ev.target.getAttribute('id')==='adminForm'){ev.preventDefault();handleSave(ev.target);return;}
 if(ev.target.getAttribute('id')==='adminCreateForm'){ev.preventDefault();handleCreateEmployee(ev.target);return;}

});
window.addEventListener('change',ev=>{
 if(ev.target.id==='archivePeriod'){state.archiveQuery=document.getElementById('archiveSearchInput')?.value||'';state.archivePeriod=ev.target.value;state.archivePage=1;renderApp();return;}
 if(ev.target.id==='archiveType'){state.archiveQuery=document.getElementById('archiveSearchInput')?.value||'';state.archiveType=ev.target.value;state.archivePage=1;renderApp();return;}

 if(ev.target.id==='adminOrderDept'){
   const next=ev.target.value;if(isOrderDirty()&&!confirm('저장하지 않은 순서 변경을 취소하고 부서를 바꿀까요?')){renderApp();return;}
   state.adminOrderDept=next;state.orderDraft=[];state.orderSort='manual';renderApp();return;
 }
 if(ev.target.id==='adminSelect'){state.adminPerson=ev.target.value;renderApp();return;}
 if(ev.target.id==='revisionEmployee'){state.revisionTarget=ev.target.value;state.revisionPage=1;loadRevisions();return;}
 if(ev.target.id==='createStatus'||ev.target.id==='editStatus'){
   const form=ev.target.form,status=ev.target.value;
   for(const name of ['leaveStart','leaveEnd','retiredAt']){
     const el=form?.querySelector(`[name="${name}"]`);
     if(!el)continue;
     const enabled=name==='retiredAt'?status==='퇴직':status==='휴직';
     el.disabled=!enabled;
     if(!enabled)el.value='';
   }
   return;
 }
});
window.addEventListener('reset',ev=>{if(ev.target.id==='adminCreateForm'){queueMicrotask(()=>{for(const name of ['leaveStart','leaveEnd','retiredAt']){const el=ev.target.querySelector(`[name="${name}"]`);if(el){el.disabled=true;el.value='';}}});}});
window.addEventListener('keydown',ev=>{
 if(ev.key==='Escape'&&(state.detailId||state.archiveId)){closeDrawer();return;}

 const archiveRow=ev.target.closest?.('[data-archive-open]');if((ev.key==='Enter'||ev.key===' ')&&archiveRow){ev.preventDefault();state.archiveId=archiveRow.dataset.archiveOpen;state.detailId=null;openDrawerIfNeeded();return;}
 const d=ev.target.closest?.('[data-deptclick]');if((ev.key==='Enter'||ev.key===' ')&&d){ev.preventDefault();state.dept=d.dataset.deptclick;state.query='';state.job='전체 직종';state.dashboardExpanded=false;navigate('dashboard');}
});
renderApp();
})();
