(function(){
'use strict';
document.addEventListener('DOMContentLoaded',function(){
  const $=id=>document.getElementById(id);
  const API_ACTIONS={
    login:'auth.login',me:'admin.me',bootstrap:'admin.bootstrap',logout:'auth.logout',changePassword:'auth.changePassword',reasons:'admin.reasons.list',
    calendarList:'admin.calendar.list',calendarPreview:'admin.calendar.preview',calendarBulkCreate:'admin.calendar.bulkCreate',calendarCreate:'admin.calendar.create',calendarUpdate:'admin.calendar.update',calendarDelete:'admin.calendar.delete',
    bookingsList:'admin.bookings.list',bookingCreate:'admin.booking.create',bookingReschedule:'admin.booking.reschedule',bookingCancel:'admin.booking.cancel',bookingOutcome:'admin.booking.outcome',
    usersList:'superadmin.users.list',userCreate:'superadmin.user.create',userActive:'superadmin.user.setActive',userReset:'superadmin.user.resetPassword'
  };
  let loadingDepth=0;
  function loadingText(action){
    if(action==='admin.bootstrap'||action==='admin.calendar.list')return 'กำลังโหลดปฏิทิน...';
    if(action==='admin.calendar.bulkCreate'||action==='admin.calendar.create')return 'กำลังเปิดห้องตรวจ...';
    if(action==='admin.calendar.preview')return 'กำลังตรวจสอบผลกระทบ...';
    if(action==='admin.calendar.update'||action==='admin.calendar.delete')return 'กำลังบันทึกการเปลี่ยนแปลง...';
    if(action==='admin.bookings.list')return 'กำลังโหลดรายการนัด...';
    if(action==='admin.booking.create'||action==='admin.booking.reschedule'||action==='admin.booking.cancel'||action==='admin.booking.outcome')return 'กำลังบันทึกข้อมูลนัด...';
    if(action==='auth.login')return 'กำลังเข้าสู่ระบบ...';
    return 'กำลังดำเนินการ...';
  }
  function beginLoading(action){loadingDepth+=1;const overlay=$('global-loading');$('global-loading-text').textContent=loadingText(action);overlay.classList.remove('hidden');}
  function endLoading(){loadingDepth=Math.max(0,loadingDepth-1);if(!loadingDepth)$('global-loading').classList.add('hidden');}
  let client;try{client=ESTApi.createApiClient({apiUrl:window.EST_CONFIG&&window.EST_CONFIG.API_URL,onStart:beginLoading,onEnd:endLoading});}catch(error){showMessage(error.message,'error',true);}
  const session=ESTApi.createSessionStore(window.sessionStorage,'est-admin-session');
  const state={token:session.get(),profile:null,reasons:[],monthAnchor:ESTUi.todayIso(),events:[],reasonCallback:null,passwordMode:'own'};

  function showMessage(text,type,login){const el=login?$('admin-message'):$('dashboard-message');el.textContent=text||'';el.className='notice '+(type||'');el.classList.toggle('hidden',!text);}
  function errorText(e){return (e&&e.message?e.message:'เกิดข้อผิดพลาด')+(e&&e.requestId?' (Ref: '+e.requestId+')':'');}
  function busy(button,on){if(button){button.disabled=!!on;button.classList.toggle('loading',!!on);}}
  function closeDialog(id){const d=$(id);if(d&&d.open)d.close();}
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.closeDialog)));
  function requireClient(){if(!client)throw new Error('API ยังไม่ได้ตั้งค่า');return client;}
  async function call(action,payload){return requireClient().call(action,payload||{},state.token);}
  function setAuthenticated(profile){
    state.profile=profile;$('login-panel').classList.add('hidden');$('dashboard').classList.remove('hidden');
    $('user-chip').textContent=(profile.name||profile.staffId)+' · '+profile.role;
    $('users-tab').classList.toggle('hidden',profile.role!=='SUPER_ADMIN');
    if(profile.role!=='SUPER_ADMIN'&&document.querySelector('.tab.active')?.dataset.tab==='users')activateTab('calendar');
  }
  function clearAuth(){state.token=null;state.profile=null;session.clear();$('dashboard').classList.add('hidden');$('login-panel').classList.remove('hidden');$('login-password').value='';}

  async function login(event){event.preventDefault();const button=$('login-button');busy(button,true);showMessage('',null,true);try{
    const result=await requireClient().call(API_ACTIONS.login,{staffId:$('login-staff-id').value,password:$('login-password').value});
    state.token=result.token;session.set(result.token);setAuthenticated(result);if(result.mustChangePassword){openPasswordDialog('own',null,true);}else{await bootstrapDashboard();}
  }catch(e){showMessage(errorText(e),'error',true);}finally{busy(button,false);}}
  async function restore(){if(!state.token)return;try{const profile=await call(API_ACTIONS.me,{});setAuthenticated(profile);if(profile.mustChangePassword)openPasswordDialog('own',null,true);else await bootstrapDashboard();}catch(e){clearAuth();}}
  async function logout(){try{if(state.token)await call(API_ACTIONS.logout,{});}catch(e){}clearAuth();}
  $('login-form').addEventListener('submit',login);$('logout-button').addEventListener('click',logout);

  async function bootstrapDashboard(){
    const range=ESTUi.monthRange(state.monthAnchor);
    try{const data=await call(API_ACTIONS.bootstrap,{startDate:range.startDate,endDate:range.endDate,bookingLimit:300});state.profile=data.profile||state.profile;state.reasons=data.reasons||[];state.events=(data.calendar&&data.calendar.events)||[];populateReasonSelects();setAuthenticated(state.profile);renderCalendar(range);renderBookings(data.bookings||[]);if(state.profile.role==='SUPER_ADMIN')renderUsers(data.users||[]);}catch(e){showMessage(errorText(e),'error');}
  }
  function populateReasonSelects(){
    const opts='<option value="">เลือกเหตุผล</option>'+state.reasons.map(r=>'<option value="'+ESTUi.escapeHtml(r.code)+'">'+ESTUi.escapeHtml(r.label)+'</option>').join('');
    $('reason-code').innerHTML=opts;document.querySelector('#admin-booking-form [name="reasonCode"]').innerHTML=opts;
  }
  function activateTab(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));$(tab+'-panel').classList.remove('hidden');if(tab==='calendar')loadCalendar();if(tab==='bookings')loadBookings();if(tab==='users'&&state.profile.role==='SUPER_ADMIN')loadUsers();}
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));

  // Calendar
  async function loadCalendar(){if(!state.token)return;const range=ESTUi.monthRange(state.monthAnchor);$('admin-month-label').textContent=ESTUi.formatThaiDate(range.startDate,{month:'long',year:'numeric',timeZone:'UTC'});try{const result=await call(API_ACTIONS.calendarList,range);state.events=result.events||[];renderCalendar(range);}catch(e){showMessage(errorText(e),'error');}}
  function renderCalendar(range){$('admin-month-label').textContent=ESTUi.formatThaiDate(range.startDate,{month:'long',year:'numeric',timeZone:'UTC'});const grid=$('admin-month-grid');grid.innerHTML='';ESTUi.monthGrid(state.monthAnchor).forEach(cell=>{const day=document.createElement('div');day.className='month-day admin-day'+(cell.inMonth?'':' outside-month');day.innerHTML='<div class="day-number">'+Number(cell.date.slice(-2))+'</div>';if(cell.inMonth){const events=state.events.filter(e=>e.date===cell.date);events.slice(0,3).forEach(e=>day.appendChild(eventCard(e,true)));if(events.length>3){const more=document.createElement('button');more.type='button';more.className='more-events';more.textContent='+'+(events.length-3)+' เพิ่มเติม';more.addEventListener('click',()=>openDayDetail(cell.date,events));day.appendChild(more);}}grid.appendChild(day);});}
  function eventCard(event,compact){const el=document.createElement('div');el.className='schedule-event'+(compact?' compact':'');const totalBooked=(event.slots||[]).reduce((n,s)=>n+Number(s.booked||0),0),totalCapacity=(event.slots||[]).reduce((n,s)=>n+Number(s.capacity||0),0);el.innerHTML='<div class="event-title">'+ESTUi.escapeHtml(event.title)+'</div><div>'+ESTUi.escapeHtml(event.startTime)+'–'+ESTUi.escapeHtml(event.endTime)+'</div><div class="event-summary">'+totalBooked+'/'+totalCapacity+' booked</div>';el.addEventListener('click',()=>openSchedule(event));return el;}
  function openDayDetail(date,events){$('day-detail-title').textContent='รอบตรวจ · '+ESTUi.formatThaiDate(date);const wrap=$('day-detail-events');wrap.innerHTML='';events.forEach(e=>wrap.appendChild(eventCard(e,false)));$('day-detail-dialog').showModal();}
  $('admin-month-prev').addEventListener('click',()=>{state.monthAnchor=ESTUi.shiftMonth(state.monthAnchor,-1);loadCalendar();});$('admin-month-next').addEventListener('click',()=>{state.monthAnchor=ESTUi.shiftMonth(state.monthAnchor,1);loadCalendar();});$('admin-month-today').addEventListener('click',()=>{state.monthAnchor=ESTUi.todayIso();loadCalendar();});$('add-schedule').addEventListener('click',()=>openSchedule(null));
  function openSchedule(event){const f=$('schedule-form');f.reset();const date=event?event.date:ESTUi.todayIso();f.elements.eventId.value=event?event.eventId:'';f.elements.startDate.value=date;f.elements.endDate.value=date;f.elements.endDate.disabled=!!event;f.elements.startTime.value=event?event.startTime:'08:00';f.elements.endTime.value=event?event.endTime:'12:00';f.elements.rooms.value=event?String(event.rooms):'1';$('schedule-end-date-field').classList.toggle('hidden',!!event);$('bulk-schedule-help').classList.toggle('hidden',!!event);$('schedule-dialog-title').textContent=event?'แก้ไขช่วงตรวจ':'เปิดห้องตรวจ';$('delete-schedule').classList.toggle('hidden',!event);$('schedule-dialog').showModal();}
  function schedulePayload(){const f=$('schedule-form'),eventId=f.elements.eventId.value;return eventId?{eventId:eventId,date:f.elements.startDate.value,startTime:f.elements.startTime.value,endTime:f.elements.endTime.value,rooms:Number(f.elements.rooms.value)}:{startDate:f.elements.startDate.value,endDate:f.elements.endDate.value,startTime:f.elements.startTime.value,endTime:f.elements.endTime.value,rooms:Number(f.elements.rooms.value),idempotencyKey:'bulk-'+Date.now()+'-'+Math.random().toString(36).slice(2)};}
  $('schedule-form').addEventListener('submit',async e=>{e.preventDefault();const p=schedulePayload();try{if(!p.eventId){await call(API_ACTIONS.calendarBulkCreate,p);}else{const impact=await call(API_ACTIONS.calendarPreview,p);if(impact.requiresConfirmation){return askReason('ยืนยันการลด/เปลี่ยนช่วงตรวจ',impact,async reason=>{await call(API_ACTIONS.calendarUpdate,Object.assign({},p,{confirmImpact:true},reason));closeDialog('schedule-dialog');await loadCalendar();});}await call(API_ACTIONS.calendarUpdate,p);}closeDialog('schedule-dialog');await loadCalendar();showMessage('บันทึกตารางตรวจแล้ว','success');}catch(err){showMessage(errorText(err),'error');}});
  $('delete-schedule').addEventListener('click',async()=>{const p=schedulePayload();try{const impact=await call(API_ACTIONS.calendarPreview,{eventId:p.eventId,operation:'DELETE'});askReason('ยืนยันการลบช่วงตรวจ',impact,async reason=>{await call(API_ACTIONS.calendarDelete,Object.assign({eventId:p.eventId,confirmImpact:true},reason));closeDialog('schedule-dialog');await loadCalendar();showMessage('ลบช่วงตรวจแล้ว','success');});}catch(e){showMessage(errorText(e),'error');}});

  function askReason(title,impact,callback){state.reasonCallback=callback;$('reason-dialog-title').textContent=title;$('impact-summary').textContent='มี Booking ที่ได้รับผลกระทบ '+Number(impact.affectedBookingCount||0)+' รายการ';const rows=(impact.affectedSlots||[]).map(s=>'<div>'+ESTUi.escapeHtml(s.date||'')+' '+ESTUi.escapeHtml(s.startTime||'')+' · booked '+Number(s.booked||0)+' / new capacity '+Number(s.newCapacity||0)+'</div>').join('');$('impact-details').innerHTML=rows||'<div>ไม่พบ Booking ที่ได้รับผลกระทบ แต่เป็นการเปลี่ยนแปลงตารางแบบ destructive</div>';$('reason-code').value='';$('reason-detail').value='';$('reason-dialog').showModal();}
  $('reason-confirm').addEventListener('click',async()=>{const code=$('reason-code').value,detail=$('reason-detail').value.trim();if(!code){showMessage('กรุณาเลือกเหตุผล','error');return;}const reason={reasonCode:code,reasonDetail:detail};const selected=state.reasons.find(r=>r.code===code);if(selected&&selected.requiresDetail&&!detail){showMessage('กรุณาระบุรายละเอียดเหตุผล','error');return;}const cb=state.reasonCallback;try{if(cb)await cb(reason);closeDialog('reason-dialog');}catch(e){showMessage(errorText(e),'error');}});

  // Bookings
  async function loadBookings(){if(!state.token)return;const payload={date:$('booking-filter-date').value,status:$('booking-filter-status').value,query:$('booking-filter-query').value,limit:300};try{const result=await call(API_ACTIONS.bookingsList,payload);renderBookings(result.bookings||[]);}catch(e){showMessage(errorText(e),'error');}}
  function renderBookings(rows){const body=$('booking-table-body');body.innerHTML='';if(!rows.length){body.innerHTML='<tr><td colspan="6" class="empty">ไม่พบรายการ</td></tr>';return;}rows.forEach(b=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+ESTUi.escapeHtml(b.appointmentDate)+'<br><strong>'+ESTUi.escapeHtml(b.startTime)+'–'+ESTUi.escapeHtml(b.endTime)+'</strong></td><td>'+ESTUi.escapeHtml(b.bookingReference)+'</td><td>'+ESTUi.escapeHtml(b.firstName+' '+b.lastName)+'<br><span class="muted">'+ESTUi.escapeHtml(b.thaiIdMasked)+'</span></td><td>'+ESTUi.escapeHtml(b.phone)+'<br>'+ESTUi.escapeHtml(b.email)+'</td><td><span class="status '+ESTUi.escapeHtml(b.status)+'">'+ESTUi.escapeHtml(b.status)+'</span></td><td class="booking-actions"></td>';const actions=tr.querySelector('.booking-actions');if(b.status==='CONFIRMED'){addAction(actions,'เลื่อนนัด',()=>openAdminBooking('reschedule',b));addAction(actions,'ยกเลิก',()=>cancelBooking(b),'btn-danger');addAction(actions,'Completed',()=>markOutcome(b,'COMPLETED'));addAction(actions,'No-show',()=>markOutcome(b,'NO_SHOW'));}body.appendChild(tr);});}
  function addAction(parent,label,handler,cls){const b=document.createElement('button');b.type='button';b.className='btn btn-small '+(cls||'btn-ghost');b.textContent=label;b.addEventListener('click',handler);parent.appendChild(b);parent.appendChild(document.createTextNode(' '));}
  $('booking-search').addEventListener('click',loadBookings);$('add-booking').addEventListener('click',()=>openAdminBooking('create',null));
  function setPatientRequired(required){document.querySelectorAll('#admin-patient-fields input,#admin-patient-fields textarea').forEach(el=>el.required=!!required);}
  function openAdminBooking(mode,booking){const f=$('admin-booking-form');f.reset();f.dataset.mode=mode;f.elements.bookingId.value=booking?booking.bookingId:'';$('booking-dialog-title').textContent=mode==='create'?'เพิ่มนัด':'เลื่อนนัด';$('admin-patient-fields').classList.toggle('hidden',mode!=='create');$('reschedule-reason-fields').classList.toggle('hidden',mode!=='reschedule');setPatientRequired(mode==='create');f.elements.appointmentDate.value=booking?booking.appointmentDate:ESTUi.todayIso();loadAdminSlots(f.elements.appointmentDate.value,booking&&booking.startTime);$('booking-dialog').showModal();}
  async function loadAdminSlots(date,selected){const select=document.querySelector('#admin-booking-form [name="startTime"]');select.innerHTML='<option value="">กำลังโหลด...</option>';try{const result=await call(API_ACTIONS.calendarList,{startDate:date,endDate:date});const slots=ESTUi.flattenAdminSlots(result.events||[],date);select.innerHTML='<option value="">เลือกเวลา</option>'+slots.map(s=>'<option value="'+ESTUi.escapeHtml(s.startTime)+'" '+(s.startTime===selected?'selected':'')+'>'+ESTUi.escapeHtml(s.startTime)+' (เหลือ '+s.remaining+')</option>').join('');}catch(e){select.innerHTML='<option value="">โหลดเวลาไม่สำเร็จ</option>';showMessage(errorText(e),'error');}}
  document.querySelector('#admin-booking-form [name="appointmentDate"]').addEventListener('change',e=>loadAdminSlots(e.target.value,''));
  $('admin-booking-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,p=Object.fromEntries(new FormData(f).entries());try{if(f.dataset.mode==='create'){delete p.bookingId;delete p.reasonCode;delete p.reasonDetail;await call(API_ACTIONS.bookingCreate,p);}else{p.bookingId=f.elements.bookingId.value;await call(API_ACTIONS.bookingReschedule,p);}closeDialog('booking-dialog');await loadBookings();await loadCalendar();showMessage('บันทึกนัดแล้ว','success');}catch(err){showMessage(errorText(err),'error');}});
  function cancelBooking(b){askReason('ยืนยันการยกเลิกนัด',{affectedBookingCount:1,affectedSlots:[{date:b.appointmentDate,startTime:b.startTime,booked:1,newCapacity:0}]},async reason=>{await call(API_ACTIONS.bookingCancel,Object.assign({bookingId:b.bookingId},reason));await loadBookings();await loadCalendar();showMessage('ยกเลิกนัดแล้ว','success');});}
  async function markOutcome(b,status){if(!window.confirm('ยืนยันเปลี่ยนสถานะเป็น '+status+' ?'))return;try{await call(API_ACTIONS.bookingOutcome,{bookingId:b.bookingId,status});await loadBookings();showMessage('อัปเดตสถานะแล้ว','success');}catch(e){showMessage(errorText(e),'error');}}

  // Users / password
  function renderUsers(rows){const body=$('users-table-body');body.innerHTML='';(rows||[]).forEach(u=>{const tr=document.createElement('tr');tr.innerHTML='<td>'+ESTUi.escapeHtml(u.staffId)+'</td><td>'+ESTUi.escapeHtml(u.name)+'</td><td>'+ESTUi.escapeHtml(u.role)+'</td><td>'+(u.active?'Active':'Disabled')+(u.mustChangePassword?' · ต้องเปลี่ยน Password':'')+'</td><td class="user-actions"></td>';const a=tr.querySelector('.user-actions');addAction(a,u.active?'Disable':'Enable',()=>toggleUser(u),u.active?'btn-danger':'');addAction(a,'Reset Password',()=>openPasswordDialog('reset',u,false));body.appendChild(tr);});}
  async function loadUsers(){if(state.profile.role!=='SUPER_ADMIN')return;try{const result=await call(API_ACTIONS.usersList,{});renderUsers(result.users||[]);}catch(e){showMessage(errorText(e),'error');}}
  $('create-user-form').addEventListener('submit',async e=>{e.preventDefault();try{await call(API_ACTIONS.userCreate,Object.fromEntries(new FormData(e.currentTarget).entries()));e.currentTarget.reset();await loadUsers();showMessage('สร้างบัญชีแล้ว','success');}catch(err){showMessage(errorText(err),'error');}});
  async function toggleUser(u){if(!window.confirm((u.active?'ปิด':'เปิด')+'บัญชี '+u.staffId+' ?'))return;try{await call(API_ACTIONS.userActive,{staffId:u.staffId,active:!u.active});await loadUsers();}catch(e){showMessage(errorText(e),'error');}}
  function openPasswordDialog(mode,user,mustChange){state.passwordMode=mode;const f=$('password-form');f.reset();f.elements.targetStaffId.value=user?user.staffId:'';$('password-dialog-title').textContent=mode==='reset'?'Reset Password: '+user.staffId:'เปลี่ยน Password';$('current-password-field').classList.toggle('hidden',mode==='reset');f.elements.currentPassword.required=mode!=='reset';$('password-close').classList.toggle('hidden',!!mustChange);$('password-dialog').dataset.mustChange=mustChange?'1':'0';$('password-dialog').showModal();}
  $('password-dialog').addEventListener('cancel',e=>{if($('password-dialog').dataset.mustChange==='1')e.preventDefault();});
  $('password-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{if(state.passwordMode==='reset'){await call(API_ACTIONS.userReset,{staffId:f.elements.targetStaffId.value,newPassword:f.elements.newPassword.value});closeDialog('password-dialog');await loadUsers();showMessage('Reset Password แล้ว','success');}else{await call(API_ACTIONS.changePassword,{currentPassword:f.elements.currentPassword.value,newPassword:f.elements.newPassword.value});closeDialog('password-dialog');clearAuth();showMessage('เปลี่ยน Password แล้ว กรุณาเข้าสู่ระบบใหม่','success',true);}}catch(err){showMessage(errorText(err),'error');}});

  restore();
});
})();
