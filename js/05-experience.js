/* Presentation and navigation only; existing data and Supabase flows stay in their modules. */
let selectedDay = toISODate(new Date());
const PAGE_NAMES = {overview:'Mi día',tasks:'Mis tareas',calendar:'Calendario',agenda:'Agenda',lists:'Mis listas',notes:'Notas',timer:'Concentración',stats:'Mi progreso',app:'Instalar TRX'};

function updatePageChrome(id) {
  if ($('#pageCrumb')) $('#pageCrumb').textContent = PAGE_NAMES[id] || 'Mi espacio';
  document.title = `${PAGE_NAMES[id] || 'TRX'} · TRX`;
  $$('.viewSwitch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  $$('.mobileNav button').forEach(b => b.setAttribute('aria-current', b.dataset.go === id ? 'page' : 'false'));
  if (id === 'overview') renderDayOverview();
}

function readableDate(iso) {
  if (!iso) return 'Sin fecha';
  const d = parseISODate(iso);
  if (!d) return 'Sin fecha';
  const delta = daysBetween(new Date(), d);
  if (delta === 0) return 'Hoy';
  if (delta === 1) return 'Mañana';
  if (delta === -1) return 'Ayer';
  return d.toLocaleDateString('es', {day:'numeric',month:'short'});
}

function renderDayOverview() {
  const host = $('#todayTasks');
  if (!host) return;
  const now = new Date();
  const today = toISODate(now);
  const name = state.guest ? '' : state.session?.u?.split(' ')[0];
  const salutation = now.getHours()<12?'Buenos días':now.getHours()<20?'Buenas tardes':'Buenas noches';
  $('#greeting').textContent = `${salutation}${name ? ', '+name : ''}.`;
  $('#daySubtitle').textContent = 'Un poco de claridad. Un día con intención.';
  $('#summaryDate').textContent = now.toLocaleDateString('es', {weekday:'long',day:'numeric',month:'long'});
  $('#homeStreak').textContent = activityStreak();
  $('#userAvatar').textContent = state.guest ? 'D' : (state.session?.u || 'T').slice(0,1).toUpperCase();
  $('#userAvatar').title = state.guest ? 'Modo demo' : state.session?.u || 'Tu espacio';
  const monday = new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7));
  $('#weekStrip').innerHTML = Array.from({length:7},(_,i)=>{
    const d=new Date(monday); d.setDate(monday.getDate()+i); const iso=toISODate(d);
    const count=state.tasks.filter(t=>t.startDate<=iso&&t.endDate>=iso&&t.status!=='done').length;
    return `<button type="button" class="weekDay${iso===selectedDay?' selected':''}${iso===today?' isToday':''}" data-day="${iso}" aria-pressed="${iso===selectedDay}" aria-label="${escapeHtml(d.toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'}))}, ${count} pendientes"><span>${d.toLocaleDateString('es',{weekday:'short'}).replace('.','')}</span><strong>${d.getDate()}</strong><i class="dayDots" aria-hidden="true">${Array.from({length:Math.min(count,3)},()=>'<b></b>').join('')}</i></button>`;
  }).join('');
  const tasks=state.tasks.filter(t=>t.startDate<=selectedDay&&t.endDate>=selectedDay).sort((a,b)=>(a.status==='done')-(b.status==='done') || (a.startTime||'99').localeCompare(b.startTime||'99'));
  const displayDay = selectedDay === today ? 'Tu plan de hoy' : parseISODate(selectedDay).toLocaleDateString('es',{weekday:'long',day:'numeric'});
  $('#todayTitle').innerHTML = `${escapeHtml(displayDay)} <span class="countBadge">${tasks.length}</span>`;
  host.innerHTML=tasks.length?tasks.map(t=>{
    const pr=prBadge(t.priority); const st=statusLabel(t.status);
    return `<div class="dayTask ${t.status==='done'?'completed':''}"><input type="checkbox" class="dayCheck" data-complete="${escapeHtml(t.id)}" ${t.status==='done'?'checked':''} aria-label="Completar ${escapeHtml(t.title)}"/><button type="button" class="dayTaskTitle" data-edit-task="${escapeHtml(t.id)}"><strong>${escapeHtml(t.title)}</strong><span>${t.category==='event'?'Evento':'Tarea'}${t.startTime?' · '+escapeHtml(t.startTime):''}${t.tags?.length?' <i>·</i> '+escapeHtml(t.tags.slice(0,2).join(' · ')):''}</span></button><span class="badge ${pr.cls}">${pr.txt}</span><span class="taskStatus ${st.cls}">${st.txt}</span></div>`;
  }).join(''):`<div class="dayEmpty">${trxIcon('sun')}<h3>Un día por escribir.</h3><p>Añade tu primera tarea y da un pequeño paso hacia lo que importa.</p></div>`;
  const next=state.tasks.filter(t=>t.startDate>today&&t.status!=='done').sort((a,b)=>a.startDate.localeCompare(b.startDate)).slice(0,3);
  $('#upcomingTasks').innerHTML=next.length?next.map(t=>`<button type="button" class="upcomingItem" data-edit-task="${escapeHtml(t.id)}"><span class="upcomingDate"><strong>${parseISODate(t.startDate).getDate()}</strong><span>${parseISODate(t.startDate).toLocaleDateString('es',{month:'short'})}</span></span><span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(readableDate(t.startDate))}${t.startTime?' · '+escapeHtml(t.startTime):''}</small></span>${trxIcon('arrow')}</button>`).join(''):'<p class="muted quietEmpty">Lo que planees para los próximos días aparecerá aquí.</p>';
  const isRunning = state.timer.running;
  $('#focusDuration').textContent = isRunning ? fmtTimer(Math.max(0,state.timer.endAt-Date.now())) : state.timer.pomodoro.workMin;
  $('#focusUnit').textContent = isRunning ? 'sesión en curso' : 'minutos para ti';
  $('#homeFocusLabel').textContent = isRunning ? 'Volver a mi sesión' : 'Preparar sesión';
  $$('.viewSwitch button').forEach(b=>b.setAttribute('aria-pressed',String(state.view===b.dataset.view)));
}

function initExperience() {
  if (document.body.dataset.experienceReady) return;
  document.body.dataset.experienceReady = 'true';
  hydrateIcons();
  // Preserve the visible trigger even when a legacy hidden button opens the dialog.
  let lastTrigger = document.activeElement;
  document.addEventListener('click', e => { if (e.isTrusted) lastTrigger = e.target.closest('button,a,input,[tabindex]') || document.activeElement; }, true);
  document.addEventListener('keydown', () => { lastTrigger = document.activeElement; }, true);
  const surfaces = [...document.querySelectorAll('.modal,.popup,.drawer')];
  const opened = new Map();
  const isOpen = el => el.classList.contains('open') || el.classList.contains('show');
  const visible = el => el?.isConnected && el.getClientRects().length && !el.closest('[inert]');
  const syncDialogs = () => {
    for (const el of surfaces) {
      const active = isOpen(el);
      if (el.classList.contains('drawer')) el.inert = !active;
      if (active && !opened.has(el)) {
        opened.set(el, lastTrigger);
        const first = el.querySelector('input:not([type="hidden"]),button:not(:disabled),[tabindex="0"]');
        if (first) first.focus({preventScroll:true});
      } else if (!active && opened.has(el)) {
        const trigger = opened.get(el); opened.delete(el);
        if (!surfaces.some(isOpen)) {
          const fallback = [...document.querySelectorAll('[data-create-task],.tab.active,#btnMenu')].find(visible);
          (visible(trigger) ? trigger : fallback)?.focus({preventScroll:true});
        }
      }
    }
  };
  const dialogObserver = new MutationObserver(syncDialogs);
  surfaces.forEach(el => dialogObserver.observe(el,{attributes:true,attributeFilter:['class','hidden']}));
  syncDialogs();
  $('#btnCmdk').setAttribute('aria-label','Buscar tareas o acciones');
  $('#btnMenu').setAttribute('aria-controls','sidebar');
  const mobileQuery = window.matchMedia('(max-width:980px)');
  const syncSidebarAccess = () => { $('#sidebar').inert = mobileQuery.matches && !$('#sidebar').classList.contains('open'); };
  mobileQuery.addEventListener('change',syncSidebarAccess); syncSidebarAccess();
  const buttonIcons = {pwToggle:'eye',modalX:'close',editX:'close',cmdkX:'close',dayModalX:'close',btnTaskNewClose:'close',btnNotifyClose:'close',btnListCreateClose:'close'};
  for (const [id,icon] of Object.entries(buttonIcons)) if ($('#'+id)) $('#'+id).innerHTML=trxIcon(icon);
  $('#btnNotify').textContent='Notificaciones';
  document.querySelector('.playlistCover').innerHTML=trxIcon('folder');
  document.querySelector('.emptyIcon').innerHTML=trxIcon('check');
  document.querySelector('.emptyDesc').textContent='Crea tu primera tarea con el botón Nueva tarea.';
  $('#btnLogout').innerHTML=trxIcon('logout')+'<span>Cerrar sesión</span>';
  $('#topNotify').addEventListener('click', openDrawer);
  const mobile=document.createElement('nav'); mobile.className='mobileNav'; mobile.setAttribute('aria-label','Navegación rápida');
  mobile.innerHTML=[['overview','Mi día','sun'],['tasks','Tareas','check'],['calendar','Calendario','calendar'],['timer','Foco','timer']].map(([id,label,icon])=>`<button type="button" data-go="${id}" aria-current="${id==='overview'?'page':'false'}">${trxIcon(icon)}<span>${label}</span></button>`).join('')+'<button type="button" data-mobile-more>'+trxIcon('menu')+'<span>Más</span></button>';
  document.querySelector('.app').appendChild(mobile);
  const create = () => { switchTab('tasks'); $('#btnTaskNew').click(); };
  document.addEventListener('click',e=>{
    const go=e.target.closest('[data-go]'); if(go){switchTab(go.dataset.go); window.scrollTo({top:0,behavior:'instant'});}
    if(e.target.closest('[data-create-task]')) create();
    if(e.target.closest('[data-mobile-more]')) openSidebarMobile();
    const day=e.target.closest('[data-day]'); if(day){selectedDay=day.dataset.day; renderDayOverview(); document.querySelector(`[data-day="${selectedDay}"]`).focus({preventScroll:true});}
    const edit=e.target.closest('[data-edit-task]'); if(edit){const t=state.tasks.find(x=>x.id===edit.dataset.editTask); if(t) openEdit(t);}
    const view=e.target.closest('[data-view]'); if(view){$('#viewSelect').value=view.dataset.view; $('#viewSelect').dispatchEvent(new Event('change'));}
  });
  $('#todayTasks').addEventListener('change',e=>{if(e.target.dataset.complete){updateTaskStatus(e.target.dataset.complete,e.target.checked?'done':'todo'); renderDayOverview();}});
  $('#homeFocus').addEventListener('click',()=>{if(!state.timer.running) setTimerMode('pomodoro'); switchTab('timer');});
  $('#calendarGrid').addEventListener('keydown',e=>{const cell=e.target.closest('[data-date]'); if(cell&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDayModal(cell.dataset.date);}});
  document.addEventListener('keydown',e=>{
    const editing=e.target.matches('input,textarea,select,[contenteditable="true"]');
    if(e.key.toLowerCase()==='n'&&!editing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&$('#authGate').classList.contains('hidden')&&!document.querySelector('.modal.show,.popup.open')) {e.preventDefault();create();}
    // Keep keyboard focus inside visible modal surfaces and return it on closing.
    if(e.key==='Tab') {
      const active=[...document.querySelectorAll('.gate:not(.hidden),.modal.show,.popup.open,.drawer.open,.onboard')].filter(el=>el.getClientRects().length).at(-1);
      if(!active)return;
      const f=[...active.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!f.length)return;
      if(e.shiftKey&&(document.activeElement===f[0]||!active.contains(document.activeElement))){e.preventDefault();f.at(-1).focus();}
      else if(!e.shiftKey&&(document.activeElement===f.at(-1)||!active.contains(document.activeElement))){e.preventDefault();f[0].focus();}
    }
  });
  $$('.sbNav .tab').forEach((tab,i,all)=>tab.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();all[(i+(e.key==='ArrowDown'?1:-1)+all.length)%all.length].focus();}}));
  updatePageChrome('overview');
}
