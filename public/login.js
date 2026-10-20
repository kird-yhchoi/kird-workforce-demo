'use strict';
const form=document.getElementById('loginForm');
const errorBox=document.getElementById('loginError');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type=submit]');
  errorBox.classList.remove('visible');errorBox.textContent='';
  button.disabled=true;button.textContent='로그인 확인 중…';
  try{
    const response=await fetch('/api/auth/login',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username:form.username.value.trim(),password:form.password.value})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'로그인에 실패했습니다.');
    if(!result.loggedIn||!['admin','viewer'].includes(result.role))throw new Error('계정 권한을 확인할 수 없습니다.');
    location.replace('/');
  }catch(error){
    errorBox.textContent=error.message;
    errorBox.classList.add('visible');
    form.password.value='';
    button.disabled=false;button.textContent='로그인';
  }
});
