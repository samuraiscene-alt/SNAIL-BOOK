(()=>{'use strict';
const KEY='snailbook_v1_store';
const base={clients:[],services:[{id:'s1',name:'젤네일',price:50000,minutes:60},{id:'s2',name:'젤 제거',price:10000,minutes:30},{id:'s3',name:'네일아트',price:70000,minutes:90},{id:'s4',name:'기본 케어',price:30000,minutes:45}],bookings:[],settings:{open:'10:00',close:'20:00',interval:30,closedDays:[0]}};
function clone(o){return JSON.parse(JSON.stringify(o))}function load(){try{const x=JSON.parse(localStorage.getItem(KEY));if(x&&Array.isArray(x.bookings)&&Array.isArray(x.clients)&&Array.isArray(x.services))return {...clone(base),...x,settings:{...base.settings,...x.settings}}}catch(e){}return clone(base)}
let store=load(),tab='calendar',view='month',cursor=new Date(),selected=localDate(new Date()),panel=null,editing=null,checkedServices=[],extras=[],search='',toastTimer;
const root=document.getElementById('app');const w=['일','월','화','수','목','금','토'];
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function dateOf(s){return new Date(s+'T12:00:00')}function shift(s,n){let d=dateOf(s);d.setDate(d.getDate()+n);return localDate(d)}function money(n){return '₩'+Math.round(n||0).toLocaleString('ko-KR')}
function mins(s){const [h,m]=s.split(':').map(Number);return h*60+m}function hour(m){m=(m+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
function uid(){return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}function save(){localStorage.setItem(KEY,JSON.stringify(store))}function notify(t){let e=document.querySelector('.toast');if(e)e.remove();e=document.createElement('div');e.className='toast';e.innerHTML='<div class="ok">✓</div>'+esc(t);document.body.append(e);clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.remove(),1800)}
function findClient(id){return store.clients.find(c=>c.id===id)}function priceFor(b){const subtotal=(b.items||[]).reduce((a,x)=>a+Number(x.price||0),0);return Math.max(0,subtotal+(b.extras||[]).reduce((a,x)=>a+(Number.isFinite(Number(x.amount))?Number(x.amount):0),0))}
function visibleBookings(d){return store.bookings.filter(b=>b.date===d&&b.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start))}
function serviceNames(b){return (b.items||[]).map(i=>i.name).join(' · ')||'시술 미선택'}
function clientName(b){return findClient(b.clientId)?.name||b.name||'고객'}
function dateTitle(d){const x=dateOf(d);return `${x.getMonth()+1}월 ${x.getDate()}일 ${w[x.getDay()]}요일`}
const ICON_MARKUP=["<svg viewbox=\"0 0 28 28\"><rect height=\"19\" rx=\"3\" width=\"21\" x=\"3.5\" y=\"5.5\"></rect><path d=\"M8.5 3.5v5m11-5v5M4 11h20M8 15h.01M14 15h.01M20 15h.01M8 19h.01M14 19h.01M20 19h.01\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><rect height=\"21\" rx=\"3\" width=\"18\" x=\"5\" y=\"3.5\"></rect><path d=\"M9 8h10M9 13h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2\"></path></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"M23.2 10.5A10 10 0 1 0 23 18M20.2 5.5l3.5 5 2-5.8\"></path><text fill=\"currentColor\" font-family=\"Arial,sans-serif\" font-size=\"16\" font-weight=\"700\" stroke=\"none\" text-anchor=\"middle\" x=\"13.5\" y=\"19\">$</text></svg>", "<svg viewbox=\"0 0 28 28\"><path d=\"m11.7 3.8.5-1h3.6l.5 1 1.7.9 1.1-.2 2.5 2.5-.2 1.1.9 1.7 1 .5v3.6l-1 .5-.9 1.7.2 1.1-2.5 2.5-1.1-.2-1.7.9-.5 1h-3.6l-.5-1-1.7-.9-1.1.2-2.5-2.5.2-1.1-.9-1.7-1-.5v-3.6l1-.5.9-1.7-.2-1.1 2.5-2.5 1.1.2z\"></path><circle cx=\"14\" cy=\"12.1\" r=\"3.5\"></circle></svg>"];
function nav(activeDark){const icons=ICON_MARKUP;return `<nav class="nav ${activeDark?'dark':''}">${['calendar','booking','sales','settings'].map((t,i)=>`<button aria-label="${['달력','시술 등록','매출','설정'][i]}" class="${tab===t?'active':''}" data-tab="${t}"><span class="nav-icon">${icons[i]}</span></button>`).join('')}</nav>`}
function render(){const dark=tab==='calendar';root.className=dark?'calendar-root':'light';root.innerHTML=(tab==='calendar'?calendarPage():tab==='booking'?bookingPage():tab==='sales'?salesPage():settingsPage())+nav(dark)+(tab==='calendar'?'<button class="fab" data-new="1" aria-label="예약 추가">+</button>':'');bind();}
function heading(){const anchor=view==='month'?`${cursor.getFullYear()}년 ${cursor.getMonth()+1}월`:view==='week'?`${shift(weekStart(selected),0).slice(5).replace('-','/')} – ${shift(weekStart(selected),6).slice(5).replace('-','/')}`:dateTitle(selected);return `<div class="heading-nav"><button data-move="-1" aria-label="이전">‹</button><strong>${anchor}</strong><button data-move="1" aria-label="다음">›</button></div>`}
function weekStart(d){const day=dateOf(d).getDay();return shift(d,-((day+6)%7))}
function calendarPage(){let html=`<div class="wrap"><div class="calendar-top"><button class="round-dark" data-panel="menu" aria-label="메뉴">≡</button><button class="round-dark" data-panel="search" aria-label="검색">⌕</button></div><div class="segment dark">${['month','week','day'].map((v,i)=>`<button data-view="${v}" class="${view===v?'active':''}">${['월간','주간','일간'][i]}</button>`).join('')}</div>${heading()}`;if(view==='month')html+=monthGrid();else html+=timeGrid();if(panel==='search')html+=`<div class="detail"><input id="calSearch" class="search" placeholder="고객 이름 검색" value="${esc(search)}"><div id="searchResults">${searchResults()}</div></div>`;if(panel==='menu')html+=`<div class="detail"><h3>S’NAIL BOOK</h3><button class="chip" data-today="1">오늘로 이동</button><button class="chip" data-tab="settings">설정</button></div>`;if(panel==='appointments'&&visibleBookings(selected).length)html+=`<div class="appointment-backdrop" data-close-appointments="1"><section class="appointment-modal" role="dialog" aria-modal="true" aria-label="${dateTitle(selected)} 예약 상세"><button class="modal-close" data-close-appointments="1" aria-label="닫기">×</button>${dayDetail(selected)}</section></div>`;return html+'</div>'}
function monthGrid(){const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);const offset=(first.getDay()+6)%7;const count=Math.ceil((offset+new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate())/7)*7;const start=new Date(first);start.setDate(1-offset);let html='<div class="weeknames">'+['월','화','수','목','금','토','일'].map(v=>`<span>${v}</span>`).join('')+'</div><div class="month-grid">';for(let i=0;i<count;i++){let d=new Date(start);d.setDate(d.getDate()+i);let s=localDate(d),list=visibleBookings(s),out=d.getMonth()!==cursor.getMonth();html+=`<div class="month-cell ${s===selected?'sel':''}" data-date="${s}"><span class="day-num ${out?'outside':''} ${d.getDay()===0?'sun':''} ${s===localDate(new Date())?'today':''}">${d.getDate()}</span>${list.length?`<div class="day-count">${list.length}명</div>`:''}${list.slice(0,2).map(b=>`<div class="mini-book">${esc(b.start)}</div>`).join('')}${list.length>2?`<div class="plus-count">+${list.length-2}</div>`:''}</div>`}html+='</div>';return html}
function dayDetail(d){let bs=visibleBookings(d);return `<div class="detail"><h3>${dateTitle(d)} 예약 · ${bs.length}명</h3>${bs.length?bs.map(b=>`<button class="detail-row" data-edit="${b.id}"><span class="time-col">${b.start}–${b.end}</span><span><b>${esc(clientName(b))}</b><div class="sub">${esc(serviceNames(b))} · ${b.status==='paid'?'결제 완료':b.status==='done'?'시술 완료':'예약'}</div></span><span style="margin-left:auto">›</span></button>`).join(''):'<div class="empty">예약 없음</div>'}</div>`}
function timeGrid(){const isWeek=view==='week',start=isWeek?weekStart(selected):selected,days=isWeek?Array.from({length:7},(_,i)=>shift(start,i)):[selected],first=7,last=23,unit=60;let html=isWeek?`<div class="week-days">${days.map(d=>`<button class="week-day ${selected===d?'active':''}" data-date="${d}">${w[dateOf(d).getDay()]}<strong>${dateOf(d).getDate()}</strong><small>${visibleBookings(d).length}명</small></button>`).join('')}</div>`:`<div class="day-head-summary">${visibleBookings(selected).length}명 예약 · 시간대별 현황</div>`;html+=`<div class="calendar-grid-wrap"><div class="hour-labels">${Array.from({length:last-first},(_,i)=>`<div class="hour-lab">${String(first+i).padStart(2,'0')}:00</div>`).join('')}</div><div class="schedule-area" style="height:${(last-first)*unit}px"><div class="week-columns ${isWeek?'':'single-day'}">${days.map(d=>`<div class="week-column">${visibleBookings(d).map(b=>{let top=Math.max(0,(mins(b.start)-first*60)/60*unit),height=Math.max(27,(mins(b.end)-mins(b.start))/60*unit-2);return `<div class="event ${isWeek?'':'day-event'} ${b.status==='paid'?'paid':''}" data-edit="${b.id}" style="top:${top}px;height:${height}px"><b>${esc(b.start)}</b><br>${esc(clientName(b))}${isWeek?'':` · ${esc(serviceNames(b))}<br>${b.end} · ${b.status==='paid'?'결제 완료':b.status==='done'?'시술 완료':'예약'}`}</div>`}).join('')}</div>`).join('')}</div></div></div>`;return html}
function searchResults(){const s=search.trim();if(!s)return '<div class="sub">고객 이름으로 예약 검색</div>';let hits=store.bookings.filter(b=>clientName(b).includes(s)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);return hits.map(b=>`<button class="detail-row" data-edit="${b.id}"><span>${b.date} ${b.start} · ${esc(clientName(b))}</span></button>`).join('')||'<div class="empty">결과 없음</div>'}

/* Membership deposits are stored per customer; only paid booking use reduces credit. */
function walletLedger(client){
 const deposits=Array.isArray(client.walletDeposits)?client.walletDeposits:[];
 const received=deposits.reduce((sum,x)=>sum+Math.max(0,Number(x.amount)||0),0);
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
 const deposits=w.deposits.map(x=>({date:x.date||'',name:'회원권 충전',amount:Number(x.amount||0)}));
 const usage=w.uses.map(x=>({date:x.date||'',name:serviceNames(x),amount:-Number(x.memberUse||0)}));
 const recent=[...deposits,...usage].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,3);
 const selected=booked&&booked.clientId===client.id?Number(booked.memberUse||0):0;
 let entries=recent.map(x=>'<div class="row member-history-item"><span><small>'+esc(x.date)+'</small> '+esc(x.name)+'</span><strong>'+(x.amount>0?'+':'')+money(x.amount)+'</strong></div>').join('');
 return '<div class="card member-section"><div class="row"><b>회원권</b><span class="member-chip">이용 중</span></div>'+
 '<div class="member-balance"><div class="muted">현재 회원권 잔액</div><div class="member-total">'+money(w.balance)+'</div>'+
 '<div class="member-track"><div class="member-bar" style="width:'+percent+'%"></div></div>'+
 '<div class="row member-sums"><span>사용 '+money(w.spent)+'</span><span>충전 '+money(w.received)+'</span></div></div>'+
 '<label class="wallet-auto-row"><input type="checkbox" id="walletPay" '+(booked&&booked.status==='paid'&&selected===0?'':'checked')+'><span>회원권으로 결제 (자동 차감)</span></label>'+ 
 '<div class="member-usage"><label for="memberUse">이번 시술 회원권 사용</label><input id="memberUse" inputmode="numeric" type="number" min="0" max="'+available+'" step="1000" value="'+selected+'"></div>'+
 '<p class="note">결제 완료로 저장할 때만 차감 · 사용 가능 '+money(available)+'</p>'+
 '<div class="member-history"><b>최근 이용 내역</b>'+entries+'</div></div>';
}
function refreshMemberCard(){
 const host=root.querySelector('#membershipMount');if(!host)return;
 const current=bookingClient();
 const previous=host.dataset.clientId;
 const oldValue=host.querySelector('#memberUse')?.value;
 const booking=editing?store.bookings.find(x=>x.id===editing):null;
 host.innerHTML=current?memberCard(current,booking):'';
 host.dataset.clientId=current?.id||'';
 const input=host.querySelector('#memberUse');
 if(input){
   if(previous===current.id&&oldValue!==undefined)input.value=oldValue;
   bindWalletAutoPayment();
   input.addEventListener('change',()=>{
     const credit=walletLedger(current);
     const available=Math.max(0,credit.balance+(booking?.status==='paid'&&booking.clientId===current.id?Number(booking.memberUse||0):0));
     let amount=Number(input.value)||0;
     if(!Number.isFinite(amount)||amount<0)amount=0;
     input.value=Math.min(available,amount);
   });
 }
}


function bookingAmountNow(){
 return Math.max(0,checkedServices.reduce((n,id)=>n+Number(store.services.find(s=>s.id===id)?.price||0),0)+
 [...root.querySelectorAll('[data-extra-amount]')].reduce((n,e)=>n+Number(e.value||0),0));
}
function bindWalletAutoPayment(){
 const status=root.querySelector('#status'),check=root.querySelector('#walletPay'),amount=root.querySelector('#memberUse');
 if(!status||!check||!amount)return;
 const old=editing?store.bookings.find(b=>b.id===editing):null;
 function update(auto){
  const client=bookingClient();if(!client)return;
  const available=Math.max(0,walletLedger(client).balance+(old?.status==='paid'&&old.clientId===client.id?Number(old.memberUse||0):0));
  amount.disabled=!check.checked;
  if(!check.checked){amount.value='0';return}
  if(status.value==='paid'&&(auto||Number(amount.value)===0))amount.value=String(Math.min(available,bookingAmountNow()));
 }
 status.addEventListener('change',()=>update(true));
 check.addEventListener('change',()=>update(true));
 update(false);
}
function bookingPage(){if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return simplePanel('Google 캘린더 연동','앱 완성 후 실제 사용자가 설치한 기기에서 연동할 예정입니다. 현재 버전은 캘린더 연동 기능을 실행하지 않습니다.');const b=editing?store.bookings.find(x=>x.id===editing):null;let client=b?findClient(b.clientId):null;let local=editing?b:null;let selections=checkedServices.map(id=>store.services.find(x=>x.id===id)).filter(Boolean),total=selections.reduce((a,s)=>a+Number(s.price),0)+extras.reduce((a,e)=>a+Number(e.amount),0);return `<div class="wrap"><h2 class="form-title">${b?'시술 예약 수정':'시술 예약 등록'}</h2><div class="card"><div class="field"><label>고객 이름</label><div class="client-autocomplete"><input id="name" autocomplete="off" placeholder="고객 이름 또는 초성 입력" value="${esc(client?.name||local?.name||'')}"><div id="clientSuggestions" class="client-suggestions" hidden></div></div></div><div class="field"><label>연락처</label><input id="phone" inputmode="tel" placeholder="010-0000-0000" value="${esc(client?.phone||local?.phone||'')}"></div><div class="field"><label>시술일</label><input id="date" type="date" value="${esc(local?.date||selected)}"></div><div class="field"><label>시술시간</label><input id="start" type="time" value="${esc(local?.start||store.settings.open)}"></div><div class="field"><label>종료시간</label><input id="end" type="time" value="${esc(local?.end||hour(mins(store.settings.open)+60))}"></div></div><div id="membershipMount"></div><div class="card"><div class="row"><b>시술 내역</b><span class="muted">복수 선택 가능</span></div><button type="button" class="service-choose-button" data-treatment-open="1">시술 선택 · 추가 <span>›</span></button><div class="selected-treatments">${selections.map(s=>`<div class="selected-treatment"><span>${esc(s.name)} · ${money(s.price)} · ${s.minutes}분</span><button type="button" data-treatment-remove="${s.id}" aria-label="선택 해제">×</button></div>`).join('')||'<div class="muted">선택된 시술이 없습니다.</div>'}</div><div class="row" style="margin-top:13px"><span class="muted">선택 시술 예상 시간</span><b>${selections.reduce((a,s)=>a+Number(s.minutes),0)}분</b></div></div><div class="card"><div class="row"><b>그 외 추가 비용·할인</b><button class="secondary" data-add-extra="1">+ 항목 추가</button></div>${extras.map((e,i)=>`<div class="field"><input aria-label="추가 항목 이름" data-extra-name="${i}" placeholder="추가 아트·할인" value="${esc(e.name)}"><input aria-label="추가 금액" data-extra-amount="${i}" type="number" placeholder="할인 시 음수" value="${e.amount}"><button class="danger" data-remove-extra="${i}">×</button></div>`).join('')}<div class="row" style="margin-top:15px"><b>예상 결제 금액</b><b style="font-size:22px;color:#087aff">${money(total)}</b></div></div><div class="card"><div class="field"><label>진행 상태</label><select id="status"><option value="reserved" ${!local||local.status==='reserved'?'selected':''}>예약</option><option value="done" ${local?.status==='done'?'selected':''}>시술 완료</option><option value="paid" ${local?.status==='paid'?'selected':''}>결제 완료</option><option value="cancelled" ${local?.status==='cancelled'?'selected':''}>예약 취소</option></select></div><div class="field"><label>고객 메모</label><textarea id="memo" placeholder="시술 및 고객 특이사항">${esc(local?.memo||'')}</textarea></div></div><button class="primary" data-save-booking="1">${b?'수정 내용 저장':'시술 금액 계산·예약 저장'}</button>${b?`<button class="danger" style="width:100%" data-delete-booking="${b.id}">예약 삭제</button><button class="ghost" style="width:100%;margin-top:10px" data-new="1">새 예약 등록</button>`:''}<p class="note">예약 시점에는 매출에 포함되지 않습니다. ‘결제 완료’로 변경한 예약만 매출 통계에 집계합니다.</p></div>`}
function sumFor(b){return priceFor(b)}
function salesPage(){let period=panel==='week'?'week':panel==='year'?'year':'month';let today=selected;let current=cursor;let begin,end,title;if(period==='week'){begin=weekStart(today);end=shift(begin,6);title=begin.slice(5)+' ~ '+end.slice(5)}else if(period==='year'){begin=`${current.getFullYear()}-01-01`;end=`${current.getFullYear()}-12-31`;title=current.getFullYear()+'년'}else{begin=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-01`;end=localDate(new Date(current.getFullYear(),current.getMonth()+1,0));title=`${current.getFullYear()}년 ${current.getMonth()+1}월`}let bs=store.bookings.filter(b=>b.status==='paid'&&b.date>=begin&&b.date<=end),sum=bs.reduce((x,b)=>x+sumFor(b),0),groups={};bs.forEach(b=>{let k=b.clientId||b.name||'unknown';(groups[k]??=[]).push(b)});return `<div class="wrap"><div class="segment">${[['week','주간'],['month','월간'],['year','연간']].map(([k,v])=>`<button data-sales-period="${k}" class="${period===k?'active':''}">${v}</button>`).join('')}</div><div class="card row"><span class="muted">조회 기간</span><span class="row-actions"><button class="small-button" data-sales-move="-1">‹</button><b>${title}</b><button class="small-button" data-sales-move="1">›</button></span></div><div class="card"><div class="muted">${title} 매출 합계</div><div class="stat">${money(sum)}</div><div class="muted">시술 기록 ${bs.length}건</div></div><div class="section-title">고객별 매출</div>${Object.entries(groups).sort((a,b)=>b[1].reduce((x,r)=>x+sumFor(r),0)-a[1].reduce((x,r)=>x+sumFor(r),0)).map(([id,rows])=>`<details class="accordion"><summary><span>${esc(findClient(id)?.name||rows[0].name||'고객')}</span><span>${money(rows.reduce((x,b)=>x+sumFor(b),0))} · ${rows.length}회 ⌄</span></summary>${rows.sort((a,b)=>b.date.localeCompare(a.date)).map(b=>`<button class="detail-row" style="color:#202127" data-edit="${b.id}"><span>${b.date}<div class="sub">${esc(serviceNames(b))}</div></span><b>${money(sumFor(b))}</b></button>`).join('')}</details>`).join('')||'<div class="empty">해당 기간 결제 완료 내역이 없습니다.</div>'}</div>`}
function settingsPage(){if(panel==='client')return clientPage();if(panel==='services')return servicesPage();if(panel==='hours')return hoursPage();if(panel==='backup')return backupPage();if(panel==='google')return simplePanel('Google 캘린더 연동','앱 완성 후 실제 사용자의 Google 계정으로 연결할 예정입니다. 연결 기능은 현재 미구현 상태입니다.');if(panel==='reset')return simplePanel('초기화',`<p>모든 예약, 고객, 서비스와 설정을 초기화합니다.</p><button class="danger" data-reset="1">전체 데이터 초기화</button>`);const entries=[['google','icons/settings/google.png','Google 캘린더 연동'],['services','💅','서비스 가격'],['hours','🕒','예약 시간 설정'],['client','👥','고객 관리'],['backup','icons/settings/backup.png','백업 내보내기·가져오기'],['reset','icons/settings/reset.png','초기화']];return `<div class="wrap">${entries.map(([id,ic,label])=>`<button class="setting-row" data-panel="${id}"><span class="emoji">${ic.startsWith("icons/")?`<img src="${ic}" alt="">`:ic}</span><span>${label}</span><span class="arrow">›</span></button>`).join('')}</div>`}
function panelHead(s){return `<div class="menu-head"><button data-back="1">‹</button><strong>${s}</strong></div>`}function simplePanel(title,content){return `<div class="wrap">${panelHead(title)}<div class="card">${content}</div></div>`}
function formatDuration(n){const h=Math.floor(n/60),m=n%60;return h?(h+'시간'+(m?' '+m+'분':'')):(m+'분')}
function servicesPage(){return `<div class="wrap">${panelHead('서비스 가격')}<p class="muted">시술별 금액과 예상 소요 시간을 설정해 예약 등록 시 자동 적용합니다.</p><div class="card service-table"><div class="service-head"><span>서비스</span><span>가격 (원)</span><span>시간 (분)</span><span></span></div>${store.services.map(s=>`<div class="service-field"><input aria-label="서비스명 직접 입력" data-s-name="${s.id}" value="${esc(s.name)}"><button type="button" class="service-picker" data-wheel-kind="price" data-wheel-id="${s.id}" data-s-price="${s.id}">${Number(s.price).toLocaleString('ko-KR')}</button><button type="button" class="service-picker" data-wheel-kind="time" data-wheel-id="${s.id}" data-s-min="${s.id}">${formatDuration(Number(s.minutes))}</button><button class="danger" data-delete-s="${s.id}" aria-label="서비스 삭제">×</button></div>`).join('')}<button class="secondary" data-add-service="1">+ 서비스 추가</button></div><button class="primary" data-save-services="1">서비스 가격 저장</button></div>`}


function recalcTreatmentEnd(){
  if(!tempForm||editing)return;
  const duration=checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean).reduce((n,s)=>n+Number(s.minutes||0),0);
  const end=mins(tempForm.start||store.settings.open)+duration;
  if(duration>0&&end<1440)tempForm.end=hour(end);
}
function openTreatmentWheel(){
  if(!store.services.length){alert('설정에서 서비스를 등록해 주세요.');return}
  captureForm();
  const draft=new Set(checkedServices),options=store.services;
  let currentIndex=0,scrollStop;
  const back=document.createElement('div');
  back.className='wheel-backdrop treatment-wheel-backdrop';
  const optionHtml=options.map((s,i)=>'<div class="wheel-option treatment-option" data-treatment-index="'+i+'">'+esc(s.name)+'</div>').join('');
  back.innerHTML='<section class="wheel-sheet treatment-sheet" role="dialog" aria-modal="true" aria-label="시술 선택">'+
    '<div class="treatment-heading">시술 선택</div>'+
    '<div class="wheel-frame treatment-frame"><div class="wheel-highlight"></div><div class="wheel-col treatment-col"><div class="wheel-pad"></div>'+optionHtml+'<div class="wheel-pad"></div></div></div>'+
    '<div class="treatment-current"></div>'+
    '<button type="button" class="treatment-add">+ 선택한 시술 추가</button>'+
    '<div class="treatment-picked"></div>'+
    '<div class="wheel-actions"><button type="button" class="wheel-cancel">취소</button><button type="button" class="wheel-done" aria-label="선택 완료">✓</button></div></section>';
  document.body.appendChild(back);
  const y=window.scrollY;
  const prior={position:document.body.style.position,top:document.body.style.top,left:document.body.style.left,right:document.body.style.right,width:document.body.style.width};
  Object.assign(document.body.style,{position:'fixed',top:'-'+y+'px',left:'0',right:'0',width:'100%'});
  const close=()=>{back.remove();Object.assign(document.body.style,prior);window.scrollTo(0,y)};
  back.addEventListener('touchmove',e=>{if(!e.target.closest('.treatment-col'))e.preventDefault()},{passive:false});
  const col=back.querySelector('.treatment-col');
  const picked=back.querySelector('.treatment-picked');
  function refresh(){
    const s=options[currentIndex];
    back.querySelector('.treatment-current').textContent=s.name+' · '+money(s.price)+' · '+s.minutes+'분';
    back.querySelector('.treatment-add').textContent=draft.has(s.id)?'✓ 추가됨':'+ 선택한 시술 추가';
    picked.innerHTML=[...draft].map(id=>{const t=options.find(x=>x.id===id);return t?'<span class="treatment-tag">'+esc(t.name)+' <button type="button" data-draft-remove="'+t.id+'" aria-label="제거">×</button></span>':''}).join('')||'<span class="treatment-empty">선택된 시술 없음</span>';
  }
  col.addEventListener('scroll',()=>{
    currentIndex=Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)));
    refresh();
    clearTimeout(scrollStop);
    scrollStop=setTimeout(()=>{if(col.isConnected)col.scrollTo({top:currentIndex*44,behavior:'smooth'})},110);
  },{passive:true});
  col.addEventListener('click',e=>{const item=e.target.closest('[data-treatment-index]');if(item)col.scrollTo({top:Number(item.dataset.treatmentIndex)*44,behavior:'smooth'})});
  back.querySelector('.treatment-add').onclick=()=>{
    currentIndex=Math.max(0,Math.min(options.length-1,Math.round(col.scrollTop/44)));
    draft.add(options[currentIndex].id);refresh();
  };
  picked.onclick=e=>{const el=e.target.closest('[data-draft-remove]');if(el){draft.delete(el.dataset.draftRemove);refresh()}};
  back.querySelector('.wheel-cancel').onclick=()=>{close();tempForm=null};
  back.addEventListener('click',e=>{if(e.target===back){close();tempForm=null}});
  back.querySelector('.wheel-done').onclick=()=>{
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
function hoursPage(){return `<div class="wrap">${panelHead('예약 시간 설정')}<div class="card"><div class="field"><label>영업 시작</label><input type="time" id="open" value="${store.settings.open}"></div><div class="field"><label>영업 종료</label><input type="time" id="close" value="${store.settings.close}"></div><div class="field"><label>예약 간격</label><select id="interval">${[15,30,60].map(n=>`<option ${store.settings.interval===n?'selected':''} value="${n}">${n}분</option>`).join('')}</select></div><div style="margin-top:20px"><b>정기 휴무 요일</b><div style="margin-top:12px">${['일','월','화','수','목','금','토'].map((v,i)=>`<label class="chip"><input type="checkbox" data-closed-day="${i}" ${store.settings.closedDays.includes(i)?'checked':''}> ${v}</label>`).join('')}</div></div></div><button class="primary" data-save-hours="1">예약 시간 저장</button></div>`}
function clientPage(){return `<div class="wrap">${panelHead('고객 관리')}<div class="card"><div class="field"><label>고객 이름</label><input id="clientName" placeholder="이름 입력"></div><div class="field"><label>연락처</label><input id="clientPhone" type="tel" placeholder="010-0000-0000"></div><div class="field"><label>특이사항</label><input id="clientNote" placeholder="메모"></div><button class="primary" data-add-client="1">고객 등록</button></div><div class="section-title">등록된 고객 ${store.clients.length}명</div>${store.clients.map(c=>`<button class="client-list-button" type="button" data-client-detail="${c.id}"><span><b>${esc(c.name)}</b><small>${esc(c.phone)}</small></span><span class="client-list-chevron">›</span></button>`).join('')||'<div class="empty">등록된 고객이 없습니다.</div>'}</div>`}
function openClientDetail(id){
 const c=findClient(id);if(!c)return;
 document.querySelector('.client-detail-backdrop')?.remove();
 const count=store.bookings.filter(b=>b.clientId===c.id&&b.status!=='cancelled').length;
 const balance=walletLedger(c).balance;
 const backdrop=document.createElement('div');
 backdrop.className='client-detail-backdrop';
 backdrop.innerHTML=`<section class="client-detail-dialog" role="dialog" aria-modal="true" aria-label="고객 정보">
 <button type="button" class="client-detail-x" aria-label="닫기" data-client-close="1">×</button>
 <h2>${esc(c.name)}</h2>
 <p class="client-detail-phone">${esc(c.phone)}</p>
 <div class="client-detail-stat"><span>방문 기록</span><strong>${count}건</strong></div>
 <div class="client-detail-stat"><span>회원권 잔액</span><strong class="client-detail-credit">${money(balance)}</strong></div>
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
 const typed=prompt(client.name+' 회원권 충전 금액(원)','300000');if(typed===null)return;
 const amount=Number(typed.replace(/,/g,''));
 if(!Number.isSafeInteger(amount)||amount<=0||amount>50000000){alert('1원 이상 5천만원 이하 금액을 입력해 주세요.');return}
 if(!confirm(client.name+' 회원권에 '+money(amount)+' 충전 기록을 추가할까요?'))return;
 if(!Array.isArray(client.walletDeposits))client.walletDeposits=[];
 client.walletDeposits.push({id:uid(),amount,date:localDate(new Date()),createdAt:new Date().toISOString()});
 save();render();notify('회원권 충전 완료');
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
function bind(){root.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{tab=e.dataset.tab;panel=null;editing=null;checkedServices=[];extras=[];render()});root.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>{view=e.dataset.view;panel=null;render()});root.querySelectorAll('[data-date]').forEach(e=>e.onclick=()=>{selected=e.dataset.date;cursor=dateOf(selected);panel=visibleBookings(selected).length?'appointments':null;render()});root.querySelectorAll('[data-close-appointments]').forEach(e=>e.onclick=ev=>{if(ev.target!==e)return;panel=null;render()});root.querySelectorAll('[data-move]').forEach(e=>e.onclick=()=>{let n=+e.dataset.move;if(view==='month'){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);selected=localDate(cursor)}else selected=shift(selected,n*(view==='week'?7:1));render()});root.querySelectorAll('[data-new]').forEach(e=>e.onclick=()=>{tab='booking';editing=null;checkedServices=[];extras=[];panel=null;render()});root.querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>{editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);tab='booking';panel=null;render()});root.querySelectorAll('[data-panel]').forEach(e=>e.onclick=()=>{panel=e.dataset.panel;render()});root.querySelectorAll('[data-back]').forEach(e=>e.onclick=()=>{panel=null;render()});root.querySelectorAll('[data-today]').forEach(e=>e.onclick=()=>{selected=localDate(new Date());cursor=new Date();panel=null;render()});if(tab==='booking'&&panel===null){setupClientAutocomplete()} let calSearch=root.querySelector('#calSearch');if(calSearch){calSearch.oninput=()=>{search=calSearch.value;root.querySelector('#searchResults').innerHTML=searchResults();bindSearchResults()}}bindSearchResults();if(tab==='booking'&&panel===null){refreshMemberCard()}root.querySelector('[data-treatment-open]')?.addEventListener('click',openTreatmentWheel);root.querySelectorAll('[data-treatment-remove]').forEach(e=>e.onclick=()=>{captureForm();checkedServices=checkedServices.filter(id=>id!==e.dataset.treatmentRemove);recalcTreatmentEnd();render();restoreForm()});root.querySelectorAll('[data-add-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.push({name:'',amount:0});render();restoreForm()});root.querySelectorAll('[data-remove-extra]').forEach(e=>e.onclick=()=>{captureForm();extras.splice(+e.dataset.removeExtra,1);render();restoreForm()});root.querySelectorAll('[data-save-booking]').forEach(e=>e.onclick=submitBooking);root.querySelectorAll('[data-delete-booking]').forEach(e=>e.onclick=()=>{if(confirm('이 예약을 삭제할까요?')){store.bookings=store.bookings.filter(b=>b.id!==e.dataset.deleteBooking);save();editing=null;tab='calendar';render();notify('예약 삭제 완료')}});root.querySelectorAll('[data-sales-period]').forEach(e=>e.onclick=()=>{panel=e.dataset.salesPeriod;render()});root.querySelectorAll('[data-sales-move]').forEach(e=>e.onclick=()=>{const period=panel==='week'?'week':panel==='year'?'year':'month',n=+e.dataset.salesMove;if(period==='week')selected=shift(selected,n*7);else if(period==='year')cursor=new Date(cursor.getFullYear()+n,cursor.getMonth(),1);else cursor=new Date(cursor.getFullYear(),cursor.getMonth()+n,1);render()});root.querySelectorAll('[data-wheel-kind]').forEach(e=>e.onclick=()=>openServiceWheel(e.dataset.wheelId,e.dataset.wheelKind));root.querySelector('[data-add-service]')?.addEventListener('click',()=>{readServices();store.services.push({id:uid(),name:'새 서비스',price:0,minutes:60});render()});root.querySelectorAll('[data-delete-s]').forEach(e=>e.onclick=()=>{readServices();store.services=store.services.filter(s=>s.id!==e.dataset.deleteS);render()});root.querySelector('[data-save-services]')?.addEventListener('click',()=>{readServices();save();render();notify('서비스 저장 완료')});root.querySelector('[data-save-hours]')?.addEventListener('click',()=>{store.settings={open:val('open'),close:val('close'),interval:+val('interval'),closedDays:[...root.querySelectorAll('[data-closed-day]:checked')].map(e=>+e.dataset.closedDay)};if(mins(store.settings.open)>=mins(store.settings.close)){alert('영업 종료는 시작보다 늦어야 합니다.');return}save();notify('예약 시간 저장 완료')});root.querySelector('[data-add-client]')?.addEventListener('click',addClient);root.querySelectorAll('[data-client-detail]').forEach(e=>e.onclick=()=>openClientDetail(e.dataset.clientDetail));root.querySelector('[data-export]')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'SNAIL_BOOK',version:1,exportedAt:new Date().toISOString(),data:store},null,2)],{type:'application/json'});let a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download='SNAIL_BOOK_backup_'+localDate(new Date())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),500)});root.querySelector('#importFile')?.addEventListener('change',async e=>{let file=e.target.files[0];if(!file)return;try{const x=JSON.parse(await file.text());if(x.app!=='SNAIL_BOOK'||!x.data||!Array.isArray(x.data.clients)||!Array.isArray(x.data.bookings)||!Array.isArray(x.data.services))throw Error('형식 오류');if(!confirm('현재 모든 데이터를 백업 파일로 교체할까요?'))return;store=x.data;save();render();notify('복원 완료')}catch(err){alert('S’NAIL BOOK 백업 파일이 아닙니다.')}});root.querySelector('[data-reset]')?.addEventListener('click',()=>{if(confirm('정말 전체 데이터를 초기화할까요? 복구할 수 없습니다.')&&confirm('한 번 더 확인합니다. 전체 삭제할까요?')){store=clone(base);save();panel=null;render();notify('초기화 완료')}})}
function bindSearchResults(){root.querySelectorAll('#searchResults [data-edit]').forEach(e=>e.onclick=()=>{editing=e.dataset.edit;let b=store.bookings.find(x=>x.id===editing);checkedServices=(b.items||[]).map(i=>i.id);extras=clone(b.extras||[]);tab='booking';panel=null;render()})}
let tempForm=null;function captureForm(){if(tab!=='booking')return;tempForm={};['name','phone','date','start','end','status','memo','memberUse'].forEach(k=>{let e=root.querySelector('#'+k);if(e)tempForm[k]=e.value});extras=extras.map((x,i)=>({name:root.querySelector(`[data-extra-name="${i}"]`)?.value||'',amount:Number(root.querySelector(`[data-extra-amount="${i}"]`)?.value||0)}))}
function restoreForm(){if(!tempForm)return;Object.entries(tempForm).forEach(([k,v])=>{let e=root.querySelector('#'+k);if(e)e.value=v});tempForm=null}
function val(id){return root.querySelector('#'+id)?.value||''}function readServices(){store.services.forEach(s=>{s.name=root.querySelector(`[data-s-name="${s.id}"]`)?.value?.trim()||s.name})}
function addClient(){const name=val('clientName').trim(),phone=val('clientPhone').trim(),note=val('clientNote').trim();if(!name||!phone){alert('고객 이름과 연락처를 입력하세요.');return}if(store.clients.some(c=>c.name===name&&c.phone===phone)){alert('이미 등록된 고객입니다.');return}store.clients.push({id:uid(),name,phone,note});save();render();notify('고객 등록 완료')}
function submitBooking(){captureForm();const f=tempForm;const name=f.name?.trim(),phone=f.phone?.trim();if(!name||!phone){alert('고객 이름과 연락처를 입력하세요.');return}if(!f.date||!f.start||!f.end||mins(f.end)<=mins(f.start)){alert('시술일과 시작·종료 시간을 확인하세요.');return}if(!checkedServices.length){alert('시술을 1개 이상 선택하세요.');return}let clients=store.clients.filter(c=>c.name===name&&c.phone===phone);let client=clients[0];if(!client){client={id:uid(),name,phone,note:''};store.clients.push(client)}let list=store.bookings.filter(b=>b.id!==editing&&b.date===f.date&&b.status!=='cancelled'&&mins(f.start)<mins(b.end)&&mins(f.end)>mins(b.start));if(list.length&&!confirm(`이미 ${list.length}건의 예약과 시간이 겹칩니다. 그래도 저장할까요?`))return;const day=dateOf(f.date).getDay();if(store.settings.closedDays.includes(day)&&!confirm('설정된 정기 휴무일입니다. 그래도 예약할까요?'))return;if((mins(f.start)<mins(store.settings.open)||mins(f.end)>mins(store.settings.close))&&!confirm('영업시간 밖의 예약입니다. 그래도 저장할까요?'))return;const old=store.bookings.find(b=>b.id===editing);
const available=walletLedger(client).balance+(old?.status==='paid'&&old.clientId===client.id?Number(old.memberUse||0):0);
const totalDue=Math.max(0,checkedServices.reduce((n,id)=>n+Number(store.services.find(s=>s.id===id)?.price||0),0)+extras.reduce((n,x)=>n+Number(x.amount||0),0));
const useWallet=!!root.querySelector('#walletPay')?.checked;
let memberUse=f.status==='paid'&&useWallet?Number(f.memberUse||0):0;
if(!Number.isSafeInteger(memberUse)||memberUse<0){alert('회원권 사용 금액을 확인해 주세요.');return}
if(f.status==='paid'&&useWallet&&memberUse===0)memberUse=Math.min(available,totalDue);
if(memberUse>available||memberUse>totalDue){alert('회원권 잔액 또는 시술 금액보다 많이 사용할 수 없습니다.');return}
const b={id:editing||uid(),clientId:client.id,name,phone,date:f.date,start:f.start,end:f.end,items:checkedServices.map(id=>store.services.find(s=>s.id===id)).filter(Boolean).map(s=>clone(s)),extras:clone(extras),memberUse,status:f.status||'reserved',memo:f.memo||'',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(editing)store.bookings=store.bookings.map(x=>x.id===editing?b:x);else store.bookings.push(b);save();selected=f.date;cursor=dateOf(selected);tab='calendar';panel=null;editing=null;checkedServices=[];extras=[];tempForm=null;render();notify('예약 저장 완료')}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));render();
})();
