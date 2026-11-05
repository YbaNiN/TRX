/* TRX Panel — 07-pomodoro.js · Pomodoro que funciona como pomofocus.io */
// Three stages: pomodoro, short break and long break. Every finished pomodoro
// adds one to the counter and to the active task, and every N pomodoros the
// break is the long one. Breaks and pomodoros can start on their own.
// Everything is kept on this device (localStorage), like Pomofocus without an account.

const POMO_LS = "trx_pomo_v1";
const POMO_STAGES = [
  { name: "Pomodoro", short: "Pomo", color: "rgb(175 73 73)" },
  { name: "Descanso corto", short: "Corto", color: "rgb(41 116 121)" },
  { name: "Descanso largo", short: "Largo", color: "rgb(47 106 149)" },
];
const POMO_DEFAULTS = {
  minutes: [25, 5, 15],
  autoStartBreaks: false,
  autoStartPomodoros: false,
  longBreakInterval: 4,
  autoCheckTasks: false,
  autoSwitchTasks: true,
  alarmSound: "bell",
  alarmRepeat: 1,
  volume: 0.5,
  tickingSound: "none",
  tickingVolume: 0.5,
  darkWhenRunning: false,
  hourFormat: "24",
  reminderType: "last", // last | every
  reminderMinutes: 0,
};
const POMO_FOCUS_MSG = "¡Hora de concentrarse!";
const POMO_BREAK_MSG = "¡Hora de un descanso!";

const pomoClamp = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

function pomoDefaultState() {
  return {
    stage: 0,
    cnt: 0, // pomodoros finished in this round
    running: false,
    endAt: null, // when the running stage ends (ms)
    remainingSec: null, // seconds left while paused; null means the full stage
    settings: { ...POMO_DEFAULTS, minutes: [...POMO_DEFAULTS.minutes] },
    tasks: [],
    activeId: null,
  };
}

function pomoNormalizeTask(t) {
  const x = t && typeof t === "object" ? t : {};
  return {
    id: String(x.id || uid()),
    title: String(x.title || "").trim().slice(0, 120) || "Sin título",
    est: pomoClamp(Math.round(x.est), 1, 99, 1),
    act: pomoClamp(Math.round(x.act), 0, 999, 0),
    note: String(x.note || "").slice(0, 1000),
    done: Boolean(x.done),
  };
}

function pomoNormalize(raw) {
  const def = pomoDefaultState();
  const r = raw && typeof raw === "object" ? raw : {};
  const s = { ...def.settings, ...(r.settings || {}) };
  const mins = Array.isArray(s.minutes) ? s.minutes : def.settings.minutes;
  s.minutes = [0, 1, 2].map((i) => pomoClamp(Math.round(mins[i]), 1, i === 0 ? 180 : 120, def.settings.minutes[i]));
  s.longBreakInterval = pomoClamp(Math.round(s.longBreakInterval), 1, 20, 4);
  s.alarmRepeat = pomoClamp(Math.round(s.alarmRepeat), 1, 10, 1);
  s.volume = pomoClamp(s.volume, 0, 1, 0.5);
  s.tickingVolume = pomoClamp(s.tickingVolume, 0, 1, 0.5);
  s.reminderMinutes = pomoClamp(Math.round(s.reminderMinutes), 0, 60, 0);
  s.reminderType = s.reminderType === "every" ? "every" : "last";
  s.hourFormat = s.hourFormat === "12" ? "12" : "24";
  if (!POMO_ALARMS[s.alarmSound] && s.alarmSound !== "none") s.alarmSound = "bell";
  if (!POMO_TICKS[s.tickingSound]) s.tickingSound = "none";
  for (const k of ["autoStartBreaks", "autoStartPomodoros", "autoCheckTasks", "autoSwitchTasks", "darkWhenRunning"]) s[k] = Boolean(s[k]);

  const tasks = (Array.isArray(r.tasks) ? r.tasks : []).map(pomoNormalizeTask).slice(0, 100);
  const stage = [0, 1, 2].includes(r.stage) ? r.stage : 0;
  const running = Boolean(r.running && Number(r.endAt));
  return {
    stage,
    cnt: pomoClamp(Math.round(r.cnt), 0, 9999, 0),
    running,
    endAt: running ? Number(r.endAt) : null,
    remainingSec: running || r.remainingSec == null ? null : pomoClamp(Math.round(r.remainingSec), 0, s.minutes[stage] * 60, null),
    settings: s,
    tasks,
    activeId: tasks.some((t) => t.id === r.activeId) ? r.activeId : null,
  };
}

function pomoLoad() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(POMO_LS) || "null"); } catch {}
  if (!raw) {
    // First run after the update: keep the times from the old Pomodoro.
    try {
      const old = JSON.parse(localStorage.getItem("trx_timer_v1") || "null")?.pomodoro;
      if (old) raw = { settings: { minutes: [old.workMin, old.shortMin, old.longMin], longBreakInterval: old.longEvery } };
    } catch {}
  }
  return pomoNormalize(raw);
}

function pomoSave() {
  if (state.guest) return;
  try { localStorage.setItem(POMO_LS, JSON.stringify(state.pomo)); } catch {}
}

/* ---------- Sounds (generated, no files) ---------- */
let pomoCtx = null;
function pomoAudio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  try {
    if (!pomoCtx) pomoCtx = new C();
    if (pomoCtx.state === "suspended") pomoCtx.resume().catch(() => {});
  } catch { return null; }
  return pomoCtx;
}
function pomoTone(ctx, { freq, type = "sine", start, dur, vol, to = null }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
  const v = Math.max(0.0002, Math.min(1, vol));
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(v, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}
const POMO_ALARMS = {
  bell: { label: "Campana", len: 1.7, play: (c, t, v) => {
    pomoTone(c, { freq: 880, start: t, dur: 1.6, vol: v * 0.7 });
    pomoTone(c, { freq: 1320, start: t, dur: 1.0, vol: v * 0.35 });
    pomoTone(c, { freq: 2210, start: t, dur: 0.5, vol: v * 0.15 });
  } },
  digital: { label: "Digital", len: 1.2, play: (c, t, v) => {
    for (let g = 0; g < 2; g++) for (let i = 0; i < 4; i++) pomoTone(c, { freq: 1000, type: "square", start: t + g * 0.6 + i * 0.1, dur: 0.06, vol: v * 0.25 });
  } },
  kitchen: { label: "Cocina", len: 1.3, play: (c, t, v) => {
    for (let i = 0; i < 16; i++) pomoTone(c, { freq: 1750, type: "triangle", start: t + i * 0.075, dur: 0.05, vol: v * 0.5 });
  } },
  wood: { label: "Madera", len: 0.8, play: (c, t, v) => {
    [0, 0.17, 0.34].forEach((d) => pomoTone(c, { freq: 540, start: t + d, dur: 0.12, vol: v * 0.9 }));
  } },
  bird: { label: "Pájaro", len: 1.2, play: (c, t, v) => {
    [0, 0.16, 0.5, 0.66].forEach((d) => pomoTone(c, { freq: 2400, to: 3600, start: t + d, dur: 0.1, vol: v * 0.3 }));
  } },
};
const POMO_TICKS = {
  none: { label: "Ninguno" },
  fast: { label: "Tic-tac rápido", every: 500, freq: 1900 },
  slow: { label: "Tic-tac lento", every: 1000, freq: 1300 },
};

function pomoAlarm(times = state.pomo.settings.alarmRepeat) {
  const s = state.pomo.settings;
  const a = POMO_ALARMS[s.alarmSound];
  if (!a || !(s.volume > 0)) return;
  const ctx = pomoAudio();
  if (!ctx) return;
  let t = ctx.currentTime + 0.05;
  for (let i = 0; i < times; i++) { a.play(ctx, t, s.volume); t += a.len + 0.25; }
}
function pomoClick() {
  const v = state.pomo.settings.volume;
  const ctx = v > 0 ? pomoAudio() : null;
  if (ctx) pomoTone(ctx, { freq: 600, type: "triangle", start: ctx.currentTime + 0.01, dur: 0.05, vol: v * 0.35 });
}
function pomoTickSound(kind = state.pomo.settings.tickingSound) {
  const tk = POMO_TICKS[kind];
  const v = state.pomo.settings.tickingVolume;
  const ctx = tk?.freq && v > 0 ? pomoAudio() : null;
  if (ctx) pomoTone(ctx, { freq: tk.freq, type: "triangle", start: ctx.currentTime + 0.005, dur: 0.03, vol: v * 0.3 });
}

/* ---------- Notifications ---------- */
function pomoNotify(msg, { toastIt = true } = {}) {
  if (toastIt) toast({ title: "Pomodoro", message: msg, type: "info", timeout: 5000 });
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(msg, { icon: "icons/icon-192.png", tag: "trx-pomodoro", requireInteraction: true });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 8000);
    } catch {}
  }
}
function pomoAskNotifications() {
  try {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch?.(() => {});
  } catch {}
}

/* ---------- Timer engine ---------- */
const pomoStageSec = (stage = state.pomo.stage) => state.pomo.settings.minutes[stage] * 60;

function pomoSecondsLeft(now = Date.now()) {
  const p = state.pomo;
  if (p.running && p.endAt) return Math.max(0, Math.ceil((p.endAt - now) / 1000));
  return p.remainingSec ?? pomoStageSec();
}

function pomoFmt(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
// Kept for other modules that format milliseconds.
function fmtTimer(ms) { return pomoFmt(Math.floor(Math.max(0, ms) / 1000)); }

let pomoAutoTimer = null;
const pomoCancelAuto = () => { clearTimeout(pomoAutoTimer); pomoAutoTimer = null; };

function pomoStart() {
  const p = state.pomo;
  if (p.running) return;
  pomoCancelAuto();
  pomoAudio(); // unlocked by this click, so the alarm can play later
  pomoAskNotifications();
  p.endAt = Date.now() + pomoSecondsLeft() * 1000;
  p.running = true;
  p.remainingSec = null;
  pomoSave();
  renderPomo();
}

function pomoPause() {
  const p = state.pomo;
  if (!p.running) return;
  pomoCancelAuto();
  p.remainingSec = pomoSecondsLeft();
  p.running = false;
  p.endAt = null;
  pomoSave();
  renderPomo();
}

function pomoToggle() {
  pomoClick();
  state.pomo.running ? pomoPause() : pomoStart();
}

// Clicking a stage tab stops the timer and loads that stage from the start.
function pomoSwitchStage(stage) {
  const p = state.pomo;
  if (![0, 1, 2].includes(stage)) return;
  pomoCancelAuto();
  p.running = false;
  p.endAt = null;
  p.remainingSec = null;
  p.stage = stage;
  pomoSave();
  renderPomo();
}

// Moves to the next stage. A finished pomodoro counts for the active task and
// for the round; after every `longBreakInterval` pomodoros the break is long.
function pomoAdvance() {
  const p = state.pomo;
  const thisStage = p.stage;
  if (thisStage === 0) {
    const t = pomoActiveTask();
    if (t) t.act += 1;
    p.stage = (p.cnt + 1) % p.settings.longBreakInterval === 0 ? 2 : 1;
    p.cnt += 1;
  } else {
    p.stage = 0;
  }
  p.running = false;
  p.endAt = null;
  p.remainingSec = null;
  return { thisStage, nextStage: p.stage };
}

function pomoFinish() {
  const p = state.pomo;
  const s = p.settings;
  const { thisStage, nextStage } = pomoAdvance();
  pomoNotify(thisStage === 0 ? (nextStage === 1 ? "¡Hora de un descanso corto!" : "¡Hora de un descanso largo!") : POMO_FOCUS_MSG);

  if (thisStage === 0 && s.autoCheckTasks) {
    const t = pomoActiveTask();
    if (t && !t.done && t.act >= t.est) pomoSetDone(t.id, true, { render: false });
  }
  pomoSave();
  renderPomo();

  const auto = thisStage === 0 ? s.autoStartBreaks : s.autoStartPomodoros;
  if (auto) {
    pomoCancelAuto();
    pomoAutoTimer = setTimeout(() => {
      pomoAutoTimer = null;
      const t = pomoActiveTask();
      if ((!t || !t.done) && !state.pomo.running) pomoStart();
    }, 2000);
  }
}

// "Next" button: ends the running stage now, as if the time had run out.
function pomoSkip() {
  if (!state.pomo.running) return;
  pomoCancelAuto();
  state.pomo.remainingSec = pomoSecondsLeft();
  state.pomo.running = false;
  state.pomo.endAt = null;
  renderPomo();
  setTimeout(pomoFinish, 200);
}

let pomoLastSec = null;
let pomoLastTickSlot = null;
function pomoTick() {
  const p = state.pomo;
  if (p.running) {
    const now = Date.now();
    const left = pomoSecondsLeft(now);
    if (left <= 0) {
      pomoAlarm();
      pomoFinish();
      return;
    }
    if (left !== pomoLastSec) {
      pomoLastSec = left;
      const m = p.settings.reminderMinutes;
      if (m > 0 && (p.settings.reminderType === "every" ? left % (60 * m) === 0 : left === 60 * m)) {
        pomoNotify(`Quedan ${left / 60} ${left === 60 ? "minuto" : "minutos"}`);
      }
    }
    const tk = POMO_TICKS[p.settings.tickingSound];
    if (p.stage === 0 && tk?.every) {
      const slot = Math.floor((p.endAt - now) / tk.every);
      if (pomoLastTickSlot !== null && slot !== pomoLastTickSlot) pomoTickSound();
      pomoLastTickSlot = slot;
    }
  } else {
    pomoLastTickSlot = null;
  }
  renderPomoClock();
}

/* ---------- Tasks ---------- */
const pomoActiveTask = () => state.pomo.tasks.find((t) => t.id === state.pomo.activeId) || null;

// With a single task, that task is the one being worked on.
function pomoTasksChanged() {
  const p = state.pomo;
  if (p.tasks.length === 1) p.activeId = p.tasks[0].id;
  if (!p.tasks.some((t) => t.id === p.activeId)) p.activeId = null;
  pomoSave();
  renderPomo();
}

function pomoSelectTask(id) {
  if (state.pomo.activeId === id) return;
  state.pomo.activeId = id;
  pomoSave();
  renderPomo();
}

function pomoSetDone(id, done, { render = true } = {}) {
  const p = state.pomo;
  const t = p.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = done;
  if (done) {
    if (p.tasks.every((x) => x.done)) setTimeout(() => pomoNotify("¡Has terminado todas tus tareas!", { toastIt: false }), 2000);
    if (p.settings.autoSwitchTasks) {
      // The finished task goes to the bottom; if it was the active one, the next pending task takes over.
      p.tasks = [...p.tasks.filter((x) => x.id !== id), t];
      if (id === p.activeId) {
        const next = p.tasks.find((x) => !x.done);
        if (next) p.activeId = next.id;
        else if (p.running) pomoPause();
      }
    }
  }
  pomoSave();
  if (render) renderPomo();
}

// Finish time: the remaining pomodoros plus the breaks between them.
function pomoFinishEstimate() {
  const p = state.pomo;
  const s = p.settings;
  const sec = s.minutes.map((m) => m * 60);
  const totalEst = p.tasks.reduce((n, t) => n + (t.act > t.est || t.done ? t.act : t.est), 0);
  const totalAct = p.tasks.reduce((n, t) => n + t.act, 0);
  let remaining = 0;
  p.tasks.forEach((t) => { if (!t.done && t.act < t.est) remaining += t.est - t.act; });
  const breaks = (n) => {
    if (n <= 0) return 0;
    const longs = Math.floor(n / s.longBreakInterval);
    return (n - longs) * sec[1] + longs * sec[2];
  };
  const between = breaks(p.cnt + remaining - 1) - breaks(p.cnt);
  const total = (totalEst - totalAct) * sec[0] + Math.max(0, between) + (p.stage === 0 ? 0 : sec[p.stage]);
  const at = new Date(Date.now() + total * 1000);
  let hh = at.getHours();
  const mm = String(at.getMinutes()).padStart(2, "0");
  let clock;
  if (s.hourFormat === "12") {
    const pm = hh >= 12;
    hh = hh % 12 || 12;
    clock = `${hh}:${mm} ${pm ? "p. m." : "a. m."}`;
  } else {
    clock = `${String(hh).padStart(2, "0")}:${mm}`;
  }
  return { totalEst, totalAct, clock, hours: Math.floor((total / 3600) * 10) / 10 };
}

/* ---------- Rendering ---------- */
let pomoOwnsTitle = false;
const pomoOnTab = () => document.querySelector(".tab.active")?.dataset.tab === "timer";

function pomoHeadline() {
  const t = pomoActiveTask();
  return t ? t.title : state.pomo.stage === 0 ? POMO_FOCUS_MSG : POMO_BREAK_MSG;
}

// Cheap part, called several times a second.
function renderPomoClock() {
  const p = state.pomo;
  const left = pomoSecondsLeft();
  const full = pomoStageSec();
  const text = pomoFmt(left);

  const time = $("#pomoTime");
  if (time && time.textContent !== text) time.textContent = text;
  const bar = $("#pomoProgress");
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, (1 - left / full) * 100))}%`;

  // Like Pomofocus, the browser tab shows the countdown.
  if (p.running || pomoOnTab()) {
    const label = p.stage === 0 ? (pomoActiveTask()?.title || POMO_FOCUS_MSG) : POMO_BREAK_MSG;
    const title = `${text} - ${label}`;
    if (document.title !== title) document.title = title;
    pomoOwnsTitle = true;
  } else if (pomoOwnsTitle) {
    pomoOwnsTitle = false;
    const tab = document.querySelector(".tab.active")?.dataset.tab;
    document.title = `${(typeof PAGE_NAMES !== "undefined" && PAGE_NAMES[tab]) || "TRX"} · TRX`;
  }
  if (typeof renderHomeFocus === "function") renderHomeFocus();
}

let pomoEditing = null; // null | "new" | task id
let pomoNoteOpen = false;

function renderPomo() {
  const app = $("#pomoApp");
  if (!app) return;
  const p = state.pomo;
  app.dataset.stage = String(p.stage);
  app.style.setProperty("--pomo", POMO_STAGES[p.stage].color);
  app.classList.toggle("isRunning", p.running);
  app.classList.toggle("isDark", p.running && p.settings.darkWhenRunning);

  $$("#pomoApp .pomoTab").forEach((b) => {
    const on = Number(b.dataset.stage) === p.stage;
    b.classList.toggle("selected", on);
    b.setAttribute("aria-selected", String(on));
  });
  const start = $("#pomoStart");
  start.textContent = p.running ? "PAUSAR" : "EMPEZAR";
  start.classList.toggle("ticking", p.running);
  start.setAttribute("aria-pressed", String(p.running));
  $("#pomoNext").classList.toggle("visible", p.running);
  $("#pomoNext").tabIndex = p.running ? 0 : -1;

  $("#pomoCount").textContent = `#${p.stage === 0 || p.cnt === 0 ? p.cnt + 1 : p.cnt}`;
  $("#pomoMsg").textContent = pomoHeadline();

  renderPomoTasks();
  renderPomoClock();
}

function renderPomoTasks() {
  const p = state.pomo;
  const list = $("#pomoTaskList");
  if (!list) return;
  // Re-rendering would drop the cursor of someone typing in the form.
  if (list.contains(document.activeElement) && document.activeElement.matches("input,textarea")) return;

  const items = p.tasks.map((t) => (pomoEditing === t.id ? pomoFormHtml(t) : pomoTaskHtml(t)));
  if (pomoEditing === "new") items.push(pomoFormHtml(null));
  const allDone = p.tasks.length > 0 && p.tasks.every((t) => t.done) && pomoEditing === null;
  if (allDone) items.push(`<div class="pomoAllDone"><span>¡Has terminado todas tus tareas de hoy! 🎉</span><button type="button" class="pomoGhostBtn" data-pomo-clear-all>Borrar tareas</button></div>`);
  list.innerHTML = items.join("");

  $("#pomoAddTask").hidden = pomoEditing === "new";

  const sum = $("#pomoSummary");
  if (!p.tasks.length) { sum.hidden = true; return; }
  const est = pomoFinishEstimate();
  sum.hidden = false;
  sum.innerHTML = `<div>Pomos: <b>${est.totalAct}</b><span class="pomoSlash">/</span><b>${est.totalEst}</b></div><div>Terminas a las <b>${escapeHtml(est.clock)}</b> (${String(est.hours).replace(".", ",")} h)</div>`;
}

function pomoTaskHtml(t) {
  const active = t.id === state.pomo.activeId;
  const title = escapeHtml(t.title);
  return `<div class="pomoTask${active ? " active" : ""}${t.done ? " done" : ""}" data-pomo-task="${escapeHtml(t.id)}" role="button" tabindex="0" aria-pressed="${active}" aria-label="${active ? "Tarea activa: " : "Trabajar en "}${title}">
    <div class="pomoTaskRow">
      <button type="button" class="pomoCheck" data-pomo-check aria-label="${t.done ? "Desmarcar" : "Marcar como hecha"} ${title}" aria-pressed="${t.done}">${trxIcon("circleCheck")}</button>
      <span class="pomoTaskTitle">${title}</span>
      <span class="pomoTaskCount"><b>${t.act}</b>/${t.est}</span>
      <button type="button" class="pomoTaskEdit" data-pomo-edit aria-label="Editar ${title}" title="Editar">${trxIcon("dots")}</button>
    </div>
    ${t.note ? `<div class="pomoTaskNote">${escapeHtml(t.note)}</div>` : ""}
  </div>`;
}

function pomoFormHtml(t) {
  const editing = !!t;
  const note = editing ? t.note : "";
  const showNote = pomoNoteOpen || !!note;
  return `<form class="pomoForm" data-pomo-form="${editing ? escapeHtml(t.id) : "new"}" autocomplete="off">
    <div class="pomoFormBody">
      <input class="pomoFormTitle" name="title" type="text" maxlength="120" placeholder="¿En qué vas a trabajar?" value="${editing ? escapeHtml(t.title) : ""}" aria-label="Tarea" />
      <div class="pomoFormLabel">${editing ? "Hechos / " : ""}Pomodoros estimados</div>
      <div class="pomoFormNums">
        ${editing ? `<input class="pomoNum" name="act" type="number" min="0" max="999" step="1" value="${t.act}" aria-label="Pomodoros hechos" /><span class="pomoFormSlash">/</span>` : ""}
        <input class="pomoNum" name="est" type="number" min="1" max="99" step="1" value="${editing ? t.est : 1}" aria-label="Pomodoros estimados" />
        <button type="button" class="pomoStep" data-step="1" aria-label="Uno más">▲</button>
        <button type="button" class="pomoStep" data-step="-1" aria-label="Uno menos">▼</button>
      </div>
      ${showNote
        ? `<textarea class="pomoFormNote" name="note" rows="3" maxlength="1000" placeholder="Alguna nota…" aria-label="Nota">${escapeHtml(note)}</textarea>`
        : `<button type="button" class="pomoAddNote" data-pomo-note>+ Añadir nota</button>`}
    </div>
    <div class="pomoFormFoot">
      ${editing ? `<button type="button" class="pomoFormDelete" data-pomo-delete>Eliminar</button>` : ""}
      <span class="pomoFormSpacer"></span>
      <button type="button" class="pomoFormCancel" data-pomo-cancel>Cancelar</button>
      <button type="submit" class="pomoFormSave">Guardar</button>
    </div>
  </form>`;
}

function pomoOpenForm(target) {
  document.activeElement?.blur?.();
  pomoEditing = target;
  pomoNoteOpen = false;
  renderPomoTasks();
  const f = $(`#pomoTaskList [data-pomo-form="${CSS.escape(target)}"]`);
  f?.querySelector(".pomoFormTitle")?.focus();
  f?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function pomoCloseForm() {
  pomoEditing = null;
  pomoNoteOpen = false;
  document.activeElement?.blur?.();
  renderPomoTasks();
}

function pomoSaveForm(form) {
  const title = form.title.value.trim();
  if (!title) { form.title.focus(); return; }
  const est = pomoClamp(Math.round(form.est.value), 1, 99, 1);
  const note = form.note ? form.note.value.trim() : "";
  const p = state.pomo;
  const id = form.dataset.pomoForm;
  if (id === "new") {
    p.tasks.push(pomoNormalizeTask({ title, est, act: 0, note }));
  } else {
    const t = p.tasks.find((x) => x.id === id);
    if (t) Object.assign(t, { title, est, note, act: pomoClamp(Math.round(form.act.value), 0, 999, t.act) });
  }
  pomoEditing = null;
  pomoNoteOpen = false;
  document.activeElement?.blur?.();
  pomoTasksChanged();
}

function pomoDeleteTask(id) {
  const p = state.pomo;
  const idx = p.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [task] = p.tasks.splice(idx, 1);
  const wasActive = p.activeId === id;
  pomoEditing = null;
  document.activeElement?.blur?.();
  pomoTasksChanged();
  offerUndo({
    title: "Tarea eliminada",
    message: task.title,
    onUndo: () => {
      p.tasks.splice(Math.min(idx, p.tasks.length), 0, task);
      if (wasActive) p.activeId = id;
      pomoTasksChanged();
    },
  });
}

async function pomoMenuAction(act) {
  const p = state.pomo;
  $("#pomoTaskMenu").hidden = true;
  $("#pomoTaskMenuBtn").setAttribute("aria-expanded", "false");
  if (act === "clear-done") {
    p.tasks = p.tasks.filter((t) => !t.done);
  } else if (act === "clear-act") {
    p.tasks.forEach((t) => { t.act = 0; });
  } else if (act === "clear-all") {
    if (!p.tasks.length) return;
    const ok = await openModal({ title: "Borrar todas las tareas", desc: "¿Seguro que quieres borrar todas las tareas del Pomodoro?", okText: "Borrar", cancelText: "Cancelar" });
    if (!ok) return;
    p.tasks = [];
  }
  pomoEditing = null;
  pomoTasksChanged();
}

/* ---------- Settings and counter dialogs ---------- */
function pomoOpenDialog(id) {
  const m = $(id);
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
}
function pomoCloseDialog(id) {
  const m = $(id);
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
}

function pomoFillSettings() {
  const s = state.pomo.settings;
  const set = (id, v) => { const el = $(id); if (el.type === "checkbox") el.checked = v; else el.value = String(v); };
  set("#pomoSetPomo", s.minutes[0]);
  set("#pomoSetShort", s.minutes[1]);
  set("#pomoSetLong", s.minutes[2]);
  set("#pomoSetAutoBreaks", s.autoStartBreaks);
  set("#pomoSetAutoPomos", s.autoStartPomodoros);
  set("#pomoSetInterval", s.longBreakInterval);
  set("#pomoSetAutoCheck", s.autoCheckTasks);
  set("#pomoSetAutoSwitch", s.autoSwitchTasks);
  set("#pomoSetAlarm", s.alarmSound);
  set("#pomoSetRepeat", s.alarmRepeat);
  set("#pomoSetVolume", Math.round(s.volume * 100));
  set("#pomoSetTicking", s.tickingSound);
  set("#pomoSetTickVolume", Math.round(s.tickingVolume * 100));
  set("#pomoSetDark", s.darkWhenRunning);
  set("#pomoSetHour", s.hourFormat);
  set("#pomoSetReminderType", s.reminderType);
  set("#pomoSetReminderMin", s.reminderMinutes);
  $("#pomoSetVolumeOut").textContent = `${Math.round(s.volume * 100)}`;
  $("#pomoSetTickVolumeOut").textContent = `${Math.round(s.tickingVolume * 100)}`;
}

// Settings apply as soon as they change.
function pomoReadSettings(e) {
  const p = state.pomo;
  const v = (id) => $(id).value;
  const c = (id) => $(id).checked;
  const raw = {
    ...p.settings,
    minutes: [v("#pomoSetPomo"), v("#pomoSetShort"), v("#pomoSetLong")],
    autoStartBreaks: c("#pomoSetAutoBreaks"),
    autoStartPomodoros: c("#pomoSetAutoPomos"),
    longBreakInterval: v("#pomoSetInterval"),
    autoCheckTasks: c("#pomoSetAutoCheck"),
    autoSwitchTasks: c("#pomoSetAutoSwitch"),
    alarmSound: v("#pomoSetAlarm"),
    alarmRepeat: v("#pomoSetRepeat"),
    volume: Number(v("#pomoSetVolume")) / 100,
    tickingSound: v("#pomoSetTicking"),
    tickingVolume: Number(v("#pomoSetTickVolume")) / 100,
    darkWhenRunning: c("#pomoSetDark"),
    hourFormat: v("#pomoSetHour"),
    reminderType: v("#pomoSetReminderType"),
    reminderMinutes: v("#pomoSetReminderMin"),
  };
  const prevMinutes = p.settings.minutes[p.stage];
  p.settings = pomoNormalize({ settings: raw }).settings;
  // A paused stage keeps its time left unless it no longer fits the new length.
  if (!p.running && p.remainingSec != null && p.settings.minutes[p.stage] !== prevMinutes) p.remainingSec = null;
  if (p.running && p.settings.minutes[p.stage] !== prevMinutes) {
    const used = prevMinutes * 60 - pomoSecondsLeft();
    p.endAt = Date.now() + Math.max(1, p.settings.minutes[p.stage] * 60 - used) * 1000;
  }
  $("#pomoSetVolumeOut").textContent = `${Math.round(p.settings.volume * 100)}`;
  $("#pomoSetTickVolumeOut").textContent = `${Math.round(p.settings.tickingVolume * 100)}`;
  pomoSave();
  renderPomo();

  // Preview the sound that was just picked, like Pomofocus does.
  const id = e?.target?.id;
  if (id === "pomoSetAlarm" || (id === "pomoSetVolume" && e.type === "change")) pomoAlarm(1);
  if (id === "pomoSetTicking" || (id === "pomoSetTickVolume" && e.type === "change")) {
    pomoTickSound();
    setTimeout(() => pomoTickSound(), POMO_TICKS[p.settings.tickingSound]?.every || 500);
  }
}

function pomoOpenCountDialog() {
  const p = state.pomo;
  $("#pomoCountInput").value = String(p.cnt + 1);
  pomoOpenDialog("#pomoCountModal");
  setTimeout(() => $("#pomoCountInput").select(), 30);
}
function pomoSaveCount() {
  const n = pomoClamp(Math.round($("#pomoCountInput").value), 1, 9999, 1);
  state.pomo.cnt = n - 1;
  pomoSave();
  pomoCloseDialog("#pomoCountModal");
  renderPomo();
}

/* ---------- Wiring ---------- */
function pomoBind() {
  const app = $("#pomoApp");
  if (!app || app.dataset.bound) return;
  app.dataset.bound = "1";

  $$("#pomoApp .pomoTab").forEach((b) => b.addEventListener("click", () => pomoSwitchStage(Number(b.dataset.stage))));
  $("#pomoStart").addEventListener("click", pomoToggle);
  $("#pomoNext").addEventListener("click", pomoSkip);
  $("#pomoCount").addEventListener("click", pomoOpenCountDialog);
  $("#pomoAddTask").addEventListener("click", () => pomoOpenForm("new"));

  // Task menu
  const menuBtn = $("#pomoTaskMenuBtn");
  const menu = $("#pomoTaskMenu");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pomo-menu]");
    if (b) pomoMenuAction(b.dataset.pomoMenu);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest(".pomoMenuWrap")) { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  });

  // Task list
  const list = $("#pomoTaskList");
  list.addEventListener("click", (e) => {
    if (e.target.closest("[data-pomo-clear-all]")) { state.pomo.tasks = []; pomoTasksChanged(); return; }
    const form = e.target.closest("[data-pomo-form]");
    if (form) {
      if (e.target.closest("[data-pomo-cancel]")) pomoCloseForm();
      else if (e.target.closest("[data-pomo-delete]")) pomoDeleteTask(form.dataset.pomoForm);
      else if (e.target.closest("[data-pomo-note]")) {
        pomoNoteOpen = true;
        const keep = { title: form.title.value, est: form.est.value, act: form.act?.value };
        renderPomoTasksForce();
        const f = $(`#pomoTaskList [data-pomo-form="${CSS.escape(form.dataset.pomoForm)}"]`);
        f.title.value = keep.title; f.est.value = keep.est; if (f.act && keep.act != null) f.act.value = keep.act;
        f.note.focus();
      } else {
        const step = e.target.closest("[data-step]");
        if (step) form.est.value = String(pomoClamp(Number(form.est.value || 1) + Number(step.dataset.step), 1, 99, 1));
      }
      return;
    }
    const row = e.target.closest("[data-pomo-task]");
    if (!row) return;
    const id = row.dataset.pomoTask;
    if (e.target.closest("[data-pomo-check]")) {
      const t = state.pomo.tasks.find((x) => x.id === id);
      if (t) pomoSetDone(id, !t.done);
    } else if (e.target.closest("[data-pomo-edit]")) {
      pomoOpenForm(id);
    } else {
      pomoSelectTask(id);
    }
  });
  list.addEventListener("keydown", (e) => {
    const form = e.target.closest("[data-pomo-form]");
    if (form) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); pomoCloseForm(); }
      else if (e.key === "Enter" && e.target.name === "title") { e.preventDefault(); form.est.focus(); form.est.select(); }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pomoSaveForm(form); }
      return;
    }
    const row = e.target.closest("[data-pomo-task]");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pomoSelectTask(row.dataset.pomoTask); }
  });
  list.addEventListener("submit", (e) => {
    e.preventDefault();
    pomoSaveForm(e.target);
  });

  // Settings
  $("#pomoSettingsBtn").addEventListener("click", () => { pomoFillSettings(); pomoOpenDialog("#pomoSettingsModal"); });
  const settings = $("#pomoSettingsForm");
  settings.addEventListener("change", pomoReadSettings);
  settings.addEventListener("input", (e) => { if (e.target.type === "range") pomoReadSettings(e); });
  settings.addEventListener("submit", (e) => { e.preventDefault(); pomoCloseDialog("#pomoSettingsModal"); });
  $("#pomoSettingsModal").addEventListener("click", (e) => { if (e.target.closest("[data-close-pomo-settings]")) pomoCloseDialog("#pomoSettingsModal"); });

  // Pomodoro counter
  $("#pomoCountForm").addEventListener("submit", (e) => { e.preventDefault(); pomoSaveCount(); });
  $("#pomoCountModal").addEventListener("click", (e) => {
    if (e.target.closest("[data-close-pomo-count]")) pomoCloseDialog("#pomoCountModal");
    const step = e.target.closest("[data-count-step]");
    if (step) $("#pomoCountInput").value = String(pomoClamp(Number($("#pomoCountInput").value || 1) + Number(step.dataset.countStep), 1, 9999, 1));
  });

  // Keyboard: space starts or pauses, 1-2-3 pick the stage (only on this page).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("#pomoSettingsModal").classList.contains("show")) pomoCloseDialog("#pomoSettingsModal");
      if ($("#pomoCountModal").classList.contains("show")) pomoCloseDialog("#pomoCountModal");
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !pomoOnTab()) return;
    if (document.querySelector(".modal.show,.popup.open") || !$("#authGate")?.classList.contains("hidden")) return;
    if (e.target.closest?.("input,textarea,select,button,a,[contenteditable='true'],[data-pomo-task]")) return;
    if (e.key === " " || e.code === "Space") { e.preventDefault(); pomoToggle(); }
    else if (e.key === "1" || e.key === "2" || e.key === "3") pomoSwitchStage(Number(e.key) - 1);
  });

  renderPomo();
}

function renderPomoTasksForce() {
  document.activeElement?.blur?.();
  renderPomoTasks();
}

// A stage that ended while TRX was closed moves on once, without auto start.
function pomoCatchUp() {
  const p = state.pomo;
  if (p.running && p.endAt && p.endAt <= Date.now()) {
    const { thisStage } = pomoAdvance();
    pomoSave();
    setTimeout(() => toast({ title: "Pomodoro", message: thisStage === 0 ? "Tu pomodoro terminó mientras no estabas." : "Tu descanso terminó mientras no estabas.", type: "info", timeout: 5000 }), 800);
  }
}

/* ---------- Entry points used by the rest of the app ---------- */
let pomoLoopHandle = null;
function initTimerLoop() {
  if (pomoLoopHandle) return;
  pomoCatchUp();
  pomoLoopHandle = setInterval(pomoTick, 200);
}
function bindTimer() { pomoBind(); }
function renderTimerUI() { renderPomo(); }

state.pomo = pomoLoad();
