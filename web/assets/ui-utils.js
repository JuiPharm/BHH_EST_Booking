(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.ESTUi=api;
})(typeof window!=='undefined'?window:null,function(){
  function parseIsoDateUTC(value){
    const text=String(value||'');
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if(!match) throw new Error('Invalid ISO date');
    return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
  }
  function toIsoDateUTC(date){
    return date.toISOString().slice(0,10);
  }
  function shiftIsoDate(value,days){
    const date=parseIsoDateUTC(value);
    date.setUTCDate(date.getUTCDate()+Number(days||0));
    return toIsoDateUTC(date);
  }
  function monthRange(value){
    const date=parseIsoDateUTC(value);
    const y=date.getUTCFullYear(),m=date.getUTCMonth();
    const start=new Date(Date.UTC(y,m,1));
    const end=new Date(Date.UTC(y,m+1,0));
    return {startDate:toIsoDateUTC(start),endDate:toIsoDateUTC(end)};
  }
  function shiftMonth(value,delta){
    const date=parseIsoDateUTC(value);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+Number(delta||0));
    return toIsoDateUTC(date);
  }
  function monthGrid(value){
    const range=monthRange(value);
    const first=parseIsoDateUTC(range.startDate);
    const day=first.getUTCDay();
    const mondayOffset=day===0?-6:1-day;
    const gridStart=shiftIsoDate(range.startDate,mondayOffset);
    return Array.from({length:42},function(_,i){const date=shiftIsoDate(gridStart,i);return {date:date,inMonth:date>=range.startDate&&date<=range.endDate};});
  }

  function calendarWeekendClass(value){
    const date=parseIsoDateUTC(value);
    const day=date.getUTCDay();
    if(day===6)return 'weekend-sat';
    if(day===0)return 'weekend-sun';
    return '';
  }

  function weekRangeMonday(value){
    const date=parseIsoDateUTC(value);
    const day=date.getUTCDay();
    const offset=day===0?-6:1-day;
    const start=shiftIsoDate(value,offset);
    return {startDate:start,endDate:shiftIsoDate(start,6)};
  }
  function formatThaiDate(value,options){
    const date=parseIsoDateUTC(value);
    return new Intl.DateTimeFormat('th-TH',options||{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
  }
  function todayIso(){
    const now=new Date();
    const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,10);
  }
  function flattenAdminSlots(events,date){
    const target=String(date||'');
    const result=[];
    (events||[]).forEach(function(event){
      if(String(event.date||'')!==target) return;
      (event.slots||[]).forEach(function(slot){
        const remaining=Number(slot.remaining||0);
        if(remaining<=0) return;
        result.push({
          eventId:String(event.eventId||''),
          date:target,
          startTime:String(slot.startTime||''),
          endTime:String(slot.endTime||''),
          booked:Number(slot.booked||0),
          capacity:Number(slot.capacity||0),
          remaining:remaining
        });
      });
    });
    result.sort(function(a,b){return a.startTime.localeCompare(b.startTime);});
    return result;
  }

  function publicAvailabilityLabel(day){
    if(!day)return '';
    if(day.status==='AVAILABLE'){
      const capacity=Math.max(0,Number(day.availableCapacity||0));
      const slots=Math.max(0,Number(day.availableSlotCount||0));
      return 'เหลือ '+capacity+' ที่ · '+slots+' ช่วงเวลา';
    }
    if(day.status==='FULL')return 'รอบเต็มแล้ว';
    if(day.status==='NOT_SCHEDULED')return 'ยังไม่มีรอบตรวจ';
    if(day.status==='TOO_SOON')return 'ยังไม่ถึงช่วงจอง';
    if(day.status==='NOT_YET_OPEN')return 'ยังไม่เปิดให้จอง';
    return '';
  }
  function createLatestRequestGate(){
    let sequence=0;
    return {
      next(){sequence+=1;return sequence;},
      isLatest(id){return Number(id)===sequence;}
    };
  }
  function escapeHtml(value){
    return String(value===null||value===undefined?'':value).replace(/[&<>'"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch];});
  }
  function normalizeThaiNationalId(value){
    return String(value===null||value===undefined?'':value).replace(/\D/g,'');
  }
  function isValidThaiNationalId(value){
    const id=normalizeThaiNationalId(value);
    if(!/^\d{13}$/.test(id))return false;
    let sum=0;
    for(let i=0;i<12;i+=1)sum+=Number(id.charAt(i))*(13-i);
    const expected=(11-(sum%11))%10;
    return expected===Number(id.charAt(12));
  }
  function notificationHost(host){
    if(host)return host;
    if(typeof window!=='undefined')return window;
    return null;
  }
  function fallbackAlert(options,host){
    const h=notificationHost(host),doc=h&&h.document;
    if(!doc||!doc.body)return Promise.resolve({fallback:true});
    const previous=doc.querySelector('.est-alert-fallback');if(previous)previous.remove();
    const overlay=doc.createElement('div');overlay.className='est-alert-fallback';overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');
    const box=doc.createElement('div');box.className='est-alert-box';
    const icon=doc.createElement('div');icon.className='est-alert-icon est-alert-'+String(options&&options.icon||'info');icon.setAttribute('aria-hidden','true');icon.textContent=options&&options.icon==='success'?'✓':options&&options.icon==='error'?'!':options&&options.icon==='warning'?'!':'i';
    const title=doc.createElement('h2');title.textContent=String(options&&options.title||'แจ้งเตือน');
    const text=doc.createElement('p');text.textContent=String(options&&options.text||'');
    const button=doc.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent=String(options&&options.confirmButtonText||'ตกลง');
    box.appendChild(icon);box.appendChild(title);if(text.textContent)box.appendChild(text);box.appendChild(button);overlay.appendChild(box);doc.body.appendChild(overlay);
    return new Promise(function(resolve){function close(){overlay.remove();resolve({fallback:true,isConfirmed:true});}button.addEventListener('click',close,{once:true});button.focus();});
  }
  function notifySweetAlert(options,host){
    const h=notificationHost(host);
    const swal=h&&h.Swal;
    const config=Object.assign({confirmButtonText:'ตกลง'},options||{});
    if(!swal||typeof swal.fire!=='function')return fallbackAlert(config,h);
    try{return Promise.resolve(swal.fire(config)).catch(function(){return fallbackAlert(config,h);});}
    catch(_error){return fallbackAlert(config,h);}
  }
  function notifySuccess(title,text,host){
    return notifySweetAlert({icon:'success',title:String(title||'สำเร็จ'),text:String(text||'')},host);
  }
  function notifyWarning(title,text,host){
    return notifySweetAlert({icon:'warning',title:String(title||'แจ้งเตือน'),text:String(text||'')},host);
  }
  function notifyError(error,title,host){
    const message=error&&error.message?String(error.message):String(error||'เกิดข้อผิดพลาด');
    const code=error&&error.code?String(error.code):'';
    const requestId=error&&error.requestId?String(error.requestId):'';
    const text=message+(code?'\nError code: '+code:'')+(requestId?'\nReference: '+requestId:'');
    return notifySweetAlert({icon:'error',title:String(title||'เกิดข้อผิดพลาด'),text:text},host);
  }
  return {parseIsoDateUTC,toIsoDateUTC,shiftIsoDate,monthRange,shiftMonth,monthGrid,calendarWeekendClass,weekRangeMonday,formatThaiDate,todayIso,flattenAdminSlots,publicAvailabilityLabel,createLatestRequestGate,escapeHtml,normalizeThaiNationalId,isValidThaiNationalId,notifySweetAlert,notifySuccess,notifyWarning,notifyError};
});
