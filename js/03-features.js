/* TRX Panel — 03-features.js · listas, temporizador, tareas, stats, notas, colores, charts, reloj, acciones */
/* ===================== Lists ===================== */
function getAccessibleLists() {
  return (state.lists || []).map(normalizeList).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function listIsOwner(l) {
  return cloudUserId && (l.ownerId ? l.ownerId === cloudUserId : true);
}
function listVisibilityLabel(l) {
  return l.visibility === "shared" ? "Compartida" : "Privada";
}
function ensureListItems(listId) {
  if (!state.listItems) state.listItems = {};
  if (!Array.isArray(state.listItems[listId])) state.listItems[listId] = [];
  return state.listItems[listId];
}

function listsIsMobile() {
  try {
    return window.matchMedia("(max-width: 980px), (pointer: coarse)").matches;
  } catch {
    return window.innerWidth <= 980;
  }
}
function setListsView(view) {
  const sec = $("#lists");
  if (sec) sec.dataset.view = view;
}

function renderLists() {
  const box = $("#listsList");
  if (!box) return;

  const lists = getAccessibleLists();
  $("#listsCount") && ($("#listsCount").textContent = String(lists.length));
  $("#listsEmptyHint") && ($("#listsEmptyHint").style.display = lists.length ? "none" : "block");

  const activeId = state.currentListId;
  box.innerHTML = "";
  for (const l of lists) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "listBtn" + (l.id === activeId ? " active" : "");
    btn.dataset.listId = l.id;

    const left = document.createElement("div");
    left.style.minWidth = "0";
    left.innerHTML = `<div class="title">${escapeHtml(l.title)}</div>
      <div class="meta"><span class="pill">${listVisibilityLabel(l)}</span>${l.ownerId && l.ownerId !== cloudUserId ? `<span class="pill">Compartida contigo</span>` : ""}</div>`;
    const right = document.createElement("div");
    right.className = "meta";
    right.textContent = "";

    btn.append(left, right);
    btn.addEventListener("click", () => openList(l.id));
    box.appendChild(btn);
  }

  // si no hay lista activa, limpia panel
  if (!activeId || !lists.some((x) => x.id === activeId)) {
    state.currentListId = null;
    $("#listDetail") && ($("#listDetail").hidden = true);
    $("#listEmpty") && ($("#listEmpty").style.display = "block");
    if (listsIsMobile()) setListsView("home");
  } else {
    // refresca detalle
    renderListDetail();
  }
}

function renderListDetail() {
  const listId = state.currentListId;
  const l = (state.lists || []).find((x) => x.id === listId);
  const detail = $("#listDetail");
  if (!l || !detail) return;

  detail.hidden = false;
  $("#listEmpty") && ($("#listEmpty").style.display = "none");

  $("#listTitle").textContent = l.title;
  $("#listMeta").textContent = `${listVisibilityLabel(l)} • ${listIsOwner(l) ? "Tu lista" : "Compartida"}`;

  // botones owner-only
  const canShare = listIsOwner(l);
  $("#btnListShare").style.display = canShare ? "inline-flex" : "none";
  $("#btnListDelete").style.display = canShare ? "inline-flex" : "none";

  // items (IMPORTANT: keep references to the real objects in state so edits/deletes reflect immediately)
  const itemsRef = ensureListItems(listId);
  const items = itemsRef.map(normalizeListItem);
  const itemsBox = $("#listItems");
  itemsBox.innerHTML = "";
  const cols = $("#listCols");
  if (!items.length) {
    if (cols) cols.style.display = "none";
    itemsBox.innerHTML = `<div class="muted" style="padding:10px">Aún no hay items. Añade el primero arriba.</div>`;
  } else {
    if (cols) cols.style.display = "grid";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ref = itemsRef[i];
      const row = document.createElement("div");
      row.className = "listItemRow" + (it.done ? " done" : "");
      row.innerHTML = `
        <input class="chk" type="checkbox" ${it.done ? "checked" : ""} aria-label="Hecho"/>
        <div class="txt">${escapeHtml(it.text)}</div>
        <div class="mini">
          <button class="btn ghost sm" type="button" data-act="edit">✎</button>
          <button class="btn danger sm" type="button" data-act="del">🗑</button>
        </div>
      `;
      row.querySelector(".chk").addEventListener("change", (e) => {
        // update the real state object
        ref.done = !!e.target.checked;
        ref.updatedAt = Date.now();
        save();
        cloudScheduleSync();
        renderListDetail();
      });
      row.querySelector('[data-act="del"]').addEventListener("click", () => {
        // Optimistic UI: remove from DOM immediately, then update state + cloud.
        row.remove();
        deleteListItem(listId, ref.id, { render: false });
        // If we removed the last row, re-render to show the empty hint.
        if (!ensureListItems(listId).length) renderListDetail();
      });
      row.querySelector('[data-act="edit"]').addEventListener("click", () => {
        const t = prompt("Editar item", ref.text);
        if (t === null) return;
        ref.text = String(t || "").trim();
        ref.updatedAt = Date.now();
        save();
        cloudScheduleSync();
        renderListDetail();
      });
      itemsBox.appendChild(row);
    }
  }
}

function openList(listId) {
  state.currentListId = listId;
  save();
  renderLists();
  if (listsIsMobile()) {
    setListsView("detail");
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 10);
  }
  // carga shares si procede
  maybeLoadShares(listId);
}

function closeListDetail() {
  state.currentListId = null;
  const detail = $("#listDetail");
  if (detail) detail.hidden = true;
  const empty = $("#listEmpty");
  if (empty) empty.style.display = "";
  const sharePanel = $("#listSharePanel");
  if (sharePanel) sharePanel.hidden = true;

  if (listsIsMobile()) setListsView("home");
}

function openListsCreateModal() {
  const ov = $("#listsOverlay");
  const modal = $("#listCreateModal");
  if (!ov || !modal) return;
  ov.hidden = false;
  modal.hidden = false;
  document.body.classList.add("popupOpen");
  setTimeout(() => {
    $("#newListTitle")?.focus();
  }, 40);
}
function closeListsCreateModal() {
  const ov = $("#listsOverlay");
  const modal = $("#listCreateModal");
  if (!ov || !modal) return;
  ov.hidden = true;
  modal.hidden = true;
  document.body.classList.remove("popupOpen");
}

async function createList() {
  const title = ($("#newListTitle")?.value || "").trim();
  const vis = ($("#newListVisibility")?.value || "private");
  if (!title) return toast({ title: "Listas", message: "Pon un nombre a la lista.", type: "warn" });

  const sb = await initSupabaseClient();
  const authUid = sb ? await cloudGetAuthUid(sb) : null;
  if (!authUid) return toast({ title: "Listas", message: "Inicia sesión para usar Listas en la nube.", type: "warn" });

  const list = normalizeList({
    id: uid(),
    title,
    visibility: vis,
    ownerId: authUid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  state.lists = [...(state.lists || []), list];
  ensureListItems(list.id);
  save();
  closeListsCreateModal();
  $("#newListTitle").value = "";
  cloudScheduleSync();
  openList(list.id);
  toast({ title: "Listas", message: "Lista creada.", type: "ok" });
}

function addListItem() {
  const listId = state.currentListId;
  if (!listId) return;
  const txt = ($("#listItemInput")?.value || "").trim();
  if (!txt) return;
  const it = normalizeListItem({ id: uid(), text: txt, done: false, createdAt: Date.now(), updatedAt: Date.now() });
  const arr = ensureListItems(listId);
  arr.push(it);
  // bump list updated
  const l = (state.lists || []).find((x) => x.id === listId);
  if (l) l.updatedAt = Date.now();
  save();
  $("#listItemInput").value = "";
  cloudScheduleSync();
  renderListDetail();
}

function deleteListItem(listId, itemId, opts) {
  const o = Object.assign({ render: true }, opts || {});
  const arr = ensureListItems(listId);
  const idx = arr.findIndex((x) => x.id === itemId);
  if (idx === -1) return;
  arr.splice(idx, 1);
  cloudMarkDeleted(CLOUD.delListItemsKey, itemId);
  const l = (state.lists || []).find((x) => x.id === listId);
  if (l) l.updatedAt = Date.now();
  save();
  cloudScheduleSync();
  if (o.render) renderListDetail();
}

function deleteCurrentList() {
  const listId = state.currentListId;
  const l = (state.lists || []).find((x) => x.id === listId);
  if (!l) return;
  if (!listIsOwner(l)) return toast({ title: "Listas", message: "Solo el dueño puede eliminar la lista.", type: "warn" });
  if (!confirm("¿Eliminar esta lista y sus items?")) return;

  // UI-first: remove locally now
  state.lists = (state.lists || []).filter((x) => x.id !== listId);
  delete state.listItems[listId];
  state.currentListId = null;
  save();

  // go back to list view
  closeListDetail();
  renderLists();
  toast({ title: "Listas", message: "Lista eliminada.", type: "ok" });

  // Cloud: delete now if possible, else mark for later
  // Cloud: delete now if possible, else mark for later
if (cloudIsReady()) {
  (async () => {
    try {
      const sb = supabaseClient;
      const authUid = await cloudGetAuthUid(sb);
      if (!authUid) throw new Error("no auth user");

      // delete shares first (FK-like)
      await sb.from(CLOUD.listSharesTable).delete().eq("list_id", listId);
      await sb.from(CLOUD.listItemsTable).delete().eq("list_id", listId);
      const { error } = await sb
        .from(CLOUD.listsTable)
        .delete()
        .eq("user_id", authUid)
        .eq("list_id", listId);

      if (error) console.warn("Cloud delete list", error);

      // also clear any pending delete markers for this id
      cloudUnmarkDeleted(CLOUD.delListsKey, listId);
    } catch (e) {
      console.warn("Cloud delete list", e);
      cloudMarkDeleted(CLOUD.delListsKey, listId);
    }
    cloudScheduleSync();
  })();
} else {
  cloudMarkDeleted(CLOUD.delListsKey, listId);
}
}

function cloudUnmarkDeleted(key, id) {
  const arr = cloudGetDeleted(key);
  const next = arr.filter((x) => x !== id);
  localStorage.setItem(key, JSON.stringify(next));
}

/* ---- Sharing ---- */
async function maybeLoadShares(listId) {
  const panel = $("#listSharePanel");
  if (panel && !panel.hidden && cloudIsReady()) {
    await loadShares(listId);
  }
}

async function loadShares(listId) {
  if (!cloudIsReady()) return;
  const sb = supabaseClient;
  const { data, error } = await sb.from(CLOUD.listSharesTable).select("shared_user_id,created_at").eq("list_id", listId);
  if (error) {
    console.warn("Share fetch", error);
    return;
  }
  const ids = (data || []).map((r) => r.shared_user_id).filter(Boolean);
  let profs = [];
  if (ids.length) {
    const pr = await sb.from("profiles").select("id,username,display_name").in("id", ids);
    if (!pr.error) profs = pr.data || [];
  }
  const map = new Map(profs.map((p) => [p.id, p]));
  const sharedWith = ids.map((id) => map.get(id)).filter(Boolean).map((p) => ({ user_id: p.id, username: p.username, display_name: p.display_name }));
  // persist in list object for UI
  const l = (state.lists || []).find((x) => x.id === listId);
  if (l) {
    l.sharedWith = sharedWith;
    save();
  }
  renderShareChips(sharedWith, listId);
}

function renderShareChips(sharedWith, listId) {
  const chips = $("#shareChips");
  if (!chips) return;
  chips.innerHTML = "";
  if (!sharedWith?.length) {
    chips.innerHTML = `<span class="muted">Aún no hay usuarios añadidos.</span>`;
    return;
  }
  for (const u of sharedWith) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "chip";
    el.textContent = u.display_name || u.username || "usuario";
    el.title = u.username || "";
    el.addEventListener("click", async () => {
      if (!confirm("Quitar acceso a este usuario?")) return;
      await removeShare(listId, u.user_id);
      await loadShares(listId);
      toast({ title: "Listas", message: "Acceso quitado.", type: "ok" });
    });
    chips.appendChild(el);
  }
}

async function addShare() {
  const listId = state.currentListId;
  const l = (state.lists || []).find((x) => x.id === listId);
  if (!listId || !l) return;
  if (!listIsOwner(l)) return toast({ title: "Listas", message: "Solo el dueño puede compartir.", type: "warn" });
  if (!cloudIsReady()) return;

  const uname = ($("#shareUsername")?.value || "").trim();
  if (!uname) return;

  const sb = supabaseClient;
  const { data: prof, error: perr } = await sb.from("profiles").select("id,username,display_name").eq("username", uname).maybeSingle();
  if (perr || !prof) return toast({ title: "Listas", message: "Usuario no encontrado.", type: "warn" });

  const { error } = await sb.from(CLOUD.listSharesTable).upsert({ list_id: listId, shared_user_id: prof.id }, { onConflict: "list_id,shared_user_id" });
  if (error) {
    console.warn("Share add", error);
    return toast({ title: "Listas", message: "No se pudo compartir.", type: "warn" });
  }

  $("#shareUsername").value = "";
  await loadShares(listId);
  toast({ title: "Listas", message: "Compartido.", type: "ok" });
}

async function removeShare(listId, userId) {
  if (!cloudIsReady()) return;
  const sb = supabaseClient;
  await sb.from(CLOUD.listSharesTable).delete().eq("list_id", listId).eq("shared_user_id", userId);
}

function toggleSharePanel() {
  const panel = $("#listSharePanel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    loadShares(state.currentListId);
    setTimeout(() => $("#shareUsername")?.focus(), 60);
  }
}

function bindLists() {
  // por defecto, en móvil mostramos la lista de listas (home)
  if (listsIsMobile()) setListsView("home");

  if ($("#btnListNew")) $("#btnListNew").addEventListener("click", openListsCreateModal);
  if ($("#btnListCreateClose")) $("#btnListCreateClose").addEventListener("click", closeListsCreateModal);
  if ($("#btnListCreateCancel")) $("#btnListCreateCancel").addEventListener("click", closeListsCreateModal);
  if ($("#listsOverlay")) $("#listsOverlay").addEventListener("click", closeListsCreateModal);
  if ($("#btnListCreate")) $("#btnListCreate").addEventListener("click", createList);
  if ($("#newListTitle")) $("#newListTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createList(); } });

  if ($("#btnListItemAdd")) $("#btnListItemAdd").addEventListener("click", addListItem);
  if ($("#listItemInput")) $("#listItemInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addListItem(); } });

  if ($("#btnListDelete")) $("#btnListDelete").addEventListener("click", deleteCurrentList);

  if ($("#btnListBack")) $("#btnListBack").addEventListener("click", closeListDetail);

  if ($("#btnListShare")) $("#btnListShare").addEventListener("click", toggleSharePanel);
  if ($("#btnListShareClose")) $("#btnListShareClose").addEventListener("click", () => { $("#listSharePanel").hidden = true; });
  if ($("#btnShareAdd")) $("#btnShareAdd").addEventListener("click", addShare);
  if ($("#shareUsername")) $("#shareUsername").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addShare(); } });

  // render initial if tab visible
  renderLists();
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


function normalizeList(l){
  if (!l) l = {};
  if (!l.id) l.id = uid();
  if (!l.title) l.title = "Sin título";
  if (!l.visibility) l.visibility = "private"; // private | shared
  if (!Array.isArray(l.sharedWith)) l.sharedWith = []; // array of {user_id, username, display_name}
  if (!l.createdAt) l.createdAt = Date.now();
  if (!l.updatedAt) l.updatedAt = Date.now();
  return l;
}
function normalizeListItem(it){
  if (!it) it = {};
  if (!it.id) it.id = uid();
  if (!it.text) it.text = "";
  if (typeof it.done !== "boolean") it.done = false;
  if (!it.createdAt) it.createdAt = Date.now();
  if (!it.updatedAt) it.updatedAt = Date.now();
  return it;
}

function addTask(title, priority, tags, startDate, endDate, startTime, endTime, category, color) {
  if (guestBlocked("crear tareas")) return;
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
  if (guestBlocked("editar tareas")) return;
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  normalizeTask(t);
  markActivity();
  save();
  renderAll();
}

function updateTaskStatus(id, status){
  if (guestBlocked("cambiar el estado de tareas")) return;
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.status = status;
  t.done = status === "done";
  t.doneAt = t.done ? (t.doneAt || Date.now()) : null;
  markActivity();
  save();
  renderAll();
}

function deleteTask(id) {
  if (guestBlocked("eliminar tareas")) return;
  const idx = state.tasks.findIndex(x => x.id === id);
  if (idx === -1) return;
  const t = state.tasks[idx];
  state.tasks = state.tasks.filter(x => x.id !== id);
  try { if (cloudIsReady()) cloudAddDeleted(CLOUD.delTasksKey, id); } catch {}
  markActivity();
  save();
  renderAll();
  offerUndo({
    title: "Tarea eliminada",
    message: t?.title || "",
    onUndo: () => {
      state.tasks.splice(Math.min(idx, state.tasks.length), 0, t);
      try { if (cloudIsReady()) cloudUnmarkDeleted(CLOUD.delTasksKey, id); } catch {}
      save();
      renderAll();
    },
  });
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
  const emptyState = $("#tasksEmpty");
  list.innerHTML = "";

  const items = filteredTasks();

  // Estado vacío: distinguimos "no hay nada" de "sin resultados de filtro"
  if (items.length === 0) {
    const hasAnyTask = (state.tasks || []).length > 0;
    if (!hasAnyTask && emptyState && state.view !== "kanban") {
      emptyState.hidden = false;
      return;
    }
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `<span class="muted">Sin resultados para este filtro</span>`;
    list.appendChild(li);
    if (emptyState) emptyState.hidden = true;
    return;
  }
  if (emptyState) emptyState.hidden = true;

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
  const emptyState = $("#tasksEmpty");
  if (emptyState) emptyState.hidden = true;

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
// Actualiza TODOS los nodos con el mismo data-stat de una vez.
function setStat(name, value) {
  $$(`[data-stat="${name}"]`).forEach((el) => { el.textContent = value; });
}

function renderStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => (t.status || (t.done ? "done":"todo")) === "done").length;
  const pending = total - done;

  setStat("total", total);
  setStat("done", done);
  setStat("pending", pending);
  setStat("streak", `${activityStreak()}d`);
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
  setStat("notes", String(state.notes.length));

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
  if (guestBlocked("crear notas")) return;
  const v = String(text||"").trim();
  if (!v) return;
  const note = { id: uid(), text: v, pinned: false, createdAt: Date.now() };
  state.notes.unshift(note);
  save();
  renderNotes();
}

function togglePinNote(id){
  if (guestBlocked("editar notas")) return;
  const n = state.notes.find(x=>x.id===id);
  if (!n) return;
  n.pinned = !n.pinned;
  save();
  renderNotes();
}

function deleteNote(id){
  if (guestBlocked("eliminar notas")) return;
  const idx = state.notes.findIndex(x=>x.id===id);
  if (idx === -1) return;
  const n = state.notes[idx];
  state.notes = state.notes.filter(x=>x.id!==id);
  try { if (cloudIsReady()) cloudAddDeleted(CLOUD.delNotesKey, id); } catch {}
  save();
  renderNotes();
  offerUndo({
    title: "Nota eliminada",
    message: n?.text || "",
    onUndo: () => {
      state.notes.splice(Math.min(idx, state.notes.length), 0, n);
      try { if (cloudIsReady()) cloudUnmarkDeleted(CLOUD.delNotesKey, id); } catch {}
      save();
      renderNotes();
    },
  });
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

