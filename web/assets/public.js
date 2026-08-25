(function(){
  'use strict';
  document.addEventListener('DOMContentLoaded',function(){
    const $=id=>document.getElementById(id);
    const message=$('public-message');
    const dateInput=$('booking-date');
    const slotList=$('slot-list');
    const patientSection=$('patient-section');
    const form=$('patient-form');
    const confirmation=$('confirmation-panel');
    let selectedSlot=null;
    let client;

    function showMessage(text,type){message.textContent=text||'';message.className='notice '+(type||'');message.classList.toggle('hidden',!text);}
    function setBusy(el,busy){if(!el)return;el.disabled=!!busy;el.classList.toggle('loading',!!busy);}
    function errorText(error){return (error&&error.message?error.message:'เกิดข้อผิดพลาด')+(error&&error.requestId?' (Ref: '+error.requestId+')':'');}
    try{client=ESTApi.createApiClient({apiUrl:window.EST_CONFIG&&window.EST_CONFIG.API_URL});}catch(error){showMessage(errorText(error),'error');}

    const today=ESTUi.todayIso();
    dateInput.min=ESTUi.shiftIsoDate(today,1);
    dateInput.max=ESTUi.shiftIsoDate(today,7);
    dateInput.value=dateInput.min;

    async function loadSlots(){
      if(!client)return;
      selectedSlot=null;patientSection.classList.add('hidden');slotList.innerHTML='';showMessage('','');
      const date=dateInput.value;if(!date){showMessage('กรุณาเลือกวันที่','error');return;}
      setBusy($('load-slots'),true);
      try{
        const result=await client.call('public.availability',{date});
        const available=(result.slots||[]).filter(s=>s.available&&Number(s.remaining)>0);
        if(!available.length){slotList.innerHTML='<div class="empty">ไม่มีเวลาว่างสำหรับวันที่เลือก กรุณาเลือกวันอื่น</div>';return;}
        available.forEach(slot=>{
          const button=document.createElement('button');button.type='button';button.className='slot';
          button.innerHTML='<strong>'+ESTUi.escapeHtml(slot.startTime)+'</strong><small>เหลือ '+Number(slot.remaining)+' ที่</small>';
          button.addEventListener('click',()=>selectSlot(slot,button));slotList.appendChild(button);
        });
      }catch(error){showMessage(errorText(error),'error');}
      finally{setBusy($('load-slots'),false);}
    }
    function selectSlot(slot,button){
      selectedSlot=slot;slotList.querySelectorAll('.slot').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');
      $('selected-slot-summary').textContent='วันตรวจ '+ESTUi.formatThaiDate(dateInput.value)+' เวลา '+slot.startTime+'–'+slot.endTime;
      patientSection.classList.remove('hidden');patientSection.scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function submitBooking(event){
      event.preventDefault();if(!client||!selectedSlot){showMessage('กรุณาเลือกเวลาตรวจก่อน','error');return;}
      const data=Object.fromEntries(new FormData(form).entries());
      data.appointmentDate=dateInput.value;data.startTime=selectedSlot.startTime;
      const button=$('submit-booking');setBusy(button,true);showMessage('','');
      try{
        const result=await client.call('public.booking.create',data);
        const fields=[
          ['Booking Reference',result.bookingReference],['ชื่อผู้รับบริการ',(result.firstName||'')+' '+(result.lastName||'')],
          ['วันที่ตรวจ',result.appointmentDate],['เวลา',result.startTime],['สถานะ',result.status||'CONFIRMED']
        ];
        $('confirmation-summary').innerHTML=fields.map(x=>'<dt>'+ESTUi.escapeHtml(x[0])+'</dt><dd>'+ESTUi.escapeHtml(x[1]||'')+'</dd>').join('');
        patientSection.classList.add('hidden');confirmation.classList.remove('hidden');confirmation.scrollIntoView({behavior:'smooth',block:'start'});
        form.reset();selectedSlot=null;
      }catch(error){showMessage(errorText(error),'error');}
      finally{setBusy(button,false);}
    }
    $('load-slots').addEventListener('click',loadSlots);dateInput.addEventListener('change',()=>{slotList.innerHTML='';patientSection.classList.add('hidden');selectedSlot=null;});
    form.addEventListener('submit',submitBooking);
    $('new-booking').addEventListener('click',()=>{confirmation.classList.add('hidden');slotList.innerHTML='';window.scrollTo({top:0,behavior:'smooth'});});
  });
})();
