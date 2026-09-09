/* TRX Panel — 01-core.js · constantes, estado, utilidades, undo, invitado, almacenamiento, cloud sync */
// ===================== TRX Panel · script.js =====================

const LS = {
  tasks: "trx_tasks_v5",
  notes: "trx_notes_v5",
  lists: "trx_lists_v1",
  listItems: "trx_list_items_v1",
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
let cloudBootstrapping = false;

const CLOUD = {
  tasksTable: "trx_tasks",
  notesTable: "trx_notes",
  listsTable: "trx_lists",
  listItemsTable: "trx_list_items",
  listSharesTable: "trx_list_shares",
  delListsKey: "trx_cloud_deleted_lists_v1",
  delListItemsKey: "trx_cloud_deleted_list_items_v1",
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
  lists: [],
  listItems: {},
  currentListId: null,
  favColors: [],
  activityDays: [],
  session: null,
  notifs: [],
  tagFilter: null,
  guest: false, // modo invitado: demo de solo lectura
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
      completed: 0, // trabajos completados
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

function toISODate(d) {
  // yyyy-mm-dd in local time
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s) {
  // returns Date at local midnight
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function fmtISODate(s) {
  const d = parseISODate(s);
  return d ? d.toLocaleDateString() : "";
}

// HH:MM -> HH:MM (para mostrar en UI). Mantiene formato y valida.
function fmtTime(hhmm) {
  const s = String(hhmm || "").trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return "";
  return s;
}
function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / ms);
}
function tagHue(tag) {
  const str = (tag || "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ===================== Modo invitado (solo lectura) ===================== */
// Devuelve true y avisa si la acción está bloqueada por ser invitado.
function guestBlocked(action = "esa acción") {
  if (!state.guest) return false;
  toast({
    title: "Modo invitado",
    message: `Crea una cuenta para ${action}.`,
    type: "warn",
  });
  return true;
}

/* ===================== Undo (deshacer) ===================== */
// Guarda una acción reversible y muestra un toast con botón "Deshacer".
let _undoTimer = null;
function offerUndo({ title = "Eliminado", message = "", onUndo }) {
  if (typeof onUndo !== "function") return;
  // limpia cualquier toast de undo previo
  const host = $("#toastHost");
  if (!host) { onUndo(); return; }

  const el = document.createElement("div");
  el.className = "toast warn undoToast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="toastBody">
      <div class="toastTitle">${escapeHtml(title)}</div>
      ${message ? `<div class="toastMsg">${escapeHtml(message)}</div>` : ""}
    </div>
    <button type="button" class="btn ghost sm undoBtn">Deshacer</button>
  `;
  host.appendChild(el);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  };

  el.querySelector(".undoBtn").addEventListener("click", () => {
    finish();
    try { onUndo(); } catch (e) { console.warn("undo error", e); }
    toast({ title: "Restaurado", type: "ok", timeout: 1600 });
  });

  _undoTimer = setTimeout(finish, 6000);
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
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!set.has(k)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ===================== Storage ===================== */
function load() {
  try {
    state.tasks = JSON.parse(localStorage.getItem(LS.tasks) || "[]");
  } catch {
    state.tasks = [];
  }
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

  try {
    state.lists = JSON.parse(localStorage.getItem(LS.lists) || "[]");
  } catch {
    state.lists = [];
  }
  try {
    state.listItems = JSON.parse(localStorage.getItem(LS.listItems) || "{}");
  } catch {
    state.listItems = {};
  }
  try {
    state.favColors = JSON.parse(localStorage.getItem(LS.favColors) || "[]");
  } catch {
    state.favColors = [];
  }
  try {
    state.activityDays = JSON.parse(localStorage.getItem(LS.activity) || "[]");
  } catch {
    state.activityDays = [];
  }
  try {
    state.session = JSON.parse(localStorage.getItem(LS.session) || "null");
  } catch {
    state.session = null;
  }
  try {
    state.notifs = JSON.parse(localStorage.getItem(LS.notifs) || "[]");
  } catch {
    state.notifs = [];
  }
  try {
    state.dueNotifs = JSON.parse(localStorage.getItem(LS.dueNotifs) || "{}");
  } catch {
    state.dueNotifs = {};
  }

  // Agenda range
  try {
    const r = localStorage.getItem("trx_agenda_range_v1");
    if (r) state.agendaRange = r;
  } catch {}

  // Timer
  try {
    state.timer = JSON.parse(localStorage.getItem(LS.timer) || "null") || state.timer;
  } catch {}
  // Normaliza timer
  const defTimer = {
    mode: "timer",
    durationMs: 25 * 1000,
    remainingMs: 25 * 1000,
    running: false,
    endAt: null,
    volume: 0.5,
    finishedAt: null,
    pomodoro: { workMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoAdvance: true, phase: "work", completed: 0 },
    pomodoroPresets: [],
    lastTimerDurationMs: 25 * 1000,
  };
  if (!state.timer || typeof state.timer !== "object") state.timer = defTimer;
  if (!state.timer.pomodoro || typeof state.timer.pomodoro !== "object") state.timer.pomodoro = defTimer.pomodoro;
  if (!Array.isArray(state.timer.pomodoroPresets)) state.timer.pomodoroPresets = [];

  state.timer.mode = state.timer.mode === "pomodoro" ? "pomodoro" : "timer";
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
  p.phase = p.phase === "short" || p.phase === "long" ? p.phase : "work";
  p.completed = Math.max(0, Number(p.completed) || 0);

  // Pomodoro presets
  state.timer.pomodoroPresets = (state.timer.pomodoroPresets || [])
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
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

function save({ sync = true } = {}) {
  // En modo invitado no persistimos nada (demo de solo lectura).
  if (state.guest) return;
  localStorage.setItem(LS.tasks, JSON.stringify(state.tasks));
  localStorage.setItem(LS.notes, JSON.stringify(state.notes));
  localStorage.setItem(LS.lists, JSON.stringify(state.lists));
  localStorage.setItem(LS.listItems, JSON.stringify(state.listItems || {}));
  localStorage.setItem(LS.favColors, JSON.stringify(state.favColors || []));
  localStorage.setItem(LS.activity, JSON.stringify(state.activityDays));
  localStorage.setItem(LS.notifs, JSON.stringify(state.notifs));
  localStorage.setItem(LS.dueNotifs, JSON.stringify(state.dueNotifs || {}));
  if (state.session) localStorage.setItem(LS.session, JSON.stringify(state.session));
  localStorage.setItem("trx_view_v1", state.view);
  if (state.agendaRange) localStorage.setItem("trx_agenda_range_v1", state.agendaRange);
  localStorage.setItem(LS.timer, JSON.stringify(state.timer || null));

  if (sync) {
    try { cloudScheduleSync(); } catch {}
  }
}

/* ===================== Cloud Sync (Supabase) ===================== */
function cloudSetUser(user) {
  cloudUserId = user?.id || null;
}

// Helper: SIEMPRE usa el UID real de la sesión (evita 403 por des-sync de cloudUserId)
async function cloudGetAuthUid(sb) {
  try {
    const { data, error } = await sb.auth.getUser(); // ✅ valida token
    if (error) return null;
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

function cloudIsReady() {
  return !!(supabaseClient && cloudUserId);
}

function cloudGetDeleted(key) {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function cloudAddDeleted(key, id) {
  if (!id) return;
  const arr = cloudGetDeleted(key);
  if (!arr.includes(id)) arr.push(id);
  localStorage.setItem(key, JSON.stringify(arr));
}
function cloudClearDeleted(key) {
  localStorage.setItem(key, JSON.stringify([]));
}

// Compat: en tu código llamas a cloudMarkDeleted (no existía en el snippet)
function cloudMarkDeleted(key, id) {
  cloudAddDeleted(key, id);
}

function cloudScheduleSync() {
  if (!cloudIsReady()) return;
  if (cloudBootstrapping) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    cloudSyncTimer = null;
    cloudSyncAll().catch((e) => console.warn("cloudSyncAll error", e));
  }, CLOUD.syncDebounceMs);
}

async function cloudBootstrap() {
  if (!cloudIsReady()) return;
  const sb = supabaseClient;
  const authUid = await cloudGetAuthUid(sb);
  if (!authUid) return;

  cloudBootstrapping = true;
  try {
    // 1) Load server data
    const [tasksRes, notesRes, listsRes] = await Promise.all([
      sb.from(CLOUD.tasksTable).select("task_id,data,deleted,updated_at").eq("user_id", authUid),
      sb.from(CLOUD.notesTable).select("note_id,data,deleted,updated_at").eq("user_id", authUid),
      sb.from(CLOUD.listsTable).select("user_id,list_id,data,deleted,updated_at"),
    ]);

    if (tasksRes.error) console.warn("Cloud tasks fetch", tasksRes.error);
    if (notesRes.error) console.warn("Cloud notes fetch", notesRes.error);
    if (listsRes.error) console.warn("Cloud lists fetch", listsRes.error);

    const serverTasks = (tasksRes.data || []).filter((r) => !r.deleted && r.data).map((r) => r.data);
    const serverNotes = (notesRes.data || []).filter((r) => !r.deleted && r.data).map((r) => r.data);

    const serverLists = (listsRes.data || [])
      .filter((r) => !r.deleted && r.data)
      .map((r) => ({ ...r.data, ownerId: r.data.ownerId || r.user_id }));

    // 2) Merge (server overlays local by id)
    const tMap = new Map((state.tasks || []).map((t) => [t.id, t]));
    for (const t of serverTasks) tMap.set(t.id, normalizeTask(t));
    state.tasks = [...tMap.values()];

    const nMap = new Map((state.notes || []).map((n) => [n.id, n]));
    for (const n of serverNotes) nMap.set(n.id, n);
    state.notes = [...nMap.values()];

    const lMap = new Map((state.lists || []).map((l) => [l.id, l]));
    for (const l of serverLists) lMap.set(l.id, normalizeList(l));
    state.lists = [...lMap.values()];

    // 3) Fetch list items for all accessible lists (own + shared)
    const allListIds = [...lMap.keys()];
    if (allListIds.length) {
      const itemsRes = await sb
        .from(CLOUD.listItemsTable)
        .select("list_id,item_id,data,deleted,updated_at")
        .in("list_id", allListIds);

      if (itemsRes.error) {
        console.warn("Cloud list items fetch", itemsRes.error);
      } else {
        const serverItems = (itemsRes.data || []).filter((r) => !r.deleted && r.data);
        for (const row of serverItems) {
          const lid = row.list_id;
          if (!state.listItems) state.listItems = {};
          if (!Array.isArray(state.listItems[lid])) state.listItems[lid] = [];
          const arr = state.listItems[lid];
          const idx = arr.findIndex((x) => x.id === row.data.id);
          if (idx === -1) {
            arr.push(normalizeListItem(row.data));
          } else {
            // server wins if newer
            const serverTs = row.data.updatedAt || 0;
            const localTs = arr[idx].updatedAt || 0;
            if (serverTs >= localTs) arr[idx] = normalizeListItem(row.data);
          }
        }
      }
    }

    save();
    renderAll();

    // 3) Push any local-only data
    cloudScheduleSync();
  } finally {
    cloudBootstrapping = false;
  }
}

async function cloudSyncAll() {
  if (!cloudIsReady()) return;
  const sb = supabaseClient;

  const authUid = await cloudGetAuthUid(sb);
  if (!authUid) return;

  // Mantén cloudUserId por UI, pero para RLS usa authUid SIEMPRE
  cloudUserId = authUid;

  // Upsert tasks
  const taskRows = (state.tasks || []).map((t) => ({
    user_id: authUid,
    task_id: t.id,
    data: t,
    deleted: false,
    updated_at: new Date().toISOString(),
  }));
  if (taskRows.length) {
    const { error } = await sb.from(CLOUD.tasksTable).upsert(taskRows, { onConflict: "user_id,task_id" });
    if (error) console.warn("Cloud tasks upsert", error);
  }

  // Upsert notes
  const noteRows = (state.notes || []).map((n) => ({
    user_id: authUid,
    note_id: n.id,
    data: n,
    deleted: false,
    updated_at: new Date().toISOString(),
  }));
  if (noteRows.length) {
    const { error } = await sb.from(CLOUD.notesTable).upsert(noteRows, { onConflict: "user_id,note_id" });
    if (error) console.warn("Cloud notes upsert", error);
  }

  // Upsert lists (via RPC SECURITY DEFINER to avoid PostgREST/RLS mismatch)
  for (const l of (state.lists || [])) {
    if (!l || l.ownerId !== authUid) continue; // solo listas propias
    const payload = { ...l, ownerId: authUid };

    const { error } = await sb.rpc("trx_upsert_list_definer", {
      p_list_id: l.id,
      p_data: payload,
      p_deleted: false,
      p_updated_at: new Date().toISOString(),
    });

    if (error) console.warn("Cloud lists upsert (rpc definer)", error);
  }

  // Pull list items from server for shared lists (lists not owned by current user)
  const sharedListIds = (state.lists || [])
    .filter(l => l.ownerId && l.ownerId !== authUid)
    .map(l => l.id);

  if (sharedListIds.length) {
    const pullRes = await sb
      .from(CLOUD.listItemsTable)
      .select("list_id,item_id,data,deleted,updated_at")
      .in("list_id", sharedListIds);

    if (!pullRes.error) {
      const serverItems = (pullRes.data || []).filter(r => !r.deleted && r.data);
      if (!state.listItems) state.listItems = {};
      for (const row of serverItems) {
        const lid = row.list_id;
        if (!Array.isArray(state.listItems[lid])) state.listItems[lid] = [];
        const arr = state.listItems[lid];
        const idx = arr.findIndex(x => x.id === row.data.id);
        if (idx === -1) {
          arr.push(normalizeListItem(row.data));
        } else {
          const serverTs = row.data.updatedAt || 0;
          const localTs = arr[idx].updatedAt || 0;
          if (serverTs >= localTs) arr[idx] = normalizeListItem(row.data);
        }
      }
      // Remove items locally that the server no longer has
      const serverItemIds = new Set((pullRes.data || []).filter(r => !r.deleted).map(r => r.item_id));
      for (const lid of sharedListIds) {
        if (!Array.isArray(state.listItems[lid])) continue;
        state.listItems[lid] = state.listItems[lid].filter(it => serverItemIds.has(it.id));
      }
      save();
      if (sharedListIds.includes(state.currentListId)) renderListDetail();
    } else {
      console.warn("Cloud list items pull (shared)", pullRes.error);
    }
  }

  // Upsert list items

  // ✅ OJO: tu tabla trx_list_items NO tiene user_id. No lo envíes.
  const listIdsKnown = new Set((state.lists || []).map(l => l.id));

const itemsFlat = [];
for (const [lid, arr] of Object.entries(state.listItems || {})) {
  if (!listIdsKnown.has(lid)) continue; // 👈 evita items huérfanos (RLS fail)
  for (const it of (arr || [])) {
    itemsFlat.push({
      list_id: lid,
      item_id: it.id,
      data: it,
      deleted: false,
      updated_at: new Date().toISOString(),
    });
  }
}

if (itemsFlat.length) {
  const { error } = await sb
    .from(CLOUD.listItemsTable)
    .upsert(itemsFlat, { onConflict: "list_id,item_id" });

  if (error) console.warn("Cloud list items upsert", error);
}

  // Deletes (hard delete)
  const delTasks = cloudGetDeleted(CLOUD.delTasksKey);
  if (delTasks.length) {
    const { error } = await sb.from(CLOUD.tasksTable).delete().eq("user_id", authUid).in("task_id", delTasks);
    if (error) console.warn("Cloud tasks delete", error);
    else cloudClearDeleted(CLOUD.delTasksKey);
  }

  const delNotes = cloudGetDeleted(CLOUD.delNotesKey);
  if (delNotes.length) {
    const { error } = await sb.from(CLOUD.notesTable).delete().eq("user_id", authUid).in("note_id", delNotes);
    if (error) console.warn("Cloud notes delete", error);
    else cloudClearDeleted(CLOUD.delNotesKey);
  }

  const delLists = cloudGetDeleted(CLOUD.delListsKey);
  if (delLists.length) {
    const { error } = await sb.from(CLOUD.listsTable).delete().eq("user_id", authUid).in("list_id", delLists);
    if (error) console.warn("Cloud lists delete", error);
    else cloudClearDeleted(CLOUD.delListsKey);
  }

  const delListItems = cloudGetDeleted(CLOUD.delListItemsKey);
  if (delListItems.length) {
    const { error } = await sb.from(CLOUD.listItemsTable).delete().in("item_id", delListItems);
    if (error) console.warn("Cloud list items delete", error);
    else cloudClearDeleted(CLOUD.delListItemsKey);
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
  setTheme(saved || "light");
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

