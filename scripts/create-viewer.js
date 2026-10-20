'use strict';
// 조회 전용 계정은 PC에서 대화식으로 한 번만 생성합니다. 비밀번호는 파일/명령행에 남기지 않습니다.
const readline=require('node:readline');
const bcrypt=require('bcryptjs');
const {pool}=require('../src/db');

function askLine(label){return new Promise(resolve=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  rl.question(label,answer=>{rl.close();resolve(answer)});
})}
function askHidden(label){return new Promise((resolve,reject)=>{
  if(!process.stdin.isTTY)return reject(new Error('Windows 명령 프롬프트(cmd)에서 직접 실행해 주세요.'));
  process.stdout.write(label);
  const stdin=process.stdin;
  stdin.resume();stdin.setRawMode(true);
  let value='';
  function input(data){
    for(const ch of data.toString('utf8')){
      if(ch==='\r'||ch==='\n'){
        stdin.off('data',input);stdin.setRawMode(false);process.stdout.write('\n');resolve(value);return;
      }
      if(ch==='\u0003'){stdin.setRawMode(false);process.stdout.write('\n');process.exit(130)}
      if(ch==='\u007f'||ch==='\b'){
        if(value.length){value=value.slice(0,-1);process.stdout.write('\b \b');}
        continue;
      }
      if(ch>=' '&&ch!=='\u007f'&&value.length<256){value+=ch;process.stdout.write('*');}
    }
  }
  stdin.on('data',input);
})}

(async()=>{
  const present=await pool.query('SELECT count(*)::int AS n FROM viewer_users');
  if(present.rows[0].n){
    console.log('조회 전용 계정이 이미 있습니다. 두 번째 계정은 만들 수 없습니다.');
    return;
  }
  const username=(await askLine('조회 계정 ID (영문 시작, 영문·숫자·_·- 사용, 4~32자): ')).trim();
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/.test(username))throw new Error('조회 계정 ID 형식을 확인해 주세요.');
  const sameAsAdmin=await pool.query('SELECT 1 FROM admin_users WHERE username=$1',[username]);
  if(sameAsAdmin.rowCount)throw new Error('기존 관리자와 다른 ID를 입력하세요.');
  const pass=await askHidden('조회 계정 비밀번호 (입력 시 * 표시, 12자리 이상): ');
  const confirm=await askHidden('비밀번호 재입력: ');
  if(pass.length<12||pass.length>128||pass!==confirm)throw new Error('비밀번호 길이(12~128자리) 또는 재입력이 올바르지 않습니다.');
  const hash=await bcrypt.hash(pass,12);
  await pool.query('INSERT INTO viewer_users(username,password_hash) VALUES ($1,$2)',[username,hash]);
  console.log('조회 전용 계정이 생성되었습니다. ID:',username);
  console.log('조회 및 PDF/JSON 출력만 가능하며, 직원정보 저장·삭제·명단 순서는 변경할 수 없습니다.');
})().catch(err=>{console.error('조회 계정 생성 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
