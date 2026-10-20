'use strict';

// 두 사용자 역할은 서버 세션에서만 판단합니다. 클라이언트의 role 문자열을 신뢰하지 않습니다.
function sessionRole(session){
  if(!session)return null;
  if(session.authRole==='admin' && session.adminUsername && session.username===session.adminUsername)return 'admin';
  if(session.authRole==='viewer' && session.viewerUsername && session.username===session.viewerUsername)return 'viewer';
  // 구버전에서 로그인한 관리자 세션의 호환성: 사용자 역할 세션은 반드시 신규 형식이어야 합니다.
  if(!session.authRole && session.adminUsername && !session.viewerUsername)return 'admin';
  return null;
}
function sessionUsername(session){
  const role=sessionRole(session);
  return role==='admin'?session.adminUsername:role==='viewer'?session.viewerUsername:null;
}
function canRead(session){return sessionRole(session)!==null;}
function canWrite(session){return sessionRole(session)==='admin';}
function isUnauthenticatedAuthEndpoint(method,path){
  return (method==='GET'&&path==='/auth/me')||(method==='POST'&&path==='/auth/login');
}
module.exports={sessionRole,sessionUsername,canRead,canWrite,isUnauthenticatedAuthEndpoint};