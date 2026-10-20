/* KIRD 업무분장: PDF 인쇄 배치와 동일한 데이터로 RAG PDF-to-JSON 규격 생성.
 * 문서 페이지를 OCR한 것이 아니라 현재 DB를 바탕으로 출력 시점의 인쇄 배치와 JSON을 동시 구성합니다.
 * 브라우저 인쇄 설정 때문에 실제 PDF 쪽수가 달라질 수 있으므로 저장 후 확인하세요.
 */
(function(root, factory){
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.DEMO_RAG_EXPORT=api;
})(typeof window!=='undefined'?window:null, function(){
  'use strict';
  const TITLE='국가과학기술인력개발원 업무분장표';
  const SECTION_PLAN=[
    ['원장','경영전략본부','경영기획실'],
    ['인사총무실'],
    ['인프라운영실'],
    ['인프라운영실'],
    ['인재개발본부','경력연구실'],
    ['경력기반실'],
    ['경력성장실'],
    ['인재교육본부','교육기반실'],
    ['기본교육실'],
    ['전문교육실'],
    ['스마트교육실'],
    ['인재혁신센터','정책협력실']
  ];
  const clean=(v)=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  // 구분자(|, ;)가 원본 데이터에 포함될 경우 각 셀의 텍스트를 보존하면서 구분자 혼동을 방지합니다.
  const cell=(v)=>clean(v).replace(/\|/g,'｜');
  function dateParts(date){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const t=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return {stamp:`${t.year}${t.month}${t.day}`,display:`${t.year}. ${t.month}. ${t.day}.`};
  }
  function filenames(date){
    const {stamp}=dateParts(date);
    const base=`KIRD_업무분장_${stamp}`;
    return {base,pdf:`${base}.pdf`,json:`${base}_RAG.json`};
  }
  function assignmentTasks(person){
    if(person.currentAssignmentVerified===false)return [];
    return (Array.isArray(person.responsibilities)?person.responsibilities:[]).map(clean).filter(Boolean);
  }
  function taskLabel(person){
    const list=assignmentTasks(person);
    if(list.length)return list.join(' / ');
    if(person.rosterStatus==='휴직')return '휴직 중 · 현재 담당 업무 미등록';
    if(person.rosterStatus==='파견')return '파견 중 · 현재 담당 업무 미등록';
    return '업무 내용 미기재';
  }
  function makePrintPages(departmentMembers){
    if(typeof departmentMembers!=='function')throw new Error('부서별 직원 조회 함수가 필요합니다.');
    const membersCache=new Map();
    const get=(name)=>{
      if(!membersCache.has(name)){
        const result=departmentMembers(name);
        if(!Array.isArray(result))throw new Error(`부서 직원 목록 오류: ${name}`);
        membersCache.set(name,result);
      }
      return membersCache.get(name);
    };
    const infrastructure=get('인프라운영실');
    const physicalPages=SECTION_PLAN.map((names,planIndex)=>names.map(name=>{
      const members=name==='인프라운영실'
        ? (planIndex===2?infrastructure.slice(0,13):infrastructure.slice(13))
        : get(name);
      return {department:name,members,continued:planIndex===3,totalCount:get(name).length};
    }).filter(part=>part.members.length));
    return physicalPages.filter(groups=>groups.length).map((sections,i)=>({number:i+1,sections}));
  }
  function checkEmployeeCoverage(pages,currentEmployees){
    const wanted=currentEmployees.map(p=>p.id);
    const actual=pages.flatMap(pg=>pg.sections.flatMap(sec=>sec.members.map(p=>p.id)));
    if(wanted.length!==new Set(wanted).size)throw new Error('현행 직원 ID가 중복되었습니다.');
    if(actual.length!==wanted.length || actual.length!==new Set(actual).size || actual.some(id=>!wanted.includes(id))){
      throw new Error('인쇄·JSON 대상 직원 수가 일치하지 않습니다. 전체 부서와 등록된 직원 정보를 확인해 주세요.');
    }
  }
  function makeTopicGroups(pages){
    const grouped=[];
    for(const pg of pages){
      if(!pg.sections.length)continue;
      const prev=grouped[grouped.length-1];
      const sec=pg.sections[0];
      const contiguous=prev && prev.pageNumbers[prev.pageNumbers.length-1]+1===pg.number;
      const sameTopic=prev && prev.sections.every(s=>s.department===sec.department);
      if(prev && contiguous && sameTopic && pg.sections.length===1 && sec.continued){
        prev.pageNumbers.push(pg.number);
        prev.sections.push(...pg.sections);
      }else{
        grouped.push({pageNumbers:[pg.number],sections:[...pg.sections]});
      }
    }
    return grouped;
  }
  function displayPosition(person){return [person.grade,person.position].map(clean).filter(Boolean).join(' · ')||'직급·직위 미등록';}
  function displayStatus(person){
    const status=clean(person.rosterStatus)||'재직';
    return status==='휴직' && person.leaveStart && person.leaveEnd
      ? `${status} (${cell(person.leaveStart)} ~ ${cell(person.leaveEnd)})`:status;
  }
  function formatOriginText(group,{sourceTitle,printDate,totalEmployees}){
    const lines=[TITLE,`${clean(sourceTitle)} · 전체 ${totalEmployees}명 · ${dateParts(printDate).display}`];
    // 하나의 부서가 연속 2페이지에 인쇄된 경우 표 헤더 중복 없이 합칩니다.
    const names=[...new Set(group.sections.map(s=>s.department))];
    for(const dept of names){
      const sec=group.sections.filter(s=>s.department===dept);
      const members=sec.flatMap(s=>s.members);
      const total=sec[0]?.totalCount??members.length;
      lines.push('',`${dept} ${total}명`);
      lines.push('성명 | 직급·직위 | 업무용 전화번호 | 내선번호 | 이메일 주소 | 재직상태 | 담당 업무');
      for(const p of members){
        const tasks=assignmentTasks(p);
        const taskValue=tasks.length?tasks.map(cell).join('; '):taskLabel(p);
        lines.push([
          cell(p.name),cell(displayPosition(p)),cell(p.phone||'전화 미등록'),
          cell(p.extension||'내선 미등록'),cell(p.email||'이메일 미등록'),
          cell(displayStatus(p)),taskValue
        ].join(' | '));
      }
    }
    return lines.join('\n').trim();
  }
  function createQuestions(sections){
    const depts=[...new Set(sections.map(s=>s.department))];
    const persons=sections.flatMap(s=>s.members.map(p=>({p,department:s.department})));
    const questions=[];
    const add=q=>{if(q && !questions.includes(q))questions.push(q)};
    for(const dept of depts.slice(0,2))add(`${dept} 직원들의 담당 업무와 연락처는 무엇인가요?`);
    const assigned=persons.find(({p})=>assignmentTasks(p).length);
    if(assigned)add(`${assigned.department} ${assigned.p.name} 직원의 담당 업무는 무엇인가요?`);
    const reachable=persons.find(({p})=>p.extension||p.phone||p.email);
    if(reachable){
      const {p,department}=reachable;
      add(`${department} ${p.name} 직원의 ${p.extension?'내선번호':p.phone?'전화번호':'이메일 주소'}는 무엇인가요?`);
    }
    if(questions.length<2 && persons.length){
      const {p,department}=persons[0];
      add(`${p.name} 직원은 어느 부서 소속이며 직급·직위는 무엇인가요?`);
      add(`${department}의 직원 수는 몇 명인가요?`);
    }
    return questions.slice(0,4);
  }
  function createKeywords(group,origin){
    const departments=[...new Set(group.sections.map(s=>s.department))];
    const persons=group.sections.flatMap(s=>s.members);
    const first=persons.find(p=>assignmentTasks(p).length)||persons[0];
    const options=['국가과학기술인력개발원','KIRD','업무분장표',...departments,'담당 업무','내선번호','이메일 주소',first?.name];
    return [...new Set(options.filter(Boolean))].filter(v=>origin.includes(v)).slice(0,8);
  }
  function createSummation(group){
    const departments=[...new Set(group.sections.map(s=>s.department))];
    const persons=group.sections.flatMap(s=>s.members);
    const statuses=[...new Set(persons.map(p=>p.rosterStatus).filter(s=>s && s!=='재직'))];
    const list=departments.join('·');
    return `${list} 소속 직원 ${persons.length}명의 업무분장 정보입니다. 성명, 직급·직위, 업무용 연락처와 등록된 담당 업무를 수록합니다.` +
      (statuses.length?` ${statuses.join('·')} 상태로 표시된 직원 정보도 포함합니다.`:'');
  }
  function createSupplement(group,sourceTitle){
    const departments=[...new Set(group.sections.map(s=>s.department))].join(' / ');
    return `${clean(sourceTitle)}을 바탕으로 출력한 ${TITLE}의 ${departments} 부분입니다. 직원별 담당 업무와 업무용 전화번호·내선번호·이메일을 대응하여 확인할 수 있습니다.`;
  }
  function buildRagJson({pages,currentEmployees,fileName,sourceTitle,printDate}){
    if(!Array.isArray(pages)||!Array.isArray(currentEmployees)||!(printDate instanceof Date)||Number.isNaN(printDate.getTime())){
      throw new Error('JSON 생성 정보가 올바르지 않습니다.');
    }
    checkEmployeeCoverage(pages,currentEmployees);
    if(!pages.length)throw new Error('출력할 직원이 없습니다.');
    if(!/^[^\\/]+\.pdf$/i.test(fileName))throw new Error('PDF 파일명이 올바르지 않습니다.');
    const stem=fileName.replace(/\.pdf$/i,'').replace(/\([0-9]+\)$/,'');
    const normalizedName=stem+'.pdf';
    const output={};
    for(const group of makeTopicGroups(pages)){
      const pageNumbers=group.pageNumbers;
      const suffix=pageNumbers.length===1?`page${pageNumbers[0]}`:`pages${pageNumbers[0]}_${pageNumbers[pageNumbers.length-1]}`;
      const key=`${stem}_${suffix}.json`;
      const departments=[...new Set(group.sections.map(s=>s.department))];
      const origin=formatOriginText(group,{sourceTitle,printDate,totalEmployees:currentEmployees.length});
      const info={
        origin_text:origin,
        meta_info:{file_name:normalizedName,menu_name:`${TITLE} > ${departments.join(' / ')}`,page:pageNumbers},
        keywords:createKeywords(group,origin),
        expected_question:createQuestions(group.sections),
        summation:createSummation(group),
        supplement:createSupplement(group,sourceTitle)
      };
      if(info.keywords.length<4||info.expected_question.length<2)throw new Error(`검색 메타정보 생성 불가: ${key}`);
      output[key]=info;
    }
    return output;
  }
  return {TITLE,filenames,dateParts,assignmentTasks,taskLabel,makePrintPages,checkEmployeeCoverage,makeTopicGroups,buildRagJson};
});
