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
          eventId:String(event.id||event.eventId||''),
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
  function escapeHtml(value){
    return String(value===null||value===undefined?'':value).replace(/[&<>'"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch];});
  }
  return {parseIsoDateUTC,toIsoDateUTC,shiftIsoDate,weekRangeMonday,formatThaiDate,todayIso,flattenAdminSlots,escapeHtml};
});
