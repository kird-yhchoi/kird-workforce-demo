'use strict';

const {employeeChanges}=require('./revisions');

// 관리자 수정 시점을 보존하되, 실제 발령일 또는 적용 시작일로 해석하지 않습니다.
function koreanPeriod(timestamp){
  const date=new Date(timestamp);
  if(Number.isNaN(date.getTime()))throw new Error('수정일시를 확인할 수 없습니다.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'
  }).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}`;
}
function makeRevisionArchive(log){
  if(log?.action!=='employee.update' || !log.before_value || !log.after_value){
    throw new Error('직원 수정 전후 값이 모두 필요합니다.');
  }
  const before=log.before_value;
  const after=log.after_value;
  const when=new Date(log.created_at).toISOString();
  const period=koreanPeriod(when);
  const id=Number(log.id);
  if(!Number.isSafeInteger(id)||id<1)throw new Error('감사 기록 ID가 올바르지 않습니다.');
  // 변경된 필드만 저장해, 민감한 내부 메타데이터를 일반 이용자에 노출하지 않습니다.
  const changes=employeeChanges(before,after);
  return {
    archive_id:`REV-${id}`, record_type:'employee_revision', employee_id:log.target_id,
    period, source_period:period, period_is_exact_effective_date:false,
    name:String(before.name||after.name||''),
    department:String(before.department||''),
    position:before.position||null, grade:before.grade||null,
    grade_original:before.gradeOriginal||before.grade||null,
    is_commissioned:Boolean(before.contract),
    responsibilities:Array.isArray(before.responsibilities)?before.responsibilities:[],
    notes:before.note?[String(before.note)]:[],
    roster_status:before.rosterStatus||'재직',
    source_file:'관리자 직원정보 수정 이력',
    source_row_order:1000000+id, source_line_index:null,
    match_status:'system_revision',review_flags:[],contacts_inherited:false,
    recorded_at:when, changed_by:String(log.actor||''), changes,
    // 유효기간은 별도 인사발령 정보가 없으므로 산정하지 않습니다.
    record_description:'관리자 저장 시점에 보존한 이전 직원정보'
  };
}
module.exports={koreanPeriod,makeRevisionArchive};
