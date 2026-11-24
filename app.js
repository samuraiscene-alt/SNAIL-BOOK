(()=>{'use strict';
const APP_VERSION='1.0.11';
const SNAIL_MODE_KEY='snailbook_dev_mode_v1';
const SNAIL_TEST_MODE=localStorage.getItem(SNAIL_MODE_KEY)==='test';
const KEY=SNAIL_TEST_MODE?'snailbook_v1_test_store':'snailbook_v1_store';
const base={clients:[],services:[{id:'s1',name:'젤네일',price:50000,minutes:60},{id:'s2',name:'젤 제거',price:10000,minutes:30},{id:'s3',name:'네일아트',price:70000,minutes:90},{id:'s4',name:'기본 케어',price:30000,minutes:45}],bookings:[],personalEvents:[],settings:{open:'10:00',close:'20:00',interval:30,closedDays:[0]}};
function clone(o){return JSON.parse(JSON.stringify(o))}function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&Array.isArray(x.bookings)&&Array.isArray(x.clients)&&Array.isArray(x.services))return {...clone(base),...x,settings:{...base.settings,...x.settings}}}catch(e){}return clone(base)}
let store=load(),tab='calendar',view='month',cursor=new Date(),selected=localDate(new Date()),panel=null,editing=null,checkedServices=[],extras=[],search='',toastTimer,earlyFinishAuthorized=false,treatmentGender=null,treatmentCategory=null,settingsGender=null,settingsCategory=null;
if(!Array.isArray(store.personalEvents))store.personalEvents=[];
const root=document.getElementById('app');const w=['일','월','화','수','목','금','토'];
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dateOf(s){return new Date(s+'T12:00:00')}function shift(s,n){let d=dateOf(s);d.setDate(d.getDate()+n);return localDate(d)}function money(n){return '₩'+Math.round(n||0).toLocaleString('ko-KR')}
function mins(s){const [h,m]=s.split(':').map(Number);return h*60+m}function hour(m){m=(m+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
function bookingEndIsFuture(date,end,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end||''))return false;
 const endAt=new Date(date+'T'+end+':00');
 return Number.isFinite(endAt.getTime())&&endAt.getTime()>now.getTime();
}
function bookingHasStarted(date,start,now=new Date()){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start||''))return false;const t=new Date(date+'T'+start+':00').getTime();return Number.isFinite(t)&&t<=now.getTime()}
function repairFutureCompletedBookings(){
 // Preserve a snapshot before correcting previously paid future appointments.
 const invalid=store.bookings.filter(b=>b.status==='paid'&&!b.actualCompletionAt&&bookingEndIsFuture(b.date,b.end));
 if(!invalid.length)return;
 const marker='futureCompletionRepairV061';
 if(store[marker])return;
 try{localStorage.setItem(KEY+'_before_v061_future_completion_repair',JSON.stringify(store))}catch(e){}
 invalid.forEach(b=>{
  b.futureCompletionCorrection={previousStatus:'paid',previousMemberUse:Number(b.memberUse)||0,previousPaymentMethod:b.paymentMethod||null,correctedAt:new Date().toISOString()};
  b.status='reserved';b.memberUse=0;b.paymentMethod=null;b.paymentDate=null;
 });
 store[marker]=true;save();
}
function uid(){return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}function save(){localStorage.setItem(KEY,JSON.stringify(store));cloudScheduleSave()}function notify(t){let e=document.querySelector('.toast');if(e)e.remove();e=document.createElement('div');e.className='toast';e.innerHTML='<div class="ok">✓</div>'+esc(t);document.body.append(e);clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.remove(),1800)}
function findClient(id){return store.clients.find(c=>c.id===id)}function priceFor(b){const subtotal=(b.items||[]).reduce((a,x)=>a+Number(x.price||0),0);return Math.max(0,subtotal+(b.extras||[]).reduce((a,x)=>a+(Number.isFinite(Number(x.amount))?Number(x.amount):0),0))}
function visibleBookings(d){return store.bookings.filter(b=>b.date===d&&b.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start))}

/* Personal calendar events live separately from customer bookings and sales. */
const PERSONAL_TYPES={
 schedule:{label:'스케줄',color:'#76a9ff'},
 todo:{label:'할 일',color:'#78c889'},
 birthday:{label:'생일',color:'#e27ba5'},
 custom:{label:'직접 입력',color:'#b394fa'}
};
function personalEventsOn(date){
 const target=Date.parse(date+'T12:00:00Z');
 return (store.personalEvents||[]).filter(e=>{
  if(!e.date||!Number.isFinite(target)||date<e.date||(Array.isArray(e.excludedDates)&&e.excludedDates.includes(date)))return false;
  if(e.date===date)return true;
  const repeat=e.repeat||'none';
  if(repeat==='weekly')return ((target-Date.parse(e.date+'T12:00:00Z'))/86400000)%7===0;
  if(repeat==='monthly')return e.date.slice(8)===date.slice(8);
  if(repeat==='yearly')return e.date.slice(5)===date.slice(5);
  return false;
 }).sort((a,b)=>(a.time||'00:00').localeCompare(b.time||'00:00'));
}
function personalEventLabel(e){return (e.time||'10:00')+' '+e.title}
function personalRepeatLabel(e){return ({weekly:'매주 반복',monthly:'매월 반복',yearly:'매년 반복'})[e.repeat]||'반복 없음'}
function personalEventRow(e,occurrenceDate){
 const type=PERSONAL_TYPES[e.type]||PERSONAL_TYPES.custom;
 return '<button type="button" class="personal-list-row" data-edit-personal="'+esc(e.id)+'" data-occurrence-date="'+esc(occurrenceDate||e.date)+'">'+
 '<span class="personal-color-pin" style="background:'+type.color+'"></span>'+
 '<span class="personal-list-copy"><strong>'+esc(e.title)+'</strong><small>'+
 esc(occurrenceDate||e.date)+' · '+personalRepeatLabel(e)+' · '+esc(e.time||'10:00')+'</small></span><span>›</span></button>';
}
function personalCalendarMenu(){
 const items=(store.personalEvents||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);
 return '<div class="personal-cal-menu"><div class="personal-menu-help">예약과 별도로 개인 일정·할 일·생일을 달력에 기록합니다.</div>'+
 '<button class="personal-add" type="button" data-add-personal="'+selected+'">＋ 개인 일정 등록</button>'+
 '<div class="personal-menu-list">'+(items.length?items.map(personalEventRow).join(''):'<p class="personal-empty">등록된 개인 일정이 없습니다.</p>')+'</div></div>';
}
function openPersonalEditor(id,date){
 const existing=(store.personalEvents||[]).find(e=>e.id===id);
 const state={date:existing?.date||date||selected,time:existing?.time||'10:00',repeat:existing?.repeat||'none'};
 const occurrenceDate=existing&&date&&date>=existing.date?date:existing?.date||date||selected;
 const dlg=document.createElement('div');dlg.className='personal-editor-backdrop';
 const type=existing?.type||'schedule';
 const list=Object.entries(PERSONAL_TYPES).map(([k,v])=>'<option value="'+k+'"'+(k===type?' selected':'')+'>'+v.label+'</option>').join('');
 const repeatText={none:'반복 없음',weekly:'매주 반복',monthly:'매월 반복',yearly:'매년 반복'};
 dlg.innerHTML='<section class="personal-editor-dialog" role="dialog" aria-modal="true" aria-label="개인 일정 작성">'+
 '<div class="personal-editor-head"><h3>'+(existing?'개인 일정 수정':'개인 일정 등록')+'</h3><button type="button" data-personal-close aria-label="닫기">×</button></div>'+
 '<label>일정 유형<select id="personalType">'+list+'</select></label>'+
 '<label>제목<input id="personalTitle" maxlength="80" placeholder="일정 제목 입력" value="'+esc(existing?.title||'')+'"></label>'+
 '<div class="personal-editor-two"><div class="personal-field"><span>날짜</span><button type="button" class="personal-wheel-trigger" data-personal-wheel="date" id="personalDateDisplay"></button></div>'+
 '<div class="personal-field"><span>시작 시간</span><button type="button" class="personal-wheel-trigger" data-personal-wheel="time" id="personalTimeDisplay"></button></div></div>'+
 '<div class="personal-field"><span>반복 일정</span><button type="button" class="personal-wheel-trigger" data-personal-wheel="repeat" id="personalRepeatDisplay"></button></div>'+
 '<div class="personal-editor-actions">'+(existing?'<button type="button" class="personal-delete">삭제</button>':'')+
 '<button type="button" class="personal-cancel">취소</button><button type="button" class="personal-save">저장</button></div></section>';
 document.body.appendChild(dlg);
 const prevOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const close=()=>{document.querySelector('.personal-wheel-backdrop')?.remove();dlg.remove();document.body.style.overflow=prevOverflow};
 const refresh=()=>{
  dlg.querySelector('#personalDateDisplay').textContent=state.date.replace(/-/g,'. ') + '.';
  const hh=Number(state.time.slice(0,2)),mm=state.time.slice(3);
  dlg.querySelector('#personalTimeDisplay').textContent=(hh<12?'오전 ':'오후 ')+String(hh%12||12).padStart(2,'0')+':'+mm;
  dlg.querySelector('#personalRepeatDisplay').textContent=repeatText[state.repeat]||repeatText.none;
 };
 refresh();
 const typeControl=dlg.querySelector('#personalType');
 typeControl.onchange=()=>{if(typeControl.value==='birthday'&&!existing&&state.repeat==='none'){state.repeat='yearly';refresh()}};
 const openWheel=mode=>{
  document.querySelector('.personal-wheel-backdrop')?.remove();
  const sheet=document.createElement('div');
  sheet.className='personal-wheel-backdrop';
  const daysIn=(y,m)=>new Date(y,m,0).getDate();
  const ymd=state.date.split('-').map(Number);
  const hhmm=state.time.split(':').map(Number);
  let chosen=mode==='date'?[ymd[0],ymd[1],ymd[2]]:mode==='time'?[hhmm[0]<12?0:1,hhmm[0]%12||12,hhmm[1]]:[state.repeat];
  const makeRange=(first,last)=>Array.from({length:last-first+1},(_,i)=>i+first);
  const definitions=mode==='date'?[
   {values:makeRange(1900,2100),label:v=>v+'년'},
   {values:makeRange(1,12),label:v=>v+'월'},
   {values:makeRange(1,daysIn(chosen[0],chosen[1])),label:v=>v+'일'}
  ]:mode==='time'?[
   {values:[0,1],label:v=>v?'오후':'오전'},
   {values:makeRange(1,12),label:v=>v+'시'},
   {values:makeRange(0,59),label:v=>String(v).padStart(2,'0')+'분'}
  ]:[{values:['none','weekly','monthly','yearly'],label:v=>repeatText[v]}];
  const wheelHTML=(def,i)=>'<div class="personal-wheel-column" data-wheel-index="'+i+'" role="listbox" aria-label="'+['년','월','일'][i]+'">'+
   '<div class="personal-wheel-spacer"></div>'+def.values.map(v=>'<div class="personal-wheel-option" data-wheel-value="'+v+'" role="option">'+esc(def.label(v))+'</div>').join('')+
   '<div class="personal-wheel-spacer"></div></div>';
  sheet.innerHTML='<section class="personal-wheel-panel" role="dialog" aria-modal="true" aria-label="휠 선택">'+
   '<div class="personal-wheel-bar"><button type="button" data-wheel-cancel>취소</button><strong>'+(mode==='date'?'날짜':mode==='time'?'시작 시간':'반복 일정')+'</strong><button type="button" data-wheel-done>완료</button></div>'+
   '<div class="personal-wheel-columns">'+definitions.map(wheelHTML).join('')+'</div></section>';
  document.body.appendChild(sheet);
  const columns=Array.from(sheet.querySelectorAll('.personal-wheel-column'));
  const rowHeight=44;
  const updateVisual=col=>{
   col.querySelectorAll('.personal-wheel-option').forEach((opt,i)=>{
    const active=definitions[Number(col.dataset.wheelIndex)].values[i]===chosen[Number(col.dataset.wheelIndex)];
    opt.classList.toggle('active',active);opt.setAttribute('aria-selected',String(active));
   });
  };
  const scrollToValue=(idx,value,smooth=false)=>{
   const at=definitions[idx].values.indexOf(value),col=columns[idx];
   if(at<0)return;
   col.scrollTo({top:at*rowHeight,behavior:smooth?'smooth':'instant'});
   updateVisual(col);
  };
  const updateDay=()=>{
   if(mode!=='date')return;
   const max=daysIn(chosen[0],chosen[1]);
   const old=definitions[2].values.length;
   if(old===max)return;
   definitions[2].values=makeRange(1,max);
   columns[2].innerHTML='<div class="personal-wheel-spacer"></div>'+
    definitions[2].values.map(v=>'<div class="personal-wheel-option" data-wheel-value="'+v+'" role="option">'+v+'일</div>').join('')+
    '<div class="personal-wheel-spacer"></div>';
   chosen[2]=Math.min(chosen[2],max);
   scrollToValue(2,chosen[2]);
  };
  columns.forEach((col,i)=>{
   scrollToValue(i,chosen[i]);
   let raf=0;
   col.addEventListener('scroll',()=>{
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
     raf=0;
     const index=Math.max(0,Math.min(definitions[i].values.length-1,Math.round(col.scrollTop/rowHeight)));
     chosen[i]=definitions[i].values[index];
     updateVisual(col);
     if(mode==='date'&&i<2)updateDay();
    });
   },{passive:true});
   col.addEventListener('click',e=>{
    const option=e.target.closest('[data-wheel-value]');
    if(!option)return;
    const idx=Array.from(col.querySelectorAll('.personal-wheel-option')).indexOf(option);
    if(idx<0)return;
    chosen[i]=definitions[i].values[idx];
    scrollToValue(i,chosen[i],true);
    if(mode==='date'&&i<2)updateDay();
   });
  });
  const dismiss=()=>sheet.remove();
  sheet.querySelector('[data-wheel-cancel]').onclick=dismiss;
  sheet.onclick=e=>{if(e.target===sheet)dismiss()};
  sheet.querySelector('[data-wheel-done]').onclick=()=>{
   // Read physical wheel position again so finishing mid-swipe still picks the centered value.
   columns.forEach((col,i)=>{
    const idx=Math.max(0,Math.min(definitions[i].values.length-1,Math.round(col.scrollTop/rowHeight)));
    chosen[i]=definitions[i].values[idx];
   });
   if(mode==='date'){
    chosen[2]=Math.min(chosen[2],daysIn(chosen[0],chosen[1]));
    state.date=[chosen[0],chosen[1],chosen[2]].map((v,i)=>i?String(v).padStart(2,'0'):v).join('-');
   }else if(mode==='time'){
    const h=(chosen[1]%12)+(chosen[0]?12:0);
    state.time=String(h).padStart(2,'0')+':'+String(chosen[2]).padStart(2,'0');
   }else state.repeat=chosen[0];
   refresh();dismiss();
  };
 };
 dlg.querySelectorAll('[data-personal-wheel]').forEach(b=>b.onclick=()=>openWheel(b.dataset.personalWheel));
 dlg.querySelector('[data-personal-close]').onclick=close;dlg.querySelector('.personal-cancel').onclick=close;
 dlg.onclick=e=>{if(e.target===dlg)close()};
 dlg.querySelector('.personal-save').onclick=()=>{
  const title=dlg.querySelector('#personalTitle').value.trim();
  const eventDate=state.date;
  if(!title){alert('일정 제목을 입력해 주세요.');return}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)){alert('날짜를 선택해 주세요.');return}
  const event={id:existing?.id||uid(),title,type:typeControl.value,date:eventDate,time:state.time,repeat:state.repeat};
  if(existing&&Array.isArray(existing.excludedDates))event.excludedDates=existing.excludedDates.slice();
  const before=JSON.stringify(store);
  try{
   if(existing){const idx=store.personalEvents.findIndex(x=>x.id===existing.id);if(idx<0)throw Error('not found');store.personalEvents[idx]=event}
   else store.personalEvents.push(event);
   save();
  }catch(err){store=JSON.parse(before);alert('일정 저장 실패. 다시 시도해 주세요.');return}
  close();panel=null;selected=eventDate;cursor=dateOf(selected);render();notify('개인 일정 저장 완료');
 };
 if(existing)dlg.querySelector('.personal-delete').onclick=()=>{
  if(document.querySelector('.personal-delete-choice'))return;
  const remove=(justOne)=>{
   const before=JSON.stringify(store);
   try{
    const idx=store.personalEvents.findIndex(e=>e.id===existing.id);
    if(idx<0)throw Error('일정 없음');
    if(justOne){
     const current=store.personalEvents[idx];
     current.excludedDates=Array.from(new Set([...(current.excludedDates||[]),occurrenceDate])).sort();
    }else store.personalEvents.splice(idx,1);
    save();
   }catch(err){store=JSON.parse(before);alert('삭제에 실패했습니다. 다시 시도해 주세요.');return}
   close();panel=null;render();notify(justOne?'선택한 날짜의 일정 삭제 완료':'반복 일정 전체 삭제 완료');
  };
  if(existing.repeat==='none'||!existing.repeat){
   if(confirm('이 개인 일정을 삭제할까요?'))remove(false);
   return;
  }
  const choice=document.createElement('div');
  choice.className='personal-delete-choice';
  choice.innerHTML='<section class="personal-delete-panel" role="dialog" aria-modal="true" aria-label="반복 일정 삭제 범위 선택">'+
   '<h3>반복 일정 삭제</h3><p>'+esc(occurrenceDate)+' 일정은 어떻게 삭제할까요?</p>'+
   '<button type="button" class="personal-delete-once">이 일정만 삭제</button>'+
   '<button type="button" class="personal-delete-all">전체 반복 일정 삭제</button>'+
   '<button type="button" class="personal-delete-abort">취소</button></section>';
  document.body.appendChild(choice);
  const dismiss=()=>choice.remove();
  choice.querySelector('.personal-delete-abort').onclick=dismiss;
  choice.onclick=e=>{if(e.target===choice)dismiss()};
  choice.querySelector('.personal-delete-once').onclick=()=>{dismiss();remove(true)};
  choice.querySelector('.personal-delete-all').onclick=()=>{dismiss();remove(false)};
 };
}
function serviceNames(b){return (b.items||[]).map(i=>i.name).join(' · ')||'시술 미선택'}
function clientName(b){return findClient(b.clientId)?.name||b.name||'고객'}
function dateTitle(d){const x=dateOf(d);return `${x.getMonth()+1}월 ${x.getDate()}일 ${w[x.getDay()]}요일`}
const ICON_MARKUP=["<svg viewbox=\"0 0 28 28\"><rect height=\"19\" rx=\"3\" width=\"21\" x=\"3.5\" y=\"5.5\"></rect><path d=\"M8.5 3.5v5m11-5v5M4 11h20M8 15h.01M14 15h.01M20 15h.01M8 19h.01M14 19h.01M20 19h.01\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><rect height=\"21\" rx=\"3\" width=\"18\" x=\"5\" y=\"3.5\"></rect><path d=\"M9 8h10M9 13h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"M23.2 10.5A10 10 0 1 0 23 18M20.2 5.5l3.5 5 2-5.8\"></path><text fill=\"currentColor\" font-family=\"Arial,sans-serif\" font-size=\"16\" font-weight=\"700\" stroke=\"none\" text-anchor=\"middle\" x=\"13.5\" y=\"19\">$</text></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"m11.7 3.8.5-1h3.6l.5 1 1.7.9 1.1-.2 2.5 2.5-.2 1.1.9 1.7 1 .5v3.6l-1 .5-.9 1.7.2 1.1-2.5 2.5-1.1-.2-1.7.9-.5 1h-3.6l-.5-1-1.7-.9-1.1.2-2.5-2.5.2-1.1-.9-1.7-1-.5v-3.6l1-.5.9-1.7-.2-1.1 2.5-2.5 1.1.2z\"></path><circle cx=\"14\" cy=\"12.1\" r=\"3.5\"></circle></svg>"];
function nav(activeDark){const icons=ICON_MARKUP;return `<nav class="nav ${activeDark?'dark':''}">${['calendar','booking','sales','settings'].map((t,i)=>`<button aria-label="${['달력','시술 등록','매출','설정'][i]}" class="${tab===t?'active':''}" data-tab="${t}"><span class="nav-icon">${icons[i]}</span></button>`).join('')}</nav>`}
function render(){const dark=tab==='calendar';root.className=dark?'calendar-root':'light';root.innerHTML=(SNAIL_TEST_MODE?'<div class="snail-dev-indicator">TEST · 실사용 데이터 분리</div>':'')+(tab==='calendar'?calendarPage():tab==='booking'?bookingPage():tab==='sales'?salesPage():settingsPage())+(tab==='calendar'?'<button class="fab" data-new="1" aria-label="예약 추가">+</button>':'');let bottomNav=document.querySelector('body > nav.nav');if(!bottomNav){bottomNav=document.createElement('nav');document.body.appendChild(bottomNav)}bottomNav.className='nav'+(dark?' dark':'');bottomNav.innerHTML=['calendar','booking','sales','settings'].map((t,i)=>`<button aria-label="${['달력','시술 등록','매출','설정'][i]}" class="${tab===t?'active':''}" data-tab="${t}"><span class="nav-icon">${ICON_MARKUP[i]}</span></button>`).join('');bind();if(typeof setTimeout==='function')setTimeout(()=>{checkPendingPassFirstUse();checkEndReminders()},180);}
function heading(){const anchor=view==='month'?`${cursor.getFullYear()}년 ${cursor.getMonth()+1}월`:view==='week'?`${shift(weekStart(selected),0).slice(5).replace('-','/')} – ${shift(weekStart(selected),6).slice(5).replace('-','/')}`:dateTitle(selected);return `<div class="heading-nav"><button data-move="-1" aria-label="이전">‹</button><strong>${anchor}</strong><button data-move="1" aria-label="다음">›</button></div>`}
function weekStart(d){const day=dateOf(d).getDay();return shift(d,-((day+6)%7))}
function calendarPage(){let html=`<div class="wrap"><div class="calendar-top"><button class="round-dark" data-panel="menu" aria-label="개인 일정 관리">≡</button><button class="round-dark" data-panel="search" aria-label="검색">⌕</button></div><div class="segment dark">${['month','week','day'].map((v,i)=>`<button data-view="${v}" class="${view===v?'active':''}">${['월간','주간','일간'][i]}</button>`).join('')}</div>${heading()}`;if(view==='month')html+=monthGrid();else html+=timeGrid();if(panel==='search')html+=`<div class="calendar-popup-backdrop" data-close-calendar-popup="1"><section class="calendar-popup" role="dialog" aria-modal="true" aria-label="예약 검색"><div class="calendar-popup-title"><h3>예약 검색</h3><button type="button" data-close-calendar-popup="1" aria-label="닫기">×</button></div><input id="calSearch" class="search" placeholder="고객 이름 검색" value="${esc(search)}"><div id="searchResults">${searchResults()}</div></section></div>`;if(panel==='menu')html+=`<div class="calendar-popup-backdrop" data-close-calendar-popup="1"><section class="calendar-popup calendar-menu-popup" role="dialog" aria-modal="true" aria-label="개인 일정 관리"><div class="calendar-popup-title"><h3>개인 일정 관리</h3><button type="button" data-close-calendar-popup="1" aria-label="닫기">×</button></div>${personalCalendarMenu()}</section></div>`;if(panel==='appointments')html+=`<div class="appointment-backdrop" data-close-appointments="1"><section class="appointment-modal" role="dialog" aria-modal="true" aria-label="${dateTitle(selected)} 예약 상세"><button class="modal-close" data-close-appointments="1" aria-label="닫기">×</button>${dayDetail(selected)}</section></div>`;return html+'</div>'}

/* Date labels are informational. Only Korea's published 2026/2027 calendars
   include movable lunar holidays and their officially announced substitute dates. */
const KOREA_HOLIDAYS={
 2026:{
 '01-01':'신정','02-16':'설날 연휴','02-17':'설날','02-18':'설날 연휴',
 '03-01':'삼일절','03-02':'대체공휴일(삼일절)','05-01':'노동절','05-05':'어린이날',
 '05-24':'부처님오신날','05-25':'대체공휴일(부처님오신날)','06-03':'지방선거일',
 '06-06':'현충일','07-17':'제헌절','08-15':'광복절','08-17':'대체공휴일(광복절)',
 '09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴',
 '10-03':'개천절','10-05':'대체공휴일(개천절)','10-09':'한글날','12-25':'성탄절'
 },
 2027:{
 '01-01':'신정','02-06':'설날 연휴','02-07':'설날','02-08':'설날 연휴','02-09':'대체공휴일(설날)',
 '03-01':'삼일절','05-01':'노동절','05-03':'대체공휴일(노동절)','05-05':'어린이날','05-13':'부처님오신날',
 '06-06':'현충일','07-17':'제헌절','07-19':'대체공휴일(제헌절)',
 '08-15':'광복절','08-16':'대체공휴일(광복절)',
 '09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴',
 '10-03':'개천절','10-04':'대체공휴일(개천절)','10-09':'한글날',
 '10-11':'대체공휴일(한글날)','12-25':'성탄절','12-27':'대체공휴일(성탄절)'
 }
};
const KOREA_FIXED_HOLIDAYS={
 '01-01':'신정','03-01':'삼일절','05-01':'노동절','05-05':'어린이날','06-06':'현충일',
 '07-17':'제헌절','08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절'
};
const INTERNATIONAL_OBSERVANCES={
 '02-14':'발렌타인데이','03-08':'세계 여성의 날','04-22':'지구의 날',
 '10-24':'유엔의 날','10-31':'할로윈','12-24':'크리스마스 이브'
};
function calendarObservances(date){
 const year=Number(date.slice(0,4)),md=date.slice(5);
 const korean=(KOREA_HOLIDAYS[year]||KOREA_FIXED_HOLIDAYS)[md];
 const global=INTERNATIONAL_OBSERVANCES[md];
 const result=[];
 if(korean)result.push({name:korean,kind:'kr',official:Boolean(KOREA_HOLIDAYS[year]),note:KOREA_HOLIDAYS[year]?'한국 공휴일':'한국 고정 공휴일 · 이동 공휴일 미확인'});
 if(global)result.push({name:global,kind:'world',official:false,note:'세계 기념일 · 휴무일 아님'});
 return result;
}
function calendarObservanceMarkup(date,detail=false){
 const labels=calendarObservances(date);
 if(!labels.length)return '';
 return labels.map(x=>'<div class="'+(detail?'observance-detail':'observance-mini')+' '+(x.kind==='kr'?'observance-kr':'observance-world')+'" title="'+esc(x.note)+'">'+esc(x.name)+'</div>').join('');
}
function monthGrid(){const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);const offset=(first.getDay()+6)%7;const count=Math.ceil((offset+new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate())/7)*7;const start=new Date(first);start.setDate(1-offset);let html='<div class="weeknames">'+['월','화','수','목','금','토','일'].map(v=>`<span>${v}</span>`).join('')+'</div><div class="month-grid">';for(let i=0;i<count;i++){let d=new Date(start);d.setDate(d.getDate()+i);let s=localDate(d),list=visibleBookings(s),out=d.getMonth()!==cursor.getMonth(),observances=calendarObservances(s);html+=`<div class="month-cell ${s===selected?'sel':''}" data-date="${s}"><span class="day-num ${out?'outside':''} ${d.getDay()===0?'sun':''} ${observances.some(x=>x.kind==='kr')?'holiday-red':''} ${s===localDate(new Date())?'today':''}">${d.getDate()}</span>${calendarObservanceMarkup(s)}${list.length?`<div class="day-count">${list.length}명</div>`:''}${list.slice(0,2).map(b=>`<div class="mini-book">${esc(b.start)}</div>`).join('')}${list.length>2?`<div class="plus-count">+${list.length-2}</div>`:''}${personalEventsOn(s).slice(0,2).map(e=>`<div class="mini-personal" style="border-color:${PERSONAL_TYPES[e.type]?.color||'#b394fa'}">${esc(e.title)}</div>`).join('')}</div>`}html+='</div>';return html}
function dayDetail(d){let bs=visibleBookings(d);return `<div class="detail"><h3>${dateTitle(d)} 예약 · ${bs.length}명</h3>${calendarObservanceMarkup(d,true)}${bs.length?bs.map(b=>`<button class="detail-row" data-edit="${b.id}"><span class="time-col">${b.start}–${b.end}</span><span><b>${esc(clientName(b))}</b><div class="sub">${esc(serviceNames(b))} · ${b.status==='paid'?'완료':b.status==='done'?'시술 완료 · 미정산':b.status==='noshow'?'노쇼':'예약'}</div></span><span style="margin-left:auto">›</span></button>`).join(''):'<div class="empty">예약 없음</div>'}<h3 class="personal-detail-title">개인 일정 · ${personalEventsOn(d).length}건</h3>${personalEventsOn(d).map(e=>personalEventRow(e,d)).join('')}<button type="button" class="personal-add" data-add-personal="${d}">＋ 이 날짜에 일정 추가</button></div>`}
function timeGrid(){
 const isWeek=view==='week',start=isWeek?weekStart(selected):selected;
 const days=isWeek?Array.from({length:7},(_,i)=>shift(start,i)):[selected];
 const first=0,last=24,unit=isWeek?96:80;
 const head=isWeek?'<div class="week-days-viewport"><div class="week-days">'+days.map(d=>'<button class="week-day '+(selected===d?'active':'')+'" data-date="'+d+'">'+w[dateOf(d).getDay()]+'<strong class="'+(calendarObservances(d).some(x=>x.kind==='kr')?'holiday-red':'')+'">'+dateOf(d).getDate()+'</strong><small>'+visibleBookings(d).length+'명</small></button>').join('')+'</div></div>':
 '<div class="day-head-summary">'+visibleBookings(selected).length+'명 예약 · 개인 일정 '+personalEventsOn(selected).length+'건</div>'+calendarObservanceMarkup(selected,true);
 const labels=Array.from({length:last-first+1},(_,i)=>'<div class="hour-lab">'+String(first+i).padStart(2,'0')+'</div>').join('');
 const cols=days.map(d=>'<div class="week-column">'+visibleBookings(d).map(b=>{
  const top=Math.max(0,(mins(b.start)-first*60)/60*unit);
  const startText=b.start.endsWith(':00')?String(Number(b.start.slice(0,2))):b.start;
  return '<button type="button" class="event '+(isWeek?'week-event':'day-event')+(b.status==='paid'?' paid':'')+
   '" data-edit="'+b.id+'" style="top:'+top+'px">'+
   '<span class="event-heading"><strong class="event-time">'+esc(startText)+'</strong> <strong class="event-client">'+esc(clientName(b))+'</strong> <span class="event-service">'+esc(serviceNames(b))+'</span></span></button>';
 }).join('')+personalEventsOn(d).map(e=>{const type=PERSONAL_TYPES[e.type]||PERSONAL_TYPES.custom;const start=e.time||'10:00';const top=(mins(start)-first*60)/60*unit;return '<button type="button" class="event personal-event" data-edit-personal="'+esc(e.id)+'" data-occurrence-date="'+esc(d)+'" style="top:'+top+'px;border-left-color:'+type.color+'"><strong>'+esc(start)+'</strong> '+esc(e.title)+'</button>'}).join('')+'</div>').join('');
 return head+'<div class="calendar-grid-wrap '+(isWeek?'week-schedule':'day-schedule')+'" style="--schedule-unit:'+unit+'px">'+
 '<div class="hour-labels">'+labels+'</div>'+
 '<div class="schedule-area" style="height:'+(last-first)*unit+'px">'+
 '<div class="week-columns '+(isWeek?'':'single-day')+'">'+cols+'</div></div></div>';
}
function searchResults(){const s=search.trim();if(!s)return '<div class="sub">고객 이름으로 예약 검색</div>';let hits=store.bookings.filter(b=>clientName(b).includes(s)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);return hits.map(b=>`<button class="detail-row" data-edit="${b.id}"><span>${b.date} ${b.start} · ${esc(clientName(b))}</span></button>`).join('')||'<div class="empty">결과 없음</div>'}

/* Membership deposits are stored per customer; only paid booking use reduces credit. */
function walletLedger(client){
 const deposits=Array.isArray(client.walletDeposits)?client.walletDeposits:[];
 const received=deposits.reduce((sum,x)=>sum+Math.max(0,Number(x.creditedAmount??x.amount)||0),0);
 const uses=store.bookings.filter(b=>b.clientId===client.id&&b.status==='paid'&&Number(b.memberUse)>0);
 const spent=uses.reduce((sum,b)=>sum+Number(b.memberUse||0),0);
 return {deposits,received,uses,spent,balance:received-spent};
}

const KOREAN_INITIALS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initialsOf(str){return Array.from(str).map(ch=>{const code=ch.charCodeAt(0)-0xAC00;return code>=0&&code<11172?KOREAN_INITIALS[Math.floor(code/588)]:ch}).join('')}
function clientMatches(value){
 const q=value.trim().replace(/\s/g,'').toLowerCase();if(!q)return [];
 return store.clients.filter(c=>{
   const name=c.name.replace(/\s/g,'').toLowerCase();
   return name.includes(q)||initialsOf(name).includes(q);
 }).slice(0,7);
}
function setupClientAutocomplete(){
 const input=root.querySelector('#name'),phone=root.querySelector('#phone'),list=root.querySelector('#clientSuggestions');
 if(!input||!phone||!list)return;
 let selectedClientId=null;
 function choose(client){
   selectedClientId=client.id;
   input.value=client.name;
   phone.value=client.phone;
   list.hidden=true;list.innerHTML='';
   refreshMemberCard();
 }
 function update(){
   const q=input.value.trim();
   const options=clientMatches(q);
   list.innerHTML='';
   if(!q||!options.length){list.hidden=true;return}
   options.forEach(c=>{
     const item=document.createElement('button');
     item.type='button';item.className='client-suggestion';
     const name=document.createElement('span');name.textContent=c.name;
     const number=document.createElement('small');number.textContent=c.phone;
     item.append(name,number);
     item.addEventListener('click',()=>choose(c));
     list.append(item);
   });
   list.hidden=false;
 }
 input.addEventListener('input',()=>{
   if(selectedClientId&&store.clients.find(c=>c.id===selectedClientId)?.name!==input.value){
     selectedClientId=null;phone.value='';
   }
   update();refreshMemberCard();
 });
 input.addEventListener('focus',update);
 input.addEventListener('compositionend',update);
 phone.addEventListener('input',refreshMemberCard);
 // Avoid reopening an autocomplete when the exact existing name is already selected.
 document.addEventListener('click',function closeSuggestions(e){
   if(!list.isConnected){document.removeEventListener('click',closeSuggestions);return}
   if(!e.target.closest('.client-autocomplete'))list.hidden=true;
 });
}
function bookingClient(){
 const name=(root.querySelector('#name')?.value||'').trim();
 const phone=(root.querySelector('#phone')?.value||'').trim();
 if(!name)return null;
 const matches=store.clients.filter(c=>c.name===name&&(!phone||c.phone===phone));
 return matches.length===1?matches[0]:null;
}
function memberCard(client,booked){
 const w=walletLedger(client);
 if(w.received<=0)return '';
 const own=booked&&booked.clientId===client.id&&booked.status==='paid'?Number(booked.memberUse||0):0;
 const available=Math.max(0,w.balance+own);
 const percent=Math.max(0,Math.min(100,Math.round(100*w.balance/w.received)));
 const deposits=w.deposits.map(x=>({date:x.date||'',name:'회원권 충전',amount:Number(x.creditedAmount??x.amount??0)}));
 const usage=w.uses.map(x=>({date:x.date||'',name:serviceNames(x),amount:-Number(x.memberUse||0)}));
 const recent=[...deposits,...usage].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,3);
 const selected=booked&&booked.clientId===client.id?Number(booked.memberUse||0):0;
 let entries=recent.map(x=>'<div class="row member-history-item"><span><small>'+esc(x.date)+'</small> '+esc(x.name)+'</span><strong>'+(x.amount>0?'+':'')+money(x.amount)+'</strong></div>').join('');
 return '<div class="card member-section"><div class="row"><b>회원권</b><span class="member-chip">이용 중</span></div>'+
 '<div class="member-balance"><div class="muted">현재 회원권 잔액</div><div class="member-total">'+money(w.balance)+'</div>'+
 '<div class="member-track"><div class="member-bar" style="width:'+percent+'%"></div></div>'+
 '<div class="row member-sums"><span>사용 '+money(w.spent)+'</span><span>충전 '+money(w.received)+'</span></div></div>'+
 '<p class="note">시술 완료 시 회원권 잔액에서 자동 차감합니다.</p>'+ 
 '<div class="member-history"><b>최근 이용 내역</b>'+entries+'</div></div>';
}
function browPassCard(client){
 const pass=browPassLedger(client);
 if(pass.bought<=0)return '';
 const history=pass.history.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
 return '<div class="card brow-pass-card"><div class="row"><b>눈썹펌 5회권</b><span class="member-chip">'+(pass.balance?'이용 중':'모두 사용')+'</span></div>'+
 '<div class="brow-pass-counts"><span>구매 <b>'+pass.bought+'회</b></span><span>사용 <b class="brow-pass-red">'+pass.used+'회</b></span><span>잔여 <b class="brow-pass-blue">'+pass.balance+'회</b></span></div>'+
 '<div class="brow-pass-dots">'+Array.from({length:Math.min(pass.bought,15)},(_,i)=>'<span class="'+(i<pass.used?'used':'unused')+'">'+(i<pass.used?'✓':Math.min(pass.bought,15)-i)+'</span>').join('')+'</div>'+
 '<p class="note">예약만 등록하면 차감되지 않습니다. 시술 완료 시 1회 자동 차감합니다.</p>'+
 '<details class="brow-pass-history"><summary>사용·구매 기록 확인 ▾</summary>'+
 history.map(b=>'<div class="row"><span>'+esc(b.date)+' · '+(specialKind(b.items)==='buy'?(b.passFirstUse?'5회권 구매 · 첫 1회 사용':'5회권 구매'):'눈썹펌 사용')+'</span><b class="'+(specialKind(b.items)==='buy'?'brow-pass-blue':'brow-pass-red')+'">'+(specialKind(b.items)==='buy'?(b.passFirstUse?'+5 / −1':'+5'):'−1')+'회</b></div>').join('')+'</details></div>';
}
function refreshMemberCard(){
 const host=root.querySelector('#membershipMount');if(!host)return;
 const current=bookingClient(),booking=editing?store.bookings.find(x=>x.id===editing):null;
 const id=current?.id||'';
 if(host.dataset.clientId!==id){
  host.innerHTML=current?memberCard(current,booking)+browPassCard(current):'';
  host.dataset.clientId=id;
 }
 updateBookingPayControls();
}
function updateBookingPayControls(){
 const block=root.querySelector('.payment-method-block');if(!block)return;
 const current=bookingClient();
 const hasMembership=current&&walletLedger(current).received>0;
 block.hidden=!!hasMembership&&!checkedServices.includes(BROW_PASS_BUY);
 const note=block.querySelector('.payment-note');
 if(note&&checkedServices.includes(BROW_PASS_BUY))note.textContent='눈썹펌 5회권은 현금 190,000원 · 카드 200,000원입니다. 시술 완료 시 확정됩니다.';
 else if(note&&!hasMembership)note.textContent='회원권이 없는 고객은 결제 수단을 선택하세요.';
}
function bookingAmountNow(){
 return Math.max(0,checkedServices.reduce((n,id)=>n+Number(store.services.find(s=>s.id===id)?.price||0),0)+extras.reduce((n,e)=>n+Number(e.amount||0),0));
}
function previewExtraBill(){
 const label=root.querySelector('#bookingTotal'),bill=root.querySelector('#extraBill');
 if(!label||!bill)return;
 extras=extras.map((e,i)=>{
  const name=root.querySelector('[data-extra-name="'+i+'"]')?.value||'';
  const amount=Math.abs(Number(root.querySelector('[data-extra-amount="'+i+'"]')?.value)||0);
  const kind=e.kind==='minus'||(e.kind!=='plus'&&Number(e.amount)<0)?'minus':'plus';
  return {name,amount:kind==='minus'?-amount:amount,kind};
 });
 bill.innerHTML=extras.map((e,i)=>'<div class="extras-bill-row"><span>'+(e.kind==='minus'?'−':'＋')+' '+esc(e.name||'항목 '+(i+1))+'</span><b class="'+e.kind+'">'+(e.kind==='minus'?'−':'＋')+money(Math.abs(e.amount))+'</b></div>').join('');
 label.textContent=money(bookingAmountNow()+(checkedServices.includes(BROW_PASS_BUY)&&root.querySelector('#payCard')?.checked?10000:0));
}

const TREATMENT_CATEGORIES=['네일','페디','얼굴왁싱','바디왁싱','특별 케어'];
const BROW_PASS_BUY='snail-browpass-buy',BROW_PASS_USE='snail-browpass-use';
function specialKind(items){const ids=(items||[]).map(i=>i.id);return ids.includes(BROW_PASS_BUY)?'buy':ids.includes(BROW_PASS_USE)?'use':null}
function passPrice(method){return method==='card'?200000:190000}
function normalDue(items,extras=[]){return Math.max(0,(items||[]).reduce((n,x)=>n+Number(x.price||0),0)+(extras||[]).reduce((n,x)=>n+Number(x.amount||0),0)-(specialKind(items)==='buy'?190000:0))}
function passReceipt(b){return b.status==='paid'&&specialKind(b.items)==='buy'?Number(b.passPurchaseAmount||passPrice(b.passPaymentMethod)):0}

function browPassLedger(client){
 const records=store.bookings.filter(b=>b.clientId===client.id&&b.status==='paid');
 const bought=records.filter(b=>specialKind(b.items)==='buy').length*5;
 const used=records.filter(b=>specialKind(b.items)==='use').length+records.filter(b=>specialKind(b.items)==='buy'&&b.passFirstUse===true).length;
 return {bought,used,balance:Math.max(0,bought-used),history:records.filter(b=>specialKind(b.items))};
}
function ensureSpecialCatalog(){
 if(store.catalogSeedVersion>=3)return;
 const male=store.services.find(s=>s.id==='menu-m-nail-care')||store.services.find(s=>s.gender==='M'&&s.category==='네일'&&s.name==='케어'&&Number(s.price)===30000);
 if(male&&male.name==='케어')male.name='맨즈 케어';
 if(!male&&!store.services.some(s=>s.gender==='M'&&s.category==='네일'&&s.name==='맨즈 케어'))
  store.services.push({id:'menu-m-nail-care',name:'맨즈 케어',gender:'M',category:'네일',price:30000,minutes:60});
 for(const gender of ['W','M']){
  if(!store.services.some(s=>s.gender===gender&&s.category==='네일'&&s.name==='풀글리터'))
   store.services.push({id:'menu-'+gender.toLowerCase()+'-nail-glitter',name:'풀글리터',gender,category:'네일',price:55000,minutes:60});
 }
 for(const item of [{id:BROW_PASS_BUY,name:'눈썹펌 5회권 구매',price:190000,minutes:0},
                    {id:BROW_PASS_USE,name:'눈썹펌 5회권 사용',price:0,minutes:60}]){
  if(!store.services.some(s=>s.id===item.id))store.services.push({...item,gender:'W',category:'특별 케어'});
 }
 store.catalogSeedVersion=3;save();
}

function serviceGender(s){return s.gender==='M'?'M':'W'}
function serviceCategory(s){
 if(TREATMENT_CATEGORIES.includes(s.category))return s.category;
 return '네일'; // Legacy services remain usable without altering their prices or booking IDs.
}
function seedStructuredServices(){
 // Source: user's photographed SNAIL price menus; W/M prices are stored separately.
 // Duration was not provided in the menu: keep an editable provisional 60 minutes.
 if(store.catalogSeedVersion>=2)return;
 const entries=[];
 const add=(gender,category,name,price,id)=>{
  entries.push({id:'menu-'+id,gender,category,name,price,minutes:60});
 };
 const both=(category,name,price,id)=>{add('W',category,name,price,'w-'+id);add('M',category,name,price,'m-'+id)};
 add('W','네일','케어',20000,'w-nail-care');
 add('M','네일','케어',30000,'m-nail-care');
 both('네일','젤컬러+케어',40000,'nail-gel');
 both('네일','풀글리터',55000,'nail-glitter');
 both('네일','프렌치/그라데이션',65000,'nail-french');
 add('W','페디','케어',30000,'w-pedi-care');
 add('M','페디','케어',40000,'m-pedi-care');
 both('페디','젤컬러+케어',50000,'pedi-gel');
 both('페디','프렌치/그라데이션',75000,'pedi-french');
 add('W','페디','스페셜 스파(각질케어)',100000,'w-pedi-spa');
 add('M','페디','스페셜 스파(각질케어)',120000,'m-pedi-spa');
 for(const [id,name,price] of [
  ['brow','디자인 눈썹',25000],['philtrum','인중',20000],
  ['cheek','볼',30000],['chin','턱',20000],['nape','뒷목',35000],
  ['forehead','이마',20000],['hairline','헤어라인',45000],
  ['browlift','브로우리프트',35000],['lash','케라틴 속눈썹펌',40000]
 ])both('얼굴왁싱',name,price,'face-'+id);
 add('M','얼굴왁싱','수염 일부',50000,'m-face-beardpart');
 add('M','얼굴왁싱','수염 전체',100000,'m-face-beardall');
 add('W','얼굴왁싱','풀페이스',120000,'w-face-full');
 add('M','얼굴왁싱','풀페이스',150000,'m-face-full');
 for(const [id,name,price] of [
  ['handsfeet','손/발',10000],['halfarm','팔 하프',35000],
  ['fullarm','팔 전체',70000],['halfleg','다리 하프',45000],
  ['fullleg','다리 전체',80000],['underarm','겨드랑이',20000]
 ])both('바디왁싱',name,price,'body-'+id);
 add('W','바디왁싱','비키니',45000,'w-body-bikini');
 add('W','바디왁싱','딥비키니',55000,'w-body-deepbikini');
 for(const [id,name,wPrice,mPrice] of [
  ['chest','가슴',25000,35000],['bellyline','배렛나루',10000,20000],
  ['abdomen','복부',30000,40000],['back','등',40000,50000]
 ]){
  add('W','바디왁싱',name,wPrice,'w-body-'+id);
  add('M','바디왁싱',name,mPrice,'m-body-'+id);
 }
 // Preserve custom services, historical IDs and changes to the four preexisting catalog entries.
 const existing=store.services;
 for(const item of entries){
  if(existing.some(s=>s.id===item.id||s.gender===item.gender&&s.category===item.category&&s.name===item.name))continue;
  if(item.category==='네일'&&['케어','젤컬러+케어'].includes(item.name)&&existing.some(s=>
   s.gender===item.gender&&s.category==='네일'&&s.name===item.name))continue;
  existing.push(item);
 }
 store.catalogSeedVersion=2;
 save();
}
seedStructuredServices();
ensureSpecialCatalog();
repairFutureCompletedBookings();
function chooseTreatmentGroup(gender,category){
 captureForm();
 if(treatmentGender===gender&&treatmentCategory===category)treatmentCategory=null;
 else{treatmentGender=gender;treatmentCategory=category}
 render();restoreForm();
}
function bookingPage(){if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return simplePanel('Google 캘린더 연동','앱 완성 후 실제 사용자가 설치한 기기에서 연동할 예정입니다. 현재 버전은 캘린더 연동 기능을 실행하지 않습니다.');const b=editing?store.bookings.find(x=>x.id===editing):null;let client=b?findClient(b.clientId):null;let local=editing?b:null;let selections=checkedServices.map(id=>store.services.find(x=>x.id===id)).filter(Boolean),total=selections.reduce((a,s)=>a+Number(s.price),0)+extras.reduce((a,e)=>a+Number(e.amount),0);let markup=`<div class="wrap"><h2 class="form-title">${b?'시술 예약 수정':'시술 예약 등록'} <small class="app-version-label">v1.0.11</small></h2><div class="card"><div class="field"><label>고객 이름</label><div class="client-autocomplete"><input id="name" autocomplete="off" placeholder="고객 이름 또는 초성 입력" value="${esc(client?.name||local?.name||'')}"><div id="clientSuggestions" class="client-suggestions" hidden></div></div></div><div class="field"><label>연락처</label><input id="phone" inputmode="tel" placeholder="010-0000-0000" value="${esc(client?.phone||local?.phone||'')}"></div><div class="field"><label>예약 날짜</label><input id="date" type="date" value="${esc(local?.date||selected)}"></div><div class="field"><label>예약 시간</label><input id="start" type="time" value="${esc(local?.start||store.settings.open)}"></div><div class="field"><label>임시 예약 시간</label><select id="bookingDuration">${[30,60,90,120,150,180].map(m=>'<option value="'+m+'" '+(m===(Number(local?.provisionalMinutes)||90)?'selected':'')+'>'+m+'분</option>').join('')}</select></div></div><div class="card booking-status-card"><div class="field"><label>예약 상태</label><select id="status"><option value="reserved" ${!local||local.status==='reserved'?'selected':''}>예약</option>${local?.status==='paid'?'<option value="paid" selected>시술 완료 · 정산됨</option>':''}${local?.status==='done'?'<option value="done" selected>시술 완료 · 정산 전</option>':''}<option value="cancelled" ${local?.status==='cancelled'?'selected':''}>예약 취소</option><option value="noshow" ${local?.status==='noshow'?'selected':''}>노쇼</option></select></div></div><p class="note booking-optional-hint">시술을 미리 알고 있으면 아래를 펼쳐 선택하세요. 몰라도 예약할 수 있습니다.</p><details id="bookingCompletion" class="booking-completion-accordion" ${bookingDetailsOpen?'open':''}><summary><strong>시술 완료·결제</strong><span>선택 입력 · 펼치기 ⌄</span></summary><div class="booking-completion-inner"><div class="card booking-actual-time"><div class="field"><label>실제 종료 시간</label><input id="end" type="time" value="${esc(local?.end||hour(Math.min(mins(local?.start||store.settings.open)+(selections.reduce((n,s)=>n+Number(s.minutes||0),0)||Number(local?.provisionalMinutes)||90),1439)))}"></div><p class="note">시술을 선택하면 예상 종료 시간이 자동 계산됩니다. 실제 종료 시간으로 직접 수정할 수 있어요.</p></div><div id="membershipMount"></div><div class="card"><div class="row"><b>시술 내역</b><span class="muted">복수 선택 가능</span></div><div class="treatment-catalog"><div class="treatment-genders">${[['W','여자 (W)'],['M','남자 (M)']].map(([g,label])=>`<button type="button" class="treatment-gender ${treatmentGender===g?'active':''}" data-treatment-gender="${g}">${label}<span>${treatmentGender===g?'⌃':'⌄'}</span></button>`).join('')}</div>${treatmentGender?`<div class="treatment-category-list">${TREATMENT_CATEGORIES.filter(cat=>treatmentGender==='W'||cat!=='특별 케어').map(cat=>`<button type="button" class="treatment-category ${treatmentCategory===cat?'active':''}" data-treatment-category="${cat}"><span>${cat}</span><span>›</span></button>`).join('')}</div>`:''}</div><div class="selected-treatments">${selections.map(s=>`<div class="selected-treatment"><span>${esc(s.name)}</span><button type="button" data-treatment-remove="${s.id}" aria-label="선택 해제">×</button></div>`).join('')||'<div class="muted">선택된 시술이 없습니다.</div>'}</div><div class="row" style="margin-top:13px"><span class="muted">선택 시술 예상 시간</span><b>${selections.reduce((a,s)=>a+Number(s.minutes),0)}분</b></div></div><div class="card"><div class="row extras-header"><b>그 외 추가 비용·할인</b><span class="extras-add-actions"><button type="button" class="extras-plus" data-add-extra="plus" aria-label="추가 비용">＋</button><button type="button" class="extras-minus" data-add-extra="minus" aria-label="할인">−</button></span></div>${extras.map((e,i)=>`<div class="field extras-editor-row"><span class="extras-kind ${Number(e.amount)<0||e.kind==='minus'?'minus':'plus'}">${Number(e.amount)<0||e.kind==='minus'?'−':'＋'}</span><input aria-label="추가 항목 이름" data-extra-name="${i}" placeholder="${Number(e.amount)<0||e.kind==='minus'?'할인 항목':'추가 비용 항목'}" value="${esc(e.name)}"><input aria-label="금액" data-extra-amount="${i}" type="number" inputmode="numeric" min="0" value="${Math.abs(Number(e.amount)||0)}"><button class="danger" data-remove-extra="${i}">×</button></div>`).join('')}<div class="extras-bill" id="extraBill">${extras.map((e,i)=>`<div class="extras-bill-row"><span>${Number(e.amount)<0||e.kind==='minus'?'−':'＋'} ${esc(e.name||'항목 '+(i+1))}</span><b class="${Number(e.amount)<0||e.kind==='minus'?'minus':'plus'}">${Number(e.amount)<0||e.kind==='minus'?'−':'＋'}${money(Math.abs(Number(e.amount)||0))}</b></div>`).join('')}</div><div class="row" style="margin-top:15px"><b>예상 결제 금액 · 예약 시 미반영</b><b id="bookingTotal" style="font-size:22px;color:#087aff">${money(total+(b?.passPaymentMethod==="card"&&specialKind(selections)==="buy"?10000:0))}</b></div></div><div class="card"><div class="payment-method-block"><b>결제 방법</b><div class="payment-switch-row"><label class="payment-switch-option"><span>카드</span><input type="checkbox" id="payCard" ${local?.paymentMethod==='card'?'checked':''}><span class="payment-switch-track" aria-hidden="true"></span></label><label class="payment-switch-option"><span>현금</span><input type="checkbox" id="payCash" ${local?.paymentMethod==='cash'?'checked':''}><span class="payment-switch-track" aria-hidden="true"></span></label></div><p class="payment-note">처음에는 둘 다 꺼져 있습니다. 완료 시 결제 방법을 선택하세요.</p></div><div class="field"><label>고객 메모</label><textarea id="memo" placeholder="시술 및 고객 특이사항">${esc(local?.memo||'')}</textarea></div></div><button type="button" class="primary booking-finish-button" data-complete-booking="1">시술 완료 및 정산 저장</button></div></details><button class="primary booking-reserve-button" data-save-booking="1">${b?'예약 수정 저장':'예약 저장'}</button>${b?`<button class="danger" style="width:100%" data-delete-booking="${b.id}">예약 삭제</button><button class="ghost" style="width:100%;margin-top:10px" data-new="1">새 예약 등록</button>`:''}<p class="note">예약을 저장해도 매출과 회원권 잔액은 바뀌지 않습니다. 시술 완료 시 위 영역에서 정산하세요.</p></div>`;
 return markup;
}

/* Cash receipts: deposits count on their deposit date; prepaid redemption is not a new receipt. */
function receiptMethod(method){return method==='cash'?'cash':method==='card'?'card':'unknown'}
function bookingReceipt(b){return b.status==='paid'?Math.max(0,normalDue(b.items,b.extras)-Math.max(0,Number(b.memberUse)||0)):0}
function cashEntries(begin,end){
 const records=[];
 for(const c of store.clients){
  for(const d of (Array.isArray(c.walletDeposits)?c.walletDeposits:[])){
   if(d.date>=begin&&d.date<=end&&Number(d.amount)>0)
    records.push({id:d.id,date:d.date,name:c.name,service:'회원권 충전',amount:Number(d.amount),method:receiptMethod(d.paymentMethod),kind:'deposit',clientId:c.id});
  }
 }
 for(const b of store.bookings){
  if(b.status!=='paid')continue;
  const amount=bookingReceipt(b),date=b.paymentDate||b.date;
  const passAmount=passReceipt(b);
  if(passAmount>0&&date>=begin&&date<=end)records.push({id:b.id,date,name:clientName(b),service:'눈썹펌 5회권 구매',amount:passAmount,method:receiptMethod(b.passPaymentMethod),kind:'booking',clientId:b.clientId});
  if(amount>0&&date>=begin&&date<=end)
   records.push({id:b.id,date,name:clientName(b),service:serviceNames({...b,items:(b.items||[]).filter(i=>i.id!==BROW_PASS_BUY)}),amount,method:receiptMethod(b.paymentMethod),kind:'booking',clientId:b.clientId});
 }
 return records;
}

function sumFor(b){return priceFor(b)}

let salesPopupPeriod='month';
function salesRange(period){
 const date=selected,current=cursor;
 if(period==='week'){
  const begin=weekStart(date),end=shift(begin,6);
  return {begin,end,title:begin.slice(5).replace('-','/')+' ~ '+end.slice(5).replace('-','/')};
 }
 if(period==='year'){
  const year=current.getFullYear();
  return {begin:year+'-01-01',end:year+'-12-31',title:year+'년'};
 }
 const year=current.getFullYear(),month=current.getMonth()+1;
 return {begin:year+'-'+String(month).padStart(2,'0')+'-01',
 end:localDate(new Date(year,month,0)),title:year+'년 '+month+'월'};
}
function salesPeriodCard(period,label){
 const {begin,end,title}=salesRange(period),entries=cashEntries(begin,end);
 const total=entries.reduce((n,x)=>n+x.amount,0);
 const cash=entries.filter(x=>x.method==='cash').reduce((n,x)=>n+x.amount,0);
 const card=entries.filter(x=>x.method==='card').reduce((n,x)=>n+x.amount,0);
 const unknown=total-cash-card;
 const performed=store.bookings.filter(b=>b.status==='paid'&&b.date>=begin&&b.date<=end);
 const serviceTotal=performed.reduce((n,b)=>n+normalDue(b.items,b.extras),0);
 const memberSpent=performed.reduce((n,b)=>n+Number(b.memberUse||0),0);
 const memberEntries=performed.filter(b=>Number(b.memberUse)>0).map(b=>({id:b.id,date:b.date,name:clientName(b),service:serviceNames(b),amount:Number(b.memberUse),method:'member',kind:'member-use',clientId:b.clientId}));
 const displayEntries=entries.concat(memberEntries);
 const groups={};displayEntries.forEach(x=>{(groups[x.clientId||x.name||'unknown']??=[]).push(x)});
 const customerHtml=Object.entries(groups).sort((a,b)=>{
  const paidSum=rows=>rows.filter(r=>r.kind!=='member-use').reduce((n,r)=>n+r.amount,0);
  return paidSum(b[1])-paidSum(a[1]);
 }).map(([id,rows])=>{
  const receipts=rows.filter(r=>r.kind!=='member-use'),used=rows.filter(r=>r.kind==='member-use');
  const received=receipts.reduce((n,r)=>n+r.amount,0),spent=used.reduce((n,r)=>n+r.amount,0);
  const displayName=esc(findClient(id)?.name||rows[0].name||'고객');
  const headerName=receipts.length
   ?'<span class="receipt-color-blue">'+displayName+'</span>'+(used.length?'<span class="receipt-color-red receipt-header-member-tag"> · 회원권 사용</span>':'')
   :'<span class="receipt-color-red">'+displayName+'</span>';
  const totals=(receipts.length?'<span class="receipt-color-blue">'+money(received)+'</span>':'')+
   (used.length?'<span class="receipt-color-red">'+(receipts.length?' / ':'')+'−'+money(spent)+'</span>':'');
  return '<details class="accordion receipt-customer"><summary><span>'+headerName+'</span><span class="receipt-header-totals">'+totals+' · '+rows.length+'건 ⌄</span></summary>'+
   rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{
    const member=r.kind==='member-use',kindLabel=member?'회원권 사용':r.method==='card'?'카드':r.method==='cash'?'현금':'결제 수단 미확인';
    return '<div class="receipt-swipe '+(member?'receipt-member-use':'receipt-new-payment')+'" data-receipt-kind="'+r.kind+'" data-receipt-id="'+esc(r.id)+'" data-receipt-client="'+esc(r.clientId)+'">'+
     '<button type="button" class="receipt-swipe-delete" data-delete-receipt="1" aria-label="내역 삭제">삭제</button>'+
     '<div class="receipt-swipe-content"><button type="button" class="receipt-swipe-main" data-edit-receipt="1">'+
     '<span><span class="receipt-row-name">'+displayName+'</span><span class="receipt-row-date">'+esc(r.date)+'</span><span class="sub">'+esc(r.service)+' · '+kindLabel+'</span></span>'+
     '<b>'+(member?'−':'')+money(r.amount)+'</b></button></div></div>';
   }).join('')+'</details>';
 }).join('')||'<div class="empty">해당 기간 수령·회원권 사용 기록이 없습니다.</div>';
 return '<div class="sales-popup-period">'+
 '<div class="sales-popup-period-title">'+label+'</div>'+
 '<div class="sales-accordion-body">'+
 '<div class="sales-range-nav"><span>조회 기간</span><div class="sales-range-controls">'+
 '<button type="button" data-sales-move="-1" data-sales-scope="'+period+'" aria-label="이전 기간">‹</button><strong>'+title+'</strong>'+
 '<button type="button" data-sales-move="1" data-sales-scope="'+period+'" aria-label="다음 기간">›</button></div></div>'+
 '<div class="sales-overview"><span class="muted">실제 수령액</span><div class="stat">'+money(total)+'</div>'+
 '<div class="receipts-split"><div><small>현금</small><strong>'+money(cash)+'</strong></div><div><small>카드</small><strong>'+money(card)+'</strong></div></div>'+
 (unknown?'<p class="receipts-unknown">결제 수단 미확인 '+money(unknown)+' · 이전 기록 확인 필요</p>':'')+'</div>'+
 '<details class="sales-performance"><summary>완료한 시술 · '+performed.length+'건 <span>⌄</span></summary>'+
 '<div class="sales-performance-info"><div><span>시술 실적</span><b>'+money(serviceTotal)+'</b></div>'+
 '<div><span>회원권 사용액</span><b class="receipt-color-red">'+money(memberSpent)+'</b></div></div></details>'+
 '<details class="sales-customers"><summary>고객별 수령·사용 내역 · '+displayEntries.length+'건 <span aria-hidden="true">⌄</span></summary>'+
 '<div class="sales-customers-body">'+customerHtml+'</div></details>'+
 '</div></div>';
}
function salesPage(){
 const period=salesPopupPeriod||'month';
 const buttons=[['week','주간'],['month','월간'],['year','연간']].map(([key,label])=>
 '<button type="button" class="sales-period-button '+(period===key?'active':'')+'" data-sales-open="'+key+'" aria-pressed="'+(period===key?'true':'false')+'">'+label+'</button>').join('');
 const label={week:'주간 매출',month:'월간 매출',year:'연간 매출'};
 return '<div class="wrap sales-popup-page sales-inline-page"><div class="sales-period-bar">'+buttons+'</div>'+
 '<div class="sales-inline-content">'+salesPeriodCard(period,label[period])+'</div></div>';
}

function deleteReceipt(kind,id,clientId){
 if(kind==='deposit'){
  const client=findClient(clientId);
  const deposits=client?.walletDeposits;
  const record=deposits?.find(d=>String(d.id)===String(id));
  if(!record)return;
  const amount=Number(record.creditedAmount??record.amount)||0;
  const ledger=walletLedger(client);
  if(ledger.balance-amount<0){alert('이 충전액은 이미 회원권 시술에 사용되어 삭제할 수 없습니다. 사용 내역부터 확인해 주세요.');return}
  if(!confirm(client.name+'님의 회원권 충전 '+money(amount)+'을 삭제할까요?\n충전 기록과 수령액이 삭제되며 회원권 잔액도 줄어듭니다.'))return;
  client.walletDeposits=deposits.filter(d=>String(d.id)!==String(id));
 }else if(kind==='booking'||kind==='member-use'){
  const b=store.bookings.find(b=>String(b.id)===String(id));
  if(!b)return;
  if(!confirm(clientName(b)+'님의 '+b.date+' 시술 예약 전체를 삭제할까요?\n수령 내역뿐 아니라 예약·시술 기록도 삭제됩니다.'))return;
  store.bookings=store.bookings.filter(x=>String(x.id)!==String(id));
 }else return;
 save();render();notify('수령 내역 삭제 완료');
}
function openReceipt(kind,id,clientId){
 if(kind==='booking'||kind==='member-use'){
  const b=store.bookings.find(b=>String(b.id)===String(id));
  if(!b)return;
  editing=b.id;checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);
  tab='booking';panel=null;render();
 }else if(kind==='deposit'){
  const client=findClient(clientId),d=client?.walletDeposits?.find(x=>String(x.id)===String(id));
  if(!d)return;
  alert('회원권 충전 기록은 현재 수정 기능이 없습니다. 잘못 충전한 내역은 왼쪽으로 밀어 삭제할 수 있습니다. 단, 이미 사용한 충전액은 보호됩니다.');
 }
}
/* Keep an expanded customer row fully in view inside the modal, not behind its footer. */
function bindSalesPopupScroll(){
 const area=root.querySelector('.sales-popup-scroll');
 if(!area)return;
 const popup=root.querySelector('.sales-popup-panel');
 const rows=[...area.querySelectorAll('.receipt-customer')];
 function alignExpanded(row){
  if(!row.open||!row.isConnected)return;
  const viewport=area.getBoundingClientRect(),rect=row.getBoundingClientRect();
  const space=area.clientHeight-20;
  let delta=0;
  if(rect.height<=space){
   if(rect.bottom>viewport.bottom-12)delta=rect.bottom-(viewport.bottom-12);
   else if(rect.top<viewport.top+8)delta=rect.top-(viewport.top+8);
  }else{
   // A long receipt stays scrollable; place its title at the top first.
   delta=rect.top-(viewport.top+8);
  }
  if(Math.abs(delta)>2)area.scrollTo({top:Math.max(0,area.scrollTop+delta),behavior:'smooth'});
 }
 rows.forEach(row=>row.addEventListener('toggle',()=>{
  if(!row.open)return;
  // Browser applies details layout asynchronously on iOS Safari.
  requestAnimationFrame(()=>requestAnimationFrame(()=>alignExpanded(row)));
 }));
 // When treatment performance expands, keep the section header in view too.
 area.querySelectorAll('.sales-performance').forEach(section=>section.addEventListener('toggle',()=>{
  if(!section.open)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const rect=section.getBoundingClientRect(),view=area.getBoundingClientRect();
   if(rect.bottom>view.bottom-12){
    const delta=rect.height<area.clientHeight-20?rect.bottom-(view.bottom-12):rect.top-(view.top+8);
    area.scrollTo({top:Math.max(0,area.scrollTop+delta),behavior:'smooth'});
   }
  }));
 }));
 // Preserve scroll inside the popup; avoid scrolling the underlying page.
 if(popup)popup.addEventListener('touchmove',e=>{
  if(!e.target.closest('.sales-popup-scroll'))e.preventDefault();
 },{passive:false});
}
function bindReceiptSwipes(){
 const rows=[...root.querySelectorAll('.receipt-swipe')];
 let opened=null;
 rows.forEach(row=>{
  const content=row.querySelector('.receipt-swipe-content'),main=row.querySelector('[data-edit-receipt]'),remove=row.querySelector('[data-delete-receipt]');
  const kind=row.dataset.receiptKind,id=row.dataset.receiptId,clientId=row.dataset.receiptClient;
  let startX=0,startY=0,startOffset=0,tracking=false,axis=null,suppressClick=false;
  function setOpen(on){row.classList.toggle('is-open',on);if(on){if(opened&&opened!==row)opened.classList.remove('is-open');opened=row}else if(opened===row)opened=null}
  row.addEventListener('touchstart',e=>{
   if(e.target.closest('[data-delete-receipt]'))return;
   const t=e.touches[0];startX=t.clientX;startY=t.clientY;
   startOffset=row.classList.contains('is-open')?-88:0;tracking=true;axis=null;suppressClick=false;
  },{passive:true});
  row.addEventListener('touchmove',e=>{
   if(!tracking)return;
   const t=e.touches[0],dx=t.clientX-startX,dy=t.clientY-startY;
   if(!axis&&Math.max(Math.abs(dx),Math.abs(dy))>8)axis=Math.abs(dx)>Math.abs(dy)*1.3?'horizontal':'vertical';
   if(axis!=='horizontal')return;
   e.preventDefault();suppressClick=true;
   const translate=Math.max(-88,Math.min(0,startOffset+dx));
   content.style.transform='translateX('+translate+'px)';
  },{passive:false});
  row.addEventListener('touchend',e=>{
   if(!tracking)return;tracking=false;
   if(axis==='horizontal'){
    const t=e.changedTouches[0],dx=t.clientX-startX;
    const offset=Math.max(-88,Math.min(0,startOffset+dx));
    content.style.transform='';
    setOpen(offset < -44);
    setTimeout(()=>{suppressClick=false},350);
   }
  },{passive:true});
  row.addEventListener('touchcancel',()=>{tracking=false;content.style.transform=''}, {passive:true});
  main.addEventListener('click',e=>{
   if(suppressClick){e.preventDefault();return}
   if(row.classList.contains('is-open')){setOpen(false);return}
   openReceipt(kind,id,clientId);
  });
  remove.addEventListener('click',()=>deleteReceipt(kind,id,clientId));
 });
}
function googleSettingsPage(){
 const savedId=localStorage.getItem('snailbook_google_client_id')||'';
 const connected=!!googleAccessToken&&Date.now()<googleExpiresAt;
 return '<div class="wrap google-setup">'+panelHead('Google 캘린더 연동')+
 '<div class="card google-setup-card"><h3>Google 계정 연결</h3>'+
 '<p class="note">실사용자 아이폰에서 본인의 Google 계정으로 연결하세요. 개발용 아이폰에서는 연결할 필요가 없습니다.</p>'+
 '<label class="google-label" for="googleClientId">Google OAuth 웹 클라이언트 ID</label>'+
 '<input id="googleClientId" class="google-id-input" inputmode="url" autocomplete="off" spellcheck="false" placeholder="000000-xxx.apps.googleusercontent.com" value="'+esc(savedId)+'">'+
 '<button type="button" class="google-subtle-btn" data-google-save>클라이언트 ID 저장</button>'+
 '<div class="google-status">'+(connected?'연결 상태: 승인됨 (이번 실행에서만 유효)':'연결 상태: Google 로그인 필요')+'</div>'+
 '<button type="button" class="primary" data-google-connect>Google 계정 연결</button>'+
 '<p class="note">Google 로그인 화면이 열리지 않으면 홈 화면 앱 대신 Safari에서 같은 앱 주소를 열어 연결하세요.</p></div>'+
 '<div class="card google-setup-card"><h3>예약 → Google 캘린더</h3>'+
 '<p class="note">본 앱에서 Google로 내보내는 단방향 동기화입니다. 고객 이름·전화번호·메모·금액은 보내지 않고 시술 예약 시간만 표시합니다.</p>'+
 '<p class="note">등록·수정된 예약은 생성 또는 변경하고, 취소·노쇼·삭제한 예약의 기존 Google 일정은 정리합니다. 자동 동기화는 아직 적용하지 않았습니다.</p>'+
 '<button type="button" class="primary" data-google-sync '+(!connected||googleBusy?'disabled':'')+'>'+(googleBusy?'동기화 중…':'예약 수동 동기화')+'</button>'+
 '<p class="note">연결 및 동기화는 사용자가 직접 눌러야 합니다. Google에 이미 있는 개인 일정은 건드리지 않습니다.</p></div></div>';
}
let googleAccessToken=null,googleExpiresAt=0,googleBusy=false;
const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
function googleSaveClientId(){
 const id=root.querySelector('#googleClientId')?.value.trim()||'';
 if(!/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)){
  alert('Google Cloud에서 발급받은 웹 애플리케이션 OAuth 클라이언트 ID를 입력하세요.');return;
 }
 const prev=localStorage.getItem('snailbook_google_client_id')||'';
 if(prev&&prev!==id&&!confirm('다른 Google OAuth 클라이언트 ID로 바꾸시겠습니까? 기존 Google 일정 연결 관계는 유지됩니다.'))return;
 localStorage.setItem('snailbook_google_client_id',id);
 googleAccessToken=null;googleExpiresAt=0;
 render();notify('Google 클라이언트 ID 저장 완료');
}
function googleConnect(){
 const id=localStorage.getItem('snailbook_google_client_id')||'';
 if(!id){alert('먼저 Google OAuth 클라이언트 ID를 저장하세요.');return}
 if(!window.google?.accounts?.oauth2){alert('Google 인증 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 Safari에서 다시 시도하세요.');return}
 try{
  const client=window.google.accounts.oauth2.initTokenClient({
   client_id:id,
   scope:GOOGLE_SCOPE,
   callback:(response)=>{
    if(!response||response.error||!response.access_token||
      !window.google.accounts.oauth2.hasGrantedAllScopes(response,GOOGLE_SCOPE)){
      alert('Google 캘린더 접근 권한을 승인하지 않았습니다.');return;
    }
    googleAccessToken=response.access_token;
    googleExpiresAt=Date.now()+Math.max(60,Number(response.expires_in||3600)-120)*1000;
    render();notify('Google 연결 완료');
   },
   error_callback:(e)=>{if(e?.type!=='popup_closed')alert('Google 계정 연결에 실패했습니다. Safari에서 다시 시도하세요.')}
  });
  client.requestAccessToken();
 }catch(e){alert('Google 연결을 시작할 수 없습니다. Safari에서 확인하세요.')}
}
async function googleCalendarRequest(method,eventId,body){
 if(!googleAccessToken||Date.now()>=googleExpiresAt)throw Error('접근 권한이 만료되었습니다. 다시 Google 계정 연결을 눌러 주세요.');
 const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
 const url=eventId?base+'/'+encodeURIComponent(eventId):base;
 const resp=await fetch(url,{
  method,headers:{'Authorization':'Bearer '+googleAccessToken,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(resp.status===401){googleAccessToken=null;googleExpiresAt=0}
 if(!resp.ok){const err=new Error('Google API 오류 ('+resp.status+')');err.status=resp.status;throw err}
 return resp.status===204?null:resp.json();
}
function googleEventFingerprint(b){return JSON.stringify([b.date,b.start,b.end,b.status])}
function googleEventPayload(b){
 const date=/^\d{4}-\d{2}-\d{2}$/.test(b.date)?b.date:null;
 if(!date||!/^\d{2}:\d{2}$/.test(b.start)||!/^\d{2}:\d{2}$/.test(b.end))return null;
 return {
  summary:'S’NAIL BOOK · 시술 예약',
  description:'S’NAIL BOOK에서 등록한 예약입니다. 고객 개인정보는 포함하지 않습니다.',
  start:{dateTime:date+'T'+b.start+':00+09:00',timeZone:'Asia/Seoul'},
  end:{dateTime:date+'T'+b.end+':00+09:00',timeZone:'Asia/Seoul'},
  extendedProperties:{private:{snailBookBookingId:String(b.id)}}
 };
}
async function googleSyncBookings(){
 if(googleBusy)return;
 if(!googleAccessToken||Date.now()>=googleExpiresAt){alert('Google 계정을 다시 연결하세요.');return}
 const current=(store.bookings||[]).filter(b=>b.status!=='cancelled'&&b.status!=='noshow');
 const tracked=(store.googleSyncEvents&&typeof store.googleSyncEvents==='object')?store.googleSyncEvents:{};
 const obsolete=Object.keys(tracked).filter(id=>!current.some(b=>String(b.id)===id));
 if(!confirm('예약 '+current.length+'건을 Google 캘린더에 동기화할까요?'+(obsolete.length?'\n취소·삭제된 예약 '+obsolete.length+'건의 앱 생성 Google 일정도 제거됩니다.':'')+'\n고객 이름·연락처·금액·메모는 전송하지 않습니다.'))return;
 googleBusy=true;render();
 let created=0,updated=0,removed=0,unchanged=0,failed=0;
 try{
  store.googleSyncEvents=tracked;
  for(const b of current){
   const payload=googleEventPayload(b),id=String(b.id),fingerprint=googleEventFingerprint(b),old=tracked[id];
   if(!payload){failed++;continue}
   if(old&&old.fingerprint===fingerprint){unchanged++;continue}
   try{
    let response;
    if(old?.eventId){
     try{response=await googleCalendarRequest('PUT',old.eventId,payload);updated++}
     catch(e){if(e.status!==404)throw e;response=await googleCalendarRequest('POST',null,payload);created++}
    }else{response=await googleCalendarRequest('POST',null,payload);created++}
    if(response?.id){tracked[id]={eventId:response.id,fingerprint};save()}
   }catch(e){failed++;if(e.status===401)throw e}
  }
  for(const id of obsolete){
   const eventId=tracked[id]?.eventId;
   try{
    if(eventId){try{await googleCalendarRequest('DELETE',eventId);removed++}catch(e){if(e.status!==404)throw e}}
    delete tracked[id];save();
   }catch(e){failed++;if(e.status===401)throw e}
  }
  notify('Google 동기화 완료');
  alert('동기화 결과\n새 등록 '+created+'건 · 수정 '+updated+'건 · 삭제 '+removed+'건\n변경 없음 '+unchanged+'건 · 실패 '+failed+'건');
 }catch(e){alert('동기화 중단: '+e.message+'\n완료된 일정은 보존되었습니다. 다시 연결 후 재시도할 수 있습니다.')}
 finally{googleBusy=false;render()}
}


/* v1.0.4 Family-only 2-device cloud mode. No server writes until explicitly enabled. */
const CLOUD_URL='https://jiqcdbandxletnqpdkaj.supabase.co';
const CLOUD_KEY="sb_publishable_IYFrIGO5hYnucIHprJQEGQ_bae42Jl7";
const CLOUD_ENABLED_KEY=SNAIL_TEST_MODE?'snailbook_test_cloud_enabled_v1':'snailbook_family_cloud_enabled_v1';
const CLOUD_PENDING_KEY=SNAIL_TEST_MODE?'snailbook_test_unsent_changes_v1':'snailbook_family_unsent_changes_v1';
const CLOUD_TABLE=SNAIL_TEST_MODE?'snail_shop_test_state':'snail_shop_state';
const CLOUD_SYNC_RPC=SNAIL_TEST_MODE?'snail_replace_test_state':'snail_replace_state';
let cloudClient=null,cloudUser=null,cloudEnabled=localStorage.getItem(CLOUD_ENABLED_KEY)==='yes';
let cloudRevision=0,cloudBusy=false,cloudConflict=false,cloudDirty=false,cloudTimer=null,cloudPolling=null,cloudMessage='연결 확인 중';
function cloudStatus(){return !cloudUser?'로그인 전':cloudConflict?'수정 충돌 · 백업 후 서버 자료 확인':!cloudEnabled?'로그인됨 · 공유 시작 전':cloudBusy?'서버 저장 중':cloudDirty?'저장 대기 중':cloudMessage}
function cloudClientReady(){
 if(!cloudClient&&window.supabase?.createClient){
  cloudClient=window.supabase.createClient(CLOUD_URL,CLOUD_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
 }
 return cloudClient;
}
function cloudSafeSnapshot(state){const out=clone(state);delete out.googleSyncEvents;return out}
function cloudAdopt(state,revision){
 if(!state||!Array.isArray(state.bookings)||!Array.isArray(state.clients)||!Array.isArray(state.services))throw Error('서버 데이터 형식을 확인할 수 없습니다.');
 // Account-local Google event IDs are intentionally not copied to a different device.
 const localGoogle=store.googleSyncEvents;
 store={...clone(base),...clone(state),settings:{...base.settings,...state.settings}};
 if(localGoogle)store.googleSyncEvents=localGoogle;
 localStorage.setItem(KEY,JSON.stringify(store));
 cloudRevision=Number(revision)||1;cloudDirty=false;cloudConflict=false;localStorage.removeItem(CLOUD_PENDING_KEY);cloudMessage='동기화 완료';render();
}
async function cloudFetchRow(){
 if(!cloudClientReady()||!cloudUser)throw Error('로그인이 필요합니다.');
 const {data,error}=await cloudClient.from(CLOUD_TABLE).select('state,revision').eq('owner_id',cloudUser.id).maybeSingle();
 if(error)throw error;return data;
}
function cloudScheduleSave(){
 if(!cloudEnabled||!cloudUser||cloudConflict)return;
 cloudDirty=true;localStorage.setItem(CLOUD_PENDING_KEY,'yes');cloudMessage='저장 대기 중';
 clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,450);
}
async function cloudFlush(){
 if(!cloudEnabled||!cloudUser||!cloudDirty||cloudBusy||cloudConflict||!cloudRevision)return;
 cloudBusy=true;
 const snapshot=cloudSafeSnapshot(store);
 const revision=cloudRevision;
 try{
  const {data,error}=await cloudClient.rpc(CLOUD_SYNC_RPC,{expected_revision:revision,next_state:snapshot});
  if(error)throw error;
  if(!Number(data)){cloudConflict=true;cloudMessage='다른 폰에서 먼저 수정함';alert('두 아이폰의 수정이 충돌했습니다.\n이 폰의 변경 사항은 로컬에 남아 있습니다.\n백업 후 설정 → 두 아이폰 공유에서 확인해 주세요.');return;}
  cloudRevision=Number(data);cloudDirty=JSON.stringify(cloudSafeSnapshot(store))!==JSON.stringify(snapshot);
  cloudMessage=cloudDirty?'추가 변경 저장 대기':'서버 저장 완료';
  if(!cloudDirty)localStorage.removeItem(CLOUD_PENDING_KEY);
 }catch(e){cloudDirty=true;cloudMessage='인터넷 연결 또는 서버 저장 오류';}
 finally{
  cloudBusy=false;
  if(cloudDirty&&!cloudConflict&&navigator.onLine){
   clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudFlush,2500);
  }
 }
}
async function cloudCheckRemote(){
 if(!cloudEnabled||!cloudUser||cloudBusy||cloudDirty||cloudConflict||document.hidden||!cloudRevision)return;
 // Do not replace an in-progress booking or settings form with a remote render.
 if(tab==='booking'||panel!==null)return;
 try{
  const remote=await cloudFetchRow();
  if(remote&&Number(remote.revision)>cloudRevision)cloudAdopt(remote.state,remote.revision);
 }catch(e){cloudMessage='서버 확인 실패 · 인터넷 점검';}
}
async function cloudBootstrap(){
 if(!cloudClientReady()){cloudMessage='연결 모듈 로딩 실패';return}
 try{
  const {data,error}=await cloudClient.auth.getUser();
  if(error&&!/session/i.test(error.message||''))throw error;
  cloudUser=data?.user||null;
  if(cloudUser&&cloudEnabled){
   if(localStorage.getItem(CLOUD_PENDING_KEY)==='yes'){
    cloudConflict=true;cloudDirty=true;cloudMessage='전송되지 않은 로컬 변경 보호 중';
    if(tab==='settings')render();
   }else{
    const remote=await cloudFetchRow();
   if(remote){
    if(cloudDirty||localStorage.getItem(CLOUD_PENDING_KEY)==='yes'){
     cloudConflict=true;cloudDirty=true;cloudMessage='서버 확인 중 로컬 수정 감지';
    }else cloudAdopt(remote.state,remote.revision);
   }
   else{cloudEnabled=false;localStorage.removeItem(CLOUD_ENABLED_KEY);cloudMessage='서버 자료가 없습니다. 공유 시작을 선택하세요';}
   }
  }
  if(!cloudPolling)cloudPolling=setInterval(cloudCheckRemote,12000);
  if(tab==='settings')render();
 }catch(e){cloudMessage='로그인 또는 네트워크 확인 필요'}
}
function cloudPanel(){
 const logged=!!cloudUser;
 return '<div class="wrap cloud-panel">'+panelHead('두 아이폰 데이터 공유')+
 '<div class="card cloud-test-tools"><b>개발·테스트 환경</b>'+
 '<p class="note">현재 모드: '+(SNAIL_TEST_MODE?'테스트 서버 (가족의 실제 데이터와 완전 분리)':'실사용 서버')+'</p>'+
 '<button type="button" class="ghost" data-cloud-toggle-test>'+(SNAIL_TEST_MODE?'실사용 모드로 돌아가기':'테스트 모드로 전환')+'</button>'+
 '<p class="note">모드를 바꿔도 기존 데이터는 삭제되지 않습니다. 테스트 모드의 예약·고객·매출 자료는 실사용 모드로 복사되지 않습니다.</p></div>'+
 '<div class="card"><strong>현재 상태: '+esc(cloudStatus())+'</strong>'+
 '<p class="note">가게폰과 개인폰에서 동일한 앱 계정으로 로그인하세요. Supabase 별도 가입은 필요 없습니다.</p>'+
 (logged?'<p class="muted">로그인: '+esc(cloudUser.email||'가족 계정')+'</p>'+
 '<button class="ghost" type="button" data-cloud-logout>로그아웃</button>':
 '<label for="cloudEmail">앱 로그인 이메일</label><input id="cloudEmail" type="email" autocomplete="username" placeholder="이메일">'+
 '<label for="cloudPassword">앱 비밀번호</label><input id="cloudPassword" type="password" autocomplete="current-password" placeholder="비밀번호">'+
 '<button class="primary" type="button" data-cloud-login>로그인</button>'+
 '<p class="note">이 계정은 개발자가 Supabase에서 한 번 만들어 줍니다. 가족이 Supabase 사이트에 가입할 필요는 없습니다.</p>')+
 '</div>'+
 (logged?'<div class="card"><b>최초 공유 설정</b>'+
 '<p class="note">처음 사용하는 가게폰에서는 공유 데이터를 만들고, 두 번째 개인폰에서는 기존 공유 데이터를 가져오세요. 이미 공유 중인 경우 기존 서버 데이터를 우선 사용합니다.</p>'+
 (!cloudEnabled?'<button type="button" class="primary" data-cloud-start>이 폰 자료로 공유 시작</button>'+
 '<button type="button" class="ghost" data-cloud-join>기존 공유 자료 가져오기</button>':
 '<p class="note">동기화가 활성화되어 있습니다. 저장 후 다른 폰에 보이기까지 최대 약 12초 걸릴 수 있습니다.</p>'+
 '<button type="button" class="ghost" data-cloud-check>지금 서버 확인</button>')+
 (cloudConflict?'<p class="note">이 폰과 서버에서 동시에 수정한 기록이 있습니다. 반드시 전체 백업 후 서버 데이터로 돌아가세요.</p><button type="button" class="ghost" data-cloud-resolve>서버 자료 다시 불러오기 (내 미전송 변경 덮어쓰기)</button>':'')+
 '</div>':'')+
 '<div class="card"><b>데이터 보호</b><p class="note">고객·예약·회원권·매출·설정을 공유합니다. 기존 로컬 자료는 최초 연결 전까지 유지됩니다. 중요한 변경 전에는 전체 백업을 권장합니다.</p>'+
 '<button type="button" class="ghost" data-cloud-backup>백업 화면 열기</button></div></div>';
}
async function cloudLogin(){
 const email=root.querySelector('#cloudEmail')?.value.trim(),password=root.querySelector('#cloudPassword')?.value;
 if(!email||!password){alert('앱 계정 이메일과 비밀번호를 입력하세요.');return}
 if(!cloudClientReady()){alert('네트워크 연결을 확인해 주세요.');return}
 const {data,error}=await cloudClient.auth.signInWithPassword({email,password});
 if(error){alert('로그인 실패: '+error.message);return}
 cloudUser=data.user;cloudMessage='로그인됨 · 공유 상태 확인 중';
 await cloudBootstrap();
 render();notify('앱 로그인 완료');
}
async function cloudLogout(){
 if(cloudDirty||cloudBusy||cloudConflict){alert('미전송 변경 사항이 있습니다. 먼저 백업과 동기화 상태를 확인하세요.');return}
 if(!confirm('이 기기에서 로그아웃할까요?'))return;
 await cloudClient?.auth.signOut();
 cloudUser=null;cloudEnabled=false;cloudRevision=0;cloudMessage='로그아웃';localStorage.removeItem(CLOUD_PENDING_KEY);
 localStorage.removeItem(CLOUD_ENABLED_KEY);render();
}
async function cloudStart(){
 if(cloudEnabled||!cloudUser)return;
 const hasData=store.bookings.length||store.clients.length||(store.personalEvents||[]).length;
 const msg='이 기기 자료를 가족 공유 서버의 최초 데이터로 등록합니다.\n'+(hasData?'이 기기에 등록된 자료가 포함됩니다. 실사용 자료인지 확인하세요.':'현재 예약/고객 자료는 없습니다.')+'\n기존 서버 자료가 있으면 절대 덮어쓰지 않습니다. 계속할까요?';
 if(!confirm(msg))return;
 try{
  const remote=await cloudFetchRow();
  if(remote){alert('이미 공유 서버 자료가 있습니다. 기존 공유 자료 가져오기를 사용하세요.');return}
  const {data,error}=await cloudClient.from(CLOUD_TABLE).insert({owner_id:cloudUser.id,state:cloudSafeSnapshot(store),revision:1}).select('revision').single();
  if(error)throw error;
  cloudRevision=Number(data.revision);cloudEnabled=true;cloudDirty=false;localStorage.removeItem(CLOUD_PENDING_KEY);cloudMessage='공유 시작 완료';
  localStorage.setItem(CLOUD_ENABLED_KEY,'yes');render();notify('가족 공유 시작 완료');
 }catch(e){alert('공유 시작 실패: '+e.message+'\n이 폰의 로컬 데이터는 그대로입니다.')}
}
async function cloudJoin(){
 if(!cloudUser||cloudEnabled)return;
 try{
  const remote=await cloudFetchRow();
  if(!remote){alert('공유된 자료가 아직 없습니다. 가게폰에서 먼저 공유 시작을 진행하세요.');return}
  if(!confirm('서버의 가족 공유 자료를 이 폰으로 가져올까요?\n현재 폰에 있던 별도 예약·고객 기록은 대체됩니다.\n필요하면 먼저 전체 백업을 해주세요.'))return;
  cloudAdopt(remote.state,remote.revision);cloudEnabled=true;localStorage.setItem(CLOUD_ENABLED_KEY,'yes');
  cloudMessage='공유 연결 완료';render();notify('가족 공유 연결 완료');
 }catch(e){alert('공유 자료 가져오기 실패: '+e.message)}
}
async function cloudResolve(){
 if(!cloudUser||!cloudConflict)return;
 if(!confirm('이 기기에 저장된 미전송 수정은 서버 자료로 대체됩니다.\n반드시 먼저 JSON 백업을 했나요?'))return;
 const remote=await cloudFetchRow();if(!remote){alert('서버 자료가 없습니다.');return}
 cloudAdopt(remote.state,remote.revision);notify('서버 자료 불러오기 완료');
}

function settingsPage(){if(panel==='cloud')return cloudPanel();if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return googleSettingsPage();if(panel==='reset')return resetPage();const entries=[['cloud','두 아이폰 데이터 공유'],['google','Google 캘린더 연동'],['services','서비스 가격'],['hours','예약 시간 설정'],['client','고객 관리'],['backup','백업 내보내기·가져오기'],['reset','초기화']];return `<div class="wrap">${entries.map(([id,label])=>`<button class="setting-row" data-panel="${id}"><span class="settings-icon icon-${id}" aria-hidden="true"></span><span>${label}</span><span class="arrow">›</span></button>`).join('')}<div class="app-update-line"><span>S’NAIL BOOK v1.0.11</span><button type="button" data-refresh-app="1">업데이트 확인</button></div></div>`}

function resetPage(){
 const rows=[
  ['bookings','모든 예약','등록된 예약 및 시술 기록',''+store.bookings.length+'건'],
  ['clients','고객','고객 정보와 회원권 충전·잔액',''+store.clients.length+'명'],
  ['services','서비스','등록된 네일·왁싱 서비스와 가격',''+store.services.length+'개'],
  ['settings','설정','영업시간·예약 간격·정기 휴무일','']
 ];
 return '<div class="wrap">'+panelHead('선택 초기화')+
 '<div class="card reset-selection-card"><p class="reset-intro">초기화할 항목만 켜세요. 선택하지 않은 데이터는 그대로 유지됩니다.</p>'+
 rows.map(([key,label,description,count])=>
 '<label class="reset-option"><span class="reset-option-copy"><strong>'+label+'</strong><small>'+description+(count?' · '+count:'')+'</small></span>'+
 '<input type="checkbox" data-reset-choice="'+key+'" aria-label="'+label+' 초기화"><span class="reset-switch" aria-hidden="true"></span></label>'
 ).join('')+
 '<p class="reset-caution">삭제한 데이터는 복원할 수 없습니다. 중요한 기록은 먼저 백업해 주세요.</p></div>'+
 '<button class="primary reset-submit" type="button" data-reset-selected disabled>선택 항목 초기화</button></div>';
}
function resetSelectedData(){
 const keys=[...root.querySelectorAll('[data-reset-choice]:checked')].map(x=>x.dataset.resetChoice);
 if(!keys.length)return;
 const labels={bookings:'모든 예약',clients:'고객',services:'서비스',settings:'설정'};
 const names=keys.map(k=>labels[k]).join(' · ');
 const warn=keys.includes('clients')&&!keys.includes('bookings')
  ?'\n\n고객만 삭제하면 기존 예약은 남지만 고객 연결과 회원권 충전·잔액 내역은 사라집니다.':'';
 if(!confirm('다음 항목을 초기화할까요?\n'+names+warn+'\n\n선택하지 않은 항목은 유지됩니다.'))return;
 if(!confirm('최종 확인: '+names+' 데이터를 삭제합니다.\n삭제 후 복구할 수 없습니다. 계속할까요?'))return;
 if(keys.includes('bookings'))store.bookings=[];
 if(keys.includes('clients'))store.clients=[];
 if(keys.includes('services')){
  store.services=[];
  store.catalogSeedVersion=2; // Do not automatically reseed the catalogue after selective reset.
  checkedServices=[];settingsGender=null;settingsCategory=null;treatmentGender=null;treatmentCategory=null;
 }
 if(keys.includes('settings'))store.settings=clone(base.settings);
 save();editing=null;extras=[];tempForm=null;render();notify('선택 항목 초기화 완료');
}
function panelHead(s){return `<div class="menu-head"><button data-back="1">‹</button><strong>${s}</strong></div>`}function simplePanel(title,content){return `<div class="wrap">${panelHead(title)}<div class="card">${content}</div></div>`}
function formatDuration(n){const h=Math.floor(n/60),m=n%60;return h?(h+'시간'+(m?' '+m+'분':'')):(m+'분')}

function servicesPage(){
 return '<div class="wrap">'+panelHead('서비스 가격')+
 '<p class="muted">여자·남자와 시술 종류를 선택한 뒤 서비스 휠에서 추가·삭제하세요.</p>'+
 '<div class="card service-manager">'+
 '<div class="treatment-genders">'+[['W','여자 (W)'],['M','남자 (M)']].map(([g,label])=>
 '<button type="button" class="treatment-gender '+(settingsGender===g?'active':'')+'" data-setting-gender="'+g+'">'+label+'<span>'+(settingsGender===g?'⌃':'⌄')+'</span></button>').join('')+'</div>'+
 (settingsGender?'<div class="treatment-category-list">'+TREATMENT_CATEGORIES.filter(cat=>settingsGender==='W'||cat!=='특별 케어').map(cat=>{
  const count=store.services.filter(s=>s.gender===settingsGender&&s.category===cat).length;
  return '<button type="button" class="treatment-category" data-setting-category="'+esc(cat)+'"><span>'+cat+'</span><span>'+count+'개 ›</span></button>';
 }).join('')+'</div>':'')+
 '</div></div>';
}
function openSettingsServiceWheel(preferredId){
 const gender=settingsGender,category=settingsCategory;
 if(!gender||!category)return;
 const options=store.services.filter(s=>s.gender===gender&&s.category===category);
 const back=document.createElement('div');
 back.className='wheel-backdrop settings-service-backdrop';
 back.innerHTML='<section class="wheel-sheet settings-service-sheet" role="dialog" aria-modal="true" aria-label="서비스 관리">'+
 '<div class="treatment-heading">'+(gender==='W'?'여자':'남자')+' · '+esc(category)+'</div>'+
 '<div class="wheel-frame"><div class="wheel-highlight"></div><div class="wheel-col settings-service-col"><div class="wheel-pad"></div>'+
 options.map((s,i)=>'<div class="wheel-option settings-service-option" data-service-index="'+i+'">'+esc(s.name)+'</div>').join('')+
 '<div class="wheel-option settings-service-option settings-service-new" hidden><input id="newServiceName" autocomplete="off" placeholder="새 서비스 이름" maxlength="70"></div>'+
 '<div class="wheel-pad"></div></div></div>'+
 '<div class="settings-service-meta"></div>'+
 '<div class="settings-service-actions"><button type="button" class="settings-service-remove" aria-label="선택 서비스 삭제">−</button><button type="button" class="settings-service-edit" aria-label="선택 서비스 수정"><svg width="27" height="27" viewBox="0 0 32 32" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" d="M23 17.5V26a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3h9"/><path fill="currentColor" d="m11 22 3.8-.8L27.1 8.9 23.1 4.9 10.8 17.2zM24.3 3.7a2.6 2.6 0 0 1 3.7 0l1.3 1.3a2.6 2.6 0 0 1 0 3.7l-1 1-5-5z"/></svg></button><button type="button" class="settings-service-add">+</button></div>'+
 '<div class="wheel-actions"><button type="button" class="wheel-cancel">취소</button><button type="button" class="wheel-done" aria-label="서비스 관리 닫기">✓</button></div></section>';
 document.body.appendChild(back);
 const y=window.scrollY,prior={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
 Object.assign(document.body.style,{position:'fixed',top:'-'+y+'px',left:'0',right:'0',width:'100%'});
 const col=back.querySelector('.settings-service-col'),newRow=back.querySelector('.settings-service-new'),input=back.querySelector('#newServiceName'),meta=back.querySelector('.settings-service-meta'),add=back.querySelector('.settings-service-add'),remove=back.querySelector('.settings-service-remove'),edit=back.querySelector('.settings-service-edit'),done=back.querySelector('.wheel-done');
 let adding=false,idx=0,settle;
 const close=()=>{clearTimeout(settle);back.remove();Object.assign(document.body.style,prior);window.scrollTo(0,y)};
 back.addEventListener('touchmove',e=>{if(!e.target.closest('.settings-service-col')&&!e.target.closest('input'))e.preventDefault()},{passive:false});
 function currentIndex(){return Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)))}
 function refresh(){
  if(adding){meta.textContent='서비스 이름 입력 후 저장하세요';add.textContent='저장';remove.disabled=true;edit.disabled=true;done.disabled=true;return}
  idx=currentIndex();const s=options[idx];
  meta.textContent=s?'중앙 서비스 선택 · − 삭제 가능':'등록된 서비스 없음';
  add.textContent='+';remove.disabled=!s;edit.disabled=!s;done.disabled=!s;
 }
 function beginAdd(){
  adding=true;newRow.hidden=false;input.value='';col.style.scrollSnapType='none';
  requestAnimationFrame(()=>{col.scrollTop=options.length*44;input.focus();refresh()});
 }
 function finishAdd(){
  const name=input.value.trim();if(!name){alert('서비스 이름을 입력해 주세요.');input.focus();return}
  if(store.services.some(s=>s.gender===gender&&s.category===category&&s.name===name)){
   alert('같은 분류에 이미 등록된 서비스입니다.');input.focus();return;
  }
  const id=uid();
  store.services.push({id,name,gender,category,price:0,minutes:60});
  save();close();render();
  openServiceWheel(id,'price',()=>openServiceWheel(id,'minutes',()=>{notify('서비스·가격·시간 설정 완료');openSettingsServiceWheel()}));
 }
 col.addEventListener('scroll',()=>{if(adding)return;refresh();clearTimeout(settle);settle=setTimeout(()=>{if(col.isConnected&&!adding)col.scrollTo({top:currentIndex()*44,behavior:'smooth'})},110)},{passive:true});
 col.addEventListener('click',e=>{
  if(adding)return;
  const item=e.target.closest('[data-service-index]');if(!item)return;
  const target=Number(item.dataset.serviceIndex);
  if(target!==currentIndex()){col.scrollTo({top:target*44,behavior:'smooth'});return}
  const s=options[target];if(!s)return;
  meta.textContent='선택: '+s.name;
 });
 edit.onclick=()=>{
  if(adding)return;
  const service=options[currentIndex()];if(!service)return;
  const selectedId=service.id;
  close();
  const modal=document.createElement('div');modal.className='settings-service-edit-backdrop';
  modal.innerHTML='<section class="settings-service-edit-panel" role="dialog" aria-modal="true" aria-label="서비스 수정">'+
   '<h3>서비스 수정</h3><label>서비스 이름<input id="editServiceName" maxlength="70" value="'+esc(service.name)+'"></label>'+
   '<label>서비스 가격 (원)<input id="editServicePrice" type="number" min="0" step="1000" inputmode="numeric" value="'+Number(service.price||0)+'"></label>'+
   '<label>시술 시간 (분)<input id="editServiceMinutes" type="number" min="10" step="10" inputmode="numeric" value="'+Number(service.minutes||60)+'"></label>'+
   '<div class="settings-service-edit-buttons"><button type="button" class="service-edit-cancel">취소</button><button type="button" class="service-edit-save">저장</button></div></section>';
  document.body.appendChild(modal);
  const dismiss=()=>{modal.remove();openSettingsServiceWheel(selectedId)};
  modal.querySelector('.service-edit-cancel').onclick=dismiss;
  modal.onclick=e=>{if(e.target===modal)dismiss()};
  modal.querySelector('.service-edit-save').onclick=()=>{
   const name=modal.querySelector('#editServiceName').value.trim();
   const priceValue=modal.querySelector('#editServicePrice').value;
   const minsValue=modal.querySelector('#editServiceMinutes').value;
   const price=Number(priceValue),minutes=Number(minsValue);
   if(!name){alert('서비스 이름을 입력해 주세요.');return}
   if(store.services.some(x=>x.id!==selectedId&&x.gender===gender&&x.category===category&&x.name===name)){alert('같은 분류에 동일한 서비스가 있습니다.');return}
   if(priceValue===''||!Number.isFinite(price)||price<0||!Number.isInteger(price)){alert('가격은 0원 이상의 정수로 입력해 주세요.');return}
   if(minsValue===''||!Number.isInteger(minutes)||minutes<10||minutes>1440){alert('시술 시간은 10~1440분 사이로 입력해 주세요.');return}
   const original={name:service.name,price:service.price,minutes:service.minutes};
   try{service.name=name;service.price=price;service.minutes=minutes;save()}catch(error){Object.assign(service,original);alert('서비스 저장에 실패했습니다.');return}
   modal.remove();render();notify('서비스 수정 완료');openSettingsServiceWheel(selectedId);
  };
 };
 add.onclick=()=>{if(adding)finishAdd();else beginAdd()};
 input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finishAdd()}});
 remove.onclick=()=>{
  if(adding)return;
  const s=options[currentIndex()];if(!s)return;
  if(!confirm('서비스 "'+s.name+'"을 삭제할까요?\n이미 저장된 예약 기록은 그대로 유지됩니다.'))return;
  store.services=store.services.filter(x=>x.id!==s.id);save();close();render();notify('서비스 삭제 완료');
  openSettingsServiceWheel();
 };
 done.onclick=()=>{
  if(adding)return;
  close();
 };
 back.querySelector('.wheel-cancel').onclick=close;
 back.addEventListener('click',e=>{if(e.target===back)close()});
 requestAnimationFrame(()=>{if(preferredId){const found=options.findIndex(x=>x.id===preferredId);if(found>=0)col.scrollTop=found*44}refresh()});
}
function recalcTreatmentEnd(){
  if(!tempForm||bookingEndManuallyEdited)return;
  const duration=checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean).reduce((n,s)=>n+Number(s.minutes||0),0);
  const end=mins(tempForm.start||store.settings.open)+duration;
  if(duration>0&&end<1440)tempForm.end=hour(end);
}
function openTreatmentWheel(){
  if(!treatmentGender||!treatmentCategory)return;
  const options=store.services.filter(s=>serviceGender(s)===treatmentGender&&serviceCategory(s)===treatmentCategory);
  if(!options.length){alert('이 카테고리에 등록된 서비스가 없습니다. 설정에서 서비스를 등록해 주세요.');return}
  captureForm();
  const draft=new Set(checkedServices);
  let currentIndex=0,scrollStop;
  const back=document.createElement('div');
  back.className='wheel-backdrop treatment-wheel-backdrop';
  const optionHtml=options.map((s,i)=>'<div class="wheel-option treatment-option" data-treatment-index="'+i+'">'+esc(s.name)+'</div>').join('');
  back.innerHTML='<section class="wheel-sheet treatment-sheet" role="dialog" aria-modal="true" aria-label="시술 선택">'+
    '<div class="treatment-heading">'+(treatmentGender==='W'?'여자':'남자')+' · '+treatmentCategory+'</div>'+
    '<div class="wheel-frame treatment-frame"><div class="wheel-highlight"></div><div class="wheel-col treatment-col"><div class="wheel-pad"></div>'+optionHtml+'<div class="wheel-pad"></div></div></div>'+
    '<div class="treatment-picked"></div>'+
    '<div class="wheel-actions"><button type="button" class="wheel-cancel">취소</button><button type="button" class="wheel-done" aria-label="선택 완료" hidden>✓</button></div></section>';
  document.body.appendChild(back);
  const y=window.scrollY;
  const prior={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
  Object.assign(document.body.style,{position:'fixed',top:'-'+y+'px',left:'0',right:'0',width:'100%'});
  const close=()=>{back.remove();Object.assign(document.body.style,prior);window.scrollTo(0,y)};
  back.addEventListener('touchmove',e=>{if(!e.target.closest('.treatment-col'))e.preventDefault()},{passive:false});
  const col=back.querySelector('.treatment-col');
  const picked=back.querySelector('.treatment-picked');
  const done=back.querySelector('.wheel-done');
  function refresh(){
    const s=options[currentIndex];
    picked.innerHTML=[...draft].map(id=>{const t=store.services.find(x=>x.id===id);return t?'<span class="treatment-tag">'+esc(t.name)+' <button type="button" data-draft-remove="'+t.id+'" aria-label="제거">×</button></span>':''}).join('');
    done.hidden=draft.size===0;
  }
  col.addEventListener('scroll',()=>{
    currentIndex=Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)));
    refresh();
    clearTimeout(scrollStop);
    scrollStop=setTimeout(()=>{if(col.isConnected)col.scrollTo({top:currentIndex*44,behavior:'smooth'})},110);
  },{passive:true});
  col.addEventListener('click',e=>{
    const item=e.target.closest('[data-treatment-index]');if(!item)return;
    const tapped=Number(item.dataset.treatmentIndex);
    const centered=Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)));
    if(tapped!==centered){col.scrollTo({top:tapped*44,behavior:'smooth'});return}
    if(options[centered].id===BROW_PASS_BUY||options[centered].id===BROW_PASS_USE){
      draft.delete(BROW_PASS_BUY);draft.delete(BROW_PASS_USE);
    }
    draft.add(options[centered].id);
    refresh();
  });
  picked.onclick=e=>{const el=e.target.closest('[data-draft-remove]');if(el){draft.delete(el.dataset.draftRemove);refresh()}};
  back.querySelector('.wheel-cancel').onclick=()=>{close();tempForm=null};
  back.addEventListener('click',e=>{if(e.target===back){close();tempForm=null}});
  done.onclick=()=>{
    if(!draft.size)return;
    checkedServices=[...draft];recalcTreatmentEnd();close();render();restoreForm();
  };
  requestAnimationFrame(refresh);
}
function openServiceWheel(id,kind,onDone){
  readServices();
  const s=store.services.find(v=>v.id===id);if(!s)return;
  document.querySelector('.wheel-backdrop')?.remove();
  const price=kind==='price',current=price?Math.max(0,Number(s.price)||0):Math.max(0,Number(s.minutes)||0);
  const firstOptions=Array.from({length:price?51:13},(_,i)=>i);
  const secondOptions=Array.from({length:price?10:6},(_,i)=>price?i:i*10);
  const initialA=price?Math.min(50,Math.floor(current/10000)):Math.min(12,Math.floor(current/60));
  const initialB=price?Math.min(9,Math.floor((current%10000)/1000)):Math.min(50,Math.round((current%60)/10)*10);
  const vals={a:initialA,b:initialB};
  const makeColumn=(name,arr,label)=>`<div class="wheel-col" data-wheel-col="${name}" aria-label="${label} 선택"><div class="wheel-pad"></div>${arr.map(v=>`<div class="wheel-option" data-wheel-value="${v}">${String(v).padStart(2,'0')}</div>`).join('')}<div class="wheel-pad"></div></div>`;
  const back=document.createElement('div');back.className='wheel-backdrop';
  back.innerHTML=`<section class="wheel-sheet" role="dialog" aria-modal="true" aria-label="${price?'가격':'시술 시간'} 선택">
  <div class="treatment-heading">${price?'가격 설정 · 만원 / 천원':'시술 시간 설정 · 시간 / 분'}</div>
  <div class="wheel-frame"><div class="wheel-highlight"></div>${makeColumn('a',firstOptions,price?'만 원 단위':'시간 단위')}${makeColumn('b',secondOptions,price?'천 원 단위':'분 단위')}</div>
  <div class="wheel-actions"><button type="button" class="wheel-cancel">재설정</button><button type="button" class="wheel-done" aria-label="선택 완료">✓</button></div>
  </section>`;
  document.body.appendChild(back);
  // iOS Safari: freeze the page beneath the picker, while keeping wheel columns scrollable.
  const savedScroll=window.scrollY;
  const original={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
  Object.assign(document.body.style,{position:'fixed',top:`-${savedScroll}px`,left:'0',right:'0',width:'100%'});
  const closeWheel=()=>{
    back.remove();
    Object.assign(document.body.style,original);
    window.scrollTo(0,savedScroll);
  };
  back.addEventListener('touchmove',e=>{
    if(!e.target.closest('.wheel-col'))e.preventDefault();
  },{passive:false});
  const columns=[...back.querySelectorAll('.wheel-col')];
  function currentValue(){return price?vals.a*10000+vals.b*1000:vals.a*60+vals.b}
  function updateResult(){}
  const rowHeight=44;
  columns.forEach((col,i)=>{
    const key=i?'b':'a',options=i?secondOptions:firstOptions;
    const initial=options.indexOf(vals[key]);
    col.scrollTop=Math.max(0,initial)*rowHeight;
    let settle;
    col.addEventListener('scroll',()=>{
      const idx=Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/rowHeight)));
      vals[key]=options[idx];updateResult();
      clearTimeout(settle);
      settle=setTimeout(()=>{if(col.isConnected)col.scrollTo({top:idx*rowHeight,behavior:'smooth'})},110);
    },{passive:true});
    col.addEventListener('click',ev=>{
      const item=ev.target.closest('[data-wheel-value]');if(!item)return;
      const idx=options.indexOf(+item.dataset.wheelValue);
      col.scrollTo({top:idx*rowHeight,behavior:'smooth'});
    });
  });
  requestAnimationFrame(()=>{columns[0].scrollTop=initialA*rowHeight;columns[1].scrollTop=secondOptions.indexOf(initialB)*rowHeight;updateResult()});
  back.querySelector('.wheel-cancel').onclick=()=>{columns.forEach((col,i)=>col.scrollTo({top:0,behavior:'smooth'}))};
  back.addEventListener('click',ev=>{if(ev.target===back)closeWheel()});
  back.querySelector('.wheel-done').onclick=()=>{
    columns.forEach((col,i)=>{const options=i?secondOptions:firstOptions;vals[i?'b':'a']=options[Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/rowHeight)))]});
    const n=currentValue();
    if(!price&&n<10){alert('시술 시간은 최소 10분으로 선택해 주세요.');return}
    if(price)s.price=n;else s.minutes=n;
    save();closeWheel();render();
    if(typeof onDone==='function')onDone();
  };
}

function openClosedDaysWheel(){
 const inputs=[...root.querySelectorAll('[data-closed-day]')];
 if(inputs.length!==7)return;
 const labels=['일','월','화','수','목','금','토'];
 const draft=new Set(inputs.filter(e=>e.checked).map(e=>Number(e.dataset.closedDay)));
 const backdrop=document.createElement('div');
 backdrop.className='wheel-backdrop closed-days-backdrop';
 backdrop.innerHTML='<section class="wheel-sheet closed-days-sheet" role="dialog" aria-modal="true" aria-label="정기 휴무 요일 선택">'+
 '<div class="treatment-heading">정기 휴무 요일 선택</div>'+
 '<div class="wheel-frame closed-days-frame"><div class="wheel-highlight"></div><div class="wheel-col closed-days-column"><div class="wheel-pad"></div>'+
 labels.map((day,i)=>'<div class="wheel-option" data-day-index="'+i+'">'+day+'요일</div>').join('')+
 '<div class="wheel-pad"></div></div></div>'+
 '<button type="button" class="treatment-add closed-days-add">+ 선택한 요일 추가</button>'+
 '<div class="treatment-picked closed-days-picked"></div>'+
 '<div class="wheel-actions"><button type="button" class="wheel-cancel">취소</button><button type="button" class="wheel-done" aria-label="요일 선택 완료">✓</button></div>'+
 '</section>';
 document.body.appendChild(backdrop);
 const scrollY=window.scrollY;
 const prior={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
 Object.assign(document.body.style,{position:'fixed',top:'-'+scrollY+'px',left:'0',right:'0',width:'100%'});
 const close=()=>{backdrop.remove();Object.assign(document.body.style,prior);window.scrollTo(0,scrollY)};
 backdrop.addEventListener('touchmove',e=>{if(!e.target.closest('.closed-days-column'))e.preventDefault()},{passive:false});
 const column=backdrop.querySelector('.closed-days-column');
 const picked=backdrop.querySelector('.closed-days-picked');
 let current=0,settle;
 function repaint(){
  const add=backdrop.querySelector('.closed-days-add');
  add.textContent=draft.has(current)?'✓ 선택됨':'+ 선택한 요일 추가';
  picked.innerHTML=[...draft].sort((a,b)=>a-b).map(i=>'<span class="treatment-tag">'+labels[i]+' <button type="button" data-remove-day="'+i+'" aria-label="'+labels[i]+'요일 삭제">×</button></span>').join('')||'<span class="treatment-empty">휴무 없음</span>';
 }
 column.addEventListener('scroll',()=>{
  current=Math.max(0,Math.min(6,Math.round(column.scrollTop/44)));
  repaint();clearTimeout(settle);
  settle=setTimeout(()=>{if(column.isConnected)column.scrollTo({top:current*44,behavior:'smooth'})},120);
 },{passive:true});
 column.addEventListener('click',e=>{
  const el=e.target.closest('[data-day-index]');
  if(el)column.scrollTo({top:Number(el.dataset.dayIndex)*44,behavior:'smooth'});
 });
 backdrop.querySelector('.closed-days-add').onclick=()=>{current=Math.max(0,Math.min(6,Math.round(column.scrollTop/44)));draft.add(current);repaint()};
 picked.onclick=e=>{const el=e.target.closest('[data-remove-day]');if(el){draft.delete(Number(el.dataset.removeDay));repaint()}};
 backdrop.querySelector('.wheel-cancel').onclick=close;
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
 backdrop.querySelector('.wheel-done').onclick=()=>{
  inputs.forEach(e=>{e.checked=draft.has(Number(e.dataset.closedDay))});
  const summary=root.querySelector('#closedDaysSummary');
  if(summary)summary.textContent=draft.size?[...draft].sort((a,b)=>a-b).map(i=>labels[i]).join(' · '):'휴무 없음';
  close();
 };
 requestAnimationFrame(repaint);
}
function hoursPage(){return `<div class="wrap">${panelHead('예약 시간 설정')}<div class="card"><div class="field"><label>영업 시작</label><input type="time" id="open" value="${store.settings.open}"></div><div class="field"><label>영업 종료</label><input type="time" id="close" value="${store.settings.close}"></div><div class="field"><label>예약 간격</label><select id="interval">${[15,30,60].map(n=>`<option ${store.settings.interval===n?'selected':''} value="${n}">${n}분</option>`).join('')}</select></div><div style="margin-top:20px"><b>정기 휴무 요일</b><div class="closed-days-picker"><button type="button" class="closed-days-trigger" data-open-closed-wheel="1"><span id="closedDaysSummary">${store.settings.closedDays.length?['일','월','화','수','목','금','토'].filter((v,i)=>store.settings.closedDays.includes(i)).join(' · '):'휴무 없음'}</span><span aria-hidden="true">›</span></button><div id="closedDaysValues" hidden>${['일','월','화','수','목','금','토'].map((v,i)=>`<input type="checkbox" data-closed-day="${i}" ${store.settings.closedDays.includes(i)?'checked':''}>`).join('')}</div></div></div></div><button class="primary" data-save-hours="1">예약 시간 저장</button></div>`}
function clientPage(){return `<div class="wrap">${panelHead('고객 관리')}<div class="card"><div class="field"><label>고객 이름</label><input id="clientName" placeholder="이름 입력"></div><div class="field"><label>연락처</label><input id="clientPhone" type="tel" placeholder="010-0000-0000"></div><div class="field"><label>특이사항</label><input id="clientNote" placeholder="메모"></div><button class="primary" data-add-client="1">고객 등록</button></div><div class="section-title">등록된 고객 ${store.clients.length}명</div>${store.clients.map(c=>`<button class="client-list-button" type="button" data-client-detail="${c.id}"><span><b>${esc(c.name)}</b><small>${esc(c.phone)}</small></span><span class="client-list-chevron">›</span></button>`).join('')||'<div class="empty">등록된 고객이 없습니다.</div>'}</div>`}
function openClientDetail(id){
 const c=findClient(id);if(!c)return;
 document.querySelector('.client-detail-backdrop')?.remove();
 const customerBookings=store.bookings.filter(b=>b.clientId===c.id);
 const count=customerBookings.filter(b=>b.status==='paid'||b.status==='done').length;
 const cancellationCount=customerBookings.filter(b=>b.status==='cancelled').length;
 const noShowCount=customerBookings.filter(b=>b.status==='noshow').length;
 const balance=walletLedger(c).balance;
 const pass=browPassLedger(c);
 const backdrop=document.createElement('div');
 backdrop.className='client-detail-backdrop';
 backdrop.innerHTML=`<section class="client-detail-dialog" role="dialog" aria-modal="true" aria-label="고객 정보">
 <button type="button" class="client-detail-x" aria-label="닫기" data-client-close="1">×</button>
 <h2>${esc(c.name)}</h2>
 <p class="client-detail-phone">${esc(c.phone)}</p>
 <div class="client-detail-stat"><span>방문 기록</span><strong>${count}건</strong></div>
 ${cancellationCount?'<div class="client-detail-stat client-detail-negative"><span>예약 취소</span><strong>'+cancellationCount+'건</strong></div>':''}
 ${noShowCount?'<div class="client-detail-stat client-detail-negative"><span>노쇼</span><strong>'+noShowCount+'건</strong></div>':''}
 <div class="client-detail-stat"><span>회원권 잔액</span><strong class="client-detail-credit">${money(balance)}</strong></div>
 <div class="client-detail-stat"><span>눈썹펌 5회권</span><strong>${pass.balance}회 남음 (구매 ${pass.bought}회)</strong></div>
 <div class="client-detail-actions"><button type="button" data-client-edit="${c.id}">고객 정보 수정</button><button type="button" data-wallet-charge="${c.id}">회원권 충전</button><button type="button" class="client-delete" data-client-delete="${c.id}">고객 삭제</button></div>
 </section>`;
 document.body.appendChild(backdrop);
 const previousScroll=window.scrollY;
 const oldStyle={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
 Object.assign(document.body.style,{position:'fixed',top:'-'+previousScroll+'px',left:'0',right:'0',width:'100%'});
 backdrop.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
 const close=()=>{backdrop.remove();Object.assign(document.body.style,oldStyle);window.scrollTo(0,previousScroll)};
 backdrop.querySelector('[data-client-close]').onclick=close;
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
 backdrop.querySelector('[data-wallet-charge]').onclick=()=>{close();chargeMember(c.id)};
 backdrop.querySelector('[data-client-edit]').onclick=()=>{close();editClient(c.id)};
 backdrop.querySelector('[data-client-delete]').onclick=()=>{close();removeClient(c.id)};
}
function chargeMember(id){
 const client=findClient(id);if(!client)return;
 const units=[5,10,15,20,25,30,35,40,45,50,60,70,80,90,100];
 // Values are 10,000 KRW units. Existing plan bonuses only apply to 20/30/50.
 const benefits={
  200000:{cash:220000,card:205000},
  300000:{cash:340000,card:320000},
  500000:{cash:570000,card:550000}
 };
 const dlg=document.createElement('div');
 dlg.className='member-charge-backdrop';
 dlg.innerHTML='<section class="member-charge-dialog" role="dialog" aria-modal="true" aria-label="회원권 충전 금액 및 결제 수단">'+
 '<h3>회원권 충전</h3>'+

 '<div class="member-charge-wheel-frame"><div class="member-charge-wheel-highlight"></div>'+
 '<div class="member-charge-wheel-list" role="listbox" aria-label="충전 금액 선택">'+
 '<div class="member-charge-wheel-pad"></div>'+
 units.map((n,i)=>'<div class="member-charge-wheel-option" role="option" data-charge-index="'+i+'" aria-selected="false">'+String(n).padStart(2,'0')+'</div>').join('')+
 '<div class="member-charge-wheel-pad"></div></div></div>'+

 '<div class="member-charge-methods">'+
 '<button type="button" class="member-charge-method" data-charge-method="cash" aria-pressed="false">현금</button>'+
 '<button type="button" class="member-charge-method" data-charge-method="card" aria-pressed="false">카드</button></div>'+
 '<div class="member-charge-preview" aria-live="polite"></div>'+
 '<div class="member-charge-actions"><button type="button" class="member-charge-cancel">취소</button>'+
 '<button type="button" class="member-charge-confirm" disabled>충전 저장</button></div></section>';
 document.body.appendChild(dlg);
 const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const wheel=dlg.querySelector('.member-charge-wheel-list');
 const options=[...wheel.querySelectorAll('[data-charge-index]')];
 const indexForScroll=()=>Math.max(0,Math.min(units.length-1,Math.round(wheel.scrollTop/52)));
 let method=null,done=false,amount=300000;
 let scrollEnd;
 const close=()=>{clearTimeout(scrollEnd);document.body.style.overflow=oldOverflow;dlg.remove()};
 const preview=dlg.querySelector('.member-charge-preview'),confirmButton=dlg.querySelector('.member-charge-confirm');
 const update=()=>{
  dlg.querySelectorAll('[data-charge-method]').forEach(b=>{
   const selected=b.dataset.chargeMethod===method;
   b.classList.toggle('active',selected);
   b.setAttribute('aria-pressed',selected?'true':'false');
  });
  const selectedIndex=units.indexOf(amount/10000);
  options.forEach((el,i)=>el.setAttribute('aria-selected',i===selectedIndex?'true':'false'));
  confirmButton.disabled=!method;
  const credited=method?(benefits[amount]?.[method]??amount):null;
  preview.innerHTML='<div><span>실제 결제액</span><b>'+money(amount)+'</b></div>'+
   '<div><span>서비스 혜택</span><b class="member-charge-bonus">'+(credited===null?'결제 수단을 선택하세요':'+ '+money(credited-amount))+'</b></div>'+
   '<div><span>회원권 충전 잔액</span><b>'+(credited===null?'—':money(credited))+'</b></div>';
 };
 wheel.addEventListener('scroll',()=>{
  amount=units[indexForScroll()]*10000;update();
  clearTimeout(scrollEnd);
  scrollEnd=setTimeout(()=>{if(wheel.isConnected)wheel.scrollTo({top:indexForScroll()*52,behavior:'smooth'})},130);
 },{passive:true});
 wheel.addEventListener('click',e=>{
  const option=e.target.closest('[data-charge-index]');if(!option)return;
  wheel.scrollTo({top:Number(option.dataset.chargeIndex)*52,behavior:'smooth'});
 });
 dlg.querySelectorAll('[data-charge-method]').forEach(b=>b.onclick=()=>{
  method=method===b.dataset.chargeMethod?null:b.dataset.chargeMethod;update();
 });
 dlg.querySelector('.member-charge-cancel').onclick=close;
 dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
 confirmButton.onclick=()=>{
  if(!method||done)return;
  amount=units[indexForScroll()]*10000;
  const credited=benefits[amount]?.[method]??amount;
  if(!confirm(client.name+' 회원권 '+money(amount)+'을 '+(method==='card'?'카드':'현금')+'으로 결제하고 '+money(credited)+' 충전할까요?'))return;
  done=true;confirmButton.disabled=true;
  if(!Array.isArray(client.walletDeposits))client.walletDeposits=[];
  client.walletDeposits.push({id:uid(),amount,creditedAmount:credited,bonusAmount:credited-amount,
   planAmount:benefits[amount]?amount:null,paymentMethod:method,date:localDate(new Date()),createdAt:new Date().toISOString()});
  save();close();render();notify('회원권 충전 완료');
 };
 requestAnimationFrame(()=>{if(wheel.isConnected){wheel.scrollTop=units.indexOf(30)*52;amount=300000;update()}});
 update();
}
function editClient(id){
 const c=findClient(id);if(!c)return;
 const n=prompt('고객 이름',c.name);if(n===null)return;
 const p=prompt('연락처',c.phone);if(p===null)return;
 const note=prompt('특이사항',c.note||'');if(note===null)return;
 if(!n.trim()){alert('이름을 입력하세요.');return}
 Object.assign(c,{name:n.trim(),phone:p.trim(),note});save();render();notify('고객 정보 수정 완료');
}
function removeClient(id){
 if(store.bookings.some(b=>b.clientId===id)){alert('예약 내역이 연결된 고객은 삭제할 수 없습니다.');return}
 if(confirm('고객을 삭제할까요?')){store.clients=store.clients.filter(c=>c.id!==id);save();render();notify('고객 삭제 완료')}
}
function backupPage(){return `<div class="wrap">${panelHead('백업 내보내기·가져오기')}<div class="card"><b>전체 데이터 백업</b><p class="muted">고객·예약·서비스·설정을 JSON 파일로 내보냅니다.</p><button class="primary" data-export="1">전체 백업 내보내기</button></div><div class="card"><b>백업 가져오기</b><p class="note">기존 자료를 덮어쓰므로 가져오기 전에 먼저 백업해 주세요.</p><input type="file" id="importFile" accept="application/json,.json"></div><p class="note">이 앱은 현재 사용하는 기기에 로컬로 저장됩니다. 브라우저 데이터 삭제나 앱 재설치로 자료가 사라질 수 있으므로 정기적으로 백업하세요.</p></div>`}
function bindScheduleScroll(){
 const area=root.querySelector('.calendar-grid-wrap.week-schedule');
 const header=root.querySelector('.week-days-viewport');
 if(!area||!header)return;
 area.onscroll=()=>{if(header.scrollLeft!==area.scrollLeft)header.scrollLeft=area.scrollLeft};
 header.onscroll=()=>{if(area.scrollLeft!==header.scrollLeft)area.scrollLeft=header.scrollLeft};
}

async function refreshInstalledApp(){
 const button=root.querySelector('[data-refresh-app]');
 const original=button?.textContent;
 if(button){button.disabled=true;button.textContent='최신 버전 확인 중…'}
 try{
  const url=new URL('./version.json',location.href);
  url.searchParams.set('t',String(Date.now()));
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('버전 파일 조회 실패');
  const info=await response.json();
  if(!/^\d+\.\d+\.\d+$/.test(info.version||''))throw Error('서버 버전 정보 오류');
  const parts=v=>v.split('.').map(Number);
  const current=parts(APP_VERSION),remote=parts(info.version);
  const newer=remote.some((num,i)=>num>current[i]&&remote.slice(0,i).every((v,j)=>v===current[j]));
  if(!newer){notify('최신 버전입니다 (v'+APP_VERSION+')');return}
  if(!confirm('새 버전 v'+info.version+'이 있습니다.\n'+String(info.notes||'')+'\n\n업데이트할까요? 기존 고객·예약 데이터는 유지됩니다.'))return;
  if('serviceWorker' in navigator){
   const reg=await navigator.serviceWorker.getRegistration();
   if(reg)await reg.update();
  }
  const req=new URL('./index.html',location.href);
  req.searchParams.set('v',info.version);
  req.searchParams.set('refresh',String(Date.now()));
  window.location.replace(req.toString());
 }catch(e){
  alert('업데이트 확인 실패: 인터넷 연결 또는 서버 상태를 확인하세요.\n'+e.message);
 }finally{
  if(button&&button.isConnected){button.disabled=false;button.textContent=original||'업데이트 확인'}
 }
}


function switchSnailMode(){
 if(cloudBusy||cloudDirty||cloudConflict||localStorage.getItem(CLOUD_PENDING_KEY)==='yes'){
  alert('동기화 대기 또는 수정 충돌이 있습니다. 먼저 백업과 서버 저장 상태를 확인해 주세요.');return;
 }
 const target=SNAIL_TEST_MODE?'실사용':'테스트';
 if(!confirm(target+' 모드로 변경할까요?\n현재 모드의 데이터는 유지되며, 모드별 저장소와 서버가 분리됩니다.'))return;
 if(SNAIL_TEST_MODE)localStorage.removeItem(SNAIL_MODE_KEY);
 else localStorage.setItem(SNAIL_MODE_KEY,'test');
 location.reload();
}
function bind(){
 root.querySelector('[data-cloud-toggle-test]')?.addEventListener('click',switchSnailMode);
 root.querySelector('[data-cloud-login]')?.addEventListener('click',cloudLogin);
 root.querySelector('[data-cloud-logout]')?.addEventListener('click',cloudLogout);
 root.querySelector('[data-cloud-start]')?.addEventListener('click',cloudStart);
 root.querySelector('[data-cloud-join]')?.addEventListener('click',cloudJoin);
 root.querySelector('[data-cloud-check]')?.addEventListener('click',async()=>{await cloudCheckRemote();render();notify('서버 확인 완료')});
 root.querySelector('[data-cloud-resolve]')?.addEventListener('click',cloudResolve);
 root.querySelector('[data-cloud-backup]')?.addEventListener('click',()=>{panel='backup';render()});
 root.querySelector('[data-google-save]')?.addEventListener('click',googleSaveClientId);
 root.querySelector('[data-google-connect]')?.addEventListener('click',googleConnect);
 root.querySelector('[data-google-sync]')?.addEventListener('click',googleSyncBookings);
 root.querySelectorAll('[data-add-personal]').forEach(e=>e.onclick=()=>openPersonalEditor(null,e.dataset.addPersonal));root.querySelectorAll('[data-edit-personal]').forEach(e=>e.onclick=()=>openPersonalEditor(e.dataset.editPersonal,e.dataset.occurrenceDate));bindReceiptSwipes();bindSalesPopupScroll();bindScheduleScroll();root.querySelector('[data-refresh-app]')?.addEventListener('click',refreshInstalledApp);document.querySelectorAll('body > nav.nav [data-tab]').forEach(e=>e.onclick=()=>{if(tab===e.dataset.tab)return;tab=e.dataset.tab;panel=null;salesPopupPeriod=e.dataset.tab==='sales'?'month':salesPopupPeriod;editing=null;earlyFinishAuthorized=false;checkedServices=[];extras=[];render();root.scrollTop=0;window.scrollTo(0,0)});root.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{view=e.dataset.view;panel=null;render()});root.querySelectorAll('[data-date]').forEach(e=>e.onclick=()=>{selected=e.dataset.date;cursor=dateOf(selected);panel='appointments';render()});root.querySelectorAll('[data-close-appointments]').forEach(e=>e.onclick=ev=>{if(ev.target!==e)return;panel=null;render()});root.querySelectorAll('[data-move]').forEach(e=>e.onclick=()=>{let n=+e.dataset.move;if(view==='month'){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);selected=localDate(cursor)}else selected=shift(selected,n*(view==='week'?7:1));render()});root.querySelectorAll('[data-new]').forEach(e=>e.onclick=()=>{tab='booking';editing=null;earlyFinishAuthorized=false;checkedServices=[];extras=[];bookingDetailsOpen=false;bookingEndManuallyEdited=false;panel=null;render()});root.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>{earlyFinishAuthorized=false;editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);bookingDetailsOpen=false;bookingEndManuallyEdited=false;tab='booking';panel=null;render()});root.querySelectorAll('[data-panel]').forEach(e=>e.onclick=()=>{panel=panel===e.dataset.panel?null:e.dataset.panel;render()});root.querySelectorAll('[data-close-calendar-popup]').forEach(e=>e.onclick=ev=>{if(e!==ev.target)return;panel=null;render()});root.querySelectorAll('[data-back]').forEach(e=>e.onclick=()=>{panel=null;render()});root.querySelectorAll('[data-today]').forEach(e=>e.onclick=()=>{selected=localDate(new Date());cursor=new Date();panel=null;render()});if(tab==='booking'&&panel===null){setupClientAutocomplete()} let calSearch=root.querySelector('#calSearch');if(calSearch){calSearch.oninput=()=>{search=calSearch.value;root.querySelector('#searchResults').innerHTML=searchResults();bindSearchResults()}}bindSearchResults();if(tab==='booking'&&panel===null){refreshMemberCard()}root.querySelectorAll('[data-treatment-gender]').forEach(el=>el.onclick=()=>{captureForm();const g=el.dataset.treatmentGender;treatmentGender=treatmentGender===g?null:g;treatmentCategory=null;render();restoreForm()});
root.querySelectorAll('[data-treatment-category]').forEach(el=>el.onclick=()=>{captureForm();treatmentCategory=el.dataset.treatmentCategory;render();restoreForm();openTreatmentWheel()});root.querySelectorAll('[data-treatment-remove]').forEach(e=>e.onclick=()=>{captureForm();checkedServices=checkedServices.filter(id=>id!==e.dataset.treatmentRemove);recalcTreatmentEnd();render();restoreForm()});root.querySelectorAll('[data-add-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.push({name:'',amount:0,kind:e.dataset.addExtra==='minus'?'minus':'plus'});render();restoreForm();previewExtraBill()});root.querySelectorAll('[data-remove-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.splice(+e.dataset.removeExtra,1);render();restoreForm();previewExtraBill()});root.querySelectorAll('[data-extra-name],[data-extra-amount]').forEach(e=>e.addEventListener('input',previewExtraBill));const payCard=root.querySelector('#payCard'),payCash=root.querySelector('#payCash');
if(payCard&&payCash){
 const preview=()=>previewExtraBill();
 payCard.onchange=()=>{if(payCard.checked)payCash.checked=false;preview()};
 payCash.onchange=()=>{if(payCash.checked)payCard.checked=false;preview()};
}
root.querySelector('#bookingCompletion')?.addEventListener('toggle',e=>{bookingDetailsOpen=e.target.open});
root.querySelector('#bookingDuration')?.addEventListener('change',()=>{let t=mins(val('start'))+Number(val('bookingDuration')||90),el=root.querySelector('#end');if(el&&t<1440&&!bookingEndManuallyEdited)el.value=hour(t)});
root.querySelector('#end')?.addEventListener('change',()=>{bookingEndManuallyEdited=true});
root.querySelectorAll('[data-complete-booking]').forEach(e=>e.onclick=()=>{let el=root.querySelector('#status');if(el)el.value='finishNow';bookingDetailsOpen=true;submitBooking()});
root.querySelectorAll('[data-save-booking]').forEach(e=>e.onclick=()=>{let el=root.querySelector('#status');if(el&&el.value==='finishNow')el.value='reserved';submitBooking()});root.querySelector('#status')?.addEventListener('change',updateStatusSaveLabel);updateStatusSaveLabel();root.querySelectorAll('[data-delete-booking]').forEach(e=>e.onclick=()=>{if(confirm('이 예약을 삭제할까요?')){store.bookings=store.bookings.filter(b=>b.id!==e.dataset.deleteBooking);save();editing=null;tab='calendar';render();notify('예약 삭제 완료')}});root.querySelectorAll('[data-sales-open]').forEach(e=>e.onclick=()=>{if(salesPopupPeriod===e.dataset.salesOpen)return;salesPopupPeriod=e.dataset.salesOpen;render()});root.querySelectorAll('[data-sales-move]').forEach(e=>e.onclick=()=>{const period=e.dataset.salesScope,n=+e.dataset.salesMove;if(period==='week')selected=shift(selected,n*7);else if(period==='year')cursor=new Date(cursor.getFullYear()+n,cursor.getMonth(),1);else cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);render()});root.querySelectorAll('[data-setting-gender]').forEach(e=>e.onclick=()=>{settingsGender=settingsGender===e.dataset.settingGender?null:e.dataset.settingGender;settingsCategory=null;render()});
root.querySelectorAll('[data-setting-category]').forEach(e=>e.onclick=()=>{settingsCategory=e.dataset.settingCategory;openSettingsServiceWheel()});root.querySelector('[data-open-closed-wheel]')?.addEventListener('click',openClosedDaysWheel);root.querySelector('[data-save-hours]')?.addEventListener('click',()=>{store.settings={open:val('open'),close:val('close'),interval:+val('interval'),closedDays:[...root.querySelectorAll('[data-closed-day]:checked')].map(e=>+e.dataset.closedDay)};if(mins(store.settings.open)>=mins(store.settings.close)){alert('영업 종료는 시작보다 늦어야 합니다.');return}save();notify('예약 시간 저장 완료')});root.querySelector('[data-add-client]')?.addEventListener('click',addClient);root.querySelectorAll('[data-client-detail]').forEach(e=>e.onclick=()=>openClientDetail(e.dataset.clientDetail));root.querySelector('[data-export]')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'SNAIL_BOOK',version:1,exportedAt:new Date().toISOString(),data:store},null,2)],{type:'application/json'});let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download='SNAIL_BOOK_backup_'+localDate(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),500)});root.querySelector('#importFile')?.addEventListener('change',async e=>{let file=e.target.files[0];if(!file)return;try{const x=JSON.parse(await file.text());if(x.app!=='SNAIL_BOOK'||!x.data||!Array.isArray(x.data.clients)||!Array.isArray(x.data.bookings)||!Array.isArray(x.data.services))throw Error('형식 오류');if(!confirm('현재 모든 데이터를 백업 파일로 교체할까요?'))return;store=x.data;save();render();notify('복원 완료')}catch(err){alert('S’NAIL BOOK 백업 파일이 아닙니다.')}});root.querySelectorAll('[data-reset-choice]').forEach(e=>e.addEventListener('change',()=>{const btn=root.querySelector('[data-reset-selected]');if(btn)btn.disabled=!root.querySelector('[data-reset-choice]:checked')}));root.querySelector('[data-reset-selected]')?.addEventListener('click',resetSelectedData)}
function bindSearchResults(){root.querySelectorAll('#searchResults [data-edit]').forEach(e=>e.onclick=()=>{editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);bookingDetailsOpen=false;bookingEndManuallyEdited=false;tab='booking';panel=null;render()})}
let bookingDetailsOpen=false;
let bookingEndManuallyEdited=false;
let tempForm=null;function captureForm(){if(tab!=='booking')return;bookingDetailsOpen=!!root.querySelector('#bookingCompletion')?.open;tempForm={};['name','phone','date','start','end','bookingDuration','status','memo','memberUse','payCard','payCash'].forEach(k=>{let e=root.querySelector('#'+k);if(e)tempForm[k]=e.type==='checkbox'?e.checked:e.value});extras=extras.map((x,i)=>{const amount=Math.abs(Number(root.querySelector(`[data-extra-amount="${i}"]`)?.value)||0);const kind=x.kind==='minus'||(x.kind!=='plus'&&Number(x.amount)<0)?'minus':'plus';return {name:root.querySelector(`[data-extra-name="${i}"]`)?.value||'',amount:kind==='minus'?-amount:amount,kind}})}
function restoreForm(){if(!tempForm)return;Object.entries(tempForm).forEach(([k,v])=>{let e=root.querySelector('#'+k);if(e){if(e.type==='checkbox')e.checked=!!v;else e.value=v}});tempForm=null}
function val(id){return root.querySelector('#'+id)?.value||''}function readServices(){store.services.forEach(s=>{s.name=root.querySelector(`[data-s-name="${s.id}"]`)?.value?.trim()||s.name})}
function addClient(){const name=val('clientName').trim(),phone=val('clientPhone').trim(),note=val('clientNote').trim();if(!name||!phone){alert('고객 이름과 연락처를 입력하세요.');return}if(store.clients.some(c=>c.name===name&&c.phone===phone)){alert('이미 등록된 고객입니다.');return}store.clients.push({id:uid(),name,phone,note});save();render();notify('고객 등록 완료')}


/* Overdue appointments: only the operator can confirm completion.
   Reminders are local to this device, and do not require a server. */
const END_REMINDER_KEY='snailbook_end_reminder_snoozes_v062';
let endReminderActiveId=null,endReminderBusy=false;
function readEndReminderSnoozes(){
 try{return JSON.parse(localStorage.getItem(END_REMINDER_KEY)||'{}')||{}}catch(e){return {}}
}
function postponeEndReminder(id){
 const d=readEndReminderSnoozes();d[id]=Date.now()+10*60*1000;
 try{localStorage.setItem(END_REMINDER_KEY,JSON.stringify(d))}catch(e){}
}
function endedReservedBookings(now=new Date()){
 const snoozes=readEndReminderSnoozes(),clock=now.getTime();
 return store.bookings.filter(b=>b.status==='reserved'&&b.date&&b.end&&
  !bookingEndIsFuture(b.date,b.end,now)&&
  Number.isFinite(new Date(b.date+'T'+b.end+':00').getTime())&&
  (new Date(b.date+'T'+b.end+':00').getTime()<=clock)&&
  Number(snoozes[b.id]||0)<=clock)
  .sort((a,b)=>(a.date+'T'+a.end).localeCompare(b.date+'T'+b.end));
}
function checkEndReminders(){
 if(endReminderBusy||endReminderActiveId||tab==='booking'||panel||document.querySelector('.member-shortage-backdrop,.member-charge-backdrop,.pass-purchase-backdrop,.pass-first-use-backdrop,.pass-first-result-backdrop,.end-confirm-backdrop,.end-pay-backdrop,.calendar-popup-backdrop,.sales-popup-backdrop,.client-detail-backdrop'))return;
 const booking=endedReservedBookings()[0];
 if(booking)openEndReminder(booking.id);
}
function openEndReminder(id){
 const b=store.bookings.find(x=>x.id===id&&x.status==='reserved');
 if(!b||endReminderActiveId)return;
 endReminderActiveId=id;postponeEndReminder(id);
 const dlg=document.createElement('div');dlg.className='end-confirm-backdrop';
 dlg.innerHTML='<section class="end-confirm-dialog" role="dialog" aria-modal="true" aria-label="시술 완료 확인">'+
 '<h3><span class="end-confirm-warning">!</span> 시술 종료 시간이 지났습니다.</h3>'+
 '<div class="end-confirm-summary">'+
 '<div><span>고객</span><strong>'+esc(clientName(b))+'</strong></div>'+
 '<div><span>시술</span><strong>'+esc(serviceNames(b))+'</strong></div>'+
 '<div><span>예약 종료</span><strong>'+esc(b.date+' '+b.end)+'</strong></div>'+
 '<div><span>시술 금액</span><strong>'+money(priceFor(b))+'</strong></div>'+ (specialKind(b.items)==='use'?'<div><span>횟수권 사용</span><strong class="brow-pass-red">−1회 (잔여 '+(findClient(b.clientId)?browPassLedger(findClient(b.clientId)).balance:0)+'회)</strong></div>':'')+'</div>'+
 '<p>'+(Array.isArray(b.items)&&b.items.length?'시술을 완료하셨나요?':'시술이 미정입니다. 먼저 시술 내역을 입력해 주세요.')+'</p>'+
 '<div class="end-confirm-actions"><button class="end-confirm-later" type="button">나중에</button>'+
 '<button class="end-confirm-yes" type="button">'+(Array.isArray(b.items)&&b.items.length?'완료 처리':'시술 내용 입력')+'</button></div></section>';
 document.body.appendChild(dlg);
 const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 let closed=false;
 const close=()=>{if(closed)return;closed=true;dlg.remove();document.body.style.overflow=oldOverflow;endReminderActiveId=null};
 dlg.querySelector('.end-confirm-later').onclick=close;
 dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
 dlg.querySelector('.end-confirm-yes').onclick=()=>{
  close();
  startQuickCompletion(id);
 };
}
function quickCompleteBooking(id,deposit,method,passMethod){
 const b=store.bookings.find(x=>x.id===id);
 if(!b||b.status!=='reserved'){alert('이미 처리되었거나 삭제된 예약입니다.');return false}
 if(!Array.isArray(b.items)||b.items.length===0){alert('시술 내역을 먼저 선택한 뒤 완료·결제해 주세요.');return false}
 if(bookingEndIsFuture(b.date,b.end)){alert('시술 종료 전에는 완료할 수 없습니다.');return false}
 const client=findClient(b.clientId),special=specialKind(b.items);
 if(special==='use'&&(!client||browPassLedger(client).balance<1)){alert('눈썹펌 횟수권 잔여 횟수가 없습니다.');return false}
 if(special==='buy'&&!['cash','card'].includes(passMethod)){alert('5회권 현금·카드 결제 수단을 선택해 주세요.');return false}
 const totalDue=normalDue(b.items,b.extras),available=client?Math.max(0,walletLedger(client).balance):0;
 const memberUse=Math.min(totalDue,Math.max(0,available+(deposit?Number(deposit.creditedAmount||0):0)));
 if(totalDue>memberUse&&!['cash','card'].includes(method)){alert('일반 시술 부족액의 결제 수단을 선택하세요.');return false}
 const snapshot=JSON.stringify(store);
 try{
  if(deposit){if(!client)throw Error('고객 정보 없음');(client.walletDeposits??=[]).push(deposit)}
  b.status='paid';b.memberUse=memberUse;b.paymentMethod=totalDue>memberUse?method:null;
  b.passPaymentMethod=special==='buy'?passMethod:null;b.passPurchaseAmount=special==='buy'?passPrice(passMethod):0;
  b.passFirstUse=special==='buy'?false:false;b.passFirstUseConfirmed=special!=='buy';
  b.paymentDate=localDate(new Date());b.updatedAt=new Date().toISOString();save();
 }catch(e){store=JSON.parse(snapshot);alert('저장에 실패했습니다.');return false}
 render();notify('시술 완료·결제 저장 완료');
 if(special==='buy')setTimeout(()=>showPassFirstUsePrompt(b.id),40);
 return true;
}

function showQuickPaymentMethod(id){
 const b=store.bookings.find(x=>x.id===id&&x.status==='reserved');if(!b)return;
 const dlg=document.createElement('div');dlg.className='end-pay-backdrop';
 dlg.innerHTML='<section class="end-pay-dialog" role="dialog" aria-modal="true" aria-label="결제 수단 선택">'+
 '<h3>시술 완료 · 결제 수단</h3>'+
 '<p>시술 금액 <strong>'+money(priceFor(b))+'</strong></p>'+
 '<div class="end-pay-methods"><button type="button" data-quick-method="cash" aria-pressed="false">현금</button>'+
 '<button type="button" data-quick-method="card" '+(specialKind(b.items)==='buy'?'disabled title="5회권 현금가 전용"':'')+' aria-pressed="false">카드</button></div>'+
 '<div class="end-pay-actions"><button type="button" class="end-pay-cancel">취소</button>'+
 '<button type="button" class="end-pay-save" disabled>결제·완료 저장</button></div></section>';
 document.body.appendChild(dlg);
 let method=null,used=false;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const close=()=>{dlg.remove();document.body.style.overflow=oldOverflow;endReminderBusy=false};
 dlg.querySelectorAll('[data-quick-method]').forEach(button=>button.onclick=()=>{
  method=button.dataset.quickMethod;
  dlg.querySelectorAll('[data-quick-method]').forEach(el=>{
   el.classList.toggle('active',el.dataset.quickMethod===method);
   el.setAttribute('aria-pressed',String(el.dataset.quickMethod===method));
  });
  dlg.querySelector('.end-pay-save').disabled=false;
 });
 dlg.querySelector('.end-pay-cancel').onclick=close;
 dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
 dlg.querySelector('.end-pay-save').onclick=()=>{
  if(!method||used)return;used=true;
  const ok=quickCompleteBooking(id,null,method);
  close();if(!ok)used=false;
 };
}
function startQuickCompletion(id){
 const b=store.bookings.find(x=>x.id===id&&x.status==='reserved');
 if(!b)return;
 if(!Array.isArray(b.items)||b.items.length===0){
  // An unknown-service reservation must never be finalized as a zero-won treatment.
  endReminderBusy=false;editing=b.id;checkedServices=[];extras=clone(b.extras||[]);
  bookingDetailsOpen=true;bookingEndManuallyEdited=false;
  tab='booking';panel=null;selected=b.date;render();
  notify('시술을 선택한 뒤 완료·결제해 주세요');return;
 }
 if(bookingEndIsFuture(b.date,b.end)){alert('시술 종료 전에는 완료할 수 없습니다.');return}
 endReminderBusy=true;
 const c=findClient(b.clientId),amount=normalDue(b.items,b.extras),available=c?Math.max(0,walletLedger(c).balance):0;
 const special=specialKind(b.items);
 if(special==='use'){
  if(!c||browPassLedger(c).balance<1){alert('눈썹펌 횟수권 잔여 횟수가 없습니다. 구매를 먼저 등록해 주세요.');endReminderBusy=false;return}
  if(amount===0){quickCompleteBooking(id,null,null);endReminderBusy=false;return}
 }
 if(special==='buy'){passPurchaseDialog({quickBookingId:id,client:c,available,totalDue:amount});return}
 if(c&&walletLedger(c).received>0){
  if(available>=amount){quickCompleteBooking(id,null,null);endReminderBusy=false;return}
  const context={available,totalDue:amount,quickBookingId:id};
  memberPaymentPrompt(context,()=>{endReminderBusy=false});
  return;
 }
 if(amount<=0){quickCompleteBooking(id,null,null);endReminderBusy=false;return}
 showQuickPaymentMethod(id);
}


function checkPendingPassFirstUse(){
 if(document.querySelector('.pass-first-use-backdrop,.pass-first-result-backdrop,.pass-purchase-backdrop,.member-shortage-backdrop,.end-confirm-backdrop,.end-pay-backdrop,.member-charge-backdrop'))return;
 const pending=store.bookings.find(b=>b.status==='paid'&&specialKind(b.items)==='buy'&&!b.passFirstUseConfirmed);
 if(pending)showPassFirstUsePrompt(pending.id);
}
function showPassFirstUsePrompt(id){
 const b=store.bookings.find(x=>x.id===id);
 if(!b||b.status!=='paid'||specialKind(b.items)!=='buy'||b.passFirstUseConfirmed)return;
 if(document.querySelector('.pass-first-use-backdrop'))return;
 const dlg=document.createElement('div');dlg.className='pass-first-use-backdrop';
 dlg.innerHTML='<section class="pass-first-use-dialog" role="dialog" aria-modal="true" aria-label="눈썹펌 5회권 첫 사용 확인">'+
 '<h3>눈썹펌 5회권 구매 완료</h3>'+
 '<div class="pass-first-use-info"><span>결제 금액</span><b>'+money(passReceipt(b))+'</b></div>'+
 '<div class="pass-first-use-info"><span>구매 횟수</span><b>5회</b></div>'+
 '<p>지금 1회를 사용하시겠습니까?</p>'+
 '<div class="pass-first-use-actions"><button type="button" class="pass-first-no">N · 사용 안 함</button>'+
 '<button type="button" class="pass-first-yes">Y · 1회 사용</button></div></section>';
 document.body.appendChild(dlg);
 const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';let completed=false;
 function finish(useNow){
  if(completed)return;
  const actual=store.bookings.find(x=>x.id===id);
  if(!actual||actual.status!=='paid'||specialKind(actual.items)!=='buy'||actual.passFirstUseConfirmed){close();return}
  completed=true;
  const prev=JSON.stringify(store);
  try{
   actual.passFirstUse=useNow;
   actual.passFirstUseConfirmed=true;
   actual.updatedAt=new Date().toISOString();
   save();
  }catch(e){store=JSON.parse(prev);completed=false;alert('사용 횟수를 저장하지 못했습니다. 다시 선택해 주세요.');return}
  close();render();showPassFirstUseResult(actual.id,useNow);
 }
 function close(){dlg.remove();document.body.style.overflow=oldOverflow}
 dlg.querySelector('.pass-first-no').onclick=()=>finish(false);
 dlg.querySelector('.pass-first-yes').onclick=()=>finish(true);
}

function showPassFirstUseResult(id,usedNow){
 const b=store.bookings.find(x=>x.id===id),client=b&&findClient(b.clientId);if(!client)return;
 const remaining=browPassLedger(client).balance;
 const dlg=document.createElement('div');dlg.className='pass-first-result-backdrop';
 dlg.innerHTML='<section class="pass-first-result-dialog" role="dialog" aria-modal="true" aria-label="눈썹펌 횟수권 사용 결과">'+
 '<h3>✓ 눈썹펌 5회권 저장 완료</h3><p>'+esc(client.name)+' · '+(usedNow?'이번 1회 사용 완료':'이번 사용 없음')+'</p>'+
 '<div class="pass-first-result-counts"><div><span>구매</span><strong>5회</strong></div><div><span>이번 사용</span><strong class="brow-pass-red">'+(usedNow?'1회':'0회')+'</strong></div>'+
 '<div><span>현재 잔여</span><strong class="brow-pass-blue">'+remaining+'회</strong></div></div>'+
 '<div class="pass-first-result-dots">'+[5,4,3,2,1].map(n=>'<span class="'+(usedNow&&n===5?'used':'')+'">'+(usedNow&&n===5?'✓':n)+'</span>').join('')+'</div>'+
 '<button type="button" class="pass-first-result-done">확인 · 달력으로</button></section>';
 document.body.appendChild(dlg);
 const prev=document.body.style.overflow;document.body.style.overflow='hidden';
 dlg.querySelector('.pass-first-result-done').onclick=()=>{dlg.remove();document.body.style.overflow=prev;tab='calendar';render()};
}

function passPurchaseDialog(ctx){
 const {quickBookingId,client}=ctx,totalDue=ctx.totalDue||0,available=ctx.available||0;
 const hasWallet=!!client&&walletLedger(client).received>0;
 const shortfall=Math.max(0,totalDue-available);
 const dlg=document.createElement('div');dlg.className='pass-purchase-backdrop';
 dlg.innerHTML='<section class="pass-purchase-dialog" role="dialog" aria-modal="true" aria-label="눈썹펌 5회권 구매 결제">'+
 '<h3>눈썹펌 5회권 구매</h3><div class="pass-purchase-row"><span>적립 횟수</span><b>+5회</b></div>'+
 '<p class="pass-purchase-label">5회권 결제 수단</p><div class="pass-purchase-methods">'+
 '<button type="button" data-pass-method="cash">현금</button><button type="button" data-pass-method="card">카드</button></div>'+
 '<div class="pass-purchase-row"><span>5회권 구매 금액</span><strong class="pass-purchase-total">선택 필요</strong></div>'+
 (totalDue>0?'<div class="pass-purchase-normal">'+
 '<div class="pass-purchase-row"><span>함께 선택한 일반 시술</span><b>'+money(totalDue)+'</b></div>'+
 '<div class="pass-purchase-row"><span>기존 회원권 사용 예정</span><b class="brow-pass-red">−'+money(Math.min(totalDue,available))+'</b></div>'+
 (shortfall>0&&!hasWallet?'<p class="pass-purchase-label">일반 시술 부족액 '+money(shortfall)+' 결제 수단</p>'+
 '<div class="pass-purchase-methods"><button type="button" data-normal-method="cash">현금</button>'+
 '<button type="button" data-normal-method="card">카드</button></div>':
 shortfall>0?'<p class="pass-purchase-note">일반 시술 부족액 '+money(shortfall)+'은 다음 단계에서 결제합니다.</p>':'')+
 '</div>':'')+
 '<div class="pass-purchase-actions"><button type="button" class="pass-purchase-cancel">취소</button>'+
 '<button type="button" class="pass-purchase-confirm" disabled>결제·완료 저장</button></div></section>';
 document.body.appendChild(dlg);
 const previous=document.body.style.overflow;document.body.style.overflow='hidden';
 let passMethod=ctx.passMethod||null,normalMethod=null,locked=false;
 const close=()=>{dlg.remove();document.body.style.overflow=previous;if(quickBookingId)endReminderBusy=false};
 const refresh=()=>{
  for(const type of ['pass','normal']){
   const value=type==='pass'?passMethod:normalMethod;
   dlg.querySelectorAll('[data-'+type+'-method]').forEach(el=>el.classList.toggle('active',el.dataset[type+'Method']===value));
  }
  dlg.querySelector('.pass-purchase-total').textContent=passMethod?money(passPrice(passMethod)):'결제 수단 선택';
  dlg.querySelector('.pass-purchase-confirm').disabled=!passMethod||(shortfall>0&&!hasWallet&&!normalMethod);
 };
 dlg.querySelectorAll('[data-pass-method]').forEach(el=>el.onclick=()=>{passMethod=el.dataset.passMethod;refresh()});
 dlg.querySelectorAll('[data-normal-method]').forEach(el=>el.onclick=()=>{normalMethod=el.dataset.normalMethod;refresh()});
 dlg.querySelector('.pass-purchase-cancel').onclick=close;
 dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
 dlg.querySelector('.pass-purchase-confirm').onclick=()=>{
  if(locked||!passMethod||(shortfall>0&&!hasWallet&&!normalMethod))return;
  locked=true;const next={...ctx,passMethod};close();
  if(shortfall>0&&hasWallet){
   if(quickBookingId){endReminderBusy=true;memberPaymentPrompt(next,()=>{endReminderBusy=false})}
   else memberPaymentPrompt(next);
   return;
  }
  if(quickBookingId)quickCompleteBooking(quickBookingId,null,normalMethod,passMethod);
  else commitCompletedBooking(next,null,normalMethod);
 };
 refresh();
}

const MEMBERSHIP_PLANS={
 200000:{cash:220000,card:205000},
 300000:{cash:340000,card:320000},
 500000:{cash:570000,card:550000}
};
function memberPaymentPrompt(context,onClose){
 const {available,totalDue}=context;
 const shortfall=totalDue-available;
 const back=document.createElement('div');
 back.className='member-shortage-backdrop';
 back.innerHTML='<section class="member-shortage-panel" role="dialog" aria-modal="true" aria-label="회원권 잔액 부족">'+
 '<h3><span class="shortage-warning" aria-hidden="true">!</span> 회원권 잔액이 부족합니다.</h3>'+
 '<div class="shortage-figures"><div><span>시술 금액</span><strong>'+money(totalDue)+'</strong></div>'+
 '<div><span>현재 회원권 잔액</span><strong>'+money(available)+'</strong></div>'+
 '<div><span>부족 금액</span><strong class="shortage-red">'+money(shortfall)+'</strong></div></div>'+
 '<div class="shortage-modes"><label><input type="radio" name="shortageMode" value="recharge" checked> 회원권 추가 충전</label>'+
 '<label><input type="radio" name="shortageMode" value="remainder"> 부족액 현금·카드 결제</label></div>'+
 '<div class="shortage-plans"><strong>회원권 상품</strong>'+
 '<div class="shortage-plan-options">'+[200000,300000,500000].map(n=>'<label><input type="radio" name="shortagePlan" value="'+n+'" '+(n===200000?'checked':'')+'><span>'+money(n)+'권</span></label>').join('')+'</div></div>'+
 '<div class="shortage-methods"><strong>결제 수단 선택</strong><div class="shortage-method-options">'+
 '<label><input type="radio" name="shortageMethod" value="cash"><span>현금</span></label>'+
 '<label><input type="radio" name="shortageMethod" value="card"><span>카드</span></label></div></div>'+
 '<div class="shortage-preview" aria-live="polite"></div>'+
 '<div class="shortage-actions"><button type="button" class="shortage-cancel">취소</button><button type="button" class="shortage-confirm" disabled>확정·시술 저장</button></div></section>';
 document.body.appendChild(back);
 const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const close=()=>{document.body.style.overflow=previousOverflow;back.remove();if(onClose)onClose()};
 const current=(name)=>back.querySelector('input[name="'+name+'"]:checked')?.value;
 const update=()=>{
  const mode=current('shortageMode'),method=current('shortageMethod'),cost=Number(current('shortagePlan')||200000);
  back.querySelector('.shortage-plans').hidden=mode!=='recharge';
  const preview=back.querySelector('.shortage-preview');
  if(mode==='recharge'){
   const credited=method?MEMBERSHIP_PLANS[cost][method]:null;
   preview.innerHTML='<div><span>실제 결제액</span><b>'+money(cost)+'</b></div>'+
    '<div><span>서비스 추가 금액</span><b class="shortage-blue">'+(credited===null?'결제 수단 선택':'+ '+money(credited-cost))+'</b></div>'+
    '<div><span>충전 후 사용 가능 금액</span><b>'+(credited===null?'—':money(credited+available))+'</b></div>'+
    '<div><span>시술비 차감 후 잔액</span><b class="shortage-blue">'+(credited===null?'—':money(credited+available-totalDue))+'</b></div>';
  }else{
   preview.innerHTML='<div><span>회원권 자동 차감</span><b class="shortage-red">−'+money(available)+'</b></div>'+
   '<div><span>추가 결제액</span><b>'+money(shortfall)+'</b></div>';
  }
  const insufficient=mode==='recharge'&&method&&available+MEMBERSHIP_PLANS[cost][method]<totalDue;
  if(insufficient)preview.innerHTML+='<p class="shortage-red" style="font-size:12px;margin:10px 0 0">선택한 회원권으로 부족액을 충당할 수 없습니다. 더 큰 상품을 선택하세요.</p>';
  back.querySelector('.shortage-confirm').disabled=!method||!!insufficient;
 };
 back.querySelectorAll('input[type="radio"]').forEach(el=>el.addEventListener('change',update));
 back.querySelector('.shortage-cancel').onclick=close;
 back.addEventListener('click',e=>{if(e.target===back)close()});
 back.querySelector('.shortage-confirm').onclick=()=>{
  const mode=current('shortageMode'),method=current('shortageMethod');
  if(method!=='cash'&&method!=='card')return;
  const face=Number(current('shortagePlan')||200000);
  const credited=mode==='recharge'?MEMBERSHIP_PLANS[face][method]:0;
  const deposit=mode==='recharge'?{id:uid(),amount:face,creditedAmount:credited,bonusAmount:credited-face,paymentMethod:method,planAmount:face,date:localDate(new Date()),createdAt:new Date().toISOString()}:null;
  close();
  if(context.quickBookingId){quickCompleteBooking(context.quickBookingId,deposit,mode==='remainder'?method:null,context.passMethod)}
  else commitCompletedBooking(context,deposit,mode==='remainder'?method:null);
 };
 update();
}
function commitCompletedBooking(ctx,deposit,paymentMethod){
 const {f,name,phone,old,client,available}=ctx;
 if(f.status==='paid'&&bookingEndIsFuture(f.date,f.end)&&!(ctx.earlyFinish&&bookingHasStarted(f.date,f.start))){alert('시술 종료 전에는 완료 처리할 수 없습니다.');return false}
 const items=checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean).map(s=>clone(s));
 const kind=specialKind(items),passMethod=ctx.passMethod;
 if(f.status==='paid'&&kind==='use'&&browPassLedger(client).balance+(old?.status==='paid'&&old.clientId===client.id&&specialKind(old.items)==='use'?1:0)<1){alert('눈썹펌 5회권 잔여 횟수가 없습니다.');return false}
 if(f.status==='paid'&&kind==='buy'&&!['cash','card'].includes(passMethod)){alert('5회권 현금·카드 결제 수단을 선택하세요.');return false}
 const total=normalDue(items,extras),credit=Number(deposit?.creditedAmount||0);
 const memberUse=f.status==='paid'?Math.min(total,Math.max(0,available+credit)):0;
 const remain=f.status==='paid'?Math.max(0,total-memberUse):0;
 if(remain>0&&!['cash','card'].includes(paymentMethod)){alert('일반 시술 부족액의 결제 수단을 선택하세요.');return false}
 const snapshot=JSON.stringify(store);
 try{
  if(deposit)(client.walletDeposits??=[]).push(deposit);
  if(!store.clients.some(c=>c.id===client.id))store.clients.push(client);
  const b={id:editing||uid(),paymentMethod:remain?paymentMethod:null,
   paymentDate:f.status==='paid'?(old?.status==='paid'?old.paymentDate||old.date:localDate(new Date())):null,
   passPaymentMethod:f.status==='paid'&&kind==='buy'?passMethod:null,
   passPurchaseAmount:f.status==='paid'&&kind==='buy'?passPrice(passMethod):0,
   passFirstUse:f.status==='paid'&&kind==='buy'&&old?.status==='paid'&&specialKind(old.items)==='buy'?!!old.passFirstUse:false,
   passFirstUseConfirmed:f.status==='paid'&&kind==='buy'&&old?.status==='paid'&&specialKind(old.items)==='buy'?!!old.passFirstUseConfirmed:kind!=='buy',
   actualCompletionAt:f.status==='paid'?(old?.actualCompletionAt||(ctx.earlyFinish?new Date().toISOString():null)):null,
   clientId:client.id,name,phone,date:f.date,start:f.start,end:f.end,items,extras:clone(extras),
   memberUse,status:f.status||'reserved',memo:f.memo||'',provisionalMinutes:Number(f.bookingDuration||90),
   createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(editing)store.bookings=store.bookings.map(x=>x.id===editing?b:x);else store.bookings.push(b);
  save();
 }catch(e){store=JSON.parse(snapshot);alert('저장에 실패했습니다.');return false}
 const editingSavedId=editing||store.bookings[store.bookings.length-1].id;
 selected=f.date;cursor=dateOf(selected);tab='calendar';panel=null;editing=null;earlyFinishAuthorized=false;checkedServices=[];extras=[];tempForm=null;
 render();notify('예약 저장 완료');
 if(f.status==='paid'&&kind==='buy'&&!(old?.status==='paid'&&specialKind(old.items)==='buy'))setTimeout(()=>showPassFirstUsePrompt(editingSavedId),40);
 return true;
}

function updateStatusSaveLabel(){const el=root.querySelector('[data-save-booking]');if(el)el.textContent=editing?'예약 수정 저장':'예약 저장';}

function submitBooking(){
 captureForm();const f=tempForm;
 const name=f.name?.trim(),phone=f.phone?.trim();
 if(!name){alert('고객 이름을 입력하세요.');return}
 if(!f.date||!f.start){alert('예약 날짜와 시간을 입력하세요.');return}
 const duration=checkedServices.reduce((n,id)=>n+Number(store.services.find(s=>s.id===id)?.minutes||0),0)||Number(f.bookingDuration||90);
 if(!editing||!checkedServices.length){let e=mins(f.start)+duration;if(e>=1440){alert('예약 종료 시간이 자정을 넘습니다.');return}f.end=hour(e)}
 if(!f.end||mins(f.end)<=mins(f.start)){alert('예약 종료 시간을 확인하세요.');return}
 if((f.status==='paid'||f.status==='finishNow')&&!checkedServices.length){alert('완료하기 전에 시술을 선택하세요.');return}
 if(f.status==='finishNow'){
  if(!bookingHasStarted(f.date,f.start)){alert('시술 시작 전에는 완료할 수 없습니다.');return}
  if(!confirm('실제로 시술을 마쳤습니까? 예약 종료 시간은 유지하고, 현재 시각을 실제 완료 시간으로 기록합니다.'))return;
  earlyFinishAuthorized=bookingEndIsFuture(f.date,f.end);
  f.status='paid';
  const el=root.querySelector('#status');if(el)el.value='paid';
 }else earlyFinishAuthorized=false;
 if(f.status==='paid'&&bookingEndIsFuture(f.date,f.end)&&!(earlyFinishAuthorized&&bookingHasStarted(f.date,f.start))){alert('아직 시술 종료 전입니다. 종료 시간 이후에 완료 처리할 수 있습니다. 지금은 예약 상태로 저장해 주세요.');return}
 const names=store.clients.filter(c=>c.name===name);const existing=store.clients.find(c=>c.name===name&&c.phone===phone)||(phone?null:names.length===1?names[0]:null);
 const client=existing||{id:uid(),name,phone,note:''};
 const collisions=store.bookings.filter(b=>b.id!==editing&&b.date===f.date&&b.status!=='cancelled'&&mins(f.start)<mins(b.end)&&mins(f.end)>mins(b.start));
 if(collisions.length&&!confirm('이미 '+collisions.length+'건의 예약과 시간이 겹칩니다. 그래도 저장할까요?'))return;
 const day=dateOf(f.date).getDay();
 if(store.settings.closedDays.includes(day)&&!confirm('설정된 정기 휴무일입니다. 그래도 예약할까요?'))return;
 if((mins(f.start)<mins(store.settings.open)||mins(f.end)>mins(store.settings.close))&&!confirm('영업시간 밖의 예약입니다. 그래도 저장할까요?'))return;
 const old=store.bookings.find(b=>b.id===editing);
 const available=Math.max(0,walletLedger(client).balance+(old?.status==='paid'&&old.clientId===client.id?Number(old.memberUse||0):0));
 const totalDue=normalDue(checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean),extras);
 const ctx={f,name,phone:phone||client.phone||'',old,client,available,totalDue,earlyFinish:earlyFinishAuthorized&&bookingEndIsFuture(f.date,f.end)};
 const currentMethod=root.querySelector('#payCard')?.checked?'card':root.querySelector('#payCash')?.checked?'cash':null;
 const special=specialKind(checkedServices.map(id=>({id})));
 if(special==='buy'&&f.status==='paid'){passPurchaseDialog({...ctx,passMethod:old?.passPaymentMethod||currentMethod});return}
 if(special==='use'&&f.status==='paid'&&browPassLedger(client).balance+(old?.status==='paid'&&specialKind(old.items)==='use'?1:0)<1){
  alert('눈썹펌 횟수권 잔여 횟수가 없습니다. 구매 기록을 확인해 주세요.');return
 }
 if(f.status!=='paid'){commitCompletedBooking(ctx,null,null);return}
 if(walletLedger(client).received>0){
  if(available<totalDue){memberPaymentPrompt(ctx);return}
  commitCompletedBooking(ctx,null,null);return;
 }
 if(totalDue>0&&!currentMethod){alert('현금 또는 카드 결제 방법을 선택해 주세요.');return}
 commitCompletedBooking(ctx,null,currentMethod);
}

if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=111',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
if(typeof setInterval==='function')setInterval(checkEndReminders,30000);
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkEndReminders()});
render();
// Restore the saved Supabase user and pull the latest revision after the app starts.
cloudBootstrap();
})();
