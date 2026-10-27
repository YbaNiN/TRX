/* TRX Panel — 06-schedule.js · horario semanal de lunes a viernes */
// Each week keeps its own copy of the timetable, so past weeks stay as they were.
// Weeks from an earlier year are removed when a new year starts.
// In the cloud every week is a row of the tasks table marked kind: "schedule",
// and the usual hours are one more row marked kind: "scheduleTemplate".

const SCHED_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const SCHED_DAYS_SHORT = ["L", "M", "X", "J", "V"];
const SCHED_TEMPLATE_ID = "sched-template";
const SCHED_DEFAULT_SLOTS = [
  ["08:00", "09:00"], ["09:00", "10:00"], ["10:00", "11:00"],
  ["11:00", "12:00"], ["12:00", "13:00"], ["13:00", "14:00"],
];
const SCHED_MAX_ROWS = 24;
const SCHED_CELL_MAX = 300;

state.schedule = { weeks: {}, template: null };
state.schedOffset = 0; // weeks from the current one
state.schedDay = Math.min(4, (new Date().getDay() + 6) % 7); // day shown on phones

// Browsers without CSS field-sizing grow the cells from JS instead.
const SCHED_AUTOSIZE = !(window.CSS && CSS.supports && CSS.supports("field-sizing", "content"));
function schedAutosize(el) {
  if (!SCHED_AUTOSIZE || !el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

const schedTime = (v) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? v : "");

function schedMonday(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// A week belongs to the year of its Thursday (ISO rule), so the week that
// starts on Monday 29 December 2025 counts as a week of 2026.
function schedWeekYear(mondayIso) {
  const d = parseISODate(mondayIso);
  if (!d) return 0;
  d.setDate(d.getDate() + 3);
  return d.getFullYear();
}

function schedWeekKey(offset = state.schedOffset) {
  const m = schedMonday();
  m.setDate(m.getDate() + offset * 7);
  return toISODate(m);
}

function schedNormalizeRow(r) {
  const row = r && typeof r === "object" ? r : {};
  const cells = Array.isArray(row.cells) ? row.cells : [];
  return {
    id: String(row.id || uid()),
    start: schedTime(row.start),
    end: schedTime(row.end),
    cells: Array.from({ length: 5 }, (_, i) => String(cells[i] ?? "").slice(0, SCHED_CELL_MAX)),
  };
}

function schedSortRows(rows) {
  return rows.sort((a, b) => (a.start || "99").localeCompare(b.start || "99") || (a.end || "").localeCompare(b.end || ""));
}

function normalizeScheduleWeek(w) {
  const week = w && typeof w === "object" ? w : {};
  const key = /^\d{4}-\d{2}-\d{2}$/.test(String(week.week || "")) ? week.week : "";
  return {
    kind: "schedule",
    id: key ? `sched-${key}` : String(week.id || ""),
    week: key,
    rows: schedSortRows((Array.isArray(week.rows) ? week.rows : []).map(schedNormalizeRow).slice(0, SCHED_MAX_ROWS)),
    updatedAt: Number(week.updatedAt) || Date.now(),
  };
}

function normalizeScheduleTemplate(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.slots)) return null;
  const slots = t.slots
    .map((s) => ({ start: schedTime(s?.start), end: schedTime(s?.end) }))
    .filter((s) => s.start && s.end)
    .slice(0, SCHED_MAX_ROWS);
  return { kind: "scheduleTemplate", id: SCHED_TEMPLATE_ID, slots, updatedAt: Number(t.updatedAt) || Date.now() };
}

function normalizeSchedule(s) {
  const src = s && typeof s === "object" ? s : {};
  const weeks = {};
  for (const w of Object.values(src.weeks || {})) {
    const week = normalizeScheduleWeek(w);
    if (week.week) weeks[week.week] = week;
  }
  return { weeks, template: normalizeScheduleTemplate(src.template) };
}

// Weeks from earlier years are removed (here and in the cloud). Returns how many.
function schedCleanupOldYears() {
  const sched = state.schedule;
  if (!sched || state.guest) return 0;
  const year = schedWeekYear(schedWeekKey(0));
  let removed = 0;
  for (const [key, week] of Object.entries(sched.weeks)) {
    if (schedWeekYear(key) < year) {
      delete sched.weeks[key];
      if (week.id) cloudMarkDeleted(CLOUD.delTasksKey, week.id);
      removed++;
    }
  }
  return removed;
}

function scheduleCloudRows() {
  const s = state.schedule;
  if (!s) return [];
  return [...Object.values(s.weeks || {}), ...(s.template ? [s.template] : [])];
}

// Server rows for the schedule; the newer copy of each week wins.
function scheduleMergeCloudRow(data) {
  const s = state.schedule || (state.schedule = { weeks: {}, template: null });
  if (data.kind === "scheduleTemplate") {
    const t = normalizeScheduleTemplate(data);
    if (t && (!s.template || t.updatedAt >= s.template.updatedAt)) s.template = t;
    return;
  }
  const w = normalizeScheduleWeek(data);
  if (!w.week) return;
  const local = s.weeks[w.week];
  if (!local || w.updatedAt >= local.updatedAt) s.weeks[w.week] = w;
}

function scheduleRemoveById(id) {
  const s = state.schedule;
  if (!s) return;
  if (id === SCHED_TEMPLATE_ID) { s.template = null; return; }
  for (const [key, w] of Object.entries(s.weeks)) if (w.id === id) delete s.weeks[key];
}

// Hours for a week that has nothing yet: the usual hours, else the defaults.
function schedTemplateRows() {
  const slots = state.schedule?.template?.slots?.length
    ? state.schedule.template.slots
    : SCHED_DEFAULT_SLOTS.map(([start, end]) => ({ start, end }));
  return slots.map((s) => schedNormalizeRow({ id: uid(), start: s.start, end: s.end }));
}

function schedRememberHours(rows) {
  state.schedule.template = {
    kind: "scheduleTemplate",
    id: SCHED_TEMPLATE_ID,
    slots: rows.filter((r) => r.start && r.end).map((r) => ({ start: r.start, end: r.end })),
    updatedAt: Date.now(),
  };
}

// The week being viewed, created from the usual hours the first time it is edited.
function schedEnsureWeek(key = schedWeekKey()) {
  const s = state.schedule;
  if (!s.weeks[key]) {
    s.weeks[key] = normalizeScheduleWeek({ week: key, rows: schedTemplateRows(), updatedAt: Date.now() });
    cloudUnmarkDeleted(CLOUD.delTasksKey, s.weeks[key].id);
  }
  return s.weeks[key];
}

const schedHasContent = (week) => !!week && week.rows.some((r) => r.cells.some((c) => c.trim()));

// Closest earlier week of this year that has something written.
function schedPreviousFilledWeek(key) {
  const keys = Object.keys(state.schedule.weeks).filter((k) => k < key && schedHasContent(state.schedule.weeks[k])).sort();
  return keys.length ? state.schedule.weeks[keys[keys.length - 1]] : null;
}

function schedCanGo(offset) {
  return schedWeekYear(schedWeekKey(offset)) === schedWeekYear(schedWeekKey(0));
}

function schedShortDate(d) {
  return d.toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", "");
}

function renderSchedule({ force = false } = {}) {
  const host = $("#schedTable");
  if (!host || !state.schedule) return;
  // Re-rendering would drop the cursor of someone typing in a cell.
  if (!force && host.contains(document.activeElement) && document.activeElement.classList.contains("schedCell")) return;

  if (schedCleanupOldYears()) save();
  if (!schedCanGo(state.schedOffset)) state.schedOffset = 0;

  const key = schedWeekKey();
  const monday = parseISODate(key);
  const week = state.schedule.weeks[key];
  const rows = week ? week.rows : schedTemplateRows();
  const isCurrent = state.schedOffset === 0;
  const todayIdx = isCurrent ? (new Date().getDay() + 6) % 7 : -1; // 5 or 6 is the weekend
  const days = SCHED_DAYS.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { name, short: SCHED_DAYS_SHORT[i], date: schedShortDate(d), today: i === todayIdx };
  });
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  $("#schedWeekLabel").innerHTML = `<strong>${isCurrent ? "Esta semana" : state.schedOffset === 1 ? "La semana que viene" : state.schedOffset === -1 ? "La semana pasada" : "Semana"}</strong><span>${escapeHtml(`${schedShortDate(monday)} – ${schedShortDate(friday)} ${friday.getFullYear()}`)}</span>`;
  $("#schedPrev").disabled = !schedCanGo(state.schedOffset - 1);
  $("#schedNext").disabled = !schedCanGo(state.schedOffset + 1);
  $("#schedToday").hidden = isCurrent;

  schedRefreshTools();

  const show = Math.max(0, Math.min(4, state.schedDay));
  $$(".schedDays [data-sched-day]").forEach((b) => {
    const i = Number(b.dataset.schedDay);
    b.classList.toggle("active", i === show);
    b.classList.toggle("isToday", i === todayIdx);
    b.setAttribute("aria-pressed", String(i === show));
    b.innerHTML = `<span>${days[i].short}</span><small>${escapeHtml(days[i].date.split(" ")[0])}</small>`;
    b.setAttribute("aria-label", `${days[i].name} ${days[i].date}`);
  });

  if (!rows.length) {
    host.innerHTML = `<div class="agendaEmpty">${trxIcon("table")}<h3>Sin franjas horarias</h3><p class="muted">Añade una franja, por ejemplo de 08:00 a 09:00, y escribe qué haces cada día.</p><button class="btn primary" type="button" data-sched-add>${trxIcon("plus")}Añadir franja</button></div>`;
    $("#schedFoot").textContent = "";
    return;
  }

  const readonly = state.guest ? " readonly" : "";
  host.innerHTML = `<table class="schedTable" data-show="${show}">
    <thead><tr>
      <th class="schedTimeHead" scope="col">Hora</th>
      ${days.map((d, i) => `<th scope="col" data-col="${i}" class="${d.today ? "isToday" : ""}"><span class="schedDayName">${d.name}</span><span class="schedDayDate">${escapeHtml(d.date)}</span></th>`).join("")}
    </tr></thead>
    <tbody>
      ${rows.map((r) => {
        const range = `${r.start || "--:--"} a ${r.end || "--:--"}`;
        return `<tr data-row="${escapeHtml(r.id)}">
        <th scope="row" class="schedTime"><button type="button" class="schedTimeBtn" data-slot-edit aria-label="Cambiar la franja de ${range}" title="Cambiar horas"><span>${r.start || "--:--"}</span><span>${r.end || "--:--"}</span></button></th>
        ${r.cells.map((c, i) => `<td data-col="${i}" class="${days[i].today ? "isToday" : ""}${c.trim() ? " filled" : ""}"><textarea class="schedCell" data-sched-day="${i}" rows="2" maxlength="${SCHED_CELL_MAX}" aria-label="${days[i].name}, de ${range}"${readonly}>${escapeHtml(c)}</textarea></td>`).join("")}
      </tr>`;
      }).join("")}
    </tbody>
  </table>`;
  if (SCHED_AUTOSIZE) host.querySelectorAll(".schedCell").forEach(schedAutosize);
  schedRefreshTools();
}

// Buttons and counter that depend on what is written; cheap enough to run while typing.
function schedRefreshTools() {
  const key = schedWeekKey();
  const week = state.schedule.weeks[key];
  const prevFilled = schedPreviousFilledWeek(key);
  $("#schedCopyPrev").disabled = !prevFilled;
  $("#schedCopyPrev").title = prevFilled ? `Copia lo que tenías la semana del ${schedShortDate(parseISODate(prevFilled.week))}` : "No hay semanas anteriores con contenido este año";
  $("#schedClear").disabled = !schedHasContent(week);
  if (!$("#schedTable table")) return;
  const filled = week ? week.rows.reduce((n, r) => n + r.cells.filter((c) => c.trim()).length, 0) : 0;
  $("#schedFoot").textContent = week
    ? `${filled} ${filled === 1 ? "hueco ocupado" : "huecos ocupados"} esta semana · Se guarda solo`
    : "Semana sin empezar. Escribe en cualquier hueco o copia la semana anterior.";
}

/* ---------- Editing ---------- */
let schedSaveTimer = null;
function schedQueueSave() {
  if (schedSaveTimer) clearTimeout(schedSaveTimer);
  schedSaveTimer = setTimeout(() => { schedSaveTimer = null; save(); }, 500);
}
function schedFlushSave() {
  if (!schedSaveTimer) return;
  clearTimeout(schedSaveTimer);
  schedSaveTimer = null;
  save();
}

function schedCellInput(el) {
  if (state.guest) return;
  const tr = el.closest("[data-row]");
  const day = Number(el.dataset.schedDay);
  const key = schedWeekKey();
  const existed = !!state.schedule.weeks[key];
  const week = schedEnsureWeek(key);
  // A brand new week gets fresh row ids, so map the row by its position.
  let row = week.rows.find((r) => r.id === tr.dataset.row);
  if (!row && !existed) {
    const idx = [...tr.parentNode.children].indexOf(tr);
    row = week.rows[idx];
    $$("#schedTable tbody tr").forEach((t, i) => { if (week.rows[i]) t.dataset.row = week.rows[i].id; });
  }
  if (!row) return;
  row.cells[day] = el.value.slice(0, SCHED_CELL_MAX);
  week.updatedAt = Date.now();
  el.closest("td")?.classList.toggle("filled", !!el.value.trim());
  schedRefreshTools();
  schedQueueSave();
}

let schedSlotRowId = null;

function openSchedSlotModal(rowId = null) {
  if (guestBlocked("editar el horario")) return;
  const key = schedWeekKey();
  const rows = state.schedule.weeks[key]?.rows || schedTemplateRows();
  const tr = rowId ? $(`#schedTable tr[data-row="${CSS.escape(rowId)}"]`) : null;
  const idx = tr ? [...tr.parentNode.children].indexOf(tr) : -1;
  const row = idx >= 0 ? rows[idx] : null;
  if (!row && rows.length >= SCHED_MAX_ROWS) {
    toast({ title: "Horario", message: `Máximo ${SCHED_MAX_ROWS} franjas por semana.`, type: "warn" });
    return;
  }
  schedSlotRowId = row ? idx : null;

  // A new slot starts where the last one ends and lasts one hour.
  const last = rows[rows.length - 1];
  const start = row ? row.start : (last?.end || "08:00");
  const [h, m] = start.split(":").map(Number);
  const end = row ? row.end : `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(h + 1 > 23 ? 59 : m).padStart(2, "0")}`;

  $("#schedSlotTitle").textContent = row ? "Cambiar franja" : "Nueva franja";
  $("#schedSlotSave").textContent = row ? "Guardar" : "Añadir";
  $("#schedSlotDelete").hidden = !row;
  $("#schedSlotStart").value = start;
  $("#schedSlotEnd").value = end;
  $("#schedSlotError").hidden = true;

  const md = $("#schedSlotModal");
  md.classList.add("show");
  md.setAttribute("aria-hidden", "false");
  setTimeout(() => $("#schedSlotStart")?.focus(), 30);
}

function closeSchedSlotModal() {
  schedSlotRowId = null;
  const md = $("#schedSlotModal");
  md.classList.remove("show");
  md.setAttribute("aria-hidden", "true");
}

function saveSchedSlot() {
  const start = $("#schedSlotStart").value;
  const end = $("#schedSlotEnd").value;
  const err = $("#schedSlotError");
  if (!schedTime(start) || !schedTime(end) || end <= start) {
    err.textContent = "La hora de fin tiene que ser posterior a la de inicio.";
    err.hidden = false;
    $("#schedSlotEnd").focus();
    return;
  }
  const week = schedEnsureWeek();
  if (schedSlotRowId !== null && week.rows[schedSlotRowId]) {
    Object.assign(week.rows[schedSlotRowId], { start, end });
  } else {
    week.rows.push(schedNormalizeRow({ start, end }));
  }
  schedSortRows(week.rows);
  week.updatedAt = Date.now();
  schedRememberHours(week.rows);
  markActivity();
  save();
  closeSchedSlotModal();
  renderSchedule({ force: true });
}

async function deleteSchedSlot() {
  const idx = schedSlotRowId;
  closeSchedSlotModal();
  if (idx === null) return;
  const week = schedEnsureWeek();
  const row = week.rows[idx];
  if (!row) return;
  week.rows.splice(idx, 1);
  week.updatedAt = Date.now();
  schedRememberHours(week.rows);
  save();
  renderSchedule({ force: true });
  offerUndo({
    title: "Franja eliminada",
    message: `${row.start} a ${row.end}`,
    onUndo: () => {
      const w = schedEnsureWeek(week.week);
      w.rows.splice(Math.min(idx, w.rows.length), 0, row);
      schedSortRows(w.rows);
      w.updatedAt = Date.now();
      schedRememberHours(w.rows);
      save();
      renderSchedule({ force: true });
    },
  });
}

async function schedCopyPrevious() {
  if (guestBlocked("editar el horario")) return;
  const key = schedWeekKey();
  const src = schedPreviousFilledWeek(key);
  if (!src) return;
  const current = state.schedule.weeks[key];
  if (schedHasContent(current)) {
    const ok = await openModal({
      title: "Copiar semana anterior",
      desc: `Se reemplazará lo que hay en esta semana por el horario de la semana del ${schedShortDate(parseISODate(src.week))}.`,
      okText: "Copiar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
  }
  const before = current ? JSON.parse(JSON.stringify(current)) : null;
  state.schedule.weeks[key] = normalizeScheduleWeek({
    week: key,
    rows: src.rows.map((r) => ({ ...r, id: uid(), cells: [...r.cells] })),
    updatedAt: Date.now(),
  });
  cloudUnmarkDeleted(CLOUD.delTasksKey, state.schedule.weeks[key].id);
  schedRememberHours(state.schedule.weeks[key].rows);
  markActivity();
  save();
  renderSchedule({ force: true });
  offerUndo({
    title: "Semana copiada",
    message: `Desde la semana del ${schedShortDate(parseISODate(src.week))}`,
    onUndo: () => schedRestoreWeek(key, before),
  });
}

function schedClearWeek() {
  if (guestBlocked("editar el horario")) return;
  const key = schedWeekKey();
  const week = state.schedule.weeks[key];
  if (!schedHasContent(week)) return;
  const before = JSON.parse(JSON.stringify(week));
  week.rows.forEach((r) => { r.cells = ["", "", "", "", ""]; });
  week.updatedAt = Date.now();
  save();
  renderSchedule({ force: true });
  offerUndo({ title: "Semana vaciada", message: "Se han borrado los textos de esta semana", onUndo: () => schedRestoreWeek(key, before) });
}

function schedRestoreWeek(key, snapshot) {
  if (snapshot) {
    state.schedule.weeks[key] = normalizeScheduleWeek({ ...snapshot, updatedAt: Date.now() });
  } else if (state.schedule.weeks[key]) {
    // The week did not exist before: keep it, but empty, so the cloud copy is replaced too.
    state.schedule.weeks[key].rows.forEach((r) => { r.cells = ["", "", "", "", ""]; });
    state.schedule.weeks[key].updatedAt = Date.now();
  }
  save();
  renderSchedule({ force: true });
}

function demoScheduleData() {
  const key = schedWeekKey(0);
  const plan = [
    ["08:00", "09:00", ["Gimnasio", "", "Gimnasio", "", "Gimnasio"]],
    ["09:00", "11:00", ["Trabajo: correo y planificación", "Reunión de equipo", "Trabajo enfocado", "Reunión con cliente", "Revisión semanal"]],
    ["11:00", "13:00", ["Trabajo enfocado", "Trabajo enfocado", "Formación", "Trabajo enfocado", "Proyectos personales"]],
    ["13:00", "14:00", ["Comida", "Comida", "Comida", "Comida", "Comida con amigos"]],
    ["17:00", "18:00", ["Inglés", "", "Inglés", "", ""]],
    ["18:00", "19:00", ["", "Clase de guitarra", "", "Clase de guitarra", ""]],
  ];
  return {
    weeks: { [key]: normalizeScheduleWeek({ week: key, rows: plan.map(([start, end, cells]) => ({ start, end, cells })) }) },
    template: null,
  };
}

function bindSchedule() {
  if (!$("#schedule")) return;
  const go = (offset) => {
    if (!schedCanGo(offset)) return;
    schedFlushSave();
    state.schedOffset = offset;
    renderSchedule({ force: true });
  };
  $("#schedPrev").addEventListener("click", () => go(state.schedOffset - 1));
  $("#schedNext").addEventListener("click", () => go(state.schedOffset + 1));
  $("#schedToday").addEventListener("click", () => {
    state.schedDay = Math.min(4, (new Date().getDay() + 6) % 7);
    go(0);
  });
  $("#btnSchedSlot").addEventListener("click", () => openSchedSlotModal());
  $("#schedCopyPrev").addEventListener("click", schedCopyPrevious);
  $("#schedClear").addEventListener("click", schedClearWeek);
  $$(".schedDays [data-sched-day]").forEach((b) => b.addEventListener("click", () => {
    schedFlushSave();
    state.schedDay = Number(b.dataset.schedDay);
    renderSchedule({ force: true });
  }));

  const host = $("#schedTable");
  host.addEventListener("input", (e) => {
    if (!e.target.classList.contains("schedCell")) return;
    schedAutosize(e.target);
    schedCellInput(e.target);
  });
  host.addEventListener("focusout", (e) => { if (e.target.classList.contains("schedCell")) schedFlushSave(); });
  host.addEventListener("click", (e) => {
    if (e.target.closest("[data-sched-add]")) { openSchedSlotModal(); return; }
    if (e.target.closest("[data-slot-edit]")) { openSchedSlotModal(e.target.closest("[data-row]").dataset.row); return; }
    if (state.guest && e.target.closest("td[data-col]")) { guestBlocked("editar el horario"); return; }
    // The cell may be taller than its text box; a tap anywhere in it starts typing.
    const td = e.target.closest("td[data-col]");
    if (td && e.target === td) td.querySelector(".schedCell")?.focus();
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && e.target.classList.contains("schedCell")) e.target.blur();
  });

  $("#schedSlotForm").addEventListener("submit", (e) => { e.preventDefault(); saveSchedSlot(); });
  $("#schedSlotCancel").addEventListener("click", closeSchedSlotModal);
  $("#schedSlotX").addEventListener("click", closeSchedSlotModal);
  $("#schedSlotDelete").addEventListener("click", deleteSchedSlot);
  $("#schedSlotModal").addEventListener("click", (e) => { if (e.target.closest("[data-close-sched]")) closeSchedSlotModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#schedSlotModal")?.classList.contains("show")) closeSchedSlotModal();
  });
  window.addEventListener("pagehide", schedFlushSave);
  document.addEventListener("visibilitychange", () => { if (document.hidden) schedFlushSave(); });

  renderSchedule({ force: true });
}

document.addEventListener("DOMContentLoaded", bindSchedule);
