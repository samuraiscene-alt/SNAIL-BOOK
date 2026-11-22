(()=>{'use strict';
const KEY='snailbook_v1_store';
const base={clients:[],services:[{id:'s1',name:'젤네일',price:50000,minutes:60},{id:'s2',name:'젤 제거',price:10000,minutes:30},{id:'s3',name:'네일아트',price:70000,minutes:90},{id:'s4',name:'기본 케어',price:30000,minutes:45}],bookings:[],settings:{open:'10:00',close:'20:00',interval:30,closedDays:[0]}};
function clone(o){return JSON.parse(JSON.stringify(o))}function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&Array.isArray(x.bookings)&&Array.isArray(x.clients)&&Array.isArray(x.services))return {...clone(base),...x,settings:{...base.settings,...x.settings}}}catch(e){}return clone(base)}
let store=load(),tab='calendar',view='month',cursor=new Date(),selected=localDate(new Date()),panel=null,editing=null,checkedServices=[],extras=[],search='',toastTimer,earlyFinishAuthorized=false,treatmentGender=null,treatmentCategory=null,settingsGender=null,settingsCategory=null;
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
function uid(){return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}function save(){localStorage.setItem(KEY,JSON.stringify(store))}function notify(t){let e=document.querySelector('.toast');if(e)e.remove();e=document.createElement('div');e.className='toast';e.innerHTML='<div class="ok">✓</div>'+esc(t);document.body.append(e);clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.remove(),1800)}
function findClient(id){return store.clients.find(c=>c.id===id)}function priceFor(b){const subtotal=(b.items||[]).reduce((a,x)=>a+Number(x.price||0),0);return Math.max(0,subtotal+(b.extras||[]).reduce((a,x)=>a+(Number.isFinite(Number(x.amount))?Number(x.amount):0),0))}
function visibleBookings(d){return store.bookings.filter(b=>b.date===d&&b.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start))}
function serviceNames(b){return (b.items||[]).map(i=>i.name).join(' · ')||'시술 미선택'}
function clientName(b){return findClient(b.clientId)?.name||b.name||'고객'}
function dateTitle(d){const x=dateOf(d);return `${x.getMonth()+1}월 ${x.getDate()}일 ${w[x.getDay()]}요일`}
const ICON_MARKUP=["<svg viewbox=\"0 0 28 28\"><rect height=\"19\" rx=\"3\" width=\"21\" x=\"3.5\" y=\"5.5\"></rect><path d=\"M8.5 3.5v5m11-5v5M4 11h20M8 15h.01M14 15h.01M20 15h.01M8 19h.01M14 19h.01M20 19h.01\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><rect height=\"21\" rx=\"3\" width=\"18\" x=\"5\" y=\"3.5\"></rect><path d=\"M9 8h10M9 13h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"M23.2 10.5A10 10 0 1 0 23 18M20.2 5.5l3.5 5 2-5.8\"></path><text fill=\"currentColor\" font-family=\"Arial,sans-serif\" font-size=\"16\" font-weight=\"700\" stroke=\"none\" text-anchor=\"middle\" x=\"13.5\" y=\"19\">$</text></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"m11.7 3.8.5-1h3.6l.5 1 1.7.9 1.1-.2 2.5 2.5-.2 1.1.9 1.7 1 .5v3.6l-1 .5-.9 1.7.2 1.1-2.5 2.5-1.1-.2-1.7.9-.5 1h-3.6l-.5-1-1.7-.9-1.1.2-2.5-2.5.2-1.1-.9-1.7-1-.5v-3.6l1-.5.9-1.7-.2-1.1 2.5-2.5 1.1.2z\"></path><circle cx=\"14\" cy=\"12.1\" r=\"3.5\"></circle></svg>"];
function nav(activeDark){const icons=ICON_MARKUP;return `<nav class="nav ${activeDark?'dark':''}">${['calendar','booking','sales','settings'].map((t,i)=>`<button aria-label="${['달력','시술 등록','매출','설정'][i]}" class="${tab===t?'active':''}" data-tab="${t}"><span class="nav-icon">${icons[i]}</span></button>`).join('')}</nav>`}
function render(){const dark=tab==='calendar';root.className=dark?'calendar-root':'light';root.innerHTML=(tab==='calendar'?calendarPage():tab==='booking'?bookingPage():tab==='sales'?salesPage():settingsPage())+nav(dark)+(tab==='calendar'?'<button class="fab" data-new="1" aria-label="예약 추가">+</button>':'');bind();if(typeof setTimeout==='function')setTimeout(()=>{checkPendingPassFirstUse();checkEndReminders()},180);}
function heading(){const anchor=view==='month'?`${cursor.getFullYear()}년 ${cursor.getMonth()+1}월`:view==='week'?`${shift(weekStart(selected),0).slice(5).replace('-','/')} – ${shift(weekStart(selected),6).slice(5).replace('-','/')}`:dateTitle(selected);return `<div class="heading-nav"><button data-move="-1" aria-label="이전">‹</button><strong>${anchor}</strong><button data-move="1" aria-label="다음">›</button></div>`}
function weekStart(d){const day=dateOf(d).getDay();return shift(d,-((day+6)%7))}
function calendarPage(){let html=`<div class="wrap"><div class="calendar-top"><button class="round-dark" data-panel="menu" aria-label="메뉴">≡</button><button class="round-dark" data-panel="search" aria-label="검색">⌕</button></div><div class="segment dark">${['month','week','day'].map((v,i)=>`<button data-view="${v}" class="${view===v?'active':''}">${['월간','주간','일간'][i]}</button>`).join('')}</div>${heading()}`;if(view==='month')html+=monthGrid();else html+=timeGrid();if(panel==='search')html+=`<div class="calendar-popup-backdrop" data-close-calendar-popup="1"><section class="calendar-popup" role="dialog" aria-modal="true" aria-label="예약 검색"><div class="calendar-popup-title"><h3>예약 검색</h3><button type="button" data-close-calendar-popup="1" aria-label="닫기">×</button></div><input id="calSearch" class="search" placeholder="고객 이름 검색" value="${esc(search)}"><div id="searchResults">${searchResults()}</div></section></div>`;if(panel==='menu')html+=`<div class="calendar-popup-backdrop" data-close-calendar-popup="1"><section class="calendar-popup calendar-menu-popup" role="dialog" aria-modal="true" aria-label="달력 메뉴"><div class="calendar-popup-title"><h3>S’NAIL BOOK 메뉴</h3><button type="button" data-close-calendar-popup="1" aria-label="닫기">×</button></div><button type="button" class="calendar-menu-option" data-today="1">오늘 날짜로 이동</button><button type="button" class="calendar-menu-option" data-tab="settings">설정 열기</button></section></div>`;if(panel==='appointments'&&visibleBookings(selected).length)html+=`<div class="appointment-backdrop" data-close-appointments="1"><section class="appointment-modal" role="dialog" aria-modal="true" aria-label="${dateTitle(selected)} 예약 상세"><button class="modal-close" data-close-appointments="1" aria-label="닫기">×</button>${dayDetail(selected)}</section></div>`;return html+'</div>'}
function monthGrid(){const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);const offset=(first.getDay()+6)%7;const count=Math.ceil((offset+new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate())/7)*7;const start=new Date(first);start.setDate(1-offset);let html='<div class="weeknames">'+['월','화','수','목','금','토','일'].map(v=>`<span>${v}</span>`).join('')+'</div><div class="month-grid">';for(let i=0;i<count;i++){let d=new Date(start);d.setDate(d.getDate()+i);let s=localDate(d),list=visibleBookings(s),out=d.getMonth()!==cursor.getMonth();html+=`<div class="month-cell ${s===selected?'sel':''}" data-date="${s}"><span class="day-num ${out?'outside':''} ${d.getDay()===0?'sun':''} ${s===localDate(new Date())?'today':''}">${d.getDate()}</span>${list.length?`<div class="day-count">${list.length}명</div>`:''}${list.slice(0,2).map(b=>`<div class="mini-book">${esc(b.start)}</div>`).join('')}${list.length>2?`<div class="plus-count">+${list.length-2}</div>`:''}</div>`}html+='</div>';return html}
function dayDetail(d){let bs=visibleBookings(d);return `<div class="detail"><h3>${dateTitle(d)} 예약 · ${bs.length}명</h3>${bs.length?bs.map(b=>`<button class="detail-row" data-edit="${b.id}"><span class="time-col">${b.start}–${b.end}</span><span><b>${esc(clientName(b))}</b><div class="sub">${esc(serviceNames(b))} · ${b.status==='paid'?'완료':b.status==='done'?'시술 완료 · 미정산':b.status==='noshow'?'노쇼':'예약'}</div></span><span style="margin-left:auto">›</span></button>`).join(''):'<div class="empty">예약 없음</div>'}</div>`}
function timeGrid(){
 const isWeek=view==='week',start=isWeek?weekStart(selected):selected;
 const days=isWeek?Array.from({length:7},(_,i)=>shift(start,i)):[selected];
 const first=isWeek?7:0,last=24,unit=isWeek?160:170;
 const head=isWeek?'<div class="week-days-viewport"><div class="week-days">'+days.map(d=>'<button class="week-day '+(selected===d?'active':'')+'" data-date="'+d+'">'+w[dateOf(d).getDay()]+'<strong>'+dateOf(d).getDate()+'</strong><small>'+visibleBookings(d).length+'명</small></button>').join('')+'</div></div>':
 '<div class="day-head-summary">'+visibleBookings(selected).length+'명 예약 · 시간대별 현황</div>';
 const labels=Array.from({length:last-first+1},(_,i)=>'<div class="hour-lab">'+String(first+i).padStart(2,'0')+'</div>').join('');
 const cols=days.map(d=>'<div class="week-column">'+visibleBookings(d).map(b=>{
  const top=Math.max(0,(mins(b.start)-first*60)/60*unit);
  const planned=Math.max(0,mins(b.end)-mins(b.start));
  const height=Math.max(isWeek?76:88,planned/60*unit-4);
  const state=b.status==='paid'?'완료':b.status==='done'?'시술 완료 · 미정산':b.status==='noshow'?'노쇼':b.status==='cancelled'?'취소':'예약';
  return '<button type="button" class="event '+(isWeek?'week-event':'day-event')+(b.status==='paid'?' paid':'')+
   '" data-edit="'+b.id+'" style="top:'+top+'px;min-height:'+height+'px;height:'+height+'px">'+
   '<strong class="event-time">'+esc(b.start)+'–'+esc(b.end)+'</strong>'+
   '<span class="event-client">'+esc(clientName(b))+'</span>'+
   '<span class="event-service">'+esc(serviceNames(b))+'</span>'+
   '<span class="event-state">'+state+'</span></button>';
 }).join('')+'</div>').join('');
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
 return Math.max(0,checkedServices.reduce((n,id)=>n+Number(store.services.find(s=>s.id===id)?.price||0),0)+
 [...root.querySelectorAll('[data-extra-amount]')].reduce((n,e)=>n+Number(e.value||0),0));
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
function bookingPage(){if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return simplePanel('Google 캘린더 연동','앱 완성 후 실제 사용자가 설치한 기기에서 연동할 예정입니다. 현재 버전은 캘린더 연동 기능을 실행하지 않습니다.');const b=editing?store.bookings.find(x=>x.id===editing):null;let client=b?findClient(b.clientId):null;let local=editing?b:null;let selections=checkedServices.map(id=>store.services.find(x=>x.id===id)).filter(Boolean),total=selections.reduce((a,s)=>a+Number(s.price),0)+extras.reduce((a,e)=>a+Number(e.amount),0);return `<div class="wrap"><h2 class="form-title">${b?'시술 예약 수정':'시술 예약 등록'} <small class="app-version-label">v0.7.2</small></h2><div class="card"><div class="field"><label>고객 이름</label><div class="client-autocomplete"><input id="name" autocomplete="off" placeholder="고객 이름 또는 초성 입력" value="${esc(client?.name||local?.name||'')}"><div id="clientSuggestions" class="client-suggestions" hidden></div></div></div><div class="field"><label>연락처</label><input id="phone" inputmode="tel" placeholder="010-0000-0000" value="${esc(client?.phone||local?.phone||'')}"></div><div class="field"><label>시술일</label><input id="date" type="date" value="${esc(local?.date||selected)}"></div><div class="field"><label>시술시간</label><input id="start" type="time" value="${esc(local?.start||store.settings.open)}"></div><div class="field"><label>종료시간</label><input id="end" type="time" value="${esc(local?.end||hour(mins(store.settings.open)+60))}"></div></div><div id="membershipMount"></div><div class="card"><div class="row"><b>시술 내역</b><span class="muted">복수 선택 가능</span></div><div class="treatment-catalog"><div class="treatment-genders">${[['W','여자 (W)'],['M','남자 (M)']].map(([g,label])=>`<button type="button" class="treatment-gender ${treatmentGender===g?'active':''}" data-treatment-gender="${g}">${label}<span>${treatmentGender===g?'⌃':'⌄'}</span></button>`).join('')}</div>${treatmentGender?`<div class="treatment-category-list">${TREATMENT_CATEGORIES.filter(cat=>treatmentGender==='W'||cat!=='특별 케어').map(cat=>`<button type="button" class="treatment-category ${treatmentCategory===cat?'active':''}" data-treatment-category="${cat}"><span>${cat}</span><span>›</span></button>`).join('')}</div>`:''}</div><div class="selected-treatments">${selections.map(s=>`<div class="selected-treatment"><span>${esc(s.name)}</span><button type="button" data-treatment-remove="${s.id}" aria-label="선택 해제">×</button></div>`).join('')||'<div class="muted">선택된 시술이 없습니다.</div>'}</div><div class="row" style="margin-top:13px"><span class="muted">선택 시술 예상 시간</span><b>${selections.reduce((a,s)=>a+Number(s.minutes),0)}분</b></div></div><div class="card"><div class="row"><b>그 외 추가 비용·할인</b><button class="secondary" data-add-extra="1">+ 항목 추가</button></div>${extras.map((e,i)=>`<div class="field"><input aria-label="추가 항목 이름" data-extra-name="${i}" placeholder="추가 아트·할인" value="${esc(e.name)}"><input aria-label="추가 금액" data-extra-amount="${i}" type="number" placeholder="할인 시 음수" value="${e.amount}"><button class="danger" data-remove-extra="${i}">×</button></div>`).join('')}<div class="row" style="margin-top:15px"><b>예상 결제 금액</b><b id="bookingTotal" style="font-size:22px;color:#087aff">${money(total+(b?.passPaymentMethod==="card"&&specialKind(selections)==="buy"?10000:0))}</b></div></div><div class="card"><div class="field"><label>진행 상태</label><select id="status"><option value="reserved" ${!local||local.status==='reserved'?'selected':''}>예약</option><option value="paid" ${local?.status==='paid'?'selected':''}>완료</option><option value="finishNow">지금 시술 완료</option>${local?.status==='done'?'<option value="done" selected>기존 시술 완료 · 정산 전</option>':''}<option value="cancelled" ${local?.status==='cancelled'?'selected':''}>예약 취소</option><option value="noshow" ${local?.status==='noshow'?'selected':''}>노쇼</option></select></div><div class="payment-method-block"><b>결제 방법</b><div class="payment-switch-row"><label class="payment-switch-option"><span>카드</span><input type="checkbox" id="payCard" ${local?.paymentMethod==='card'?'checked':''}><span class="payment-switch-track" aria-hidden="true"></span></label><label class="payment-switch-option"><span>현금</span><input type="checkbox" id="payCash" ${local?.paymentMethod==='cash'?'checked':''}><span class="payment-switch-track" aria-hidden="true"></span></label></div><p class="payment-note">처음에는 둘 다 꺼져 있습니다. 완료 시 결제 방법을 선택하세요.</p></div><div class="field"><label>고객 메모</label><textarea id="memo" placeholder="시술 및 고객 특이사항">${esc(local?.memo||'')}</textarea></div></div><button class="primary" data-save-booking="1">${b?'수정 내용 저장':'시술 금액 계산·예약 저장'}</button>${b?`<button class="danger" style="width:100%" data-delete-booking="${b.id}">예약 삭제</button><button class="ghost" style="width:100%;margin-top:10px" data-new="1">새 예약 등록</button>`:''}<p class="note">예약 시점에는 매출과 회원권 사용액에 반영되지 않습니다. 시술 종료 시간이 지난 후 ‘완료’로 저장하면 정산됩니다.</p></div>`}

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

let salesPopupPeriod=null;
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
 '<div class="section-title">고객별 수령·사용 내역 · '+displayEntries.length+'건</div>'+customerHtml+
 '</div></div>';
}
function salesPage(){
 const buttons=[['week','주간'],['month','월간'],['year','연간']].map(([key,label])=>
 '<button type="button" class="sales-period-button '+(salesPopupPeriod===key?'active':'')+'" data-sales-open="'+key+'">'+label+'</button>').join('');
 const label={week:'주간 매출',month:'월간 매출',year:'연간 매출'};
 return '<div class="wrap sales-popup-page"><div class="sales-period-bar">'+buttons+'</div>'+
 '<p class="sales-popup-hint">기간을 선택하면 매출 내역이 팝업으로 열립니다.</p></div>'+
 (salesPopupPeriod?'<div class="sales-popup-backdrop" data-sales-close="1">'+
 '<section class="sales-popup-panel" role="dialog" aria-modal="true" aria-label="'+label[salesPopupPeriod]+'">'+
 '<div class="sales-popup-header"><strong>'+label[salesPopupPeriod]+'</strong><button type="button" data-sales-close="1" aria-label="닫기">×</button></div>'+
 '<div class="sales-popup-scroll">'+salesPeriodCard(salesPopupPeriod,label[salesPopupPeriod])+'</div>'+
 '</section></div>':'');
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
function settingsPage(){if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return simplePanel('Google 캘린더 연동','앱 완성 후 실제 사용자의 Google 계정으로 연결할 예정입니다. 연결 기능은 현재 미구현 상태입니다.');if(panel==='reset')return resetPage();const entries=[['google','icons/settings/google.png','Google 캘린더 연동'],['services','💅','서비스 가격'],['hours','🕒','예약 시간 설정'],['client','👥','고객 관리'],['backup','icons/settings/backup.png','백업 내보내기·가져오기'],['reset','icons/settings/reset.png','초기화']];return `<div class="wrap">${entries.map(([id,ic,label])=>`<button class="setting-row" data-panel="${id}"><span class="emoji">${ic.startsWith("icons/")?`<img src="${ic}" alt="">`:ic}</span><span>${label}</span><span class="arrow">›</span></button>`).join('')}</div>`}

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
function openSettingsServiceWheel(){
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
 '<div class="settings-service-actions"><button type="button" class="settings-service-remove" aria-label="선택 서비스 삭제">−</button><button type="button" class="settings-service-add">+</button></div>'+
 '<div class="wheel-actions"><button type="button" class="wheel-cancel">취소</button><button type="button" class="wheel-done" aria-label="서비스 관리 닫기">✓</button></div></section>';
 document.body.appendChild(back);
 const y=window.scrollY,prior={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
 Object.assign(document.body.style,{position:'fixed',top:'-'+y+'px',left:'0',right:'0',width:'100%'});
 const col=back.querySelector('.settings-service-col'),newRow=back.querySelector('.settings-service-new'),input=back.querySelector('#newServiceName'),meta=back.querySelector('.settings-service-meta'),add=back.querySelector('.settings-service-add'),remove=back.querySelector('.settings-service-remove'),done=back.querySelector('.wheel-done');
 let adding=false,idx=0,settle;
 const close=()=>{clearTimeout(settle);back.remove();Object.assign(document.body.style,prior);window.scrollTo(0,y)};
 back.addEventListener('touchmove',e=>{if(!e.target.closest('.settings-service-col')&&!e.target.closest('input'))e.preventDefault()},{passive:false});
 function currentIndex(){return Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)))}
 function refresh(){
  if(adding){meta.textContent='서비스 이름 입력 후 저장하세요';add.textContent='저장';remove.disabled=true;done.disabled=true;return}
  idx=currentIndex();const s=options[idx];
  meta.textContent=s?'중앙 서비스 선택 · − 삭제 가능':'등록된 서비스 없음';
  add.textContent='+';remove.disabled=!s;done.disabled=!s;
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
  store.services.push({id:uid(),name,gender,category,price:0,minutes:60});
  save();close();render();notify('새 서비스 이름 저장 완료');
  openSettingsServiceWheel();
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
 requestAnimationFrame(refresh);
}
function recalcTreatmentEnd(){
  if(!tempForm||editing)return;
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
function openServiceWheel(id,kind){
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
    closeWheel();render();
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
 const count=store.bookings.filter(b=>b.clientId===c.id&&b.status!=='cancelled').length;
 const balance=walletLedger(c).balance;
 const pass=browPassLedger(c);
 const backdrop=document.createElement('div');
 backdrop.className='client-detail-backdrop';
 backdrop.innerHTML=`<section class="client-detail-dialog" role="dialog" aria-modal="true" aria-label="고객 정보">
 <button type="button" class="client-detail-x" aria-label="닫기" data-client-close="1">×</button>
 <h2>${esc(c.name)}</h2>
 <p class="client-detail-phone">${esc(c.phone)}</p>
 <div class="client-detail-stat"><span>방문 기록</span><strong>${count}건</strong></div>
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
function bind(){bindReceiptSwipes();bindSalesPopupScroll();bindScheduleScroll();root.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{tab=e.dataset.tab;panel=null;salesPopupPeriod=null;editing=null;earlyFinishAuthorized=false;checkedServices=[];extras=[];render()});root.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{view=e.dataset.view;panel=null;render()});root.querySelectorAll('[data-date]').forEach(e=>e.onclick=()=>{selected=e.dataset.date;cursor=dateOf(selected);panel=visibleBookings(selected).length?'appointments':null;render()});root.querySelectorAll('[data-close-appointments]').forEach(e=>e.onclick=ev=>{if(ev.target!==e)return;panel=null;render()});root.querySelectorAll('[data-move]').forEach(e=>e.onclick=()=>{let n=+e.dataset.move;if(view==='month'){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);selected=localDate(cursor)}else selected=shift(selected,n*(view==='week'?7:1));render()});root.querySelectorAll('[data-new]').forEach(e=>e.onclick=()=>{tab='booking';editing=null;earlyFinishAuthorized=false;checkedServices=[];extras=[];panel=null;render()});root.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>{earlyFinishAuthorized=false;editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);tab='booking';panel=null;render()});root.querySelectorAll('[data-panel]').forEach(e=>e.onclick=()=>{panel=panel===e.dataset.panel?null:e.dataset.panel;render()});root.querySelectorAll('[data-close-calendar-popup]').forEach(e=>e.onclick=ev=>{if(e!==ev.target)return;panel=null;render()});root.querySelectorAll('[data-back]').forEach(e=>e.onclick=()=>{panel=null;render()});root.querySelectorAll('[data-today]').forEach(e=>e.onclick=()=>{selected=localDate(new Date());cursor=new Date();panel=null;render()});if(tab==='booking'&&panel===null){setupClientAutocomplete()} let calSearch=root.querySelector('#calSearch');if(calSearch){calSearch.oninput=()=>{search=calSearch.value;root.querySelector('#searchResults').innerHTML=searchResults();bindSearchResults()}}bindSearchResults();if(tab==='booking'&&panel===null){refreshMemberCard()}root.querySelectorAll('[data-treatment-gender]').forEach(el=>el.onclick=()=>{captureForm();const g=el.dataset.treatmentGender;treatmentGender=treatmentGender===g?null:g;treatmentCategory=null;render();restoreForm()});
root.querySelectorAll('[data-treatment-category]').forEach(el=>el.onclick=()=>{captureForm();treatmentCategory=el.dataset.treatmentCategory;render();restoreForm();openTreatmentWheel()});root.querySelectorAll('[data-treatment-remove]').forEach(e=>e.onclick=()=>{captureForm();checkedServices=checkedServices.filter(id=>id!==e.dataset.treatmentRemove);recalcTreatmentEnd();render();restoreForm()});root.querySelectorAll('[data-add-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.push({name:'',amount:0});render();restoreForm()});root.querySelectorAll('[data-remove-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.splice(+e.dataset.removeExtra,1);render();restoreForm()});const payCard=root.querySelector('#payCard'),payCash=root.querySelector('#payCash');
if(payCard&&payCash){
 const preview=()=>{const label=root.querySelector('#bookingTotal');if(label&&checkedServices.includes(BROW_PASS_BUY))label.textContent=money(bookingAmountNow()+(payCard.checked?10000:0))};
 payCard.onchange=()=>{if(payCard.checked)payCash.checked=false;preview()};
 payCash.onchange=()=>{if(payCash.checked)payCard.checked=false;preview()};
}
root.querySelectorAll('[data-save-booking]').forEach(e=>e.onclick=submitBooking);root.querySelector('#status')?.addEventListener('change',updateStatusSaveLabel);updateStatusSaveLabel();root.querySelectorAll('[data-delete-booking]').forEach(e=>e.onclick=()=>{if(confirm('이 예약을 삭제할까요?')){store.bookings=store.bookings.filter(b=>b.id!==e.dataset.deleteBooking);save();editing=null;tab='calendar';render();notify('예약 삭제 완료')}});root.querySelectorAll('[data-sales-open]').forEach(e=>e.onclick=()=>{salesPopupPeriod=e.dataset.salesOpen;render()});root.querySelectorAll('[data-sales-close]').forEach(e=>e.onclick=ev=>{if(e!==ev.target)return;salesPopupPeriod=null;render()});root.querySelectorAll('[data-sales-move]').forEach(e=>e.onclick=()=>{const period=e.dataset.salesScope,n=+e.dataset.salesMove;if(period==='week')selected=shift(selected,n*7);else if(period==='year')cursor=new Date(cursor.getFullYear()+n,cursor.getMonth(),1);else cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);render()});root.querySelectorAll('[data-setting-gender]').forEach(e=>e.onclick=()=>{settingsGender=settingsGender===e.dataset.settingGender?null:e.dataset.settingGender;settingsCategory=null;render()});
root.querySelectorAll('[data-setting-category]').forEach(e=>e.onclick=()=>{settingsCategory=e.dataset.settingCategory;openSettingsServiceWheel()});root.querySelector('[data-open-closed-wheel]')?.addEventListener('click',openClosedDaysWheel);root.querySelector('[data-save-hours]')?.addEventListener('click',()=>{store.settings={open:val('open'),close:val('close'),interval:+val('interval'),closedDays:[...root.querySelectorAll('[data-closed-day]:checked')].map(e=>+e.dataset.closedDay)};if(mins(store.settings.open)>=mins(store.settings.close)){alert('영업 종료는 시작보다 늦어야 합니다.');return}save();notify('예약 시간 저장 완료')});root.querySelector('[data-add-client]')?.addEventListener('click',addClient);root.querySelectorAll('[data-client-detail]').forEach(e=>e.onclick=()=>openClientDetail(e.dataset.clientDetail));root.querySelector('[data-export]')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'SNAIL_BOOK',version:1,exportedAt:new Date().toISOString(),data:store},null,2)],{type:'application/json'});let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download='SNAIL_BOOK_backup_'+localDate(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),500)});root.querySelector('#importFile')?.addEventListener('change',async e=>{let file=e.target.files[0];if(!file)return;try{const x=JSON.parse(await file.text());if(x.app!=='SNAIL_BOOK'||!x.data||!Array.isArray(x.data.clients)||!Array.isArray(x.data.bookings)||!Array.isArray(x.data.services))throw Error('형식 오류');if(!confirm('현재 모든 데이터를 백업 파일로 교체할까요?'))return;store=x.data;save();render();notify('복원 완료')}catch(err){alert('S’NAIL BOOK 백업 파일이 아닙니다.')}});root.querySelectorAll('[data-reset-choice]').forEach(e=>e.addEventListener('change',()=>{const btn=root.querySelector('[data-reset-selected]');if(btn)btn.disabled=!root.querySelector('[data-reset-choice]:checked')}));root.querySelector('[data-reset-selected]')?.addEventListener('click',resetSelectedData)}
function bindSearchResults(){root.querySelectorAll('#searchResults [data-edit]').forEach(e=>e.onclick=()=>{editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);tab='booking';panel=null;render()})}
let tempForm=null;function captureForm(){if(tab!=='booking')return;tempForm={};['name','phone','date','start','end','status','memo','memberUse','payCard','payCash'].forEach(k=>{let e=root.querySelector('#'+k);if(e)tempForm[k]=e.type==='checkbox'?e.checked:e.value});extras=extras.map((x,i)=>({name:root.querySelector(`[data-extra-name="${i}"]`)?.value||'',amount:Number(root.querySelector(`[data-extra-amount="${i}"]`)?.value||0)}))}
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
 '<p>시술을 완료하셨나요?</p>'+
 '<div class="end-confirm-actions"><button class="end-confirm-later" type="button">나중에</button>'+
 '<button class="end-confirm-yes" type="button">완료 처리</button></div></section>';
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
   memberUse,status:f.status||'reserved',memo:f.memo||'',
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

function updateStatusSaveLabel(){
 const button=root.querySelector('[data-save-booking]'),status=root.querySelector('#status')?.value;
 if(!button)return;
 button.textContent=status==='finishNow'?'지금 시술 완료 · 결제 저장':status==='paid'?'시술 완료 · 결제 저장':editing?'수정 내용 저장':'시술 금액 계산·예약 저장';
}

function submitBooking(){
 captureForm();const f=tempForm;
 const name=f.name?.trim(),phone=f.phone?.trim();
 if(!name||!phone){alert('고객 이름과 연락처를 입력하세요.');return}
 if(!f.date||!f.start||!f.end||mins(f.end)<=mins(f.start)){alert('시술일과 시작·종료 시간을 확인하세요.');return}
 if(!checkedServices.length){alert('시술을 1개 이상 선택하세요.');return}
 if(f.status==='finishNow'){
  if(!bookingHasStarted(f.date,f.start)){alert('시술 시작 전에는 완료할 수 없습니다.');return}
  if(!confirm('실제로 시술을 마쳤습니까? 예약 종료 시간은 유지하고, 현재 시각을 실제 완료 시간으로 기록합니다.'))return;
  earlyFinishAuthorized=bookingEndIsFuture(f.date,f.end);
  f.status='paid';
  const el=root.querySelector('#status');if(el)el.value='paid';
 }else earlyFinishAuthorized=false;
 if(f.status==='paid'&&bookingEndIsFuture(f.date,f.end)&&!(earlyFinishAuthorized&&bookingHasStarted(f.date,f.start))){alert('아직 시술 종료 전입니다. 종료 시간 이후에 완료 처리할 수 있습니다. 지금은 예약 상태로 저장해 주세요.');return}
 const existing=store.clients.find(c=>c.name===name&&c.phone===phone);
 const client=existing||{id:uid(),name,phone,note:''};
 const collisions=store.bookings.filter(b=>b.id!==editing&&b.date===f.date&&b.status!=='cancelled'&&mins(f.start)<mins(b.end)&&mins(f.end)>mins(b.start));
 if(collisions.length&&!confirm('이미 '+collisions.length+'건의 예약과 시간이 겹칩니다. 그래도 저장할까요?'))return;
 const day=dateOf(f.date).getDay();
 if(store.settings.closedDays.includes(day)&&!confirm('설정된 정기 휴무일입니다. 그래도 예약할까요?'))return;
 if((mins(f.start)<mins(store.settings.open)||mins(f.end)>mins(store.settings.close))&&!confirm('영업시간 밖의 예약입니다. 그래도 저장할까요?'))return;
 const old=store.bookings.find(b=>b.id===editing);
 const available=Math.max(0,walletLedger(client).balance+(old?.status==='paid'&&old.clientId===client.id?Number(old.memberUse||0):0));
 const totalDue=normalDue(checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean),extras);
 const ctx={f,name,phone,old,client,available,totalDue,earlyFinish:earlyFinishAuthorized&&bookingEndIsFuture(f.date,f.end)};
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

if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=072',{updateViaCache:'none'}).catch(()=>{}));
if(typeof setInterval==='function')setInterval(checkEndReminders,30000);
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkEndReminders()});
render();
})();
