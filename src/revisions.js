'use strict';

// 직원 기록의 업무상 의미 있는 필드를 비교합니다.
// JSONB 내부 키 순서 / null과 빈 문자열 등 표시상 동일한 값은 변경으로 기록하지 않습니다.
const fields={
  name:'성명',department:'소속 부서',position:'직위',grade:'직급',
  rosterStatus:'인력 상태',retiredAt:'퇴직일',leaveStart:'휴직 시작일',leaveEnd:'휴직 종료일',
  phone:'업무용 전화번호',extension:'내선',email:'업무용 이메일',
  responsibilities:'담당 업무',note:'비고',contract:'위촉 여부',
  currentAssignmentVerified:'현재 담당 업무 확인 상태',
  gradeVerified:'직급 확인 상태',departmentVerified:'소속 확인 상태'
};
const arrayFields=new Set(['responsibilities']);
const booleanFields=new Set(['contract','currentAssignmentVerified','gradeVerified','departmentVerified']);
function normalized(value,field){
  if(arrayFields.has(field))return Array.isArray(value)?value.map(s=>String(s||'').trim()).filter(Boolean):[];
  if(booleanFields.has(field))return value===true;
  return value==null?'':String(value).trim();
}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function employeeChanges(before={},after={}){
  if(!before || !after || typeof before!=='object'||typeof after!=='object')return [];
  return Object.entries(fields).flatMap(([field,label])=>{
    const oldValue=normalized(before[field],field),newValue=normalized(after[field],field);
    return equal(oldValue,newValue)?[]:[{field,label,before:oldValue,after:newValue}];
  });
}
function revisionLabel(action){return ({'employee.create':'신규 등록','employee.update':'정보 수정','employee.delete':'오등록 삭제'})[action]||'기타';}
module.exports={employeeChanges,revisionLabel,fields};
