'use strict';
(async()=>{
  const target=document.getElementById('app');
  try {
    const authRes=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
    if(!authRes.ok)throw new Error('로그인 상태를 조회하지 못했습니다.');
    const auth=await authRes.json();
    if(!auth.loggedIn||!['admin','viewer'].includes(auth.role)){
      window.location.replace('/login');
      return;
    }
    const bootRes=await fetch('/api/bootstrap',{credentials:'same-origin',cache:'no-store'});
    if(bootRes.status===401){window.location.replace('/login');return;}
    if(!bootRes.ok)throw new Error((await bootRes.json().catch(()=>({}))).error||`데이터 조회 오류: ${bootRes.status}`);
    const boot=await bootRes.json();
    if(!Array.isArray(boot.seed?.staff))throw new Error('직원 데이터를 불러올 수 없습니다.');
    window.DEMO_SEED=boot.seed;
    window.DEMO_ARCHIVE=boot.archive;
    window.DEMO_ORDERS=boot.deptOrders||{};
    window.DEMO_ORDER_VERSIONS=boot.orderVersions||{};
    window.DEMO_AUTH=auth;
    const script=document.createElement('script');
    script.src='/app.js';
    script.onerror=()=>{if(target)target.textContent='UI 파일을 불러올 수 없습니다. 새로고침해 주세요.'};
    document.body.appendChild(script);
  }catch(err){
    if(target){target.innerHTML='';const box=document.createElement('div');box.style.cssText='padding:50px;font:16px sans-serif;color:#24364b';box.textContent='데이터베이스 연결 확인이 필요합니다: '+err.message;target.appendChild(box)}
  }
})();
