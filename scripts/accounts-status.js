'use strict';
const {pool}=require('../src/db');
(async()=>{
  const [admins,viewers]=await Promise.all([
    pool.query('SELECT username,created_at FROM admin_users'),
    pool.query('SELECT username,created_at FROM viewer_users')
  ]);
  console.log('등록 관리자:',admins.rowCount,'개 / 역할: 조회·수정');
  console.log('등록 조회 전용:',viewers.rowCount,'개 / 역할: 조회만');
  console.log('관리자 ID:',admins.rows.map(r=>r.username).join(', ')||'(없음)');
  console.log('조회 계정 ID:',viewers.rows.map(r=>r.username).join(', ')||'(없음)');
  if(admins.rowCount>1||viewers.rowCount>1)throw new Error('계정 개수가 정책과 다릅니다.');
})().catch(err=>{console.error('계정 확인 실패:',err.message);process.exitCode=1}).finally(()=>pool.end());
