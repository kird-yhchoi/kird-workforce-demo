'use strict';
const editableFields = ['name','department','position','grade','phone','email','rosterStatus', 'note','leaveStart','leaveEnd','responsibilities','currentAssignmentVerified'];
const statusTypes = ['재직','휴직','파견','퇴직'];
const creatableGrades=new Set(['원장','선임연구위원','연구위원','부연구위원','연구원','책임행정원','선임행정원','행정원','책임전문관리원','선임전문관리원','전문관리원','교육사무원','시설관리원']);
function uniqueNames(ids) {return new Set(ids).size===ids.length;}
function requireText(x, max, label, allowEmpty=false){
  if(typeof x !== 'string' || (!allowEmpty && !x.trim()) || x.length > max)throw new Error(`${label} 형식을 확인해 주세요.`);
  return x.trim();
}
function nullableText(x,max,label) {
  if(x===null || x===undefined || x==='')return null;
  return requireText(x,max,label);
}
function validateDate(x,label){
  if(!x)return null;
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x+'T00:00:00Z'))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x){throw new Error(`${label} 날짜를 확인해 주세요.`)}
  return x;
}
function makeEmployeeUpdate(original,body,allDepartments,parentMap={}){
  if(!body || typeof body!=='object'||Array.isArray(body))throw new Error('직원 데이터가 필요합니다.');
  for(const field of editableFields){if(!(field in body))throw new Error(`직원 데이터 필수 항목 누락: ${field}`)}
  const p={...original};
  p.name=requireText(body.name,80,'성명');
  p.department=requireText(body.department,100,'부서');
  if(!allDepartments.includes(p.department))throw new Error('등록되지 않은 부서입니다.');
  p.position=nullableText(body.position,100,'직위');
  p.grade=requireText(body.grade,80,'직급');
  p.phone=nullableText(body.phone,40,'전화번호');
  if(p.phone && !/^[+\d()\s-]+$/.test(p.phone))throw new Error('전화번호 형식이 올바르지 않습니다.');
  p.email=nullableText(body.email,200,'이메일');
  if(p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw new Error('이메일 형식이 올바르지 않습니다.');
  p.note=requireText(body.note||'',1500,'비고',true);
  p.rosterStatus=requireText(body.rosterStatus,10,'상태');
  if(!statusTypes.includes(p.rosterStatus))throw new Error('재직·휴직·파견·퇴직 중 선택해 주세요.');
  p.leaveStart=validateDate(body.leaveStart,'휴직 시작일');
  p.leaveEnd=validateDate(body.leaveEnd,'휴직 종료일');
  if(Boolean(p.leaveStart)!==Boolean(p.leaveEnd))throw new Error('휴직 시작일과 종료일은 함께 입력해야 합니다.');
  if(p.leaveStart && p.leaveStart>p.leaveEnd)throw new Error('휴직 종료일이 시작일보다 빠릅니다.');
  if(p.rosterStatus!=='휴직'&&(p.leaveStart||p.leaveEnd))throw new Error('휴직기간은 휴직 상태에서만 입력할 수 있습니다.');
  p.retiredAt=validateDate(body.retiredAt??original.retiredAt,'퇴직일');
  if(p.rosterStatus!=='퇴직'&&p.retiredAt)throw new Error('퇴직일은 퇴직 상태에서만 입력할 수 있습니다.');
  if(!Array.isArray(body.responsibilities)||body.responsibilities.length>70||body.responsibilities.some(t=>typeof t!=='string'||t.length>1800))throw new Error('담당 업무는 최대 70개까지 등록할 수 있습니다.');
  p.responsibilities=body.responsibilities.map(s=>s.trim()).filter(Boolean);
  p.jobGroup=p.grade==='원장'?'기관장':p.grade==='직급 미확인'?'직종 미확인':p.grade.includes('연구')?'연구직':p.grade.includes('행정')?'행정직':p.grade.includes('전문관리')?'전문관리원':p.grade==='교육사무원'?'교육사무원':'시설관리원';
  p.extension=p.phone?.match(/([0-9]{4})$/)?.[1]||null;
  p.departmentVerified=p.department!=='소속 확인 필요';
  p.gradeVerified=original.gradeVerified===false && p.grade===original.grade ? false : p.grade!=='직급 미확인';
  p.currentAssignmentVerified=Boolean(original.currentAssignmentVerified!==false || (p.departmentVerified && p.responsibilities.length));
  p.parentDepartment=parentMap[p.department]||null;
  if(original.department!==p.department)p.departmentSource='관리자 변경 (업무분장 관리 웹앱)';
  if(original.department!==p.department || original.position!==p.position || original.grade!==p.grade || JSON.stringify(original.responsibilities)!==JSON.stringify(p.responsibilities)){
    p.assignmentSource='관리자 변경 (업무분장 관리 웹앱)';
    p.sourcePeriod=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  }
  if(original.phone!==p.phone || original.email!==p.email)p.contactMatch='관리자 확인·변경';
  return p;
}

// 신규 등록은 DB가 생성하는 직원 ID를 신뢰하며, 클라이언트가 지정한 ID는 받지 않습니다.
// 현재 업무가 미입력된 인력은 챗봇에서 '담당 업무 미등록'으로 구분합니다.
function makeEmployeeCreate(body, allDepartments, parentMap={}){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('신규 직원 정보가 필요합니다.');
  if(body.contract!==undefined && typeof body.contract!=='boolean')throw new Error('위촉 여부를 확인해 주세요.');
  const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  const original={
    id:null,name:'',department:'',parentDepartment:null,position:null,grade:'직급 미확인',gradeOriginal:null,
    gradeVerified:false,jobGroup:'직종 미확인',contract:false,phone:null,extension:null,email:null,
    responsibilities:[],note:'',rosterStatus:'재직',leaveStart:null,leaveEnd:null,retiredAt:null,
    departmentVerified:false,currentAssignmentVerified:false,
    sourceSection:'관리자 신규 등록',sourcePeriod:month,
    assignmentSource:'관리자 신규 등록 (업무분장 관리 웹앱)',
    departmentSource:'관리자 신규 등록 (업무분장 관리 웹앱)',
    contactMatch:'관리자 직접 등록'
  };
  const normalized={
    name:body.name,department:body.department,position:body.position??'',grade:body.grade,
    phone:body.phone??'',email:body.email??'',rosterStatus:body.rosterStatus??'재직',
    note:body.note??'',leaveStart:body.leaveStart??'',leaveEnd:body.leaveEnd??'',retiredAt:body.retiredAt??'',
    responsibilities:body.responsibilities??[],currentAssignmentVerified:false
  };
  const created=makeEmployeeUpdate(original,normalized,allDepartments,parentMap);
  if(!creatableGrades.has(created.grade))throw new Error('신규 직원의 직급을 목록에서 선택해 주세요.');
  created.gradeOriginal=created.grade;
  created.gradeVerified=true;
  created.contract=Boolean(body.contract);
  created.currentAssignmentVerified=created.responsibilities.length>0;
  created.sourceSection='관리자 신규 등록';
  created.sourcePeriod=month;
  created.assignmentSource='관리자 신규 등록 (업무분장 관리 웹앱)';
  created.departmentSource='관리자 신규 등록 (업무분장 관리 웹앱)';
  created.contactMatch='관리자 직접 등록';
  created.emailId=created.email?created.email.split('@')[0]:null;
  return created;
}

function validateOrder(ids,expected){
  if(!Array.isArray(ids)||ids.length!==expected.length||ids.some(id=>typeof id!=='string')||!uniqueNames(ids)||!uniqueNames(expected))return false;
  const available=new Set(expected);
  return ids.every(id=>available.has(id));
}
module.exports={makeEmployeeUpdate,makeEmployeeCreate,validateOrder,uniqueNames};
