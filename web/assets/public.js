(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    const $=id=>document.getElementById(id);
    let client;let monthAnchor=ESTUi.todayIso();let calendarData=null;let selectedDate='';let selectedSlot=null;let lastDateButton=null;
    const copy={
      NOT_SCHEDULED:'วันที่เลือกยังไม่มีรอบตรวจที่เปิดให้จอง กรุณาเลือกวันที่อื่นที่แสดงว่ามีเวลาว่าง',
      FULL:'รอบตรวจของวันนี้เต็มแล้ว กรุณาเลือกวันที่อื่นเพื่อดูรอบที่ยังมีที่ว่าง',
      TOO_SOON:'ยังไม่สามารถจองรอบของวันที่นี้ได้ ระบบเปิดให้จองล่วงหน้าอย่างน้อย 24 ชั่วโมง',
      NOT_YET_OPEN:'วันที่นี้ยังไม่อยู่ในช่วงที่เปิดให้จอง สามารถจองล่วงหน้าได้ไม่เกิน 7 วัน',
      PAST:'วันที่นี้ผ่านไปแล้ว กรุณาเลือกวันที่อื่น'
    };
    function showMessage(text,type){const e=$('public-message');e.textContent=text||'';e.className='notice '+(type||'');e.classList.toggle('hidden',!text);}
    function errorText(e){return (e&&e.message?e.message:'เกิดข้อผิดพลาด')+(e&&e.requestId?' (Ref: '+e.requestId+')':'');}
    function busy(el,on){if(el){el.disabled=!!on;el.classList.toggle('loading',!!on);}}
    let loadingDepth=0;
    function loadingText(action){
      if(action==='public.calendar')return 'กำลังโหลดปฏิทิน...';
      if(action==='public.availability')return 'กำลังโหลดเวลาว่าง...';
      if(action==='public.booking.create')return 'กำลังบันทึกการจอง...';
      return 'กำลังดำเนินการ...';
    }
    function beginLoading(action){loadingDepth+=1;const overlay=$('global-loading');$('global-loading-text').textContent=loadingText(action);overlay.classList.remove('hidden');}
    function endLoading(){loadingDepth=Math.max(0,loadingDepth-1);if(!loadingDepth)$('global-loading').classList.add('hidden');}
    try{client=ESTApi.createApiClient({apiUrl:window.EST_CONFIG&&window.EST_CONFIG.API_URL,onStart:beginLoading,onEnd:endLoading});}catch(e){showMessage(errorText(e),'error');}

    function statusLabel(day){
      if(!day)return '';
      if(day.status==='AVAILABLE')return 'ว่าง '+Number(day.availableSlotCount||0)+' รอบ';
      if(day.status==='FULL')return 'รอบเต็มแล้ว';
      if(day.status==='NOT_SCHEDULED')return 'ยังไม่มีรอบตรวจ';
      if(day.status==='TOO_SOON')return 'ยังไม่ถึงช่วงจอง';
      if(day.status==='NOT_YET_OPEN')return 'ยังไม่เปิดให้จอง';
      return '';
    }
    async function loadMonth(){
      if(!client)return;showMessage('','');const range=ESTUi.monthRange(monthAnchor);
      $('public-month-label').textContent=ESTUi.formatThaiDate(range.startDate,{month:'long',year:'numeric',timeZone:'UTC'});
      const grid=$('public-month-grid');grid.classList.add('loading');
      try{calendarData=await client.call('public.calendar',range);renderMonth();}catch(e){showMessage(errorText(e),'error');grid.innerHTML='<div class="empty month-error">ไม่สามารถโหลดปฏิทินได้</div>';}
      finally{grid.classList.remove('loading');}
    }
    function renderMonth(){
      const grid=$('public-month-grid');grid.innerHTML='';
      ESTUi.monthGrid(monthAnchor).forEach(cell=>{
        const day=calendarData&&calendarData.days?calendarData.days[cell.date]:null;
        const button=document.createElement('button');button.type='button';button.className='month-day';button.dataset.date=cell.date;
        if(!cell.inMonth){button.classList.add('outside-month');button.disabled=true;}
        if(day)button.classList.add('state-'+String(day.status||'').toLowerCase());
        const dateNo=String(Number(cell.date.slice(-2)));
        button.innerHTML='<span class="day-number">'+dateNo+'</span><span class="day-status">'+ESTUi.escapeHtml(statusLabel(day))+'</span>';
        if(cell.inMonth){button.setAttribute('aria-label',ESTUi.formatThaiDate(cell.date)+' '+statusLabel(day));button.addEventListener('click',()=>onDateClick(cell.date,day,button));}
        grid.appendChild(button);
      });
    }
    function onDateClick(date,day,button){
      lastDateButton=button;
      if(!day||day.status!=='AVAILABLE'){showMessage(copy[day&&day.status]||copy.NOT_SCHEDULED,'warning');return;}
      showMessage('','');openSlots(date);
    }
    async function openSlots(date){
      selectedDate=date;selectedSlot=null;$('slot-dialog-title').textContent='เลือกเวลาตรวจ · '+ESTUi.formatThaiDate(date);$('slot-list').innerHTML='<div class="empty">กำลังโหลดเวลาว่าง...</div>';
      const dialog=$('slot-dialog');dialog.showModal();
      try{
        const result=await client.call('public.availability',{date:date});$('slot-list').innerHTML='';
        (result.slots||[]).forEach(slot=>{
          const b=document.createElement('button');b.type='button';b.className='slot';b.disabled=!(slot.available&&Number(slot.remaining)>0);
          b.innerHTML='<strong>'+ESTUi.escapeHtml(slot.startTime)+'</strong><small>'+(b.disabled?'เต็มแล้ว':'เหลือ '+Number(slot.remaining)+' ที่')+'</small>';
          if(!b.disabled)b.addEventListener('click',()=>chooseSlot(slot));$('slot-list').appendChild(b);
        });
        if(!$('slot-list').children.length)$('slot-list').innerHTML='<div class="empty">'+copy.NOT_SCHEDULED+'</div>';
      }catch(e){$('slot-list').innerHTML='<div class="notice error">'+ESTUi.escapeHtml(errorText(e))+'</div>';}
    }
    function chooseSlot(slot){selectedSlot=slot;$('slot-dialog').close();$('selected-slot-summary').textContent='วันตรวจ '+ESTUi.formatThaiDate(selectedDate)+' เวลา '+slot.startTime+'–'+slot.endTime;$('patient-section').classList.remove('hidden');$('patient-section').scrollIntoView({behavior:'smooth',block:'start'});}
    $('slot-dialog-close').addEventListener('click',()=>$('slot-dialog').close());$('slot-dialog').addEventListener('close',()=>{if(lastDateButton)lastDateButton.focus();});
    $('month-prev').addEventListener('click',()=>{monthAnchor=ESTUi.shiftMonth(monthAnchor,-1);loadMonth();});$('month-next').addEventListener('click',()=>{monthAnchor=ESTUi.shiftMonth(monthAnchor,1);loadMonth();});
    $('change-slot').addEventListener('click',()=>{$('patient-section').classList.add('hidden');selectedSlot=null;window.scrollTo({top:0,behavior:'smooth'});});
    $('patient-form').addEventListener('submit',async event=>{
      event.preventDefault();if(!selectedDate||!selectedSlot){showMessage('กรุณาเลือกวันและเวลาตรวจก่อน','error');return;}
      const data=Object.fromEntries(new FormData(event.currentTarget).entries());data.appointmentDate=selectedDate;data.startTime=selectedSlot.startTime;const button=$('submit-booking');busy(button,true);showMessage('','');
      try{const result=await client.call('public.booking.create',data);const fields=[['Booking Reference',result.bookingReference],['ชื่อผู้รับบริการ',(result.firstName||'')+' '+(result.lastName||'')],['วันที่ตรวจ',result.appointmentDate],['เวลา',result.startTime],['สถานะ',result.status||'CONFIRMED']];$('confirmation-summary').innerHTML=fields.map(x=>'<dt>'+ESTUi.escapeHtml(x[0])+'</dt><dd>'+ESTUi.escapeHtml(x[1]||'')+'</dd>').join('');$('patient-section').classList.add('hidden');$('confirmation-panel').classList.remove('hidden');event.currentTarget.reset();await loadMonth();}
      catch(e){showMessage(errorText(e),'error');if(e&&e.code==='SLOT_FULL'){await loadMonth();if(selectedDate)openSlots(selectedDate);}}
      finally{busy(button,false);}
    });
    $('new-booking').addEventListener('click',()=>{$('confirmation-panel').classList.add('hidden');selectedDate='';selectedSlot=null;window.scrollTo({top:0,behavior:'smooth'});});
    loadMonth();
  });
})();
