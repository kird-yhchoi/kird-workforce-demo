'use strict';
// This copy is for synthetic contest demonstrations only.
// Refuse to connect to the existing KIRD employee database even if a local .env is copied by mistake.
function databaseName(env=process.env){
  if(env.DATABASE_URL){
    let url;
    try{url=new URL(env.DATABASE_URL)}catch{throw new Error('DATABASE_URL 형식이 잘못되었습니다.')}
    if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('PostgreSQL URL만 사용하세요.');
    return decodeURIComponent(url.pathname.slice(1));
  }
  return env.PGDATABASE||'';
}
function assertSafeDemoEnvironment(env=process.env){
  if(env.DEMO_MODE!=='true')throw new Error('이 앱은 가상 데이터 전용입니다. DEMO_MODE=true가 필요합니다.');
  const db=databaseName(env);
  if(!db || !/(demo|contest|sample)/i.test(db) || /^kird_work$/i.test(db)){
    throw new Error(`시연용 DB 이름에 demo/contest/sample이 포함되어야 합니다. 현재 DB: ${db||'(미설정)'}`);
  }
  if(env.DATABASE_URL && (env.PGDATABASE || env.PGHOST || env.PGUSER)){
    throw new Error('DATABASE_URL과 PGHOST/PGUSER/PGDATABASE를 함께 설정하지 마세요.');
  }
  return db;
}
module.exports={databaseName,assertSafeDemoEnvironment};
