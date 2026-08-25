(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.ESTAdmin=api;
})(typeof window!=='undefined'?window:null,function(root){
  'use strict';

  function eventIdOf(event){
    return event&&event.eventId!==undefined&&event.eventId!==null?String(event.eventId).trim():'';
  }
  function isEventReadOnly(event){return !!(event&&event.readOnly===true);}
  function bookingKey(row){return String(row&&row.bookingReference||'').trim();}
  function isoDateTimeMs(date,time){
    const d=String(date||'').trim(),t=String(time||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!/^\d{2}:\d{2}$/.test(t))return NaN;
    return Date.parse(d+'T'+t+':00+07:00');
  }
  function bookingIsEnded(row,nowMs){
    const end=String(row&&row.endTime||row&&row.startTime||'');
    const ms=isoDateTimeMs(row&&row.appointmentDate,end);
    return Number.isFinite(ms)&&ms<=Number(nowMs||Date.now());
  }

  if(!root||!root.document)return {eventIdOf,isEventReadOnly,bookingIsEnded};

  const doc=root.document;
  const TOKEN_KEY='est_admin_token';
  const CONFIG=root.EST_CONFIG||{};
  const UI=root.ESTUi;
  const Api=root.ESTApi;
  if(!UI||!Api)throw new Error('EST frontend dependencies are missing.');

  const $=id=>doc.getElementById(id);
  let token='';
  try{token=root.sessionStorage.getItem(TOKEN_KEY)||'';}catch(_ignored){}
  let profile=null,reasons=[],calendarData={events:[]},bookings=[],users=[];
  let monthAnchor=UI.todayIso();
  const calendarRequestGate=UI.createLatestRequestGate();
  let client=null;
  let eventDetailData=null,eventDetailTrigger=null,eventDetailRequestSeq=0;
  let activeBooking=null,pendingReasonAction=null,outcomeBooking=null,passwordMode='own';
  let broadcast=null;
  try{if('BroadcastChannel'in root)broadcast=new root.BroadcastChannel('est-booking-updates');}catch(_ignored){}

  function setLoading(active,text){
    const overlay=$('global-loading'); if(!overlay)return;
    if(text)$('global-loading-text').textContent=text;
    overlay.classList.toggle('hidden',!active);
  }
  const loadingText={
    'auth.login':'กำลังเข้าสู่ระบบ...','admin.bootstrap':'กำลังโหลดข้อมูล...','admin.calendar.list':'กำลังโหลดปฏิทิน...',
    'admin.calendar.detail':'กำลังโหลดรายละเอียดรอบตรวจ...','admin.calendar.preview':'กำลังตรวจสอบผลกระทบ...',
    'admin.calendar.bulkCreate':'กำลังเปิดห้องตรวจ...','admin.calendar.update':'กำลังบันทึกการเปลี่ยนแปลง...',
    'admin.calendar.delete':'กำลังลบรอบตรวจ...','admin.bookings.list':'กำลังโหลดรายการจอง...',
    'admin.booking.create':'กำลังบันทึกการจอง...','admin.booking.reschedule':'กำลังเปลี่ยนนัด...',
    'admin.booking.cancel':'กำลังยกเลิกนัด...','admin.booking.outcome':'กำลังบันทึกผล...',
    'superadmin.users.list':'กำลังโหลดผู้ใช้งาน...','superadmin.user.create':'กำลังสร้างบัญชี...',
    'superadmin.user.setActive':'กำลังบันทึกสถานะบัญชี...','superadmin.user.resetPassword':'กำลังรีเซ็ตรหัสผ่าน...',
    'auth.changePassword':'กำลังเปลี่ยนรหัสผ่าน...','auth.logout':'กำลังออกจากระบบ...'
  };
  client=Api.createApiClient({apiUrl:String(CONFIG.API_URL||''),onStart:a=>setLoading(true,loadingText[a]||'กำลังดำเนินการ...'),onEnd:()=>setLoading(false)});

  function apiCall(action,payload,options){return client.call(action,payload||{},token,options);}
  function message(target,text,type){
    const el=$(target); if(!el)return;
    el.textContent=String(text||''); el.className='notice '+String(type||''); el.classList.toggle('hidden',!text);
  }
  function errorText(error){
    if(!error)return 'เกิดข้อผิดพลาด';
    const ref=error.requestId?' (Ref: '+error.requestId+')':'';
    return String(error.message||'เกิดข้อผิดพลาด')+ref;
  }
  function showDashboard(show){$('login-panel').classList.toggle('hidden',!!show);$('dashboard').classList.toggle('hidden',!show);}
  function setToken(value){token=String(value||'');try{if(token)root.sessionStorage.setItem(TOKEN_KEY,token);else root.sessionStorage.removeItem(TOKEN_KEY);}catch(_ignored){}}
  function clearSession(){setToken('');profile=null;reasons=[];calendarData={events:[]};bookings=[];users=[];showDashboard(false);}
  function showDialog(id){const d=$(id);if(d&&!d.open)d.showModal();}
  function closeDialog(id){const d=$(id);if(d&&d.open)d.close();}
  function safeHtml(value){return UI.escapeHtml(value);}
  function statusPill(status){const s=String(status||'');return '<span class="status status-'+safeHtml(s)+'">'+safeHtml(s||'-')+'</span>';}

  function notifyChanged(kind,date){
    const payload={type:kind||'booking-changed',date:String(date||''),at:Date.now()};
    try{if(broadcast)broadcast.postMessage(payload);}catch(_ignored){}
  }
  async function bestEffortRefresh(options){
    const opts=options||{}; const warnings=[];
    try{await loadCalendar({silent:true});}catch(e){warnings.push('ปฏิทิน');}
    if(opts.bookings){try{await loadBookings({silent:true});}catch(e){warnings.push('รายการจอง');}}
    if(opts.detail&&eventDetailData){try{await refreshEventDetail({silent:true});}catch(e){warnings.push('รายละเอียดรอบตรวจ');}}
    if(warnings.length)message('dashboard-message','รีเฟรช '+warnings.join(', ')+' ไม่สำเร็จ ข้อมูลที่บันทึกไว้ไม่ถูกย้อนกลับ กรุณากดรีเฟรชหรือโหลดหน้าใหม่','warning');
  }

  function monthRange(){return UI.monthRange(monthAnchor);}
  function monthLabel(value){return UI.formatThaiDate(value,{month:'long',year:'numeric',timeZone:'UTC'});}
  function eventOccupancy(event){
    const slots=Array.isArray(event&&event.slots)?event.slots:[];
    return slots.reduce((a,s)=>({booked:a.booked+Number(s.booked||0),capacity:a.capacity+Number(s.capacity||0)}),{booked:0,capacity:0});
  }
  function renderCalendar(){
    $('admin-month-label').textContent=monthLabel(monthAnchor);
    const grid=$('admin-month-grid'); grid.innerHTML='';
    const byDate={};(calendarData.events||[]).forEach(e=>{(byDate[e.date]||(byDate[e.date]=[])).push(e);});
    UI.monthGrid(monthAnchor).forEach(cell=>{
      const day=doc.createElement('div');day.className='admin-day'+(cell.inMonth?'':' outside-month');
      const head=doc.createElement('div');head.className='admin-day-head';head.innerHTML='<span class="day-number">'+Number(cell.date.slice(8,10))+'</span>';
      day.appendChild(head);const stack=doc.createElement('div');stack.className='event-stack';
      const events=(byDate[cell.date]||[]).slice().sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
      events.slice(0,3).forEach(event=>{
        const id=eventIdOf(event);const occ=eventOccupancy(event);const card=doc.createElement('button');card.type='button';card.className='event-card';
        card.innerHTML='<strong>'+safeHtml(event.startTime)+'–'+safeHtml(event.endTime)+' · '+safeHtml(event.title||('OPEN-'+event.rooms))+'</strong><small>'+occ.booked+'/'+occ.capacity+' booked</small>';
        card.setAttribute('aria-label','ดูรายละเอียดรอบตรวจ '+String(event.startTime||'')+' '+occ.booked+' จาก '+occ.capacity+' ราย');
        card.addEventListener('click',()=>openEventDetail(event.eventId,card));
        if(!id)card.disabled=true;
        stack.appendChild(card);
      });
      if(events.length>3){const more=doc.createElement('div');more.className='overflow-note';more.textContent='+'+(events.length-3)+' เพิ่มเติม';stack.appendChild(more);}
      day.appendChild(stack);grid.appendChild(day);
    });
  }
  async function loadCalendar(options){
    const requestId=calendarRequestGate.next();
    const range=monthRange();
    const result=await apiCall('admin.calendar.list',range,options);
    if(!calendarRequestGate.isLatest(requestId))return calendarData;
    calendarData=result||{events:[]};renderCalendar();return calendarData;
  }

  function eventSummaryHtml(event){
    return [
      ['วันที่',event.date],['เวลา',String(event.startTime||'')+'–'+String(event.endTime||'')],['รอบตรวจ',event.title||('OPEN-'+event.rooms)],['จำนวนห้อง',String(event.rooms||0)],
      ['จองแล้ว',String(event.booked||0)],['Capacity',String(event.capacity||0)],['คงเหลือ',String(event.remaining||0)],['สถานะ',event.readOnly?'สิ้นสุดแล้ว / Read-only':'ใช้งานได้']
    ].map(v=>'<div class="metric"><span>'+safeHtml(v[0])+'</span><strong>'+safeHtml(v[1])+'</strong></div>').join('');
  }
  function renderEventDetail(){
    if(!eventDetailData)return;
    const event=eventDetailData.event||{};$('event-detail-summary').innerHTML=eventSummaryHtml(event);
    $('event-detail-readonly').classList.toggle('hidden',!isEventReadOnly(event));
    $('event-edit').classList.toggle('hidden',isEventReadOnly(event));$('event-delete').classList.toggle('hidden',isEventReadOnly(event));
    const body=$('event-detail-bookings');body.innerHTML='';const rows=Array.isArray(eventDetailData.bookings)?eventDetailData.bookings:[];
    $('event-detail-empty').classList.toggle('hidden',rows.length!==0);
    rows.forEach(row=>{
      const tr=doc.createElement('tr');if(String(row.status)==='CANCELLED')tr.classList.add('row-cancelled');
      const ref=bookingKey(row);
      tr.innerHTML='<td>'+safeHtml(row.startTime)+'</td><td>'+safeHtml(ref)+'</td><td>'+safeHtml((row.firstName||'')+' '+(row.lastName||''))+'</td><td>'+statusPill(row.status)+'</td><td><div class="row-actions"></div></td>';
      const actions=tr.querySelector('.row-actions');
      const add=(label,fn,cls)=>{const b=doc.createElement('button');b.type='button';b.className='btn btn-small '+(cls||'');b.textContent=label;b.addEventListener('click',fn);actions.appendChild(b);};
      add('ดูรายละเอียด',()=>openBookingFromReference(ref));
      if(String(row.status)==='CONFIRMED'){
        add('เปลี่ยนนัด',()=>openRescheduleFromReference(ref));
        add('ยกเลิก',()=>cancelBookingFromReference(ref),'btn-danger');
        const ended=bookingIsEnded(row,eventDetailData.serverNow?Date.parse(eventDetailData.serverNow):Date.now());
        const out=doc.createElement('button');out.type='button';out.className='btn btn-small';out.textContent='บันทึกผล';out.disabled=!ended;out.title=ended?'':'บันทึกผลได้หลังเวลานัดสิ้นสุด';out.addEventListener('click',()=>openOutcomeFromReference(ref));actions.appendChild(out);
      }
      body.appendChild(tr);
    });
  }
  async function openEventDetail(eventId,trigger,options){
    const id=String(eventId||'').trim();if(!id){message('dashboard-message','ไม่พบ eventId ของรอบตรวจ','error');return;}
    eventDetailTrigger=trigger||eventDetailTrigger;const requestId=++eventDetailRequestSeq;
    const data=await apiCall('admin.calendar.detail',{eventId:id},options);
    if(requestId!==eventDetailRequestSeq)return;
    eventDetailData=data;renderEventDetail();showDialog('event-detail-dialog');
  }
  async function refreshEventDetail(options){
    const id=eventDetailData&&eventIdOf(eventDetailData.event);if(!id)return null;
    const requestId=++eventDetailRequestSeq;const data=await apiCall('admin.calendar.detail',{eventId:id},options);
    if(requestId!==eventDetailRequestSeq)return null;eventDetailData=data;renderEventDetail();return data;
  }

  function reasonOptions(select){
    select.innerHTML='<option value="">เลือกเหตุผล</option>';
    reasons.forEach(r=>{const o=doc.createElement('option');o.value=String(r.code||'');o.textContent=String(r.label||r.code||'');select.appendChild(o);});
  }
  function setReasonFields(){reasonOptions($('reason-code'));reasonOptions($('admin-booking-form').elements.reasonCode);}
  function openReasonDialog(title,impact,callback){
    pendingReasonAction=callback;$('reason-dialog-title').textContent=title||'ยืนยันการเปลี่ยนแปลง';
    const affected=Number(impact&&impact.affectedBookingCount||0),over=Array.isArray(impact&&impact.overCapacitySlots)?impact.overCapacitySlots.length:0;
    $('impact-summary').textContent='รายการจองที่ได้รับผลกระทบ '+affected+' ราย'+(over?' · มี '+over+' ช่วงเวลาที่อาจเกิน Capacity':'');
    const slots=Array.isArray(impact&&impact.affectedSlots)?impact.affectedSlots:[];$('impact-details').innerHTML=slots.map(s=>'<div>'+safeHtml(s.date||'')+' '+safeHtml(s.startTime||'')+' · booked '+Number(s.booked||0)+' / capacity '+Number(s.capacity||0)+'</div>').join('');
    $('reason-code').value='';$('reason-detail').value='';showDialog('reason-dialog');
  }
  async function previewSchedule(operation,event,payload){
    return apiCall('admin.calendar.preview',Object.assign({eventId:eventIdOf(event),operation:operation},payload||{}));
  }
  function openScheduleCreate(){
    const f=$('schedule-form');f.reset();f.elements.eventId.value='';f.elements.startDate.value=UI.todayIso();f.elements.endDate.value=UI.todayIso();f.elements.startTime.value='08:00';f.elements.endTime.value='12:00';f.elements.rooms.value='1';
    $('schedule-dialog-title').textContent='เปิดห้องตรวจ';$('schedule-mode-note').textContent='สร้าง OPEN event แยก 1 event ต่อวัน สูงสุด 31 วัน';showDialog('schedule-dialog');
  }
  function openScheduleEdit(event){
    if(!event||isEventReadOnly(event))return;const f=$('schedule-form');f.reset();f.elements.eventId.value=eventIdOf(event);f.elements.startDate.value=event.date;f.elements.endDate.value=event.date;f.elements.startTime.value=event.startTime;f.elements.endTime.value=event.endTime;f.elements.rooms.value=String(event.rooms||1);
    f.elements.endDate.disabled=true;$('schedule-dialog-title').textContent='แก้ไขรอบตรวจ';$('schedule-mode-note').textContent='แก้ไขเฉพาะ event นี้';showDialog('schedule-dialog');
  }
  function resetScheduleDisabled(){const f=$('schedule-form');if(f)f.elements.endDate.disabled=false;}
  async function performScheduleUpdate(event,payload,reason){
    const p=Object.assign({},payload,{eventId:eventIdOf(event)});if(reason)Object.assign(p,{confirmImpact:true,reasonCode:reason.code,reasonDetail:reason.detail});
    await apiCall('admin.calendar.update',p);closeDialog('schedule-dialog');closeDialog('reason-dialog');notifyChanged('schedule-changed',payload.date);message('dashboard-message','บันทึกรอบตรวจสำเร็จ','success');await bestEffortRefresh({detail:true});
  }
  async function deleteCurrentEvent(){
    const event=eventDetailData&&eventDetailData.event;if(!event||isEventReadOnly(event))return;
    const impact=await previewSchedule('DELETE',event,{});
    const run=async reason=>{await apiCall('admin.calendar.delete',{eventId:eventIdOf(event),confirmImpact:true,reasonCode:reason.code,reasonDetail:reason.detail});closeDialog('reason-dialog');closeDialog('event-detail-dialog');notifyChanged('schedule-changed',event.date);message('dashboard-message','ลบรอบตรวจสำเร็จ','success');await bestEffortRefresh();};
    openReasonDialog('ยืนยันลบรอบตรวจ',impact,run);
  }

  function filtersPayload(){return {date:$('booking-filter-date').value,status:$('booking-filter-status').value,query:$('booking-filter-query').value.trim(),limit:300};}
  function bookingByRef(ref){const key=String(ref||'');return bookings.find(b=>bookingKey(b)===key)||null;}
  async function ensureBooking(ref){
    let row=bookingByRef(ref);if(row)return row;const result=await apiCall('admin.bookings.list',{query:String(ref||''),limit:20});const list=result&&result.bookings||[];row=list.find(b=>bookingKey(b)===String(ref||''))||list[0]||null;return row;
  }
  async function loadAdminBookingSlots(date,selectedTime){
    const f=$('admin-booking-form');
    const select=f.elements.startTime;
    const target=String(date||'').trim();
    select.innerHTML='<option value="">'+(target?'กำลังโหลดเวลาว่าง...':'เลือกวันที่ก่อน')+'</option>';
    select.disabled=true;
    if(!target){select.disabled=false;return [];}
    try{
      const result=await apiCall('admin.calendar.list',{startDate:target,endDate:target});
      const slots=UI.flattenAdminSlots(result&&result.events||[],target).filter(slot=>isoDateTimeMs(target,slot.startTime)>=Date.now());
      select.innerHTML='<option value="">เลือกเวลา</option>';
      slots.forEach(slot=>{
        const o=doc.createElement('option');
        o.value=slot.startTime;
        o.textContent=slot.startTime+' · เหลือ '+slot.remaining+' ที่';
        select.appendChild(o);
      });
      if(selectedTime&&slots.some(slot=>slot.startTime===selectedTime))select.value=selectedTime;
      if(!slots.length)select.innerHTML='<option value="">ไม่มีช่วงเวลาที่ว่าง</option>';
      return slots;
    }finally{select.disabled=false;}
  }
  function bookingDetailHtml(row){
    const pairs=[['Booking Reference',row.bookingReference],['วัน/เวลา',String(row.appointmentDate||'')+' '+String(row.startTime||'')+'–'+String(row.endTime||'')],['Status',row.status],['ชื่อ',String(row.firstName||'')+' '+String(row.lastName||'')],['วันเกิด',row.dob],['โทรศัพท์',row.phone],['Email',row.email],['เลขบัตร',row.thaiIdMasked],['โรคประจำตัว',row.underlyingDisease]];
    return pairs.map(p=>'<dt>'+safeHtml(p[0])+'</dt><dd>'+safeHtml(p[1]||'-')+'</dd>').join('');
  }
  async function openBookingFromReference(ref){const row=await ensureBooking(ref);if(!row){message('dashboard-message','ไม่พบข้อมูลการจอง','error');return;}$('booking-detail-summary').innerHTML=bookingDetailHtml(row);showDialog('booking-detail-dialog');}
  function setBookingMode(mode,row){
    const f=$('admin-booking-form');f.reset();f.elements.mode.value=mode;activeBooking=row||null;
    const create=mode==='create';$('admin-patient-fields').classList.toggle('hidden',!create);$('reschedule-reason-fields').classList.toggle('hidden',create);$('booking-dialog-title').textContent=create?'เพิ่มนัด':'เปลี่ยนนัด '+String(row&&row.bookingReference||'');
    ['firstName','lastName','dob','phone','email','thaiNationalId'].forEach(n=>{if(f.elements[n])f.elements[n].required=create;});
    if(create){f.elements.appointmentDate.value=UI.todayIso();loadAdminBookingSlots(f.elements.appointmentDate.value,'').catch(e=>message('dashboard-message',errorText(e),'error'));}
    else{f.elements.bookingId.value=String(row.bookingId||'');f.elements.appointmentDate.value=String(row.appointmentDate||'');loadAdminBookingSlots(f.elements.appointmentDate.value,String(row.startTime||'')).catch(e=>message('dashboard-message',errorText(e),'error'));}
    showDialog('booking-dialog');
  }
  async function openRescheduleFromReference(ref){const row=await ensureBooking(ref);if(row)setBookingMode('reschedule',row);}
  async function cancelBookingFromReference(ref){
    const row=await ensureBooking(ref);if(!row)return;
    openReasonDialog('ยืนยันยกเลิกนัด',{affectedBookingCount:1},async reason=>{await apiCall('admin.booking.cancel',{bookingId:row.bookingId,bookingReference:row.bookingReference,reasonCode:reason.code,reasonDetail:reason.detail});closeDialog('reason-dialog');notifyChanged('booking-changed',row.appointmentDate);message('dashboard-message','ยกเลิกนัดสำเร็จ','success');await bestEffortRefresh({bookings:true,detail:true});});
  }
  async function openOutcomeFromReference(ref){const row=await ensureBooking(ref);if(!row)return;outcomeBooking=row;$('outcome-booking-label').textContent=String(row.bookingReference||'')+' · '+String(row.firstName||'')+' '+String(row.lastName||'');showDialog('outcome-dialog');}
  async function submitOutcome(status){
    const row=outcomeBooking;if(!row)return;await apiCall('admin.booking.outcome',{bookingId:row.bookingId,bookingReference:row.bookingReference,status:status});closeDialog('outcome-dialog');notifyChanged('booking-changed',row.appointmentDate);message('dashboard-message','บันทึกผล '+status+' สำเร็จ','success');await bestEffortRefresh({bookings:true,detail:true});
  }
  function renderBookings(){
    const body=$('booking-table-body');body.innerHTML='';
    bookings.forEach(row=>{const tr=doc.createElement('tr');if(String(row.status)==='CANCELLED')tr.classList.add('row-cancelled');tr.innerHTML='<td>'+safeHtml(row.appointmentDate)+'<br>'+safeHtml(row.startTime)+'</td><td>'+safeHtml(row.bookingReference)+'</td><td>'+safeHtml((row.firstName||'')+' '+(row.lastName||''))+'</td><td>'+safeHtml(row.phone||'-')+'<br>'+safeHtml(row.email||'')+'</td><td>'+statusPill(row.status)+'</td><td><div class="row-actions"></div></td>';
      const a=tr.querySelector('.row-actions');const add=(label,fn,cls)=>{const b=doc.createElement('button');b.type='button';b.className='btn btn-small '+(cls||'');b.textContent=label;b.onclick=fn;a.appendChild(b);};add('ดู',()=>openBookingFromReference(row.bookingReference));if(String(row.status)==='CONFIRMED'){add('เปลี่ยนนัด',()=>setBookingMode('reschedule',row));add('ยกเลิก',()=>cancelBookingFromReference(row.bookingReference),'btn-danger');if(bookingIsEnded(row,Date.now()))add('ผล',()=>openOutcomeFromReference(row.bookingReference));}body.appendChild(tr);});
  }
  async function loadBookings(options){const result=await apiCall('admin.bookings.list',filtersPayload(),options);bookings=result&&result.bookings||[];renderBookings();return result;}

  function renderUsers(){
    const body=$('users-table-body');body.innerHTML='';users.forEach(u=>{const tr=doc.createElement('tr');const active=!!(u.active===true||String(u.active).toUpperCase()==='TRUE');tr.innerHTML='<td>'+safeHtml(u.staffId||u.StaffID)+'</td><td>'+safeHtml(u.name||u.Name)+'</td><td>'+safeHtml(u.role||u.Role)+'</td><td>'+(active?'ACTIVE':'INACTIVE')+'</td><td><div class="row-actions"></div></td>';const a=tr.querySelector('.row-actions');const staff=String(u.staffId||u.StaffID||'');const toggle=doc.createElement('button');toggle.type='button';toggle.className='btn btn-small';toggle.textContent=active?'ปิดบัญชี':'เปิดบัญชี';toggle.onclick=async()=>{await apiCall('superadmin.user.setActive',{staffId:staff,active:!active});await loadUsers();};a.appendChild(toggle);const reset=doc.createElement('button');reset.type='button';reset.className='btn btn-small';reset.textContent='Reset Password';reset.onclick=()=>openPasswordDialog('reset',staff);a.appendChild(reset);body.appendChild(tr);});
  }
  async function loadUsers(){if(!profile||profile.role!=='SUPER_ADMIN')return;const result=await apiCall('superadmin.users.list',{});users=result&&result.users||result||[];renderUsers();}

  function activateTab(name){
    const target=name==='users'&&profile&&profile.role!=='SUPER_ADMIN'?'calendar':name;
    doc.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===target));
    ['calendar','bookings','users'].forEach(n=>$(n+'-panel').classList.toggle('hidden',n!==target));
    if(target==='bookings')loadBookings().catch(e=>message('dashboard-message',errorText(e),'error'));
    if(target==='users')loadUsers().catch(e=>message('dashboard-message',errorText(e),'error'));
  }
  function renderProfile(){
    $('user-chip').textContent=profile?String(profile.name||profile.staffId||'')+' · '+String(profile.staffId||'')+' · '+String(profile.role||''):'';
    $('users-tab').classList.toggle('hidden',!profile||profile.role!=='SUPER_ADMIN');
  }
  async function bootstrap(){
    const range=monthRange();const data=await apiCall('admin.bootstrap',Object.assign({},range,{bookingLimit:300}));
    profile=data.profile||null;reasons=data.reasons||[];calendarData=data.calendar||{events:[]};bookings=data.bookings||[];users=data.users||[];setReasonFields();renderProfile();renderCalendar();renderBookings();if(profile&&profile.role==='SUPER_ADMIN')renderUsers();showDashboard(true);activateTab('calendar');
  }

  function openPasswordDialog(mode,staffId){
    passwordMode=mode;const f=$('password-form');f.reset();f.elements.targetStaffId.value=String(staffId||'');const own=mode==='own'||mode==='must-change';$('current-password-field').classList.toggle('hidden',!own);f.elements.currentPassword.required=own;$('password-dialog-title').textContent=mode==='reset'?'Reset Password: '+staffId:'เปลี่ยน Password';$('password-close').classList.toggle('hidden',mode==='must-change');$('password-cancel').classList.toggle('hidden',mode==='must-change');showDialog('password-dialog');
  }

  function wire(){
    doc.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.closeDialog;if(id==='schedule-dialog')resetScheduleDisabled();closeDialog(id);}));
    $('event-detail-dialog').addEventListener('close',()=>{eventDetailRequestSeq++;const t=eventDetailTrigger;eventDetailData=null;eventDetailTrigger=null;if(t&&typeof t.focus==='function')t.focus();});
    $('password-dialog').addEventListener('cancel',ev=>{if(passwordMode==='must-change')ev.preventDefault();});
    $('login-form').addEventListener('submit',async ev=>{ev.preventDefault();message('admin-message','','');const b=$('login-button');b.disabled=true;try{const r=await client.call('auth.login',{staffId:$('login-staff-id').value.trim(),password:$('login-password').value},'',{});setToken(r.token);if(r.mustChangePassword){profile={staffId:r.staffId,name:r.name,role:r.role};showDashboard(true);renderProfile();openPasswordDialog('must-change','');message('dashboard-message','ต้องเปลี่ยน Password ก่อนใช้งานระบบ','warning');}else await bootstrap();}catch(e){clearSession();message('admin-message',errorText(e),'error');}finally{b.disabled=false;}});
    $('logout-button').onclick=async()=>{try{if(token)await apiCall('auth.logout',{});}catch(_ignored){}clearSession();};
    $('own-password-button').onclick=()=>openPasswordDialog('own','');
    doc.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));
    $('month-admin-prev').onclick=()=>{monthAnchor=UI.shiftMonth(monthAnchor,-1);loadCalendar().catch(e=>message('dashboard-message',errorText(e),'error'));};
    $('month-admin-next').onclick=()=>{monthAnchor=UI.shiftMonth(monthAnchor,1);loadCalendar().catch(e=>message('dashboard-message',errorText(e),'error'));};
    $('month-admin-today').onclick=()=>{monthAnchor=UI.todayIso();loadCalendar().catch(e=>message('dashboard-message',errorText(e),'error'));};
    $('add-schedule').onclick=openScheduleCreate;
    $('event-detail-refresh').onclick=()=>refreshEventDetail().catch(e=>message('dashboard-message',errorText(e),'error'));
    $('event-edit').onclick=()=>{const event=eventDetailData&&eventDetailData.event;if(event){closeDialog('event-detail-dialog');openScheduleEdit(event);}};
    $('event-delete').onclick=()=>deleteCurrentEvent().catch(e=>message('dashboard-message',errorText(e),'error'));
    $('schedule-form').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget;const id=String(f.elements.eventId.value||'');const payload={startDate:f.elements.startDate.value,endDate:f.elements.endDate.disabled?f.elements.startDate.value:f.elements.endDate.value,startTime:f.elements.startTime.value,endTime:f.elements.endTime.value,rooms:Number(f.elements.rooms.value)};try{if(!id){await apiCall('admin.calendar.bulkCreate',Object.assign({},payload,{idempotencyKey:(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'bulk-'+Date.now())}));closeDialog('schedule-dialog');resetScheduleDisabled();notifyChanged('schedule-changed',payload.startDate);message('dashboard-message','เปิดห้องตรวจสำเร็จ','success');await bestEffortRefresh();}else{const event={eventId:id,date:f.elements.startDate.value,startTime:f.elements.startTime.value,endTime:f.elements.endTime.value,rooms:payload.rooms};const updatePayload={date:payload.startDate,startTime:payload.startTime,endTime:payload.endTime,rooms:payload.rooms};const impact=await previewSchedule('UPDATE',event,updatePayload);if(impact&&impact.requiresConfirmation)openReasonDialog('ยืนยันแก้ไขรอบตรวจ',impact,r=>performScheduleUpdate(event,updatePayload,r));else await performScheduleUpdate(event,updatePayload,null);}}catch(e){message('dashboard-message',errorText(e),'error');}});
    $('reason-confirm').onclick=async()=>{if(!pendingReasonAction)return;const code=$('reason-code').value,detail=$('reason-detail').value.trim();if(!code){message('dashboard-message','กรุณาเลือกเหตุผล','error');return;}const cb=pendingReasonAction;try{await cb({code,detail});pendingReasonAction=null;}catch(e){message('dashboard-message',errorText(e),'error');}};
    $('booking-search').onclick=()=>loadBookings().catch(e=>message('dashboard-message',errorText(e),'error'));
    $('add-booking').onclick=()=>setBookingMode('create',null);
    $('admin-booking-form').elements.appointmentDate.addEventListener('change',ev=>loadAdminBookingSlots(ev.currentTarget.value,'').catch(e=>message('dashboard-message',errorText(e),'error')));
    $('admin-booking-form').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget,mode=f.elements.mode.value;try{if(mode==='create'){const payload={appointmentDate:f.elements.appointmentDate.value,startTime:f.elements.startTime.value,firstName:f.elements.firstName.value.trim(),lastName:f.elements.lastName.value.trim(),dob:f.elements.dob.value,phone:f.elements.phone.value.trim(),email:f.elements.email.value.trim(),thaiNationalId:f.elements.thaiNationalId.value.trim(),underlyingDisease:f.elements.underlyingDisease.value.trim()};await apiCall('admin.booking.create',payload);closeDialog('booking-dialog');notifyChanged('booking-changed',payload.appointmentDate);message('dashboard-message','เพิ่มนัดสำเร็จ','success');await bestEffortRefresh({bookings:true,detail:true});}else if(activeBooking){const payload={bookingId:activeBooking.bookingId,bookingReference:activeBooking.bookingReference,appointmentDate:f.elements.appointmentDate.value,startTime:f.elements.startTime.value,reasonCode:f.elements.reasonCode.value,reasonDetail:f.elements.reasonDetail.value.trim()};const oldDate=activeBooking.appointmentDate;await apiCall('admin.booking.reschedule',payload);closeDialog('booking-dialog');notifyChanged('booking-changed',oldDate);notifyChanged('booking-changed',payload.appointmentDate);message('dashboard-message','เปลี่ยนนัดสำเร็จ','success');await bestEffortRefresh({bookings:true,detail:true});}}catch(e){message('dashboard-message',errorText(e),'error');}});
    $('outcome-completed').onclick=()=>submitOutcome('COMPLETED').catch(e=>message('dashboard-message',errorText(e),'error'));
    $('outcome-no-show').onclick=()=>submitOutcome('NO_SHOW').catch(e=>message('dashboard-message',errorText(e),'error'));
    $('create-user-form').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget;try{await apiCall('superadmin.user.create',{staffId:f.elements.staffId.value.trim(),name:f.elements.name.value.trim(),role:f.elements.role.value,password:f.elements.password.value});f.reset();message('dashboard-message','สร้างบัญชีสำเร็จ','success');await loadUsers();}catch(e){message('dashboard-message',errorText(e),'error');}});
    $('password-form').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget;try{if(passwordMode==='reset'){const targetStaffId=String(f.elements.targetStaffId.value||'');await apiCall('superadmin.user.resetPassword',{staffId:targetStaffId,newPassword:f.elements.newPassword.value});closeDialog('password-dialog');if(profile&&targetStaffId===String(profile.staffId||'')){clearSession();message('admin-message','Reset Password สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง','success');}else{message('dashboard-message','Reset Password สำเร็จ','success');await loadUsers();}}else{await apiCall('auth.changePassword',{currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value});closeDialog('password-dialog');clearSession();message('admin-message','เปลี่ยน Password สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง','success');}}catch(e){message('dashboard-message',errorText(e),'error');}});
    if(broadcast)broadcast.onmessage=()=>{if(token)bestEffortRefresh({bookings:true,detail:true});};
    root.addEventListener('focus',()=>{if(token)bestEffortRefresh({detail:true});});
  }

  async function start(){wire();if(!token){showDashboard(false);return;}try{await bootstrap();}catch(e){clearSession();message('admin-message',errorText(e),'error');}}
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start);else start();

  return {eventIdOf,isEventReadOnly,bookingIsEnded};
});
