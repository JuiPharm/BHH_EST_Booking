(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.ESTApi=api;
})(typeof window!=='undefined'?window:null,function(){
  class ApiError extends Error{
    constructor(code,message,details,requestId){
      super(message||'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ');
      this.name='ApiError';
      this.code=code||'API_ERROR';
      this.details=details;
      this.requestId=requestId||'';
    }
  }

  function validateApiUrl(apiUrl){
    const url=String(apiUrl||'').trim();
    if(!url||/YOUR_APPS_SCRIPT|CHANGE_ME/i.test(url)){
      throw new ApiError('API_NOT_CONFIGURED','ยังไม่ได้กำหนด Apps Script Web App URL ใน web/config.js');
    }
    if(!/^https:\/\//i.test(url)) throw new ApiError('API_URL_INVALID','API URL ต้องใช้ HTTPS');
    return url;
  }

  function createApiClient(options){
    const opts=options||{};
    const url=validateApiUrl(opts.apiUrl);
    const fetchImpl=opts.fetchImpl||(typeof fetch!=='undefined'?fetch.bind(globalThis):null);
    if(!fetchImpl) throw new ApiError('FETCH_UNAVAILABLE','Browser นี้ไม่รองรับ Fetch API');
    async function waitForBrowserPaint_(){
      if(typeof opts.beforeRequest==='function'){ await opts.beforeRequest(); return; }
      if(typeof requestAnimationFrame==='function'){
        await new Promise(function(resolve){ requestAnimationFrame(function(){ resolve(); }); });
      }
    }
    return {
      async call(action,payload,token,callOptions){
        const actionName=String(action||'');
        const silent=!!(callOptions&&callOptions.silent);
        if(!silent&&typeof opts.onStart==='function') opts.onStart(actionName);
        try{
          if(!silent) await waitForBrowserPaint_();
          const body={action:actionName,payload:payload||{}};
          if(token) body.token=String(token);
          let response;
          try{
            response=await fetchImpl(url,{
              method:'POST',
              headers:{'Content-Type':'text/plain;charset=utf-8'},
              body:JSON.stringify(body),
              redirect:'follow',
              credentials:'omit'
            });
          }catch(error){
            throw new ApiError('NETWORK_ERROR','ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบเครือข่าย',null,'');
          }
          let envelope;
          try{
            if(response&&typeof response.text==='function'){
              const text=await response.text();
              envelope=JSON.parse(text);
            }else if(response&&typeof response.json==='function'){
              envelope=await response.json();
            }else{
              throw new Error('No response reader');
            }
          }catch(error){
            throw new ApiError('INVALID_API_RESPONSE','ระบบตอบกลับในรูปแบบที่ไม่ถูกต้อง',null,'');
          }
          if(!envelope||envelope.ok!==true){
            const err=envelope&&envelope.error?envelope.error:{};
            throw new ApiError(err.code||'API_ERROR',err.message||'เกิดข้อผิดพลาดจากระบบ',err.details,envelope&&envelope.requestId);
          }
          return envelope.data;
        }finally{
          if(!silent&&typeof opts.onEnd==='function') opts.onEnd(actionName);
        }
      }
    };
  }

  function createSessionStore(storage,key){
    const backing=storage||(typeof sessionStorage!=='undefined'?sessionStorage:null);
    const storageKey=String(key||'est-admin-session');
    return {
      get(){return backing?backing.getItem(storageKey):null;},
      set(token){if(backing) backing.setItem(storageKey,String(token||''));},
      clear(){if(backing) backing.removeItem(storageKey);}
    };
  }

  return {ApiError,validateApiUrl,createApiClient,createSessionStore};
});
