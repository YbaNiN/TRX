/* TRX Panel — 04-views.js · render global, calendario, agenda, bindings, formularios Discord, main() */
/* ===================== Render all ===================== */
function renderAll(redraw = true) {
  if (typeof renderDayOverview === "function") renderDayOverview();
  renderStats();
  renderRecent();
  renderNotes();
  renderTagChips();
  renderTasksList();
  renderKanban();
  renderCalendar();
  renderAgenda();
  renderNotifs();
  if (redraw) redrawChartsIfVisible();
}


/* ===================== Calendario ===================== */
state.calOffset = 0;
state.agendaRange = "week"; // today | tomorrow | week | month | all

function monthLabel(year, monthIndex){
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month:"long", year:"numeric" });
}

function tasksForDay(dayDate){
  // Solo mostramos "puntos": comienzo y fin (no todos los días del rango)
  const out = [];
  const day0 = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0,0,0,0);

  for (const t of state.tasks){
    const s = parseISODate(t.startDate);
    const e = parseISODate(t.endDate);
    if (!s || !e) continue;

    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);

    if (day0.getTime() === s0.getTime()){
      out.push({ task: t, point: "start" });
    }
    if (day0.getTime() === e0.getTime() && e0.getTime() !== s0.getTime()){
      out.push({ task: t, point: "end" });
    }
  }

  const pr = { high:0, med:1, low:2 };
  out.sort((a,b)=>
    (a.task.category==="event"?0:1)-(b.task.category==="event"?0:1) ||
    (pr[a.task.priority]??9)-(pr[b.task.priority]??9) ||
    (a.task.createdAt-b.task.createdAt) ||
    (a.point==="start"?0:1)-(b.point==="start"?0:1)
  );
  return out;
}


function renderCalendar(){
  const grid = $("#calendarGrid");
  const label = $("#calMonthLabel");
  if (!grid || !label) return;

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + (state.calOffset||0), 1);
  const y = base.getFullYear();
  const m = base.getMonth();

  label.textContent = monthLabel(y,m);

  const firstDow = new Date(y,m,1).getDay(); // 0=Sun
  const mondayFirst = (firstDow + 6) % 7; // 0=Mon..6=Sun
  const daysInMonth = new Date(y,m+1,0).getDate();
  const prevDays = new Date(y,m,0).getDate();

  const totalCells = 42; // 6 semanas
  const cells = [];

  for (let i=0;i<totalCells;i++){
    const dayNum = i - mondayFirst + 1;
    let cellDate, dim=false;

    if (dayNum <= 0){
      cellDate = new Date(y, m-1, prevDays + dayNum);
      dim = true;
    } else if (dayNum > daysInMonth){
      cellDate = new Date(y, m+1, dayNum - daysInMonth);
      dim = true;
    } else {
      cellDate = new Date(y, m, dayNum);
    }

    const isToday = cellDate.getFullYear()===now.getFullYear() && cellDate.getMonth()===now.getMonth() && cellDate.getDate()===now.getDate();

    const all = tasksForDay(cellDate);

    const iso = toISODate(cellDate);
    const items = all.slice(0,4);
    const more = Math.max(0, all.length - items.length);

    const chips = items.map(({task:t, point})=>{
      const cls = `${t.status} ${t.category==="event"?"event":""} ${point}`;
      const typeTxt = t.category==="event" ? "Evento" : "Tarea";
      const style = t.color ? ` style="--task-border:${t.color}"` : ``;
      const extra = t.color ? " hasColor" : "";
      const badge = point==="start" ? "⏵" : "⏹";
      const when = point==="start"
        ? `${fmtISODate(t.startDate)}${t.startTime?` ${fmtTime(t.startTime)}`:""}`
        : `${fmtISODate(t.endDate)}${t.endTime?` ${fmtTime(t.endTime)}`:""}`;
      return `<div class="calChip ${cls}${extra}"${style} title="${escapeHtml(typeTxt)} · ${escapeHtml(t.title)} · ${escapeHtml(point==="start"?"Comienzo":"Fin")} ${escapeHtml(when)}">
        ${taskColorMarker(t.color)}
        <span class="t">${badge} ${escapeHtml(t.title)}</span>
      </div>`;
    }).join("");

    cells.push(`
      <div class="calCell ${dim?"dim":""} ${isToday?"today":""}" data-date="${iso}" role="button" tabindex="0" aria-label="${escapeHtml(cellDate.toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'}))}, ${all.length} tareas o eventos">
        <div class="day">${cellDate.getDate()}</div>
        <div class="calItems">
          ${chips}
          ${more>0 ? `<small>+${more} más</small>` : ""}
        </div>
      </div>
    `);
  }

  const dows = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d=>`<div class="calDow">${d}</div>`).join("");
  grid.innerHTML = `
    <div class="calRow">${dows}</div>
    <div class="calRow">${cells.slice(0,7).join("")}</div>
    <div class="calRow">${cells.slice(7,14).join("")}</div>
    <div class="calRow">${cells.slice(14,21).join("")}</div>
    <div class="calRow">${cells.slice(21,28).join("")}</div>
    <div class="calRow">${cells.slice(28,35).join("")}</div>
    <div class="calRow">${cells.slice(35,42).join("")}</div>
  `;
}


/* ===================== Agenda ===================== */
function agendaRangeWindow(range){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
  if (range === "all") return { start: null, end: null };

  let days = 6; // week
  if (range === "today") days = 0;
  else if (range === "tomorrow") {
    const s = new Date(start.getTime() + 24*60*60*1000);
    return { start: s, end: new Date(s.getTime() + 24*60*60*1000) };
  }
  else if (range === "month") days = 29;

  const end = new Date(start.getTime() + (days+1) * 24*60*60*1000);
  return { start, end };
}

function taskPrimaryISO(t){
  return t.startDate || t.endDate || "";
}

function taskSortKey(t){
  const iso = taskPrimaryISO(t);
  const time = (t.startTime || t.endTime || "");
  return { iso, time };
}

function renderAgenda(){
  const host = $("#agendaList");
  if (!host) return;

  const range = state.agendaRange || "week";
  const { start, end } = agendaRangeWindow(range);

  const dated = [];
  const undated = [];

  for (const t of state.tasks){
    const iso = taskPrimaryISO(t);
    if (!iso){ undated.push(t); continue; }
    const d = parseISODate(iso);
    if (!d){ undated.push(t); continue; }
    if (start && end){
      const ts = d.getTime();
      if (ts < start.getTime() || ts >= end.getTime()) continue;
    }
    dated.push(t);
  }

  // sort
  const pr = { high:0, med:1, low:2 };
  dated.sort((a,b)=>{
    const ka = taskSortKey(a), kb = taskSortKey(b);
    if (ka.iso !== kb.iso) return ka.iso.localeCompare(kb.iso);
    if ((ka.time||"") !== (kb.time||"")) return (ka.time||"99:99").localeCompare(kb.time||"99:99");
    return (a.category==="event"?0:1)-(b.category==="event"?0:1) || (pr[a.priority]??9)-(pr[b.priority]??9) || (a.createdAt-b.createdAt);
  });
  undated.sort((a,b)=> (a.category==="event"?0:1)-(b.category==="event"?0:1) || (pr[a.priority]??9)-(pr[b.priority]??9) || (a.createdAt-b.createdAt));

  // group
  const groups = new Map();
  for (const t of dated){
    const iso = taskPrimaryISO(t);
    if (!groups.has(iso)) groups.set(iso, []);
    groups.get(iso).push(t);
  }

  const groupKeys = [...groups.keys()].sort((a,b)=>a.localeCompare(b));
  const parts = [];

  if (groupKeys.length === 0 && undated.length === 0){
    host.innerHTML = `<div class="empty">No hay tareas en este rango.</div>`;
    return;
  }

  for (const iso of groupKeys){
    const day = parseISODate(iso);
    const title = day ? day.toLocaleDateString(undefined, { weekday:"long", day:"2-digit", month:"long" }) : iso;
    parts.push(`<div class="agendaDay">
      <div class="agendaDayHead">${escapeHtml(title)}</div>
      <div class="agendaItems">${groups.get(iso).map(t=>agendaItemHtml(t)).join("")}</div>
    </div>`);
  }

  if (undated.length){
    parts.push(`<div class="agendaDay">
      <div class="agendaDayHead">Sin fecha</div>
      <div class="agendaItems">${undated.map(t=>agendaItemHtml(t)).join("")}</div>
    </div>`);
  }

  host.innerHTML = parts.join("");

  // click item -> editar
  if (!host.dataset.bound){
    host.dataset.bound = "1";
    host.addEventListener("click", (e)=>{
      const row = e.target.closest(".agendaItem");
      if (!row || !host.contains(row)) return;
      const id = row.dataset.id;
      const t = state.tasks.find(x=>x.id===id);
      if (t) openEdit(t);
    });
  }
}

function agendaItemHtml(t){
  const typeTxt = t.category === "event" ? "Evento" : "Tarea";
  const whenStart = t.startTime ? fmtTime(t.startTime) : "";
  const whenEnd = t.endTime ? fmtTime(t.endTime) : "";
  const timeTxt = whenStart || whenEnd ? `${whenStart}${whenEnd ? `–${whenEnd}` : ""}` : "";
  const tags = (t.tags||[]).slice(0,3).map(tag=>`<span class="tag" style="--h:${tagHue(tag)}">${escapeHtml(tag)}</span>`).join("");
  const style = t.color ? `style="--task-border:${t.color}"` : "";
  const extra = t.color ? "hasColor" : "";
  return `<div class="agendaItem ${t.status} ${extra}" data-id="${escapeHtml(t.id)}" ${style}>
    <div class="agendaMain">
      <div class="agendaTitle">${taskColorMarker(t.color)}${escapeHtml(t.title)}</div>
      <div class="agendaMeta">
        <span class="chip mini">${escapeHtml(typeTxt)}</span>
        ${timeTxt ? `<span class="chip mini subtle">${escapeHtml(timeTxt)}</span>` : ""}
        <span class="chip mini subtle">${escapeHtml(prBadge(t.priority).txt)}</span>
      </div>
    </div>
    <div class="agendaTags">${tags}</div>
  </div>`;
}


/* ===================== Bindings ===================== */
function bindModal() {
  $("#modalOk").addEventListener("click", () => closeModal(true));
  $("#modalCancel").addEventListener("click", () => closeModal(false));
  $("#modalX").addEventListener("click", () => closeModal(false));
  $$(".modalBackdrop").forEach((b) => b.addEventListener("click", () => closeModal(false)));
}

function bindEditModal() {
  $("#editX").addEventListener("click", closeEdit);
  $("#editCancel").addEventListener("click", closeEdit);
  document.querySelectorAll("[data-close-edit='1']").forEach(b => b.addEventListener("click", closeEdit));

  $("#editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editId) return;
    const title = $("#editText").value.trim();
    const priority = $("#editPriority").value;
    const status = $("#editStatus").value;
    const category = $("#editType").value || "task";
    const startDate = $("#editStart").value || null;
    const endDate = $("#editEnd").value || startDate || null;
    const startTime = ($("#editStartTime") && $("#editStartTime").value) ? $("#editStartTime").value : "";
    const endTime = ($("#editEndTime") && $("#editEndTime").value) ? $("#editEndTime").value : "";
    const tags = parseTags($("#editTags").value);

    const color = ($("#editColor") && $("#editColor").value) ? $("#editColor").value : null;
    updateTask(editId, { title, priority, status, category, startDate, endDate, startTime, endTime, tags, color });
    toast({ title:"Actualizada", message:title, type:"ok" });
    closeEdit();
  });
}

function bindCmdk() {
  $("#btnCmdk").addEventListener("click", openCmdk);
  $("#cmdkX").addEventListener("click", closeCmdk);
  document.querySelectorAll("[data-close-cmdk='1']").forEach(b => b.addEventListener("click", closeCmdk));

  $("#cmdkInput").addEventListener("input", (e) => {
    cmdkIndex = 0;
    renderCmdk(e.target.value);
  });

  $("#cmdkInput").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); cmdkMove(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); cmdkMove(-1); }
    if (e.key === "Enter") { e.preventDefault(); cmdkRun(); }
    if (e.key === "Escape") { e.preventDefault(); closeCmdk(); }
  });
}

// Atajos de teclado eliminados por petición del usuario.

function bindUx() {
  // password toggle
  $("#pwToggle").addEventListener("click", () => {
    const p = $("#loginPass");
    p.type = p.type === "password" ? "text" : "password";
  });

  // sidebar mobile
  $("#btnMenu").addEventListener("click", openSidebarMobile);
  $("#sbOverlay").addEventListener("click", closeSidebarMobile);

  // drawer
  $("#btnNotify").addEventListener("click", openDrawer);
  $("#btnNotifyClose").addEventListener("click", closeDrawer);
  $("#drawerOverlay").addEventListener("click", closeDrawer);
  $("#btnNotifyClear").addEventListener("click", () => {
    state.notifs = [];
    save();
    renderNotifs();
    toast({ title:"Notificaciones", message:"Historial limpiado", type:"info" });
  });

  // theme + density
  $("#btnTheme").addEventListener("click", () => {
    const light = document.body.classList.contains("light");
    setTheme(light ? "dark" : "light");
    toast({ title:"Tema", message: light ? "Oscuro" : "Claro", type:"info" });
  });

  $("#btnDensity").addEventListener("click", toggleDensity);

  // reset/logout
  $("#btnReset").addEventListener("click", resetAll);
  $("#btnLogout").addEventListener("click", logoutFlow);

  // tabs
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      switchTab(btn.dataset.tab);
    });
  });

  // tasks controls

  // Tareas: crear y filtrar como pop-up (en todos los tamaños)
  const tasksOverlay = $("#tasksOverlay");
  const taskCreatePanel = $("#taskCreatePanel");
  const taskControlsPanel = $("#taskControlsPanel");
  const taskMoreToggle = $("#taskMoreToggle");
  const taskMoreFields = $("#taskMoreFields");

  const closeTaskPanels = () => {
    if (taskCreatePanel) { taskCreatePanel.classList.remove("open"); taskCreatePanel.hidden = true; }
    if (taskControlsPanel) { taskControlsPanel.classList.remove("open"); taskControlsPanel.hidden = true; }
    if (tasksOverlay) tasksOverlay.hidden = true;
    document.body.classList.remove("popupOpen");
  };
  const openCreate = () => {
    if (guestBlocked("crear tareas")) return;
    closeTaskPanels();
    if (taskCreatePanel) { taskCreatePanel.hidden = false; taskCreatePanel.classList.add("open"); }
    if (tasksOverlay) tasksOverlay.hidden = false;
    document.body.classList.add("popupOpen");
    setTimeout(() => { try { $("#taskInput")?.focus(); } catch(_){} }, 60);
  };
  const openFilters = () => {
    closeTaskPanels();
    if (taskControlsPanel) { taskControlsPanel.hidden = false; taskControlsPanel.classList.add("open"); }
    if (tasksOverlay) tasksOverlay.hidden = false;
    document.body.classList.add("popupOpen");
    setTimeout(() => { try { $("#searchInput")?.focus(); } catch(_){} }, 60);
  };

  // Toggle "Más opciones"
  if (taskMoreToggle && taskMoreFields) {
    taskMoreToggle.addEventListener("click", () => {
      const open = taskMoreFields.hidden;
      taskMoreFields.hidden = !open;
      taskMoreToggle.setAttribute("aria-expanded", String(open));
      taskMoreToggle.classList.toggle("open", open);
    });
  }

  if ($("#btnTaskNew")) $("#btnTaskNew").addEventListener("click", openCreate);
  if ($("#btnTaskNewClose")) $("#btnTaskNewClose").addEventListener("click", closeTaskPanels);
  if ($("#taskFormCancel")) $("#taskFormCancel").addEventListener("click", closeTaskPanels);
  if ($("#btnTaskFilters")) $("#btnTaskFilters").addEventListener("click", openFilters);
  if ($("#btnTaskFiltersClose")) $("#btnTaskFiltersClose").addEventListener("click", closeTaskPanels);
  if (tasksOverlay) tasksOverlay.addEventListener("click", closeTaskPanels);

  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeTaskPanels(); });

  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = $("#taskType").value || "task";
    const start = $("#taskStart").value || null;
    const end = $("#taskEnd").value || start || null;
    const startTime = ($("#taskStartTime") && $("#taskStartTime").value) ? $("#taskStartTime").value : "";
    const endTime = ($("#taskEndTime") && $("#taskEndTime").value) ? $("#taskEndTime").value : "";
    const color = ($("#taskColor") && $("#taskColor").value) ? $("#taskColor").value : null;

    addTask(
      $("#taskInput").value,
      $("#taskPriority").value,
      parseTags($("#taskTags").value),
      start,
      end,
      startTime,
      endTime,
      type,
      color
    );

    $("#taskInput").value = "";
    $("#taskTags").value = "";
    $("#taskStart").value = "";
    $("#taskEnd").value = "";
    if ($("#taskStartTime")) $("#taskStartTime").value = "";
    if ($("#taskEndTime")) $("#taskEndTime").value = "";
    $("#taskType").value = "task";

    // cerramos el pop-up al crear y replegamos avanzadas
    if (taskMoreFields) { taskMoreFields.hidden = true; }
    if (taskMoreToggle) { taskMoreToggle.setAttribute("aria-expanded","false"); taskMoreToggle.classList.remove("open"); }
    closeTaskPanels();
  });

  // favorite colors
  if ($("#saveFavColor") && $("#taskColor")){
    $("#saveFavColor").addEventListener("click", ()=>{
      addFavColor($("#taskColor").value);
      toast({ title:"Color", message:"Guardado en favoritos", type:"ok", timeout: 1200 });
    });
  }
  if ($("#saveFavColorEdit") && $("#editColor")){
    $("#saveFavColorEdit").addEventListener("click", ()=>{
      addFavColor($("#editColor").value);
      toast({ title:"Color", message:"Guardado en favoritos", type:"ok", timeout: 1200 });
    });
  }
  if ($("#taskColor")) $("#taskColor").addEventListener("input", ()=> renderFavColors());
  if ($("#editColor")) $("#editColor").addEventListener("input", ()=> renderFavColors());

  $("#searchInput").addEventListener("input", () => renderAll(false));
  $("#filterSelect").addEventListener("change", () => renderAll(false));

  $("#viewSelect").addEventListener("change", (e) => {
    state.view = e.target.value;
    save();
    renderAll(false);
  });

  $("#btnClearTag").addEventListener("click", () => {
    state.tagFilter = null;
    renderAll(false);
  });


  // calendario
  const prev = $("#calPrev");
  const next = $("#calNext");
  const today = $("#calToday");
  if (prev && next && today) {
    prev.addEventListener("click", () => { state.calOffset = (state.calOffset||0) - 1; renderCalendar(); });
    next.addEventListener("click", () => { state.calOffset = (state.calOffset||0) + 1; renderCalendar(); });
    today.addEventListener("click", () => { state.calOffset = 0; renderCalendar(); });
  }

  // click en un día para ver sus tareas (móvil/desktop)
  const calGrid = $("#calendarGrid");
  if (calGrid && !calGrid.dataset.dayClickBound){
    calGrid.dataset.dayClickBound = "1";
    calGrid.addEventListener("click", (e)=>{
      const cell = e.target.closest(".calCell");
      if (!cell || !calGrid.contains(cell)) return;
      const iso = cell.dataset.date;
      if (iso) openDayModal(iso);
    });
  }

  // agenda
  const setAg = (range) => {
    state.agendaRange = range;
    save();
    renderAgenda();
  };
  $("#agToday")?.addEventListener("click", ()=> setAg("today"));
  $("#agTomorrow")?.addEventListener("click", ()=> setAg("tomorrow"));
  $("#agWeek")?.addEventListener("click", ()=> setAg("week"));
  $("#agMonth")?.addEventListener("click", ()=> setAg("month"));
  $("#agAll")?.addEventListener("click", ()=> setAg("all"));
  // temporizador
  bindTimer();



  // notes
  const wireNotesBar = (inputId, btnId) => {
    const inp = $(inputId);
    const btn = $(btnId);
    if (!inp || !btn) return;
    btn.addEventListener("click", ()=>{
      if (!inp.value.trim()) { inp.focus(); return; }
      addNote(inp.value);
      inp.value = "";
      toast({ title:"Nota", message:"Guardada", type:"ok", timeout: 1200 });
    });
    inp.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing){
        e.preventDefault();
        btn.click();
      }
    });
  };

  wireNotesBar("#noteInput", "#addNoteBtn");
  wireNotesBar("#noteInputMini", "#addNoteBtnMini");
  renderNotes();

// stats
  $("#btnRecalc").addEventListener("click", () => redrawChartsIfVisible());
  $("#rangeSelect").addEventListener("change", () => redrawChartsIfVisible());
  window.addEventListener("resize", () => redrawChartsIfVisible());

  // auth (Supabase login / registro)
  setAuthMode("login");
  $("#authModeToggle")?.addEventListener("click", () => {
    setAuthMode(authUiMode === "login" ? "register" : "login");
  });

  $("#guestEnterBtn")?.addEventListener("click", () => {
    enterGuestMode();
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginErr").textContent = "";

    const btn = $("#loginBtn");
    btn.classList.add("loading");
    btn.disabled = true;

    await new Promise(r => setTimeout(r, 180));

    const email = $("#loginEmail").value;
    const pass = $("#loginPass").value;
    let res;
    if (authUiMode === "register") {
      res = await tryRegister($("#regName").value, email, pass);
    } else {
      res = await tryLogin(email, pass);
    }

    btn.classList.remove("loading");
    btn.disabled = false;

    if (!res?.ok) {
      $("#loginErr").textContent = res?.error || "No se pudo completar la operación";
      toast({ title:"Acceso", message: res?.error || "Error", type:"danger" });
      return;
    }

    if (res?.needsEmailConfirm) {
      $("#loginErr").textContent = "Cuenta creada. Revisa tu correo para confirmar el acceso.";
      toast({ title:"Cuenta creada", message:"Confirma tu email para entrar", type:"info" });
      setAuthMode("login");
    }

    $("#loginPass").value = "";
  });
}



/* ===================== Discord forms ===================== */
function discordFormChannelLabel(type){
  return DISCORD_CHANNEL_LABELS[type] || type || "Discord";
}

function openDiscordForm(type){
  const modal = document.getElementById("discordFormModal");
  if (!modal) return;
  const t = (type || "peticiones").toLowerCase();
  const lbl = discordFormChannelLabel(t);
  const who = state.session?.u ? `${state.session.u} (${state.session.role||"user"})` : "";

  const title = document.getElementById("discordFormTitle");
  const desc = document.getElementById("discordFormDesc");
  const hint = document.getElementById("discordFormHint");
  const typeEl = document.getElementById("discordFormType");
  const nameEl = document.getElementById("discordFormName");
  const contactEl = document.getElementById("discordFormContact");
  const subjEl = document.getElementById("discordFormSubject");
  const msgEl = document.getElementById("discordFormMessage");

  if (title) title.textContent = `${lbl} · Discord`;
  if (desc) desc.textContent = "Rellena el formulario y se enviará al canal correspondiente.";
  if (hint) hint.textContent = `Canal: #${t}`;
  if (typeEl) typeEl.value = t;
  if (nameEl && !nameEl.value) nameEl.value = who;
  if (contactEl && !contactEl.value) contactEl.value = "";
  if (subjEl) subjEl.value = "";
  if (msgEl) msgEl.value = "";

  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("open");
  document.body.classList.add("noScroll");
  setTimeout(()=>subjEl?.focus(), 10);
}

function closeDiscordForm(){
  const modal = document.getElementById("discordFormModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("open");
  document.body.classList.remove("noScroll");
  const form = document.getElementById("discordForm");
  if (form) form.reset();
}

async function sendDiscordForm(e){
  e.preventDefault();
  const sendBtn = document.getElementById("discordFormSend");
  const type = (document.getElementById("discordFormType")?.value || "").trim();
  const webhook = DISCORD_WEBHOOKS[type];
  if (!webhook){
    toast({ title:"Discord", message:`Falta configurar el webhook de ${discordFormChannelLabel(type)}.`, type:"warn" });
    return;
  }

  const name = (document.getElementById("discordFormName")?.value || "").trim() || "Sin nombre";
  const contact = (document.getElementById("discordFormContact")?.value || "").trim();
  const subject = (document.getElementById("discordFormSubject")?.value || "").trim();
  const message = (document.getElementById("discordFormMessage")?.value || "").trim();
  if (!subject || !message){
    toast({ title:"Formulario", message:"Asunto y mensaje son obligatorios.", type:"warn" });
    return;
  }

  const colorMap = { peticiones: 3447003, reportes: 15158332, sugerencias: 10181046, contacto: 3066993 };
  const payload = {
    username: "TRX Panel",
    embeds: [{
      title: `${discordFormChannelLabel(type)} · ${subject}`.slice(0, 256),
      description: message.slice(0, 4000),
      color: colorMap[type] || 5793266,
      fields: [
        { name: "Nombre", value: name.slice(0, 1024), inline: true },
        { name: "Contacto", value: (contact || "No indicado").slice(0, 1024), inline: true },
        { name: "Usuario TRX", value: ((state.session?.u || "No logueado") + (state.session?.role ? ` (${state.session.role})` : "")).slice(0, 1024), inline: false },
      ],
      footer: { text: `TRX Panel · ${new Date().toLocaleString()}` }
    }]
  };

  try{
    if (sendBtn){ sendBtn.disabled = true; sendBtn.textContent = "Enviando..."; }
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    pushNotif({ title:"Discord", message:`Enviado a #${type}`, type:"ok" });
    toast({ title:"Discord", message:`Mensaje enviado a ${discordFormChannelLabel(type)}.`, type:"ok" });
    closeDiscordForm();
  }catch(err){
    console.error("Discord webhook error", err);
    toast({ title:"Discord", message:"No se pudo enviar. Revisa webhook/CORS o usa backend proxy.", type:"danger" });
  }finally{
    if (sendBtn){ sendBtn.disabled = false; sendBtn.textContent = "Enviar"; }
  }
}

function bindDiscordForms(){
  const quickBar = document.getElementById("discordQuickBar");
  if (quickBar && !quickBar.dataset.bound){
    quickBar.dataset.bound = "1";
    quickBar.addEventListener("click", (e)=>{
      const btn = e.target.closest("[data-discord-form]");
      if (!btn) return;
      openDiscordForm(btn.dataset.discordForm);
    });
  }

  const modal = document.getElementById("discordFormModal");
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = "1";

  document.getElementById("discordForm")?.addEventListener("submit", sendDiscordForm);
  document.getElementById("discordFormCancel")?.addEventListener("click", closeDiscordForm);
  document.getElementById("discordFormX")?.addEventListener("click", closeDiscordForm);
  modal.addEventListener("click", (e)=>{
    if (e.target?.closest("[data-close-discord='1']")) closeDiscordForm();
  });
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && modal.classList.contains("open")) closeDiscordForm();
  });
}

/* ===================== Main ===================== */
/* ----- PWA Install UX (Mobile-first: FAB + smarter banner + iOS sheet) ----- */
let deferredInstallPrompt = null;

const INSTALL_STATE_KEY = "trx_install_ui_v1"; // { dismissedAt: ISO, installed: bool, installedAt?: ISO }

function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "") && !window.MSStream;
}

function isStandalone(){
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
}

function getInstallState(){
  try { return JSON.parse(localStorage.getItem(INSTALL_STATE_KEY) || "{}"); }
  catch { return {}; }
}

function setInstallState(patch){
  const cur = getInstallState();
  const next = { ...cur, ...patch };
  localStorage.setItem(INSTALL_STATE_KEY, JSON.stringify(next));
}

function canShowInstallUI(){
  if (isStandalone()) return false;
  const s = getInstallState();
  if (s.installed) return false;

  // Don't annoy: if dismissed today, hide until tomorrow
  if (s.dismissedAt){
    const d = new Date(s.dismissedAt);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return false;
  }
  return true;
}

function showInstallUI({ canInstall, showHelp }){
  // UI automática deshabilitada: ahora está en la sección APP
  return;
}


function hideInstallUI(){
  // UI automática deshabilitada: ahora está en la sección APP
  return;
}


function dismissInstallUI(){
  setInstallState({ dismissedAt: new Date().toISOString() });
  hideInstallUI();
  // Extra safety: close help sheet too if it was open
  const sheet = $("#installHelp");
  if (sheet) sheet.hidden = true;
}

function openInstallSheet(){
  const sheet = $("#installHelp");
  if (!sheet) return;
  sheet.hidden = false;

  const close = () => { sheet.hidden = true; };

  $("#btnSheetClose")?.addEventListener("click", close, { once:true });
  $("#btnSheetOk")?.addEventListener("click", close, { once:true });
  sheet.querySelector(".sheetBackdrop")?.addEventListener("click", close, { once:true });
}

async function triggerInstall(){
  if (isIOS()){
    openInstallSheet();
    return;
  }

  if (deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    try {
      const choice = await deferredInstallPrompt.userChoice;
      if (choice && choice.outcome !== "accepted"){
        // If they cancel, don't keep pushing today
        dismissInstallUI();
      }
    } catch {
      // ignore
    }
    deferredInstallPrompt = null;
    return;
  }

  // No native prompt available: show a quick hint
  toast({ title:"Instalar", message:"Abre el menú del navegador y busca “Instalar app” o “Añadir a pantalla de inicio”.", type:"info" });
}

function bindInstallButtons(){
  // Rebind safely (clone nodes to remove previous handlers)
  const rebind = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || !el.parentNode) return;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    });
  };

  rebind("installFab", triggerInstall);
  rebind("btnInstallApp", triggerInstall);
  rebind("btnInstallHelp", () => openInstallSheet());
  rebind("btnInstallClose", () => dismissInstallUI());

  // Fallback delegated listener (por si algún render reemplaza nodos más adelante)
  if (!document.body.dataset.installDelegatedBound){
    document.body.dataset.installDelegatedBound = "1";
    document.body.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("#btnInstallClose");
      if (closeBtn){
        e.preventDefault();
        e.stopPropagation();
        dismissInstallUI();
        return;
      }
    });
  }
}

function initInstallUX(){
  // Bind buttons once
  bindInstallButtons();

  // Global delegated handlers to ensure close works even if nodes are re-rendered
  if (!document.body.dataset.installCloseBound){
    document.body.dataset.installCloseBound = "1";
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.closest){
        if (t.closest("#btnInstallClose")){
          e.preventDefault(); e.stopPropagation();
          dismissInstallUI();
          return;
        }
        if (t.closest("#btnSheetClose") || t.closest("#btnSheetOk") || t.closest("#installHelp .sheetBackdrop")){
          e.preventDefault(); e.stopPropagation();
          const sheet = document.getElementById("installHelp");
          if (sheet) sheet.hidden = true;
          return;
        }
      }
    }, true);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        const sheet = document.getElementById("installHelp");
        if (sheet && !sheet.hidden){
          sheet.hidden = true;
          e.preventDefault();
        }
      }
    });
  }

  // If already installed, hide
  if (isStandalone()) { hideInstallUI(); return; }

  // IMPORTANT: do not show install UI on the login gate.
  // We'll show it after login (setSession) or when an existing session is restored.

  // Android/Chrome: capture native prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // Mark installed
  window.addEventListener("appinstalled", () => {
    setInstallState({ installed:true, installedAt: new Date().toISOString() });
    deferredInstallPrompt = null;
    hideInstallUI();
    toast({ title:"✅ Instalado", message:"TRX Panel ya está en tu móvil", type:"ok" });
  });
}

function scheduleInstallUIAfterLogin(){
  // UI automática deshabilitada: ahora está en la sección APP
  return;
}


async function main() {
  load();
  initTheme();
  initDensity();
  initClock();
  initTimerLoop();

  $("#viewSelect").value = state.view;

  bindModal();
  bindEditModal();
  bindDayModal();
  bindLists();
  bindCmdk();
  bindUx();
  bindDiscordForms();

  initInstallUX();

  // The current app has no offline shell; do not register the removed sw.js.

  // restore session (Supabase)
  let restored = false;
  try {
    const sb = await initSupabaseClient();
    if (sb) {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        await applySupabaseSession(data.session.user);
        restored = true;
      }
    }
  } catch (e) {
    console.warn("Supabase session restore error", e);
  }

  if (!restored && state.session?.u && state.session?.role) {
    // compatibilidad con sesiones antiguas guardadas localmente
    $("#who").textContent = `${state.session.u} (${state.session.role})`;
    lockByRole(state.session.role);
    showGate(false);
    try { scheduleInstallUIAfterLogin(); } catch {}
  } else if (!restored) {
    showGate(true);
  }

  renderAll();
  if (typeof initExperience === "function") initExperience();
  // Avisos de vencimiento: al arrancar y cada hora (si la app está abierta)
  checkDueNotifications();
  setInterval(checkDueNotifications, 60 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);
