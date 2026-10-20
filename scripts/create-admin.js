'use strict';
const readline=require('node:readline');
const bcrypt=require('bcryptjs');
const {pool}=require('../src/db');
function askLine(label){return new Promise(resolve=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  rl.question(label,answer=>{rl.close();resolve(answer)});
})}
function askHidden(label){return new Promise((resolve,reject)=>{
  if(!process.stdin.isTTY)return reject(new Error('터미널에서 실행해 주세요.'));
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
  const count=await pool.query('SELECT count(*)::int AS n FROM admin_users');
  if(count.rows[0].n){console.log('관리자 계정은 이미 존재합니다. 추가 생성하지 않습니다.');return;}
  const username=(await askLine('관리자 ID (영문·숫자 4~32자리): ')).trim();
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{3,31}$/.test(username))throw new Error('관리자 ID 형식을 확인해 주세요.');
  const alreadyViewer=await pool.query('SELECT 1 FROM viewer_users WHERE username=$1',[username]);
  if(alreadyViewer.rowCount)throw new Error('조회 전용 사용자와 다른 ID를 입력하세요.');
  const pass=await askHidden('비밀번호 (입력 내용 숨김, 12자리 이상): ');
  const confirm=await askHidden('비밀번호 재입력: ');
  if(pass.length<12||pass.length>128||pass!==confirm)throw new Error('비밀번호 길이 또는 재입력이 올바르지 않습니다.');
  const hash=await bcrypt.hash(pass,12);
  await pool.query('INSERT INTO admin_users(username,password_hash) VALUES ($1,$2)',[username,hash]);
  console.log('관리자 계정이 생성되었습니다. ID:',username);
})().catch(err=>{console.error('관리자 생성 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
