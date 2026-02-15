const LS = {
  tasks: "trx_tasks_v5",
  notes: "trx_notes_v5",
  theme: "trx_theme_v5",
  density: "trx_density_v1",
  activity: "trx_activity_v5",
  session: "trx_session_v4",
  notifs: "trx_notifs_v1",
};

const USERS = {
  admin: {
    role: "admin",
    pass_sha256: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9" // admin123
  },
  user: {
    role: "user",
    pass_sha256: "e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446" // user123
  }
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  tasks: [],
  notes: "",
  activityDays: [],
  session: null,
  notifs: [],
  tagFilter: null,
  view: "list", // list | kanban
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}


function toISODate(d){
  // yyyy-mm-dd in local time
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const day = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s){
  // returns Date at local midnight
  if (!s) return null;
  const [y,m,d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m-1, d, 0,0,0,0);
}
function fmtISODate(s){
  const d = parseISODate(s);
  return d ? d.toLocaleDateString() : "";
}
function daysBetween(a,b){
  const ms = 24*60*60*1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da)/ms);
}
function tagHue(tag){
  const str = (tag||"").trim().toLowerCase();
  let h = 0;
  for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return (h % 360);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ===================== Date helpers ===================== */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayKeyFromTs(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function markActivity() {
  const key = todayKey();
  if (!state.activityDays.includes(key)) {
    state.activityDays.push(key);
    state.activityDays = state.activityDays.slice(-60);
    save();
  }
}

function activityStreak() {
  const set = new Set(state.activityDays || []);
  let streak = 0;
  let d = new Date();
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (!set.has(k)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ===================== Storage ===================== */
function load() {
  try { state.tasks = JSON.parse(localStorage.getItem(LS.tasks) || "[]"); } catch { state.tasks = []; }
  state.notes = localStorage.getItem(LS.notes) || "";
  try { state.activityDays = JSON.parse(localStorage.getItem(LS.activity) || "[]"); } catch { state.activityDays = []; }
  try { state.session = JSON.parse(localStorage.getItem(LS.session) || "null"); } catch { state.session = null; }
  try { state.notifs = JSON.parse(localStorage.getItem(LS.notifs) || "[]"); } catch { state.notifs = []; }
  try { state.dueNotifs = JSON.parse(localStorage.getItem(LS.dueNotifs) || "{}"); } catch { state.dueNotifs = {}; }

  const v = localStorage.getItem("trx_view_v1");
  if (v) state.view = v;

  // Migrate old schema
  state.tasks = state.tasks.map(normalizeTask);
}

function save() {
  localStorage.setItem(LS.tasks, JSON.stringify(state.tasks));
  localStorage.setItem(LS.notes, state.notes);
  localStorage.setItem(LS.activity, JSON.stringify(state.activityDays));
  localStorage.setItem(LS.notifs, JSON.stringify(state.notifs));
  localStorage.setItem(LS.dueNotifs, JSON.stringify(state.dueNotifs || {}));
  if (state.session) localStorage.setItem(LS.session, JSON.stringify(state.session));
  localStorage.setItem("trx_view_v1", state.view);
}

/* ===================== Theme + Density ===================== */
function setTheme(mode) {
  const light = mode === "light";
  document.body.classList.toggle("light", light);
  localStorage.setItem(LS.theme, mode);
  $("#btnTheme").textContent = light ? "Claro" : "Oscuro";
  requestAnimationFrame(redrawChartsIfVisible);
}

function initTheme() {
  const saved = localStorage.getItem(LS.theme);
  setTheme(saved || "dark");
}

function setDensity(mode) {
  const compact = mode === "compact";
  document.body.classList.toggle("compact", compact);
  localStorage.setItem(LS.density, mode);
  $("#btnDensity").textContent = compact ? "Normal" : "Compacta";
}

function initDensity() {
  const saved = localStorage.getItem(LS.density) || "normal";
  setDensity(saved);
}

/* ===================== UI: Toast + Notifications ===================== */
function pushNotif({ title, message = "", type = "info" }) {
  const n = { id: uid(), title, message, type, ts: Date.now() };
  state.notifs.unshift(n);
  state.notifs = state.notifs.slice(0, 80);
  save();
  renderNotifs();
}

function toast({ title, message = "", type = "info", timeout = 2600 } = {}) {
  const host = $("#toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  const icon = type === "ok" ? "✓" : type === "warn" ? "!" : type === "danger" ? "✕" : "i";

  el.innerHTML = `
    <div class="tIcon">${icon}</div>
    <div class="tBody">
      <div class="tTitle">${escapeHtml(title || "Aviso")}</div>
      <div class="tMsg">${escapeHtml(message)}</div>
    </div>
    <button class="tClose" type="button" aria-label="Cerrar">✕</button>
  `;

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  const close = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector(".tClose").addEventListener("click", close);
  setTimeout(close, timeout);

  pushNotif({ title, message, type });
}

/* ===================== Avisos de vencimiento ===================== */
function notifyDueSoon(task, daysLeft){
  const title = daysLeft === 0 ? "Vence hoy" : `Vence en ${daysLeft} día${daysLeft===1?"":"s"}`;
  const message = `${task.category==="event" ? "Evento" : "Tarea"}: ${task.title}`;

  toast({ title, message, type: daysLeft<=1 ? "warn" : "info", timeout: 4200 });

  // Notificación del sistema (si el usuario dio permiso)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      // Si hay SW activo, mejor vía SW
      if (navigator.serviceWorker?.getRegistration) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.showNotification) {
            reg.showNotification(title, { body: message, tag: `due-${task.id}` });
          } else {
            new Notification(title, { body: message, tag: `due-${task.id}` });
          }
        });
      } else {
        new Notification(title, { body: message, tag: `due-${task.id}` });
      }
    } catch {}
  }
}

function checkDueNotifications(){
  if (!state.tasks || state.tasks.length===0) return;
  if (!state.dueNotifs) state.dueNotifs = {};

  const today = new Date();
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const t of state.tasks){
    if (t.status === "done") continue;
    const end = parseISODate(t.endDate);
    if (!end) continue;

    const end0 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const daysLeft = daysBetween(today0, end0);

    // Ventana de aviso: dentro de 7 días (incluido), pero no negativo
    if (daysLeft <= 7 && daysLeft >= 0){
      const last = state.dueNotifs[t.id] || null;
      const stamp = toISODate(today0);
      if (last !== stamp){
        state.dueNotifs[t.id] = stamp;
        save();
        notifyDueSoon(t, daysLeft);
      }
    }
  }
}


function openDrawer() {
  $("#notifyPanel").classList.add("open");
  $("#notifyPanel").setAttribute("aria-hidden", "false");
  $("#drawerOverlay").classList.add("show");
  $("#drawerOverlay").setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  $("#notifyPanel").classList.remove("open");
  $("#notifyPanel").setAttribute("aria-hidden", "true");
  $("#drawerOverlay").classList.remove("show");
  $("#drawerOverlay").setAttribute("aria-hidden", "true");
}

function renderNotifs() {
  const list = $("#notifyList");
  list.innerHTML = "";
  $("#notifySub").textContent = `${state.notifs.length} total`;

  if (state.notifs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "noteItem";
    empty.innerHTML = `<div class="noteTitle">Sin notificaciones</div>`;
    list.appendChild(empty);
    return;
  }

  for (const n of state.notifs) {
    const item = document.createElement("div");
    item.className = "noteItem";
    const time = new Date(n.ts).toLocaleString();
    item.innerHTML = `
      <div class="noteTop">
        <div class="noteTitle">${escapeHtml(n.title)}</div>
        <div class="noteTime">${escapeHtml(time)}</div>
      </div>
      <div class="noteMsg">${escapeHtml(n.message)}</div>
    `;
    list.appendChild(item);
  }
}

/* ===================== UI: Confirm Modal ===================== */
let modalResolve = null;

function openModal({ title = "Confirmación", desc = "", okText = "Aceptar", cancelText = "Cancelar" } = {}) {
  const m = $("#modal");
  $("#modalTitle").textContent = title;
  $("#modalDesc").textContent = desc;
  $("#modalOk").textContent = okText;
  $("#modalCancel").textContent = cancelText;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  return new Promise((resolve) => { modalResolve = resolve; });
}

function closeModal(result) {
  const m = $("#modal");
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}

/* ===================== UI: Edit Modal ===================== */
let editId = null;

function openEdit(t) {
  editId = t.id;
  $("#editText").value = t.title;
  $("#editPriority").value = t.priority;
  $("#editStatus").value = t.status;
  $("#editType").value = t.category || "task";
  $("#editStart").value = t.startDate || "";
  $("#editEnd").value = t.endDate || "";
  $("#editTags").value = (t.tags || []).join(", ");
  const m = $("#editModal");
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  $("#editText").focus();
}

function closeEdit() {
  editId = null;
  const m = $("#editModal");
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
}

/* ===================== UI: Command Palette ===================== */
let cmdkIndex = 0;
let cmdkItems = [];

function openCmdk() {
  const m = $("#cmdk");
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  $("#cmdkInput").value = "";
  cmdkIndex = 0;
  renderCmdk("");
  $("#cmdkInput").focus();
}
function closeCmdk() {
  const m = $("#cmdk");
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
}

function renderCmdk(q) {
  const list = $("#cmdkList");
  list.innerHTML = "";

  const base = [
    { name:"Ir a Resumen", desc:"Abrir resumen", key:"G", run:()=>switchTab("overview") },
    { name:"Ir a Tareas", desc:"Abrir tareas", key:"G", run:()=>switchTab("tasks") },
    { name:"Ir a Calendario", desc:"Abrir calendario", key:"G", run:()=>switchTab("calendar") },
    { name:"Ir a Stats", desc:"Abrir estadísticas", key:"G", run:()=>switchTab("stats"), admin:true },
    { name:"Cambiar Tema", desc:"Claro/Oscuro", key:"T", run:()=>toggleTheme() },
    { name:"Activar notificaciones", desc:"Permitir avisos de vencimiento", key:"N", run:()=>{
        if (!("Notification" in window)) return toast({title:"No disponible", message:"Este navegador no soporta notificaciones.", type:"warn"});
        Notification.requestPermission().then(p=>{
          toast({ title:"Notificaciones", message: p==="granted" ? "Permiso concedido." : "Permiso denegado.", type: p==="granted" ? "ok" : "warn" });
        });
      } },
    { name:"Cambiar Densidad", desc:"Compacta/Normal", key:"D", run:()=>toggleDensity() },
    { name:"Nueva tarea", desc:"Enfocar input y crear", key:"N", run:()=>{switchTab("tasks"); setTimeout(()=>$("#taskInput").focus(), 50);} },
    { name:"Notificaciones", desc:"Abrir panel", key:"B", run:()=>openDrawer() },
    { name:"Cerrar sesión", desc:"Salir de la sesión", key:"L", run:()=>logoutFlow() },
  ];

  const isAdmin = state.session?.role === "admin";
  cmdkItems = base.filter(x => !x.admin || isAdmin)
    .filter(x => (x.name + " " + x.desc).toLowerCase().includes((q||"").trim().toLowerCase()));

  if (cmdkItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cmdkItem";
    empty.innerHTML = `<div class="cmdkLeft"><div class="cmdkName">Sin resultados</div><div class="cmdkDesc">Prueba otra búsqueda</div></div><div class="cmdkKey">—</div>`;
    list.appendChild(empty);
    return;
  }

  cmdkItems.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "cmdkItem" + (i === cmdkIndex ? " active" : "");
    row.setAttribute("role", "option");
    row.innerHTML = `
      <div class="cmdkLeft">
        <div class="cmdkName">${escapeHtml(it.name)}</div>
        <div class="cmdkDesc">${escapeHtml(it.desc)}</div>
      </div>
      <div class="cmdkKey">${escapeHtml(it.key)}</div>
    `;
    row.addEventListener("click", () => { it.run(); closeCmdk(); });
    list.appendChild(row);
  });
}

function cmdkMove(dir) {
  if (cmdkItems.length === 0) return;
  cmdkIndex = (cmdkIndex + dir + cmdkItems.length) % cmdkItems.length;
  renderCmdk($("#cmdkInput").value);
}

function cmdkRun() {
  if (cmdkItems.length === 0) return;
  cmdkItems[cmdkIndex].run();
  closeCmdk();
}

/* ===================== Auth / Roles ===================== */
function showGate(on) {
  $("#authGate").classList.toggle("hidden", !on);
}

function lockByRole(role) {
  const isAdmin = role === "admin";
  $$(".tab").forEach((t) => {
    const req = t.getAttribute("data-requires-role");
    if (!req) return;
    const ok = req === role;
    t.disabled = !ok;
    if (!ok && t.classList.contains("active")) switchTab("overview");
  });
  $("#btnReset").style.display = isAdmin ? "inline-flex" : "none";
}

function setSession(username, role) {
  state.session = { u: username, role, ts: Date.now() };
  localStorage.setItem(LS.session, JSON.stringify(state.session));
  $("#who").textContent = `${username} (${role})`;
  lockByRole(role);
  showGate(false);
  switchTab("overview");
  toast({ title: "Sesión iniciada", message: `${username} conectado`, type: "ok" });
}

function clearSession() {
  state.session = null;
  localStorage.removeItem(LS.session);
  $("#who").textContent = "";
  showGate(true);
  switchTab("overview");
  toast({ title: "Sesión cerrada", message: "Acceso finalizado", type: "info" });
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function tryLogin(username, password) {
  const u = (username || "").trim().toLowerCase();
  const p = password || "";
  if (!USERS[u]) return false;
  const hash = await sha256Hex(p);
  if (hash !== USERS[u].pass_sha256) return false;
  setSession(u, USERS[u].role);
  return true;
}

/* ===================== Sidebar Mobile ===================== */
function openSidebarMobile() {
  const sb = $("#sidebar");
  const ov = $("#sbOverlay");
  sb.classList.add("open");
  ov.classList.add("show");
  ov.setAttribute("aria-hidden", "false");
}
function closeSidebarMobile() {
  const sb = $("#sidebar");
  const ov = $("#sbOverlay");
  sb.classList.remove("open");
  ov.classList.remove("show");
  ov.setAttribute("aria-hidden", "true");
}

/* ===================== Tabs ===================== */
function switchTab(id) {
  $$(".tab").forEach((b) => {
    const on = b.dataset.tab === id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === id));

  closeSidebarMobile();

  if (id === "tasks") {
    showTasksSkeleton();
    setTimeout(() => { hideTasksSkeleton(); renderAll(); }, 220);
  }
  if (id === "stats") {
    showStatsSkeleton();
    setTimeout(() => { hideStatsSkeleton(); redrawChartsIfVisible(); }, 260);
  }
}

/* ===================== Tasks (schema + rendering) ===================== */
function parseTags(str) {
  return (str || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function statusLabel(s) {
  if (s === "doing") return { txt:"En curso", cls:"doing" };
  if (s === "done") return { txt:"Hecho", cls:"done" };
  return { txt:"Pendiente", cls:"todo" };
}

function prBadge(p) {
  if (p === "high") return { txt:"Alta", cls:"high" };
  if (p === "low") return { txt:"Baja", cls:"low" };
  return { txt:"Media", cls:"med" };
}

function normalizeTask(t) {
  if (!t.tags) t.tags = [];
  if (!t.status) t.status = t.done ? "done" : "todo";

  // Tipo: task | event
  if (!t.category) t.category = "task";

  // Fechas: startDate/endDate en yyyy-mm-dd
  const createdISO = toISODate(t.createdAt || Date.now());
  if (!t.startDate) t.startDate = createdISO;
  if (!t.endDate) t.endDate = t.startDate;

  // Normaliza rango (end >= start)
  const s = parseISODate(t.startDate);
  const e = parseISODate(t.endDate);
  if (s && e && e < s) t.endDate = t.startDate;

  t.done = t.status === "done";
  if (typeof t.doneAt === "undefined") t.doneAt = t.done ? Date.now() : null;
  if (t.done && !t.doneAt) t.doneAt = Date.now();
  if (!t.done) t.doneAt = null;
  return t;
}

function addTask(title, priority, tags, startDate, endDate, category) {
  const clean = (title || "").trim();
  if (!clean) return;

  const t = normalizeTask({
    id: uid(),
    title: clean,
    priority,
    status: "todo",
    category: category || "task",
    startDate: startDate || null,
    endDate: endDate || null,
    tags: tags || [],
    createdAt: Date.now(),
    doneAt: null,
    done: false,
  });

  state.tasks.unshift(t);
  markActivity();
  save();
  renderAll();
  toast({ title:"Tarea creada", message: clean, type:"ok" });
}

function updateTask(id, patch) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  normalizeTask(t);
  markActivity();
  save();
  renderAll();
}

function deleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  state.tasks = state.tasks.filter(x => x.id !== id);
  markActivity();
  save();
  renderAll();
  toast({ title:"Eliminada", message: t?.title || "", type:"warn" });
}

function filteredTasks() {
  const q = ($("#searchInput").value || "").trim().toLowerCase();
  const filter = $("#filterSelect").value || "all";

  return state.tasks
    .map(normalizeTask)
    .filter(t => {
      const matchQ =
        t.title.toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.includes(q));
      const matchF = (filter === "all") || (t.status === filter);
      const matchTag = !state.tagFilter || (t.tags || []).includes(state.tagFilter);
      return matchQ && matchF && matchTag;
    });
}

function renderTagChips() {
  const wrap = $("#tagChips");
  wrap.innerHTML = "";

  const tags = new Map();
  for (const t of state.tasks) {
    for (const tag of (t.tags || [])) tags.set(tag, (tags.get(tag) || 0) + 1);
  }

  const sorted = [...tags.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 18);
  if (sorted.length === 0) {
    const e = document.createElement("span");
    e.className = "muted";
    e.textContent = "—";
    wrap.appendChild(e);
    return;
  }

  for (const [tag, count] of sorted) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chipBtn" + (state.tagFilter === tag ? " active" : "");
    b.textContent = `${tag} (${count})`;
    b.addEventListener("click", () => {
      state.tagFilter = (state.tagFilter === tag) ? null : tag;
      renderAll();
    });
    wrap.appendChild(b);
  }
}

function renderTasksList() {
  const list = $("#taskList");
  list.innerHTML = "";

  const items = filteredTasks();

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = `item status-${t.status}`;
    li.innerHTML = `<span class="muted">Sin resultados</span>`;
    list.appendChild(li);
    return;
  }

  items.forEach((t, index) => {
    const st = statusLabel(t.status);
    const pr = prBadge(t.priority);

    const li = document.createElement("li");
    li.className = `item status-${t.status}`;
    li.setAttribute("draggable", "true");
    li.dataset.id = t.id;

    li.innerHTML = `
      <div class="left">
        <div class="handle" aria-label="Arrastrar" title="Arrastrar">⋮⋮</div>
        <input class="chk" type="checkbox" ${t.status === "done" ? "checked" : ""} aria-label="Marcar como hecha" />
        <div style="min-width:0">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="subline">🗓 ${fmtISODate(t.startDate)} → ${fmtISODate(t.endDate)} · Creada: ${new Date(t.createdAt).toLocaleString()}</div>
          <div class="badges">
            <span class="badge ${pr.cls}">${pr.txt}</span>
            <span class="badge ${st.cls}">${st.txt}</span>
            ${t.category==="event" ? `<span class="badge type">Evento</span>` : ``}
            ${(t.tags||[]).slice(0,3).map(tag=>`<span class="badge tag" style="--tag-h:${tagHue(tag)}">${escapeHtml(tag)}</span>`).join("")}
            ${(t.tags||[]).length>3 ? `<span class="badge">+${(t.tags||[]).length-3}</span>` : ""}
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px">
        <button class="iconBtn btnEdit" type="button" aria-label="Editar">✎</button>
        <button class="iconBtn btnDel" type="button" aria-label="Eliminar">🗑️</button>
      </div>
    `;

    const chk = li.querySelector(".chk");
    const btnDel = li.querySelector(".btnDel");
    const btnEdit = li.querySelector(".btnEdit");

    chk.addEventListener("change", () => {
      updateTask(t.id, { status: chk.checked ? "done" : "todo" });
      toast({ title: chk.checked ? "Completada" : "Reabierta", message: t.title, type:"ok" });
    });

    btnEdit.addEventListener("click", () => openEdit(t));

    btnDel.addEventListener("click", async () => {
      const ok = await openModal({
        title:"Eliminar tarea",
        desc:`Se eliminará: "${t.title}"`,
        okText:"Eliminar",
        cancelText:"Cancelar"
      });
      if (!ok) return;
      deleteTask(t.id);
    });

    // Drag & drop ordering
    li.addEventListener("dragstart", (e) => {
      li.classList.add("dragging");
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));

    list.appendChild(li);
  });

  // Drop logic on list
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = list.querySelector(".dragging");
    if (!dragging) return;
    const after = getDragAfterElement(list, e.clientY);
    if (after == null) list.appendChild(dragging);
    else list.insertBefore(dragging, after);
  });

  list.addEventListener("drop", () => {
    const ids = [...list.querySelectorAll(".item[draggable='true']")].map(x => x.dataset.id);
    // Rebuild state order based on current DOM order
    const map = new Map(state.tasks.map(t => [t.id, t]));
    state.tasks = ids.map(id => map.get(id)).filter(Boolean);
    save();
    toast({ title:"Orden actualizado", message:"Reordenación aplicada", type:"info" });
    renderAll(false);
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".item[draggable='true']:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

/* Kanban rendering + drag */
function renderKanban() {
  const kb = $("#kanban");
  const list = $("#taskList");

  if (state.view !== "kanban") {
    kb.classList.remove("show");
    list.style.display = "";
    return;
  }
  kb.classList.add("show");
  list.style.display = "none";

  const cols = {
    todo: $("#kTodoBody"),
    doing: $("#kDoingBody"),
    done: $("#kDoneBody"),
  };
  Object.values(cols).forEach(el => el.innerHTML = "");

  const items = filteredTasks();
  const counts = { todo:0, doing:0, done:0 };

  for (const t of items) {
    counts[t.status] = (counts[t.status] || 0) + 1;

    const pr = prBadge(t.priority);
    const card = document.createElement("div");
    card.className = "kCard";
    card.setAttribute("draggable", "true");
    card.dataset.id = t.id;
    card.innerHTML = `
      <div class="kTitle">${escapeHtml(t.title)}</div>
      <div class="kMeta">🗓 ${fmtISODate(t.startDate)} → ${fmtISODate(t.endDate)} · ${escapeHtml(pr.txt)}${t.category==="event" ? " · Evento" : ""}${(t.tags||[]).length ? " · "+escapeHtml((t.tags||[]).slice(0,2).join(", ")) : ""}</div>
    `;

    card.addEventListener("click", () => openEdit(t));

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
    });

    cols[t.status].appendChild(card);
  }

  $("#kTodo").textContent = counts.todo;
  $("#kDoing").textContent = counts.doing;
  $("#kDone").textContent = counts.done;

  $$(".kBody").forEach(body => {
    body.addEventListener("dragover", (e) => e.preventDefault());
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const col = body.closest(".kCol")?.dataset?.status;
      if (!id || !col) return;
      updateTask(id, { status: col });
      toast({ title:"Movida", message:"Estado actualizado", type:"info" });
    });
  });
}

/* ===================== Stats + Notes + Recent ===================== */
function renderStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => (t.status || (t.done ? "done":"todo")) === "done").length;
  const pending = total - done;

  $("#statTotal").textContent = total;
  $("#statDone").textContent = done;
  $("#statPending").textContent = pending;
  $("#statTotal_dup").textContent = total;
  $("#streak").textContent = `${activityStreak()}d`;
}

function renderRecent() {
  const el = $("#recentList");
  el.innerHTML = "";
  const last = state.tasks.slice(0, 6);

  if (last.length === 0) {
    const li = document.createElement("li");
    li.className = "miniItem";
    li.innerHTML = `<span class="muted">Sin registros</span>`;
    el.appendChild(li);
    return;
  }

  for (const t of last) {
    const li = document.createElement("li");
    li.className = "miniItem";
    li.innerHTML = `
      <span>${escapeHtml(t.title)}</span>
      <span class="muted">${t.status === "done" ? "✔" : "•"}</span>
    `;
    el.appendChild(li);
  }
}

function renderNotes() {
  const area = $("#notesArea");
  const areaDup = $("#notesArea_dup");
  const count = $("#notesCount");
  const countDup = $("#notesCount_dup");

  if (area) area.value = state.notes;
  if (areaDup) areaDup.value = state.notes;

  if (count) count.textContent = String(state.notes.length);
  if (countDup) countDup.textContent = String(state.notes.length);
}

/* ===================== Skeletons ===================== */
function showTasksSkeleton() {
  const w = $("#tasksSkeleton");
  w.innerHTML = "";
  w.classList.add("show");
  w.setAttribute("aria-hidden", "false");
  for (let i = 0; i < 4; i++) {
    const c = document.createElement("div");
    c.className = "skeletonCard";
    c.innerHTML = `
      <div class="skeletonLine" style="width:70%"></div>
      <div class="skeletonLine" style="width:45%"></div>
      <div class="skeletonLine" style="width:85%"></div>
    `;
    w.appendChild(c);
  }
}
function hideTasksSkeleton() {
  const w = $("#tasksSkeleton");
  w.classList.remove("show");
  w.setAttribute("aria-hidden", "true");
}

function showStatsSkeleton() {
  const w = $("#statsSkeleton");
  w.innerHTML = "";
  w.classList.add("show");
  w.setAttribute("aria-hidden", "false");
  for (let i = 0; i < 3; i++) {
    const c = document.createElement("div");
    c.className = "skeletonCard";
    c.innerHTML = `
      <div class="skeletonLine" style="width:60%"></div>
      <div class="skeletonLine" style="width:90%"></div>
      <div class="skeletonLine" style="width:75%"></div>
    `;
    w.appendChild(c);
  }
}
function hideStatsSkeleton() {
  const w = $("#statsSkeleton");
  w.classList.remove("show");
  w.setAttribute("aria-hidden", "true");
}

/* ===================== Charts (Canvas) ===================== */
function canvasSetup(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.getAttribute("height") ? Number(canvas.getAttribute("height")) : 200;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cssW, h: cssH };
}

function palette() {
  const light = document.body.classList.contains("light");
  return {
    grid: light ? "rgba(10,20,40,0.12)" : "rgba(255,255,255,0.10)",
    text: light ? "#0f172a" : "#eaf1ff",
    muted: light ? "#51607a" : "#9fb0d6",
    fill: light ? "rgba(43,108,255,0.28)" : "rgba(43,108,255,0.22)",
    stroke: light ? "rgba(43,108,255,0.95)" : "rgba(43,108,255,0.9)",
    a: light ? "rgba(102,227,168,0.9)" : "rgba(102,227,168,0.85)",
    b: light ? "rgba(255,59,59,0.9)" : "rgba(255,59,59,0.85)",
    c: light ? "rgba(255,200,80,0.95)" : "rgba(255,200,80,0.9)",
  };
}

function drawAxes(ctx, w, h, pad, pal) {
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  const lines = 4;
  for (let i = 0; i <= lines; i++) {
    const y = pad.top + ((h - pad.top - pad.bottom) * i) / lines;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }
}

function drawLineChart(canvas, labels, values) {
  const { ctx, w, h } = canvasSetup(canvas);
  const pal = palette();
  const pad = { left: 36, right: 16, top: 14, bottom: 28 };

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, pad, pal);

  const maxV = Math.max(1, ...values);
  const x0 = pad.left;
  const y0 = h - pad.bottom;
  const x1 = w - pad.right;
  const y1 = pad.top;

  const n = values.length;
  const step = n > 1 ? (x1 - x0) / (n - 1) : 0;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const x = x0 + step * i;
    const y = y0 - ((values[i] / maxV) * (y0 - y1));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x0 + step * (n - 1), y0);
  ctx.closePath();
  ctx.fillStyle = pal.fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = x0 + step * i;
    const y = y0 - ((values[i] / maxV) * (y0 - y1));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = pal.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = pal.stroke;
  for (let i = 0; i < n; i++) {
    const x = x0 + step * i;
    const y = y0 - ((values[i] / maxV) * (y0 - y1));
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = pal.muted;
  ctx.font = "12px system-ui";
  const showEvery = n <= 10 ? 1 : Math.ceil(n / 8);
  for (let i = 0; i < n; i += showEvery) {
    const x = x0 + step * i;
    ctx.fillText(labels[i], Math.max(0, x - 10), h - 8);
  }
  ctx.fillText(String(maxV), 6, pad.top + 10);
  ctx.fillText("0", 12, y0);
}

function drawBarChart(canvas, labels, values) {
  const { ctx, w, h } = canvasSetup(canvas);
  const pal = palette();
  const pad = { left: 36, right: 16, top: 14, bottom: 28 };

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, pad, pal);

  const maxV = Math.max(1, ...values);
  const x0 = pad.left;
  const y0 = h - pad.bottom;
  const x1 = w - pad.right;

  const n = values.length;
  const slot = (x1 - x0) / n;
  const barW = Math.max(10, slot * 0.55);
  const colors = [pal.a, pal.c, pal.b];

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const bh = (v / maxV) * (y0 - pad.top);
    const x = x0 + slot * i + (slot - barW) / 2;
    const y = y0 - bh;

    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barW, bh);

    ctx.fillStyle = pal.muted;
    ctx.font = "12px system-ui";
    ctx.fillText(labels[i], x0 + slot * i + 4, h - 8);

    ctx.fillStyle = pal.text;
    ctx.font = "12px system-ui";
    ctx.fillText(String(v), x + barW / 2 - 4, y - 6);
  }

  ctx.fillStyle = pal.muted;
  ctx.font = "12px system-ui";
  ctx.fillText(String(maxV), 6, pad.top + 10);
  ctx.fillText("0", 12, y0);
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  d.setHours(0,0,0,0);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    out.push({ key: dayKeyFromTs(x.getTime()), label: `${dd}/${mm}` });
  }
  return out;
}

function computeSeries(rangeDays) {
  const days = lastNDays(rangeDays);
  const createdMap = new Map(days.map(d => [d.key, 0]));
  const doneMap = new Map(days.map(d => [d.key, 0]));
  let createdTotal = 0;
  let doneTotal = 0;

  for (const t of state.tasks) {
    const cKey = dayKeyFromTs(t.createdAt);
    if (createdMap.has(cKey)) { createdMap.set(cKey, createdMap.get(cKey) + 1); createdTotal++; }

    if (t.status === "done" && t.doneAt) {
      const dKey = dayKeyFromTs(t.doneAt);
      if (doneMap.has(dKey)) { doneMap.set(dKey, doneMap.get(dKey) + 1); doneTotal++; }
    }
  }

  const labels = days.map(d => d.label);
  const created = days.map(d => createdMap.get(d.key) || 0);
  const done = days.map(d => doneMap.get(d.key) || 0);

  return { labels, created, done, createdTotal, doneTotal };
}

function computePriorities() {
  const low = state.tasks.filter(t => t.priority === "low").length;
  const med = state.tasks.filter(t => t.priority === "med").length;
  const high = state.tasks.filter(t => t.priority === "high").length;
  return { labels: ["Baja", "Media", "Alta"], values: [low, med, high], total: low + med + high };
}

function redrawChartsIfVisible() {
  const statsPanel = $("#stats");
  if (!statsPanel || !statsPanel.classList.contains("active")) return;

  const rangeDays = Number($("#rangeSelect").value || "7");
  const s = computeSeries(rangeDays);
  const p = computePriorities();

  $("#doneTotalInRange").textContent = String(s.doneTotal);
  $("#createdTotalInRange").textContent = String(s.createdTotal);
  $("#prioTotal").textContent = String(p.total);

  drawLineChart($("#chartDone"), s.labels, s.done);
  drawBarChart($("#chartPrio"), p.labels, p.values);
  drawLineChart($("#chartCreated"), s.labels, s.created);
}

/* ===================== Clock ===================== */
function initClock() {
  const clock = $("#clock");
  const today = $("#today");
  const tick = () => {
    const d = new Date();
    if (clock) clock.textContent = d.toLocaleTimeString();
    if (today) today.textContent = d.toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"2-digit" });
  };
  tick();
  setInterval(tick, 1000);
}

/* ===================== Actions ===================== */
async function resetAll() {
  const ok = await openModal({
    title: "Reiniciar",
    desc: "Se borrarán tareas, notas y estadísticas guardadas localmente.",
    okText: "Reiniciar",
    cancelText: "Cancelar"
  });
  if (!ok) return;

  localStorage.removeItem(LS.tasks);
  localStorage.removeItem(LS.notes);
  localStorage.removeItem(LS.activity);
  localStorage.removeItem(LS.notifs);

  state.tasks = [];
  state.notes = "";
  state.activityDays = [];
  state.notifs = [];
  state.tagFilter = null;

  save();
  renderAll();
  switchTab("overview");
  toast({ title:"Reiniciado", message:"Datos locales eliminados", type:"warn" });
}

async function logoutFlow() {
  const ok = await openModal({
    title: "Cerrar sesión",
    desc: "Se cerrará la sesión actual.",
    okText: "Salir",
    cancelText: "Cancelar"
  });
  if (!ok) return;
  clearSession();
}

function toggleTheme() {
  const light = document.body.classList.contains("light");
  setTheme(light ? "dark" : "light");
}
function toggleDensity() {
  const compact = document.body.classList.contains("compact");
  setDensity(compact ? "normal" : "compact");
  toast({ title:"Densidad", message: compact ? "Normal" : "Compacta", type:"info" });
}

/* ===================== Render all ===================== */
function renderAll(redraw = true) {
  renderStats();
  renderRecent();
  renderNotes();
  renderTagChips();
  renderTasksList();
  renderKanban();
  renderCalendar();
  renderNotifs();
  if (redraw) redrawChartsIfVisible();
}


/* ===================== Calendario ===================== */
state.calOffset = 0;

function monthLabel(year, monthIndex){
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month:"long", year:"numeric" });
}

function tasksForDay(dayDate){
  const out = [];
  const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0,0,0,0);
  for (const t of state.tasks){
    const s = parseISODate(t.startDate);
    const e = parseISODate(t.endDate);
    if (!s || !e) continue;
    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);
    if (dayStart >= s0 && dayStart <= e0) out.push(t);
  }
  // Orden: primero eventos, luego por prioridad y fecha
  const pr = { high:0, med:1, low:2 };
  out.sort((a,b)=> (a.category==="event"?0:1)-(b.category==="event"?0:1) || (pr[a.priority]??9)-(pr[b.priority]??9) || (a.createdAt-b.createdAt));
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

    const items = tasksForDay(cellDate).slice(0,4);
    const more = Math.max(0, tasksForDay(cellDate).length - items.length);

    const chips = items.map(t=>{
      const cls = `${t.status} ${t.category==="event"?"event":""}`;
      const typeTxt = t.category==="event" ? "Evento" : "Tarea";
      return `<div class="calChip ${cls}" title="${escapeHtml(typeTxt)} · ${escapeHtml(t.title)}">
        <span class="k"></span>
        <span class="t">${escapeHtml(t.title)}</span>
      </div>`;
    }).join("");

    cells.push(`
      <div class="calCell ${dim?"dim":""} ${isToday?"today":""}">
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
    const tags = parseTags($("#editTags").value);

    updateTask(editId, { title, priority, status, category, startDate, endDate, tags });
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

function bindShortcuts() {
  document.addEventListener("keydown", (e) => {
    const isCmdkOpen = $("#cmdk").classList.contains("show");
    const isModalOpen = $("#modal").classList.contains("show") || $("#editModal").classList.contains("show");

    // Ctrl+K command palette
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (!isCmdkOpen) openCmdk();
      else closeCmdk();
      return;
    }

    // Esc closes modals/drawers/sidebar/cmdk
    if (e.key === "Escape") {
      if (isCmdkOpen) closeCmdk();
      if ($("#modal").classList.contains("show")) closeModal(false);
      if ($("#editModal").classList.contains("show")) closeEdit();
      if ($("#notifyPanel").classList.contains("open")) closeDrawer();
      closeSidebarMobile();
      return;
    }

    if (isCmdkOpen || isModalOpen) return;

    // "/" focus search
    if (e.key === "/") {
      e.preventDefault();
      switchTab("tasks");
      setTimeout(()=>$("#searchInput").focus(), 50);
    }

    // "n" new task
    if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switchTab("tasks");
      setTimeout(()=>$("#taskInput").focus(), 50);
    }
  });
}

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
  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const type = $("#taskType").value || "task";
    const start = $("#taskStart").value || null;
    const end = $("#taskEnd").value || start || null;
    addTask(
      $("#taskInput").value,
      $("#taskPriority").value,
      parseTags($("#taskTags").value),
      start,
      end,
      type
    );
    $("#taskInput").value = "";
    $("#taskTags").value = "";
    $("#taskStart").value = "";
    $("#taskEnd").value = "";
    $("#taskType").value = "task";
  });

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

  // notes
  const onNotes = (val) => {
    state.notes = val;
    markActivity();
    save();
    renderNotes();
    toast({ title:"Notas", message:"Guardadas", type:"ok", timeout: 1400 });
  };
  $("#notesArea").addEventListener("input", (e) => onNotes(e.target.value));
  $("#notesArea_dup").addEventListener("input", (e) => onNotes(e.target.value));

  // stats
  $("#btnRecalc").addEventListener("click", () => redrawChartsIfVisible());
  $("#rangeSelect").addEventListener("change", () => redrawChartsIfVisible());
  window.addEventListener("resize", () => redrawChartsIfVisible());

  // login
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginErr").textContent = "";

    const btn = $("#loginBtn");
    btn.classList.add("loading");
    btn.disabled = true;

    await new Promise(r => setTimeout(r, 260));
    const ok = await tryLogin($("#loginUser").value, $("#loginPass").value);

    btn.classList.remove("loading");
    btn.disabled = false;

    if (!ok) {
      $("#loginErr").textContent = "Credenciales inválidas";
      toast({ title:"Acceso denegado", message:"Revisa usuario y contraseña", type:"danger" });
    } else {
      toast({ title:"Bienvenido", message:"Acceso concedido", type:"ok" });
    }

    $("#loginPass").value = "";
  });
}

/* ===================== Main ===================== */
function main() {
  load();
  initTheme();
  initDensity();
  initClock();

  $("#viewSelect").value = state.view;

  bindModal();
  bindEditModal();
  bindCmdk();
  bindShortcuts();
  bindUx();

  // service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(err => console.warn("SW register failed:", err));
    });
  }

  // restore session
  if (state.session?.u && state.session?.role) {
    $("#who").textContent = `${state.session.u} (${state.session.role})`;
    lockByRole(state.session.role);
    showGate(false);
  } else {
    showGate(true);
  }

  renderAll();
  // Avisos de vencimiento: al arrancar y cada hora (si la app está abierta)
  checkDueNotifications();
  setInterval(checkDueNotifications, 60 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);