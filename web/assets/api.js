(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.ESTApi=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function ApiError(message,code,requestId,details,status){
    const e=new Error(String(message||'เกิดข้อผิดพลาด'));
    e.name='ApiError';e.code=String(code||'API_ERROR');e.requestId=String(requestId||'');e.details=details;e.status=Number(status||0);return e;
  }
  function nextPaint(){
    return new Promise(resolve=>{
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>resolve());
      else setTimeout(resolve,0);
    });
  }
  function createApiClient(options){
    const opts=options||{};
    const apiUrl=String(opts.apiUrl||'').trim();
    if(!/^https:\/\//.test(apiUrl))throw new Error('EST API URL is not configured.');
    const fetchImpl=opts.fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);
    if(!fetchImpl)throw new Error('Fetch API is unavailable.');
    async function call(action,payload,token,callOptions){
      const c=callOptions||{};
      if(!c.silent&&typeof opts.onStart==='function'){opts.onStart(action);await nextPaint();}
      try{
        let response;
        try{
          response=await fetchImpl(apiUrl,{method:'POST',redirect:'follow',credentials:'omit',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:String(action||''),payload:payload||{},token:String(token||'')})});
        }catch(networkError){throw ApiError('ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่','NETWORK_ERROR','',null,0);}
        let envelope;
        try{
          if(response&&typeof response.text==='function'){
            const raw=await response.text();
            envelope=JSON.parse(raw);
          }else{
            envelope=await response.json();
          }
        }catch(parseError){
          throw ApiError('Web App ตอบกลับไม่ใช่ JSON กรุณาตรวจสอบ Apps Script Deploy ให้ใช้ URL /exec และอนุญาตให้ผู้ใช้เข้าถึง Web App','INVALID_RESPONSE','',null,response&&response.status);
        }
        if(!response.ok||!envelope||envelope.ok!==true){
          const err=envelope&&envelope.error||{};
          throw ApiError(err.message||('HTTP '+response.status),err.code||'API_ERROR',envelope&&envelope.requestId,err.details,response.status);
        }
        return envelope.data;
      }finally{
        if(!c.silent&&typeof opts.onEnd==='function')opts.onEnd(action);
      }
    }
    return {call};
  }
  return {ApiError,createApiClient};
});
