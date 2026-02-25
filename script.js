const LS = {
  tasks: "trx_tasks_v5",
  notes: "trx_notes_v5",
  theme: "trx_theme_v5",
  density: "trx_density_v1",
  activity: "trx_activity_v5",
  session: "trx_session_v4",
  notifs: "trx_notifs_v1",
  favColors: "trx_fav_colors_v1",
  dueNotifs: "trx_due_notifs_v1",
  timer: "trx_timer_v1",
};

const SUPABASE_URL = "https://hfduuucvknucjhrtodpt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HpAVTQ7Op6b2Cjnp9rBdrg_RmZrDJ9F";
let supabaseClient = null;
let cloudUserId = null;
let cloudSyncTimer = null;
const CLOUD = {
  tasksTable: "trx_tasks",
  notesTable: "trx_notes",
  delTasksKey: "trx_cloud_deleted_tasks_v1",
  delNotesKey: "trx_cloud_deleted_notes_v1",
  syncDebounceMs: 1200,
};

let authUiMode = "login"; // login | register

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];


// Discord webhooks por canal (pon aquí tus URLs reales)
const DISCORD_WEBHOOKS = {
  peticiones: "https://discord.com/api/webhooks/1475201722598035466/TiovwsMXoldKuituNh48fn-Mn5QkjzjXe1Rl6wCERr5NHWwFWe5BpU86m5GHE-XohJrY",
  reportes: "https://discord.com/api/webhooks/1475203494288953467/ZYY0YXTzNtRMwU-hIzVgYLOIXjZU994f3A7kabgWsRGqFEHAJ92Q8bx-MTrj34IhrL2A",
  sugerencias: "https://discord.com/api/webhooks/1475203356472381592/wHB4VJTFF8tSl_LcriW35K8w7sBwC41vFEQ4VsBg82zcuk6nlNY1DJ9kurP5gZGKPQwY",
  contacto: "https://discord.com/api/webhooks/1475203570826481806/LDIqUrTbaxPYFiNky1Jax58oFhhOvQWEwrJvm4kwVAgiF0IHtD9_oabiIcNFA-mBu6hS",
};
const DISCORD_CHANNEL_LABELS = {
  peticiones: "Peticiones",
  reportes: "Reportes",
  sugerencias: "Sugerencias",
  contacto: "Contacto",
};

const state = {
  tasks: [],
  notes: [],
  favColors: [],
  activityDays: [],
  session: null,
  notifs: [],
  tagFilter: null,
  view: "list", // list | kanban
  timer: {
  mode: "timer", // timer | pomodoro
  durationMs: 25 * 1000,
  remainingMs: 25 * 1000,
  running: false,
  endAt: null,
  volume: 0.5,
  finishedAt: null,

  // Pomodoro
  pomodoro: {
    workMin: 25,
    shortMin: 5,
    longMin: 15,
    longEvery: 4,
    autoAdvance: true,
    phase: "work", // work | short | long
    completed: 0,  // trabajos completados
  },

  // Configuraciones guardadas (máx 10)
  pomodoroPresets: [],

  // Para recordar el último temporizador "normal"
  lastTimerDurationMs: 25 * 1000,
},
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

// HH:MM -> HH:MM (para mostrar en UI). Mantiene formato y valida.
function fmtTime(hhmm){
  const s = String(hhmm || "").trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return "";
  return s;
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
  // Notes migration: old versions stored a single textarea string
  try {
    const rawNotes = localStorage.getItem(LS.notes);
    const parsed = rawNotes ? JSON.parse(rawNotes) : null;
    if (Array.isArray(parsed)) {
      state.notes = parsed;
    } else if (typeof rawNotes === "string" && rawNotes.trim()) {
      state.notes = [{ id: uid(), text: rawNotes.trim(), pinned: false, createdAt: Date.now() }];
    } else {
      state.notes = [];
    }
  } catch {
    const rawNotes = localStorage.getItem(LS.notes) || "";
    state.notes = rawNotes && rawNotes.trim() ? [{ id: uid(), text: rawNotes.trim(), pinned: false, createdAt: Date.now() }] : [];
  }

  try { state.favColors = JSON.parse(localStorage.getItem(LS.favColors) || "[]"); } catch { state.favColors = []; }
  try { state.activityDays = JSON.parse(localStorage.getItem(LS.activity) || "[]"); } catch { state.activityDays = []; }
  try { state.session = JSON.parse(localStorage.getItem(LS.session) || "null"); } catch { state.session = null; }
  try { state.notifs = JSON.parse(localStorage.getItem(LS.notifs) || "[]"); } catch { state.notifs = []; }
  try { state.dueNotifs = JSON.parse(localStorage.getItem(LS.dueNotifs) || "{}"); } catch { state.dueNotifs = {}; }

  // Agenda range
  try {
    const r = localStorage.getItem("trx_agenda_range_v1");
    if (r) state.agendaRange = r;
  } catch {}

  // Timer
try { state.timer = JSON.parse(localStorage.getItem(LS.timer) || "null") || state.timer; } catch {}
// Normaliza timer
const defTimer = {
  mode: "timer",
  durationMs: 25*1000,
  remainingMs: 25*1000,
  running:false,
  endAt:null,
  volume:0.5,
  finishedAt:null,
  pomodoro: { workMin:25, shortMin:5, longMin:15, longEvery:4, autoAdvance:true, phase:"work", completed:0 },
  pomodoroPresets: [],
  lastTimerDurationMs: 25*1000,
};
if (!state.timer || typeof state.timer !== "object") state.timer = defTimer;
if (!state.timer.pomodoro || typeof state.timer.pomodoro !== "object") state.timer.pomodoro = defTimer.pomodoro;
if (!Array.isArray(state.timer.pomodoroPresets)) state.timer.pomodoroPresets = [];

state.timer.mode = (state.timer.mode === "pomodoro") ? "pomodoro" : "timer";
state.timer.durationMs = Math.max(1000, Number(state.timer.durationMs) || defTimer.durationMs);
state.timer.remainingMs = Math.min(state.timer.durationMs, Math.max(0, Number(state.timer.remainingMs) || state.timer.durationMs));
state.timer.running = Boolean(state.timer.running);
state.timer.endAt = state.timer.endAt ? Number(state.timer.endAt) : null;
state.timer.volume = Math.max(0, Math.min(1, Number(state.timer.volume) ?? defTimer.volume));
state.timer.finishedAt = state.timer.finishedAt ? Number(state.timer.finishedAt) : null;

state.timer.lastTimerDurationMs = Math.max(1000, Number(state.timer.lastTimerDurationMs) || state.timer.durationMs);

// Pomodoro settings
const p = state.timer.pomodoro;
p.workMin = Math.max(1, Math.min(180, Number(p.workMin) || defTimer.pomodoro.workMin));
p.shortMin = Math.max(1, Math.min(60, Number(p.shortMin) || defTimer.pomodoro.shortMin));
p.longMin = Math.max(1, Math.min(120, Number(p.longMin) || defTimer.pomodoro.longMin));
p.longEvery = Math.max(2, Math.min(10, Number(p.longEvery) || defTimer.pomodoro.longEvery));
p.autoAdvance = Boolean(p.autoAdvance);
p.phase = (p.phase === "short" || p.phase === "long") ? p.phase : "work";
p.completed = Math.max(0, Number(p.completed) || 0);

// Pomodoro presets
state.timer.pomodoroPresets = (state.timer.pomodoroPresets || [])
  .filter(x => x && typeof x === "object")
  .map(x => ({
    id: String(x.id || uid()),
    name: String(x.name || "Sin nombre").slice(0, 40),
    workMin: Math.max(1, Math.min(180, Number(x.workMin) || p.workMin)),
    shortMin: Math.max(1, Math.min(60, Number(x.shortMin) || p.shortMin)),
    longMin: Math.max(1, Math.min(120, Number(x.longMin) || p.longMin)),
    longEvery: Math.max(2, Math.min(10, Number(x.longEvery) || p.longEvery)),
  }))
  .slice(0, 10);

  const v = localStorage.getItem("trx_view_v1");
  if (v) state.view = v;

  // Migrate old schema
  state.tasks = state.tasks.map(normalizeTask);
}

function save() {
  localStorage.setItem(LS.tasks, JSON.stringify(state.tasks));
  localStorage.setItem(LS.notes, JSON.stringify(state.notes));
  localStorage.setItem(LS.favColors, JSON.stringify(state.favColors || []));
  localStorage.setItem(LS.activity, JSON.stringify(state.activityDays));
  localStorage.setItem(LS.notifs, JSON.stringify(state.notifs));
  localStorage.setItem(LS.dueNotifs, JSON.stringify(state.dueNotifs || {}));
  if (state.session) localStorage.setItem(LS.session, JSON.stringify(state.session));
  localStorage.setItem("trx_view_v1", state.view);
  if (state.agendaRange) localStorage.setItem("trx_agenda_range_v1", state.agendaRange);
  localStorage.setItem(LS.timer, JSON.stringify(state.timer || null));
  try { cloudScheduleSync(); } catch {}
}

/* ===================== Cloud Sync (Supabase) ===================== */
function cloudSetUser(user){
  cloudUserId = user?.id || null;
}

function cloudIsReady(){
  return !!(cloudUserId && supabaseClient);
}

function cloudGetDeleted(key){
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function cloudAddDeleted(key, id){
  if (!id) return;
  const arr = cloudGetDeleted(key);
  if (!arr.includes(id)) arr.push(id);
  localStorage.setItem(key, JSON.stringify(arr));
}
function cloudClearDeleted(key){
  localStorage.setItem(key, JSON.stringify([]));
}

function cloudScheduleSync(){
  if (!cloudIsReady()) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    cloudSyncAll().catch(e => console.warn("cloudSyncAll error", e));
  }, CLOUD.syncDebounceMs);
}

async function cloudBootstrap(){
  if (!cloudIsReady()) return;
  const sb = supabaseClient;
  // 1) Load server data
  const [tasksRes, notesRes] = await Promise.all([
    sb.from(CLOUD.tasksTable).select("task_id,data,deleted,updated_at").eq("user_id", cloudUserId),
    sb.from(CLOUD.notesTable).select("note_id,data,deleted,updated_at").eq("user_id", cloudUserId),
  ]);
  if (tasksRes.error) console.warn("Cloud tasks fetch", tasksRes.error);
  if (notesRes.error) console.warn("Cloud notes fetch", notesRes.error);

  const serverTasks = (tasksRes.data || []).filter(r => !r.deleted && r.data).map(r => r.data);
  const serverNotes = (notesRes.data || []).filter(r => !r.deleted && r.data).map(r => r.data);

  // 2) Merge (server overlays local by id)
  const tMap = new Map((state.tasks || []).map(t => [t.id, t]));
  for (const t of serverTasks) tMap.set(t.id, normalizeTask(t));
  state.tasks = [...tMap.values()];

  const nMap = new Map((state.notes || []).map(n => [n.id, n]));
  for (const n of serverNotes) nMap.set(n.id, n);
  state.notes = [...nMap.values()];

  save();
  renderAll();

  // 3) Push any local-only data
  cloudScheduleSync();
}

async function cloudSyncAll(){
  if (!cloudIsReady()) return;
  const sb = supabaseClient;

  // Upsert tasks
  const taskRows = (state.tasks || []).map(t => ({
    user_id: cloudUserId,
    task_id: t.id,
    data: t,
    deleted: false,
    updated_at: new Date().toISOString()
  }));
  if (taskRows.length){
    const { error } = await sb.from(CLOUD.tasksTable).upsert(taskRows, { onConflict: "user_id,task_id" });
    if (error) console.warn("Cloud tasks upsert", error);
  }

  // Upsert notes
  const noteRows = (state.notes || []).map(n => ({
    user_id: cloudUserId,
    note_id: n.id,
    data: n,
    deleted: false,
    updated_at: new Date().toISOString()
  }));
  if (noteRows.length){
    const { error } = await sb.from(CLOUD.notesTable).upsert(noteRows, { onConflict: "user_id,note_id" });
    if (error) console.warn("Cloud notes upsert", error);
  }

  // Deletes (hard delete)
  const delTasks = cloudGetDeleted(CLOUD.delTasksKey);
  if (delTasks.length){
    const { error } = await sb.from(CLOUD.tasksTable).delete().eq("user_id", cloudUserId).in("task_id", delTasks);
    if (error) console.warn("Cloud tasks delete", error);
    else cloudClearDeleted(CLOUD.delTasksKey);
  }

  const delNotes = cloudGetDeleted(CLOUD.delNotesKey);
  if (delNotes.length){
    const { error } = await sb.from(CLOUD.notesTable).delete().eq("user_id", cloudUserId).in("note_id", delNotes);
    if (error) console.warn("Cloud notes delete", error);
    else cloudClearDeleted(CLOUD.delNotesKey);
  }
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
  if ($("#editStartTime")) $("#editStartTime").value = t.startTime || "";
  if ($("#editEndTime")) $("#editEndTime").value = t.endTime || "";
  $("#editTags").value = (t.tags || []).join(", ");
    if ($("#editColor")) $("#editColor").value = (t.color && /^#[0-9a-f]{6}$/i.test(t.color)) ? t.color : "#3b82f6";
  renderFavColors();
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


/* ===================== UI: Day Modal (Calendario) ===================== */
let dayModalISO = null;

function tasksForISODate(iso){
  const d = parseISODate(iso);
  if (!d) return [];
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
  const out = [];

  for (const t of state.tasks){
    const s = parseISODate(t.startDate);
    const e = parseISODate(t.endDate);
    if (!s || !e) continue;

    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0,0,0,0);
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0,0,0,0);

    if (day0 >= s0 && day0 <= e0){
      const starts = day0.getTime() === s0.getTime();
      const ends = day0.getTime() === e0.getTime();
      const point = starts ? "start" : (ends ? "end" : "mid");
      out.push({ task: t, point });
    }
  }

  const pr = { high:0, med:1, low:2 };
  out.sort((a,b)=>
    (a.task.category==="event"?0:1)-(b.task.category==="event"?0:1) ||
    (pr[a.task.priority]??9)-(pr[b.task.priority]??9) ||
    (a.task.startTime||"").localeCompare(b.task.startTime||"") ||
    (a.task.createdAt-b.task.createdAt)
  );
  return out;
}

function openDayModal(iso){
  const m = $("#dayModal");
  if (!m) return;
  dayModalISO = iso;

  const d = parseISODate(iso);
  const title = d ? d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" }) : iso;
  $("#dayModalTitle").textContent = title;

  const list = $("#dayModalList");
  const items = tasksForISODate(iso);

  if (!items.length){
    list.innerHTML = `<div class="muted">No hay tareas/eventos este día.</div>`;
  } else {
    list.innerHTML = items.map(({task:t, point})=>{
      const badge = t.status;
      const typeTxt = t.category === "event" ? "Evento" : "Tarea";
      const span = (t.startDate !== t.endDate) ? `· Rango ${fmtISODate(t.startDate)} → ${fmtISODate(t.endDate)}` : "";
      const when = (t.startTime || t.endTime)
        ? `· ${t.startTime?fmtTime(t.startTime):""}${(t.startTime&&t.endTime)?"→":""}${t.endTime?fmtTime(t.endTime):""}`
        : "";
      const flag = point === "start" ? "Comienza" : (point === "end" ? "Termina" : "En curso");
      const style = t.color ? ` style="border-left:4px solid ${t.color}; padding-left:10px"` : "";
      return `
        <div class="dayItem" data-id="${escapeHtml(t.id)}"${style}>
          <div class="dayItemTop">
            <div>
              <div class="dayItemTitle">${escapeHtml(t.title)}</div>
              <div class="dayItemMeta">${escapeHtml(typeTxt)} · ${escapeHtml(flag)} ${span} ${when}</div>
            </div>
            <div class="dayBadge ${escapeHtml(badge)}">${escapeHtml(badge)}</div>
          </div>
        </div>`;
    }).join("");

    // bind click once via delegation
    if (!list.dataset.bound){
      list.dataset.bound = "1";
      list.addEventListener("click", (e)=>{
        const item = e.target.closest(".dayItem");
        if (!item) return;
        const id = item.dataset.id;
        const t = state.tasks.find(x=>x.id===id);
        if (t){
          closeDayModal();
          openEdit(t);
        }
      });
    }
  }

  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
}

function closeDayModal(){
  const m = $("#dayModal");
  if (!m) return;
  dayModalISO = null;
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
}

function bindDayModal(){
  const m = $("#dayModal");
  if (!m || m.dataset.bound) return;
  m.dataset.bound = "1";
  $("#dayModalX")?.addEventListener("click", closeDayModal);
  $("#dayModalClose")?.addEventListener("click", closeDayModal);
  m.addEventListener("click", (e)=>{
    if (e.target?.closest('[data-close-day="1"]')) closeDayModal();
  });
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && m.classList.contains("show")) closeDayModal();
  });
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
    { name:"Ir a Temporizador", desc:"Abrir temporizador", key:"G", run:()=>switchTab("timer") },
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


async function initSupabaseClient(){
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return supabaseClient;
  } catch (e) {
    console.warn("Supabase init error", e);
    return null;
  }
}

async function fetchProfileForUser(user){
  const sb = await initSupabaseClient();
  if (!sb || !user?.id) {
    const email = user?.email || "";
    return { username: (email.split("@")[0] || "usuario"), role: "user" };
  }
  const { data, error } = await sb.from("profiles").select("username,display_name,role").eq("id", user.id).maybeSingle();
  if (error) {
    console.warn("Profile fetch error", error);
  }
  const email = user.email || "";
  return {
    username: data?.display_name || data?.username || (email.split("@")[0] || "usuario"),
    role: data?.role || "user"
  };
}

async function applySupabaseSession(user, opts = {}){
  if (!user) return false;
  const profile = await fetchProfileForUser(user);
  setSession(profile.username, profile.role, user.email || "");
  try { cloudSetUser(user); cloudBootstrap(); } catch {}
  if (opts.toastMessage) {
    toast({ title:"Bienvenido", message: opts.toastMessage, type:"ok" });
  }
  return true;
}

function setAuthMode(mode){
  authUiMode = mode === "register" ? "register" : "login";
  const form = document.getElementById("loginForm");
  if (form) form.dataset.mode = authUiMode;
  const regNameField = document.getElementById("regNameField");
  const regName = document.getElementById("regName");
  const email = document.getElementById("loginEmail");
  const pass = document.getElementById("loginPass");
  const btn = document.getElementById("loginBtn")?.querySelector?.(".btnText");
  const toggle = document.getElementById("authModeToggle");
  const chip = document.getElementById("authModeChip");
  if (regNameField) regNameField.style.display = authUiMode === "register" ? "block" : "none";
  if (regName) regName.required = authUiMode === "register";
  if (email) email.autocomplete = authUiMode === "register" ? "email" : "email";
  if (pass) pass.autocomplete = authUiMode === "register" ? "new-password" : "current-password";
  if (btn) btn.textContent = authUiMode === "register" ? "Crear cuenta" : "Entrar";
  if (toggle) toggle.textContent = authUiMode === "register" ? "Ya tengo cuenta" : "Crear cuenta";
  if (chip) chip.textContent = authUiMode === "register" ? "Registro" : "Login";
  const hint = document.getElementById("authHint");
  if (hint) hint.textContent = authUiMode === "register" ? "Regístrate con correo y contraseña." : "Inicia sesión con tu correo (no con nombre de usuario).";
  const err = document.getElementById("loginErr");
  if (err) err.textContent = "";
}

/* ===================== Auth / Roles ===================== */
function showGate(on) {
  $("#authGate").classList.toggle("hidden", !on);
}

function lockByRole(role) {
  const isAdmin = role === "admin";
  // Notas y Stats quedan disponibles para todos los usuarios.
  // El sistema de roles se mantiene para futuras secciones exclusivas de admin.
  $$(".tab").forEach((t) => {
    const req = t.getAttribute("data-requires-role");
    if (!req) return;

    const tabId = t.getAttribute("data-tab");
    const allowForAll = tabId === "notes" || tabId === "stats";
    const ok = allowForAll ? true : (req === role);

    t.disabled = !ok;
    t.classList.toggle("is-locked", !ok);
    if (ok) {
      t.removeAttribute("aria-disabled");
      t.tabIndex = 0;
    } else {
      t.setAttribute("aria-disabled", "true");
      t.tabIndex = -1;
      if (t.classList.contains("active")) switchTab("overview");
    }
  });

  // Mantener acciones sensibles solo para admin (por ejemplo, reinicio global)
  $("#btnReset").style.display = isAdmin ? "inline-flex" : "none";
}

function setSession(username, role, email = "") {
  state.session = { u: username, role, email, ts: Date.now() };
  localStorage.setItem(LS.session, JSON.stringify(state.session));
  $("#who").textContent = `${username} (${role})`;
  lockByRole(role);
  showGate(false);
  switchTab("overview");
  toast({ title: "Sesión iniciada", message: `${username} conectado`, type: "ok" });
  try { scheduleInstallUIAfterLogin(); } catch {}
}

async function clearSession() {
  try {
    const sb = await initSupabaseClient();
    if (sb) {
      await sb.auth.signOut();
    }
  } catch (e) {
    console.warn("Supabase signOut error", e);
  }
  state.session = null;
  cloudUserId = null;
  if (cloudSyncTimer) { clearTimeout(cloudSyncTimer); cloudSyncTimer = null; }
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

function authErrorMessage(error, mode = "login") {
  const raw = (error?.message || error?.error_description || error || "").toString();
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return mode === "login"
      ? "Correo o contraseña incorrectos. Inicia sesión con tu EMAIL (no con nombre de usuario)."
      : "No se pudo crear la cuenta con esas credenciales.";
  }
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return "Tu correo no está confirmado. Revisa tu email o desactiva la confirmación en Supabase para pruebas.";
  }
  if (msg.includes("already registered") || msg.includes("user already registered")) {
    return "Ese correo ya está registrado. Prueba a iniciar sesión.";
  }
  if (msg.includes("invalid api key") || msg.includes("apikey")) {
    return "La clave pública de Supabase no es válida o está incompleta.";
  }
  return raw || (mode === "login" ? "No se pudo iniciar sesión" : "No se pudo crear la cuenta");
}

async function tryLogin(email, password) {
  const sb = await initSupabaseClient();
  if (!sb) return { ok:false, error:"Supabase no está configurado" };
  const e = (email || "").trim().toLowerCase();
  const p = password || "";
  const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p });
  if (error) return { ok:false, error: authErrorMessage(error, "login") };
  if (!data?.user) return { ok:false, error:"Sesión no disponible" };
  await applySupabaseSession(data.user, { toastMessage: "Acceso concedido" });
  return { ok:true };
}

async function tryRegister(name, email, password){
  const sb = await initSupabaseClient();
  if (!sb) return { ok:false, error:"Supabase no está configurado" };
  const displayName = String(name || "").trim();
  const e = (email || "").trim().toLowerCase();
  const p = password || "";
  if (displayName.length < 2) return { ok:false, error:"Pon un nombre de al menos 2 caracteres" };
  if (p.length < 6) return { ok:false, error:"La contraseña debe tener al menos 6 caracteres" };

  const { data, error } = await sb.auth.signUp({
    email: e,
    password: p,
    options: { data: { username: displayName } }
  });
  if (error) return { ok:false, error: authErrorMessage(error, "register") };

  if (data?.user && data?.session) {
    // Asegura username amigable por si el trigger usó el correo
    try {
      await sb.from("profiles").update({ username: displayName, display_name: displayName }).eq("id", data.user.id);
    } catch {}
    await applySupabaseSession(data.user, { toastMessage: "Cuenta creada" });
    return { ok:true, registered:true };
  }

  return { ok:true, registered:true, needsEmailConfirm:true };
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
  if (id === "timer") {
    setTimeout(() => { renderTimerUI(true); }, 20);
  }
  if (id === "agenda") {
    setTimeout(() => { renderAgenda(); }, 10);
  }
}


/* ===================== Timer ===================== */
let timerTickHandle = null;
// Evita pisar inputs mientras el usuario escribe (p.ej. ajustes Pomodoro)
let _lastTimerUiMode = null;

function clampTimerParts(min, sec){
  const m = Math.max(0, Math.min(999, Number(min) || 0));
  const s = Math.max(0, Math.min(59, Number(sec) || 0));
  return { m, s };
}
function msFromParts(min, sec){
  const { m, s } = clampTimerParts(min, sec);
  return (m * 60 + s) * 1000;
}
function partsFromMs(ms){
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { m, s };
}
function fmtTimer(ms){
  const { m, s } = partsFromMs(ms);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function setTimerDuration(ms){
  const dur = Math.max(1000, Math.min(999*60*1000 + 59*1000, Number(ms) || 0));
  state.timer.durationMs = dur;
  if (!state.timer.running){
    state.timer.remainingMs = dur;
    state.timer.endAt = null;
  } else {
    // si está corriendo, ajusta el final manteniendo el % restante
    const now = Date.now();
    const rem = Math.max(0, (state.timer.endAt || now) - now);
    const ratio = state.timer.durationMs ? rem / state.timer.durationMs : 1;
    state.timer.remainingMs = Math.round(dur * ratio);
    state.timer.endAt = now + state.timer.remainingMs;
  }
  save();
  renderTimerUI();
}

function readTimerInputs(){
  const minEl = $("#timerMin");
  const secEl = $("#timerSec");
  if (!minEl || !secEl) return null;
  const ms = msFromParts(minEl.value, secEl.value);
  return ms;
}

function syncTimerInputsFromState(){
  const minEl = $("#timerMin");
  const secEl = $("#timerSec");
  if (!minEl || !secEl) return;
  const { m, s } = partsFromMs(state.timer.durationMs || 0);
  minEl.value = String(m);
  secEl.value = String(s);
}

function setTimerPreset(minutes){
  const mins = Math.max(1, Number(minutes) || 1);

  if (state.timer.mode === "pomodoro"){
    state.timer.pomodoro.workMin = mins;
    state.timer.pomodoro.phase = "work";
    const dur = mins * 60 * 1000;
    state.timer.durationMs = dur;
    if (!state.timer.running){
      state.timer.remainingMs = dur;
      state.timer.endAt = null;
    }
    save();
    syncPomodoroInputsFromState();
    renderTimerUI(true);
    toast({ title:"Pomodoro", message:`Trabajo: ${mins} min`, type:"info", timeout: 1200 });
    return;
  }

  const ms = Math.max(1000, mins * 60 * 1000);
  setTimerDuration(ms);
  toast({ title:"Temporizador", message:`Preset: ${mins} min`, type:"info", timeout: 1200 });
}

function pomoPhaseLabel(phase){
  if (phase === "short") return "Descanso";
  if (phase === "long") return "Descanso largo";
  return "Trabajo";
}
function pomoPhaseDurationMs(phase){
  const p = state.timer.pomodoro;
  const min = phase === "short" ? p.shortMin : phase === "long" ? p.longMin : p.workMin;
  return Math.max(1000, Number(min) * 60 * 1000);
}
function setTimerMode(mode){
  const m = (mode === "pomodoro") ? "pomodoro" : "timer";
  if (state.timer.mode === m) return;

  // pausa para evitar inconsistencias
  if (state.timer.running) timerPause();

  if (m === "pomodoro"){
    // guarda el último temporizador normal
    state.timer.lastTimerDurationMs = state.timer.durationMs;
    // carga la fase actual
    const dur = pomoPhaseDurationMs(state.timer.pomodoro.phase);
    state.timer.durationMs = dur;
    state.timer.remainingMs = dur;
    state.timer.endAt = null;
  } else {
    // vuelve al último temporizador normal
    const dur = Math.max(1000, Number(state.timer.lastTimerDurationMs) || 25*1000);
    state.timer.durationMs = dur;
    state.timer.remainingMs = dur;
    state.timer.endAt = null;
  }

  state.timer.mode = m;
  save();
  syncTimerInputsFromState();
  syncPomodoroInputsFromState();
  renderTimerUI(true);
}

function setPomodoroPhase(phase, { keepRunning=false } = {}){
  const p = state.timer.pomodoro;
  const ph = (phase === "short" || phase === "long") ? phase : "work";
  const wasRunning = state.timer.running;
  if (wasRunning) timerPause();

  p.phase = ph;
  const dur = pomoPhaseDurationMs(ph);
  state.timer.durationMs = dur;
  state.timer.remainingMs = dur;
  state.timer.endAt = null;
  state.timer.finishedAt = null;

  save();
  renderTimerUI(true);

  if (keepRunning && wasRunning){
    timerStart();
  }
}

function syncPomodoroInputsFromState(){
  const p = state.timer.pomodoro;
  const elWork = $("#pomoWork");
  const elShort = $("#pomoShort");
  const elLong = $("#pomoLong");
  const elEvery = $("#pomoEvery");
  const elAuto = $("#pomoAuto");
  const volP = $("#timerVolPomo");
  const volN = $("#timerVol");

  // No sobreescribas el valor si el usuario está editando ese input
  const ae = document.activeElement;
  if (elWork && ae !== elWork) elWork.value = String(p.workMin);
  if (elShort && ae !== elShort) elShort.value = String(p.shortMin);
  if (elLong && ae !== elLong) elLong.value = String(p.longMin);
  if (elEvery && ae !== elEvery) elEvery.value = String(p.longEvery);
  if (elAuto) elAuto.checked = !!p.autoAdvance;

  // sincroniza selects de sonido
  if (volP) volP.value = String(state.timer.volume ?? 0.5);
  if (volN) volN.value = String(state.timer.volume ?? 0.5);

  const sec = $("#timer");
  if (sec) sec.dataset.mode = state.timer.mode;
  const btnT = $("#timerModeTimer");
  const btnP = $("#timerModePomodoro");
  if (btnT) btnT.classList.toggle("active", state.timer.mode === "timer");
  if (btnP) btnP.classList.toggle("active", state.timer.mode === "pomodoro");
  if (btnT) btnT.setAttribute("aria-selected", state.timer.mode === "timer" ? "true" : "false");
  if (btnP) btnP.setAttribute("aria-selected", state.timer.mode === "pomodoro" ? "true" : "false");
}

function applyPomodoroSettings(){
  const p = state.timer.pomodoro;
  const elWork = $("#pomoWork");
  const elShort = $("#pomoShort");
  const elLong = $("#pomoLong");
  const elEvery = $("#pomoEvery");
  const elAuto = $("#pomoAuto");

  if (elWork) p.workMin = Math.max(1, Math.min(180, Number(elWork.value) || p.workMin));
  if (elShort) p.shortMin = Math.max(1, Math.min(60, Number(elShort.value) || p.shortMin));
  if (elLong) p.longMin = Math.max(1, Math.min(120, Number(elLong.value) || p.longMin));
  if (elEvery) p.longEvery = Math.max(2, Math.min(10, Number(elEvery.value) || p.longEvery));
  if (elAuto) p.autoAdvance = !!elAuto.checked;

  save();

  // si estamos en pomodoro y no está corriendo, aplica la duración de la fase actual
  if (state.timer.mode === "pomodoro" && !state.timer.running){
    const dur = pomoPhaseDurationMs(p.phase);
    state.timer.durationMs = dur;
    state.timer.remainingMs = dur;
    state.timer.endAt = null;
    save();
  }
  renderTimerUI(true);
}

function renderPomodoroPresets(force = false){
  const wrap = $("#pomoPresetList");
  if (!wrap) return;
  if (!force){
    // Evita re-render si el usuario está editando un nombre
    const ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("pomoPresetName")) return;
  }

  const presets = state.timer.pomodoroPresets || [];
  if (!presets.length){
    wrap.innerHTML = `<div class="muted" style="font-size:12px">No hay configuraciones guardadas.</div>`;
    return;
  }

  wrap.innerHTML = presets.map(p => {
    const meta = `${p.workMin}/${p.shortMin}/${p.longMin} · Largo cada ${p.longEvery}`;
    return `
      <div class="pomoPresetItem" data-id="${escapeHtml(p.id)}">
        <div class="name">
          <input class="pomoPresetName" type="text" maxlength="40" value="${escapeHtml(p.name)}" />
          <div class="pomoPresetMeta">${escapeHtml(meta)}</div>
        </div>
        <div class="row compact" style="gap:8px; flex-wrap:wrap; justify-content:flex-end">
          <button class="btn ghost sm" type="button" data-act="apply">Usar</button>
          <button class="btn ghost sm" type="button" data-act="delete">Borrar</button>
        </div>
      </div>`;
  }).join("");
}

function saveCurrentPomodoroPreset(){
  const nameEl = $("#pomoPresetName");
  const raw = String(nameEl?.value || "").trim();
  const name = raw || "Sin nombre";

  const list = state.timer.pomodoroPresets || [];
  if (list.length >= 10){
    toast({ title:"Pomodoro", message:"Límite: 10 configuraciones guardadas.", type:"warn" });
    return;
  }

  const p = state.timer.pomodoro;
  list.unshift({
    id: uid(),
    name: name.slice(0, 40),
    workMin: Number(p.workMin),
    shortMin: Number(p.shortMin),
    longMin: Number(p.longMin),
    longEvery: Number(p.longEvery),
  });
  state.timer.pomodoroPresets = list.slice(0, 10);
  save();
  if (nameEl) nameEl.value = "";
  renderPomodoroPresets(true);
  toast({ title:"Pomodoro", message:`Guardado: ${name}`, type:"ok" });
}

function applyPomodoroPresetById(id){
  const preset = (state.timer.pomodoroPresets || []).find(x => x.id === id);
  if (!preset) return;
  const p = state.timer.pomodoro;
  p.workMin = preset.workMin;
  p.shortMin = preset.shortMin;
  p.longMin = preset.longMin;
  p.longEvery = preset.longEvery;
  save();
  // refresca inputs y duración si aplica
  syncPomodoroInputsFromState();
  if (state.timer.mode === "pomodoro" && !state.timer.running){
    const dur = pomoPhaseDurationMs(p.phase);
    state.timer.durationMs = dur;
    state.timer.remainingMs = dur;
    state.timer.endAt = null;
    save();
  }
  renderTimerUI(true);
  toast({ title:"Pomodoro", message:`Aplicado: ${preset.name}`, type:"ok" });
}

function deletePomodoroPresetById(id){
  const before = (state.timer.pomodoroPresets || []).length;
  state.timer.pomodoroPresets = (state.timer.pomodoroPresets || []).filter(x => x.id !== id);
  if ((state.timer.pomodoroPresets || []).length !== before){
    save();
    renderPomodoroPresets(true);
    toast({ title:"Pomodoro", message:"Configuración eliminada.", type:"ok" });
  }
}

function pomodoroAdvance(){
  const p = state.timer.pomodoro;

  if (p.phase === "work"){
    p.completed = (Number(p.completed) || 0) + 1;
    const useLong = (p.completed % p.longEvery) === 0;
    p.phase = useLong ? "long" : "short";
  } else {
    p.phase = "work";
  }

  const dur = pomoPhaseDurationMs(p.phase);
  state.timer.durationMs = dur;
  state.timer.remainingMs = dur;
  state.timer.endAt = null;
  state.timer.finishedAt = null;

  save();
  renderTimerUI(true);

  if (p.autoAdvance){
    timerStart();
  }
}



function timerStart(){
  // si estaba a 0, vuelve a cargar duración
  if ((state.timer.remainingMs || 0) <= 0) state.timer.remainingMs = state.timer.durationMs;
  state.timer.running = true;
  state.timer.finishedAt = null;
  state.timer.endAt = Date.now() + (state.timer.remainingMs || 0);
  save();
  renderTimerUI();
}

function timerPause(){
  if (!state.timer.running) return;
  const now = Date.now();
  state.timer.remainingMs = Math.max(0, (state.timer.endAt || now) - now);
  state.timer.running = false;
  state.timer.endAt = null;
  save();
  renderTimerUI();
}

function timerReset(){
  state.timer.running = false;
  state.timer.endAt = null;
  state.timer.finishedAt = null;

  if (state.timer.mode === "pomodoro"){
    state.timer.pomodoro.phase = "work";
    state.timer.pomodoro.completed = 0;
    const dur = pomoPhaseDurationMs("work");
    state.timer.durationMs = dur;
    state.timer.remainingMs = dur;
  } else {
    state.timer.remainingMs = state.timer.durationMs;
  }

  save();
  renderTimerUI(true);
  toast({ title:"Temporizador", message:"Reiniciado", type:"info", timeout: 1200 });
}

function playBeep(vol=0.5){
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, Number(vol) || 0));
    gain.connect(ctx.destination);

    const beepOnce = (t, freq)=>{
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.14);
    };

    const t0 = ctx.currentTime + 0.02;
    beepOnce(t0, 880);
    beepOnce(t0 + 0.20, 880);
    beepOnce(t0 + 0.40, 660);

    setTimeout(()=>{ try{ ctx.close(); }catch{} }, 900);
  }catch{}
}

function timerFinished(){
  state.timer.running = false;
  state.timer.endAt = null;
  state.timer.remainingMs = 0;
  state.timer.finishedAt = Date.now();
  save();
  renderTimerUI(true);

  const isPomo = state.timer.mode === "pomodoro";
  const p = state.timer.pomodoro;

  const title = isPomo ? "🍅 Pomodoro" : "⏱ Temporizador";
  const phaseTxt = isPomo ? pomoPhaseLabel(p.phase) : "";
  const msg = isPomo ? `Fin: ${phaseTxt}` : "¡Tiempo!";

  pushNotif({ title, message: msg, type:"ok" });
  toast({ title, message: isPomo ? msg : "Temporizador finalizado", type:"ok" });

  const vol = Number(state.timer.volume || 0);
  if (vol > 0) playBeep(vol);

  if ("Notification" in window && Notification.permission === "granted"){
    try {
      new Notification(`TRX Panel · ${isPomo ? "Pomodoro" : "Temporizador"}`, { body: msg, silent: vol === 0 });
    } catch {}
  }

  // Pomodoro: avanza a la siguiente fase (si auto está activado)
  if (isPomo){
    pomodoroAdvance();
  }
}

function timerTick(){
  if (!state.timer) return;
  if (state.timer.running){
    const now = Date.now();
    const rem = Math.max(0, (state.timer.endAt || now) - now);
    state.timer.remainingMs = rem;
    if (rem <= 0) timerFinished();
  }
  renderTimerUI();
}

function renderTimerUI(force = false){
  const sec = $("#timer");
  const digits = $("#timerDigits");
  const ring = document.querySelector("#timer .timerRing");
  const meta = $("#timerMeta");
  const startBtn = $("#timerStart");
  const pauseBtn = $("#timerPause");

  const volSel = $("#timerVol");
  const volPomo = $("#timerVolPomo");

  const phaseEl = $("#pomoPhase");
  const countEl = $("#pomoCount");

  if (!digits || !ring) return;

  // modo (atributo + botones)
  if (sec) sec.dataset.mode = state.timer.mode;
  // Solo sincroniza inputs cuando cambie el modo o cuando lo pidamos explícitamente.
  // Si no, al hacer tick pisaría el valor mientras el usuario escribe.
  if (force || _lastTimerUiMode !== state.timer.mode){
    syncTimerInputsFromState();
    syncPomodoroInputsFromState();
    if (state.timer.mode === "pomodoro") renderPomodoroPresets(true);
    _lastTimerUiMode = state.timer.mode;
  }

  const dur = Math.max(1000, Number(state.timer.durationMs) || 1000);
  const rem = Math.max(0, Number(state.timer.remainingMs) || 0);
  digits.textContent = fmtTimer(rem);

  const p = 1 - (rem / dur);
  ring.style.setProperty("--timer-p", String(Math.max(0, Math.min(1, p))));

  if (state.timer.mode === "pomodoro"){
    const ph = state.timer.pomodoro.phase;
    const done = Number(state.timer.pomodoro.completed) || 0;
    if (phaseEl) phaseEl.textContent = pomoPhaseLabel(ph);
    if (countEl) countEl.textContent = `${done} pomodoro${done === 1 ? "" : "s"}`;
    if (meta) meta.textContent = `${pomoPhaseLabel(ph)} · ${fmtTimer(dur)} · Total: ${done}`;
  } else {
    if (phaseEl) phaseEl.textContent = "";
    if (countEl) countEl.textContent = "";
    if (meta) meta.textContent = `Duración: ${fmtTimer(dur)}`;
  }

  if (startBtn) startBtn.disabled = state.timer.running;
  if (pauseBtn) pauseBtn.disabled = !state.timer.running;

  if (volSel && (force || !volSel.dataset.bound)){
    volSel.value = String(state.timer.volume ?? 0.5);
  }
  if (volPomo && (force || !volPomo.dataset.bound)){
    volPomo.value = String(state.timer.volume ?? 0.5);
  }
}

function bindTimer(){
  const minEl = $("#timerMin");
  const secEl = $("#timerSec");
  const volSel = $("#timerVol");
  const volPomo = $("#timerVolPomo");

  const startBtn = $("#timerStart");
  const pauseBtn = $("#timerPause");
  const resetBtn = $("#timerReset");

  if (!startBtn || !pauseBtn || !resetBtn) return;

  // Evita doble bind si se llama varias veces
  if (startBtn.dataset.bound) return;
  startBtn.dataset.bound = "1";
  if (volSel) volSel.dataset.bound = "1";
  if (volPomo) volPomo.dataset.bound = "1";

  const applyInputs = () => {
    if (state.timer.running) return;
    if (state.timer.mode !== "timer") return;
    const ms = readTimerInputs();
    if (ms != null) setTimerDuration(ms);
  };

  if (minEl && secEl){
    minEl.addEventListener("change", applyInputs);
    secEl.addEventListener("change", applyInputs);
    minEl.addEventListener("blur", applyInputs);
    secEl.addEventListener("blur", applyInputs);
  }

  startBtn.addEventListener("click", timerStart);
  pauseBtn.addEventListener("click", timerPause);
  resetBtn.addEventListener("click", timerReset);

  const p5 = $("#timerPreset5");
  const p10 = $("#timerPreset10");
  const p25 = $("#timerPreset25");
  if (p5) p5.addEventListener("click", ()=>setTimerPreset(5));
  if (p10) p10.addEventListener("click", ()=>setTimerPreset(10));
  if (p25) p25.addEventListener("click", ()=>setTimerPreset(25));

  const bModeTimer = $("#timerModeTimer");
  const bModePomo = $("#timerModePomodoro");
  if (bModeTimer) bModeTimer.addEventListener("click", ()=>setTimerMode("timer"));
  if (bModePomo) bModePomo.addEventListener("click", ()=>setTimerMode("pomodoro"));

  const bWork = $("#pomoPhaseWork");
  const bShort = $("#pomoPhaseShort");
  const bLong = $("#pomoPhaseLong");
  if (bWork) bWork.addEventListener("click", ()=>{ if (state.timer.mode !== "pomodoro") setTimerMode("pomodoro"); setPomodoroPhase("work"); });
  if (bShort) bShort.addEventListener("click", ()=>{ if (state.timer.mode !== "pomodoro") setTimerMode("pomodoro"); setPomodoroPhase("short"); });
  if (bLong) bLong.addEventListener("click", ()=>{ if (state.timer.mode !== "pomodoro") setTimerMode("pomodoro"); setPomodoroPhase("long"); });

  const pWork = $("#pomoWork");
  const pShort = $("#pomoShort");
  const pLong = $("#pomoLong");
  const pEvery = $("#pomoEvery");
  const pAuto = $("#pomoAuto");
  [pWork, pShort, pLong, pEvery].forEach(el=>{
    if (!el) return;
    el.addEventListener("change", applyPomodoroSettings);
    el.addEventListener("blur", applyPomodoroSettings);
  });
  if (pAuto) pAuto.addEventListener("change", applyPomodoroSettings);

  // Presets (guardar / usar / renombrar / borrar)
  const savePresetBtn = $("#pomoPresetSave");
  const presetList = $("#pomoPresetList");
  if (savePresetBtn){
    savePresetBtn.addEventListener("click", ()=>{
      // Asegura que el estado está actualizado con lo que el usuario puso en los inputs
      applyPomodoroSettings();
      saveCurrentPomodoroPreset();
    });
  }
  const presetNameInput = $("#pomoPresetName");
  if (presetNameInput){
    presetNameInput.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){ e.preventDefault(); if (savePresetBtn) savePresetBtn.click(); }
    });
  }
  if (presetList && !presetList.dataset.bound){
    presetList.dataset.bound = "1";
    presetList.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const item = btn.closest(".pomoPresetItem");
      const id = item?.dataset?.id;
      if (!id) return;
      const act = btn.dataset.act;
      if (act === "apply") applyPomodoroPresetById(id);
      if (act === "delete") deletePomodoroPresetById(id);
    });
    presetList.addEventListener("input", (e)=>{
      const inp = e.target.closest(".pomoPresetName");
      if (!inp) return;
      const item = inp.closest(".pomoPresetItem");
      const id = item?.dataset?.id;
      if (!id) return;
      const name = String(inp.value || "").trim().slice(0, 40) || "Sin nombre";
      const preset = (state.timer.pomodoroPresets || []).find(x => x.id === id);
      if (!preset) return;
      preset.name = name;
      save();
      // no forzamos render para no robar el foco
    });
  }

  const bindVolChange = (sel)=>{
    if (!sel) return;
    sel.addEventListener("change", ()=>{
      state.timer.volume = Math.max(0, Math.min(1, Number(sel.value) || 0));
      save();
      renderTimerUI(true);
    });
  };
  bindVolChange(volSel);
  bindVolChange(volPomo);

  // Inicializa inputs según estado
  syncTimerInputsFromState();
  syncPomodoroInputsFromState();
  renderPomodoroPresets(true);
  renderTimerUI(true);
}

function initTimerLoop(){
  if (timerTickHandle) return;
  timerTickHandle = setInterval(timerTick, 120);
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


  // Horas: startTime/endTime en HH:MM (opcional)
  if (!t.startTime) t.startTime = "";
  if (!t.endTime) t.endTime = "";
  if (t.startTime && !/^\d{2}:\d{2}$/.test(String(t.startTime))) t.startTime = "";
  if (t.endTime && !/^\d{2}:\d{2}$/.test(String(t.endTime))) t.endTime = "";

// Color del borde (hex #RRGGBB)
  if (!t.color) t.color = null;
  if (t.color && !/^#[0-9a-f]{6}$/i.test(String(t.color))) t.color = null;
  // Fechas: startDate/endDate en yyyy-mm-dd
  const createdISO = toISODate(t.createdAt || Date.now());
  if (!t.startDate) t.startDate = createdISO;
  if (!t.endDate) t.endDate = t.startDate;

  // Normaliza rango (end >= start)
  const s = parseISODate(t.startDate);
  const e = parseISODate(t.endDate);
  if (s && e && e < s) t.endDate = t.startDate;
  // Si es el mismo día y ambas horas existen, fuerza endTime >= startTime
  if (t.startDate === t.endDate && t.startTime && t.endTime){
    const a = t.startTime.split(":").map(Number);
    const b = t.endTime.split(":").map(Number);
    if (b[0]*60+b[1] < a[0]*60+a[1]) t.endTime = t.startTime;
  }


  t.done = t.status === "done";
  if (typeof t.doneAt === "undefined") t.doneAt = t.done ? Date.now() : null;
  if (t.done && !t.doneAt) t.doneAt = Date.now();
  if (!t.done) t.doneAt = null;
  return t;
}

function addTask(title, priority, tags, startDate, endDate, startTime, endTime, category, color) {
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
    startTime: startTime || "",
    endTime: endTime || "",
    tags: tags || [],
    createdAt: Date.now(),
    color: color || null,
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
  try { if (cloudIsReady()) cloudAddDeleted(CLOUD.delTasksKey, id); } catch {}
  markActivity();
  save();
  renderAll();
  toast({ title:"Eliminada", message: t?.title || "", type:"warn" });
}

// Confirmación antes de eliminar (usado por vista lista)
async function confirmDelete(id) {
  const t = state.tasks.find(x => x.id === id);
  const ok = await openModal({
    title: "Eliminar",
    desc: `¿Eliminar \"${t?.title || ""}\"?`,
    okText: "Eliminar",
    cancelText: "Cancelar",
  });
  if (ok) deleteTask(id);
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
    li.className = "item";
    li.innerHTML = `<span class="muted">Sin resultados</span>`;
    list.appendChild(li);
    return;
  }

  items.forEach((t) => {
    const st = statusLabel(t.status);
    const pr = prBadge(t.priority);

    const li = document.createElement("li");
    li.className = `item status-${t.status}`;
    li.setAttribute("draggable", "true");
    li.dataset.id = t.id;

    if (t.color) {
      li.classList.add("hasColor");
      li.style.setProperty("--task-border", t.color);
    }

    li.innerHTML = `
      <div class="left">
        <div class="handle" aria-label="Arrastrar" title="Arrastrar">⋮⋮</div>
        <input class="chk" type="checkbox" ${t.status === "done" ? "checked" : ""} aria-label="Marcar como hecha" />
        <div style="min-width:0">
          <div class="title">${escapeHtml(t.title)}</div>
          <div class="subline">🗓 ${fmtISODate(t.startDate)}${t.startTime?` ${fmtTime(t.startTime)}`:""} → ${fmtISODate(t.endDate)}${t.endTime?` ${fmtTime(t.endTime)}`:""} · Creada: ${new Date(t.createdAt).toLocaleString()}</div>
          <div class="tags">${t.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        </div>
      </div>

      <div class="right">
        <span class="badge ${escapeHtml(pr.cls)}">${escapeHtml(pr.txt)}</span>
        <span class="badge ${escapeHtml(st.cls)}">${escapeHtml(st.txt)}</span>
        <button class="btn btnGhost small edit" title="Editar">✎</button>
        <button class="btn btnGhost small del" title="Eliminar">🗑</button>
      </div>
    `;

    li.querySelector(".chk").addEventListener("change", (e) => {
      updateTaskStatus(t.id, e.target.checked ? "done" : "todo");
    });
    li.querySelector(".edit").addEventListener("click", () => openEdit(t));
    li.querySelector(".del").addEventListener("click", () => confirmDelete(t.id));

    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", t.id);
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));

    list.appendChild(li);
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
    
    if (t.color) { card.classList.add("hasColor"); card.style.setProperty("--task-border", t.color); }
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

  $$('.kBody').forEach(body => {
    // Evita acumular listeners al re-renderizar
    if (body.dataset.dndBound === "1") return;
    body.dataset.dndBound = "1";

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
    if (t.color) {
      li.classList.add("hasColor");
      li.style.setProperty("--task-border", t.color);
    }
    li.innerHTML = `
      <span>${escapeHtml(t.title)}</span>
      <span class="muted">${t.status === "done" ? "✔" : "•"}</span>
    `;
    el.appendChild(li);
  }
}

function renderNotes() {
  const board = $("#notesBoard");
  const mini = $("#notesBoardMini");
  const count = $("#notesCount");
  const countDup = $("#notesCount_dup");
  if (count) count.textContent = String(state.notes.length);
  if (countDup) countDup.textContent = String(state.notes.length);

  const notes = [...(state.notes||[])].map(n=>({
    ...n,
    pinned: !!n.pinned,
    createdAt: n.createdAt || Date.now()
  }));
  notes.sort((a,b)=> (b.pinned?1:0)-(a.pinned?1:0) || (b.createdAt - a.createdAt));

  const renderInto = (container, subset) => {
    if (!container) return;
    container.innerHTML = "";
    for (const n of subset){
      const el = document.createElement("div");
      el.className = "note" + (n.pinned ? " pinned" : "");
      el.dataset.id = n.id;

      const created = new Date(n.createdAt).toLocaleString();
      el.innerHTML = `
        <div class="noteTop">
          <div class="noteText">${escapeHtml(n.text)}</div>
        </div>
        <div class="noteMeta2">
          <span class="muted">${created}</span>
          <div class="noteBtns">
            <button class="noteBtn pin" type="button" title="${n.pinned?"Desfijar":"Fijar"}">${n.pinned?"📌":"📍"}</button>
            <button class="noteBtn danger del" type="button" title="Eliminar">🗑</button>
          </div>
        </div>
      `;
      container.appendChild(el);

      el.querySelector(".pin").addEventListener("click", ()=> togglePinNote(n.id));
      el.querySelector(".del").addEventListener("click", ()=>{
        // Usa el modal de confirmación estándar
        openModal({
          title: "Eliminar nota",
          desc: "¿Quieres eliminar esta nota?",
          okText: "Eliminar",
          cancelText: "Cancelar",
        }).then((ok)=>{ if (ok) deleteNote(n.id); });
      });
    }
    if (subset.length === 0){
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Aún no hay notas.";
      container.appendChild(empty);
    }
  };

  renderInto(board, notes);
  // Mini: primero fijadas (máx 2), si no hay, las 2 más recientes
  const pinned = notes.filter(n=>n.pinned).slice(0,2);
  const miniList = pinned.length ? pinned : notes.slice(0,2);
  renderInto(mini, miniList);
}





/* ===================== Favorite colors ===================== */
function normalizeHex(c){
  const s = String(c||"").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  return null;
}
function addFavColor(color){
  const c = normalizeHex(color);
  if (!c) return;
  if (!state.favColors) state.favColors = [];
  state.favColors = state.favColors.filter(x=>normalizeHex(x) && normalizeHex(x)!==c);
  state.favColors.unshift(c);
  state.favColors = state.favColors.slice(0,10);
  save();
  renderFavColors();
}
function renderFavColors(){
  const wrap = $("#favColors");
  const wrap2 = $("#favColorsEdit");
  const colors = (state.favColors || []).map(normalizeHex).filter(Boolean).slice(0,10);

  const renderInto = (el, currentGetter, onPick)=>{
    if (!el) return;
    el.innerHTML = "";
    for (const c of colors){
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sw";
      b.style.background = c;
      const cur = currentGetter ? normalizeHex(currentGetter()) : null;
      if (cur && cur === c) b.classList.add("active");
      b.title = c;
      b.addEventListener("click", ()=> onPick(c));
      el.appendChild(b);
    }
    if (colors.length===0){
      const s = document.createElement("span");
      s.className = "muted";
      s.textContent = "Guarda hasta 10 colores con ★";
      el.appendChild(s);
    }
  };

  renderInto(wrap, ()=> $("#taskColor")?.value, (c)=>{
    const inp = $("#taskColor"); if (inp) inp.value = c;
    renderFavColors();
  });
  renderInto(wrap2, ()=> $("#editColor")?.value, (c)=>{
    const inp = $("#editColor"); if (inp) inp.value = c;
    renderFavColors();
  });
}

/* ===================== Notes (Post-its) ===================== */
function addNote(text){
  const v = String(text||"").trim();
  if (!v) return;
  const note = { id: uid(), text: v, pinned: false, createdAt: Date.now() };
  state.notes.unshift(note);
  save();
  renderNotes();
}

function togglePinNote(id){
  const n = state.notes.find(x=>x.id===id);
  if (!n) return;
  n.pinned = !n.pinned;
  save();
  renderNotes();
}

function deleteNote(id){
  state.notes = state.notes.filter(x=>x.id!==id);
  try { if (cloudIsReady()) cloudAddDeleted(CLOUD.delNotesKey, id); } catch {}
  save();
  renderNotes();
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

  // Ancho visual del canvas (CSS px)
  const cssW = Math.max(1, Math.floor(canvas.clientWidth || 600));

  // Guardamos una altura base SOLO una vez para evitar que el canvas
  // se re-escale infinitamente al volver a renderizar stats.
  if (!canvas.dataset.baseHeight) {
    const attrHRaw = Number(canvas.getAttribute("height"));
    const attrH = Number.isFinite(attrHRaw) && attrHRaw > 0 ? attrHRaw : 0;

    const rectHRaw = Math.round(canvas.getBoundingClientRect().height || 0);
    const rectH = rectHRaw > 0 ? rectHRaw : 0;

    const baseH = attrH || rectH || 200;
    canvas.dataset.baseHeight = String(baseH);

    // Fijamos también la altura CSS visual para que no “crezca” sola.
    canvas.style.height = `${baseH}px`;
  }

  const cssH = Number(canvas.dataset.baseHeight) || 200;

  // Tamaño interno en píxeles físicos (para nitidez en pantallas HiDPI)
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  // Tamaño visual estable (CSS px)
  canvas.style.width = "100%";
  canvas.style.height = `${cssH}px`;

  // Dibujar usando coordenadas CSS
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
  localStorage.removeItem(LS.timer);

  state.tasks = [];
  state.notes = [];
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
        <span class="k"></span>
        <span class="t">${badge} ${escapeHtml(t.title)}</span>
      </div>`;
    }).join("");

    cells.push(`
      <div class="calCell ${dim?"dim":""} ${isToday?"today":""}" data-date="${iso}">
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
      <div class="agendaTitle">${escapeHtml(t.title)}</div>
      <div class="agendaMeta">
        <span class="chip mini">${escapeHtml(typeTxt)}</span>
        ${timeTxt ? `<span class="chip mini subtle">${escapeHtml(timeTxt)}</span>` : ""}
        <span class="chip mini subtle">${escapeHtml(t.priority)}</span>
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

  // tareas (móvil): crear como bottom-sheet + filtros en modal
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;
  const tasksOverlay = $("#tasksOverlay");
  const taskCreatePanel = $("#taskCreatePanel");
  const taskControlsPanel = $("#taskControlsPanel");

  const closeTaskPanels = () => {
    if (taskCreatePanel) taskCreatePanel.classList.remove("open");
    if (taskControlsPanel) taskControlsPanel.classList.remove("open");
    if (tasksOverlay) tasksOverlay.hidden = true;
  };
  const openCreate = () => {
    closeTaskPanels();
    if (!isMobile()) return; // en desktop siempre visible
    if (taskCreatePanel) taskCreatePanel.classList.add("open");
    if (tasksOverlay) tasksOverlay.hidden = false;
  };
  const openFilters = () => {
    closeTaskPanels();
    if (!isMobile()) return; // en desktop son inline
    if (taskControlsPanel) taskControlsPanel.classList.add("open");
    if (tasksOverlay) tasksOverlay.hidden = false;
    // focus al buscador si existe
    setTimeout(() => { try { $("#searchInput")?.focus(); } catch(_){} }, 60);
  };

  if ($("#btnTaskNew")) $("#btnTaskNew").addEventListener("click", openCreate);
  if ($("#btnTaskNewClose")) $("#btnTaskNewClose").addEventListener("click", closeTaskPanels);
  if ($("#btnTaskFilters")) $("#btnTaskFilters").addEventListener("click", openFilters);
  if ($("#btnTaskFiltersClose")) $("#btnTaskFiltersClose").addEventListener("click", closeTaskPanels);
  if (tasksOverlay) tasksOverlay.addEventListener("click", closeTaskPanels);

  // al cambiar de pestaña, cerramos overlays de tareas
  window.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeTaskPanels(); });
  window.addEventListener("resize", ()=>{
    // si salimos de móvil, quitamos estados open y overlay
    if (!isMobile()) closeTaskPanels();
  });

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

    // en móvil, cerramos el sheet al crear
    try { if (typeof isMobile === "function" && isMobile()) closeTaskPanels(); } catch(_e){}
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
      addNote(inp.value);
      inp.value = "";
      toast({ title:"Nota", message:"Guardada", type:"ok", timeout: 1200 });
    });
    inp.addEventListener("keydown", (e)=>{
      if (e.key === "Enter"){
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
  bindCmdk();
  bindUx();
  bindDiscordForms();

  initInstallUX();

  // service worker
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(err => console.warn("SW register failed:", err));
    });
  }

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
  // Avisos de vencimiento: al arrancar y cada hora (si la app está abierta)
  checkDueNotifications();
  setInterval(checkDueNotifications, 60 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", main);
