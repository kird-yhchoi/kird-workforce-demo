'use strict';
// 사용: node scripts/verify-rag-json.js "C:\\Users\\...\\Downloads\\DEMO_업무분장_YYYYMMDD_RAG.json"
const fs=require('node:fs');
const path=require('node:path');
function validate(json){
  if(!json||Array.isArray(json)||typeof json!=='object')throw Error('최상위 JSON이 Object가 아닙니다.');
  const entries=Object.entries(json);
  if(!entries.length)throw Error('JSON 항목이 없습니다.');
  const seen=new Set();
  const required=['origin_text','meta_info','keywords','expected_question','summation','supplement'];
  for(const [key,item] of entries){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error(`항목 자료형 오류: ${key}`);
    if(JSON.stringify(Object.keys(item))!==JSON.stringify(required))throw Error(`6개 필드 구조 오류: ${key}`);
    for(const f of ['origin_text','summation','supplement'])if(typeof item[f]!=='string'||!item[f].trim())throw Error(`${f} 미기재: ${key}`);
    if(!Array.isArray(item.keywords)||item.keywords.length<4||item.keywords.length>8||item.keywords.some(x=>typeof x!=='string'||!x.trim()))throw Error(`keywords 오류: ${key}`);
    if(!Array.isArray(item.expected_question)||item.expected_question.length<2||item.expected_question.length>4||item.expected_question.some(x=>typeof x!=='string'||!x.trim()))throw Error(`expected_question 오류: ${key}`);
    const meta=item.meta_info;
    if(!meta||JSON.stringify(Object.keys(meta))!==JSON.stringify(['file_name','menu_name','page']))throw Error(`meta_info 구조 오류: ${key}`);
    if(typeof meta.file_name!=='string'||!meta.file_name.endsWith('.pdf')||typeof meta.menu_name!=='string'||!meta.menu_name.trim())throw Error(`meta_info 값 오류: ${key}`);
    if(!Array.isArray(meta.page)||meta.page.length<1||meta.page.some(n=>!Number.isInteger(n)||n<1))throw Error(`페이지 번호 오류: ${key}`);
    const first=meta.page[0],last=meta.page[meta.page.length-1];
    if(meta.page.some((n,i)=>n!==first+i))throw Error(`페이지 번호 비연속: ${key}`);
    const stem=meta.file_name.slice(0,-4);
    const expected=stem+'_'+(meta.page.length===1?`page${first}`:`pages${first}_${last}`)+'.json';
    if(key!==expected)throw Error(`가상 파일명 불일치: ${key} / ${expected}`);
    for(const n of meta.page){if(seen.has(n))throw Error(`페이지 중복: ${n}`);seen.add(n);}
  }
  for(let n=1;n<=seen.size;n++)if(!seen.has(n))throw Error(`페이지 누락: ${n}`);
  return {chunks:entries.length,pages:seen.size};
}
if(require.main===module){
  const file=process.argv[2];
  if(!file){console.error('사용법: node scripts/verify-rag-json.js "내보낸_RAG.json_파일경로"');process.exit(2);}
  try{
    const result=validate(JSON.parse(fs.readFileSync(path.resolve(file),'utf8')));
    console.log(`JSON 규격 검증 통과: 항목 ${result.chunks}개, 인쇄 계획 페이지 ${result.pages}개.`);
    console.log('※ 업로드 시스템의 추가 스키마 요구 및 실제 PDF 페이지 일치는 별도 검증이 필요합니다.');
  }catch(err){console.error('JSON 규격 검증 실패:',err.message);process.exitCode=1;}
}
module.exports={validate};
