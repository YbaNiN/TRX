/* TRX Panel — 02-ui-auth.js · toast/notifs, modales, command palette, Supabase, auth, demo, onboarding, tabs */
/* ===================== UI: Toast + Notifications ===================== */
function pushNotif({ title, message = "", type = "info" }) {
  const n = { id: uid(), title, message, type, ts: Date.now() };
  state.notifs.unshift(n);
  state.notifs = state.notifs.slice(0, 80);
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
function notifyDueSoon(task, daysLeft) {
  const title = daysLeft === 0 ? "Vence hoy" : `Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`;
  const message = `${task.category === "event" ? "Evento" : "Tarea"}: ${task.title}`;

  toast({ title, message, type: daysLeft <= 1 ? "warn" : "info", timeout: 4200 });

  // Notificación del sistema (si el usuario dio permiso)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      // Si hay SW activo, mejor vía SW
      if (navigator.serviceWorker?.getRegistration) {
        navigator.serviceWorker.getRegistration().then((reg) => {
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

function checkDueNotifications() {
  if (!state.tasks || state.tasks.length === 0) return;
  if (!state.dueNotifs) state.dueNotifs = {};

  const today = new Date();
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const t of state.tasks) {
    if (t.status === "done") continue;
    const end = parseISODate(t.endDate);
    if (!end) continue;

    const end0 = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const daysLeft = daysBetween(today0, end0);

    // Ventana de aviso: dentro de 7 días (incluido), pero no negativo
    if (daysLeft <= 7 && daysLeft >= 0) {
      const last = state.dueNotifs[t.id] || null;
      const stamp = toISODate(today0);
      if (last !== stamp) {
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
  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

function closeModal(result) {
  const m = $("#modal");
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
  if (modalResolve) {
    modalResolve(result);
    modalResolve = null;
  }
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
  if ($("#editColor")) $("#editColor").value = t.color && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#3b82f6";
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

function tasksForISODate(iso) {
  const d = parseISODate(iso);
  if (!d) return [];
  const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const out = [];

  for (const t of state.tasks) {
    const s = parseISODate(t.startDate);
    const e = parseISODate(t.endDate);
    if (!s || !e) continue;

    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);

    if (day0 >= s0 && day0 <= e0) {
      const starts = day0.getTime() === s0.getTime();
      const ends = day0.getTime() === e0.getTime();
      const point = starts ? "start" : ends ? "end" : "mid";
      out.push({ task: t, point });
    }
  }

  const pr = { high: 0, med: 1, low: 2 };
  out.sort(
    (a, b) =>
      (a.task.category === "event" ? 0 : 1) - (b.task.category === "event" ? 0 : 1) ||
      (pr[a.task.priority] ?? 9) - (pr[b.task.priority] ?? 9) ||
      (a.task.startTime || "").localeCompare(b.task.startTime || "") ||
      a.task.createdAt - b.task.createdAt
  );
  return out;
}

function openDayModal(iso) {
  const m = $("#dayModal");
  if (!m) return;
  dayModalISO = iso;

  const d = parseISODate(iso);
  const title = d ? d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : iso;
  $("#dayModalTitle").textContent = title;

  const list = $("#dayModalList");
  const items = tasksForISODate(iso);

  if (!items.length) {
    list.innerHTML = `<div class="muted">No hay tareas/eventos este día.</div>`;
  } else {
    list.innerHTML = items
      .map(({ task: t, point }) => {
        const badge = t.status;
        const typeTxt = t.category === "event" ? "Evento" : "Tarea";
        const span = t.startDate !== t.endDate ? `· Rango ${fmtISODate(t.startDate)} → ${fmtISODate(t.endDate)}` : "";
        const when =
          t.startTime || t.endTime ? `· ${t.startTime ? fmtTime(t.startTime) : ""}${t.startTime && t.endTime ? "→" : ""}${t.endTime ? fmtTime(t.endTime) : ""}` : "";
        const flag = point === "start" ? "Comienza" : point === "end" ? "Termina" : "En curso";
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
      })
      .join("");

    // bind click once via delegation
    if (!list.dataset.bound) {
      list.dataset.bound = "1";
      list.addEventListener("click", (e) => {
        const item = e.target.closest(".dayItem");
        if (!item) return;
        const id = item.dataset.id;
        const t = state.tasks.find((x) => x.id === id);
        if (t) {
          closeDayModal();
          openEdit(t);
        }
      });
    }
  }

  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
}

function closeDayModal() {
  const m = $("#dayModal");
  if (!m) return;
  dayModalISO = null;
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
}

function bindDayModal() {
  const m = $("#dayModal");
  if (!m || m.dataset.bound) return;
  m.dataset.bound = "1";
  $("#dayModalX")?.addEventListener("click", closeDayModal);
  $("#dayModalClose")?.addEventListener("click", closeDayModal);
  m.addEventListener("click", (e) => {
    if (e.target?.closest('[data-close-day="1"]')) closeDayModal();
  });
  document.addEventListener("keydown", (e) => {
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
    { name: "Ir a Resumen", desc: "Abrir resumen", key: "G", run: () => switchTab("overview") },
    { name: "Ir a Tareas", desc: "Abrir tareas", key: "G", run: () => switchTab("tasks") },
    { name: "Ir a Calendario", desc: "Abrir calendario", key: "G", run: () => switchTab("calendar") },
    { name: "Ir a Listas", desc: "Abrir listas", key: "G", run: () => switchTab("lists") },
    { name: "Ir a Temporizador", desc: "Abrir temporizador", key: "G", run: () => switchTab("timer") },
    { name: "Ir a Stats", desc: "Abrir estadísticas", key: "G", run: () => switchTab("stats"), admin: true },
    { name: "Cambiar Tema", desc: "Claro/Oscuro", key: "T", run: () => toggleTheme() },
    {
      name: "Activar notificaciones",
      desc: "Permitir avisos de vencimiento",
      key: "N",
      run: () => {
        if (!("Notification" in window)) return toast({ title: "No disponible", message: "Este navegador no soporta notificaciones.", type: "warn" });
        Notification.requestPermission().then((p) => {
          toast({ title: "Notificaciones", message: p === "granted" ? "Permiso concedido." : "Permiso denegado.", type: p === "granted" ? "ok" : "warn" });
        });
      },
    },
    { name: "Cambiar Densidad", desc: "Compacta/Normal", key: "D", run: () => toggleDensity() },
    { name: "Nueva tarea", desc: "Enfocar input y crear", key: "N", run: () => { switchTab("tasks"); setTimeout(() => $("#taskInput").focus(), 50); } },
    { name: "Notificaciones", desc: "Abrir panel", key: "B", run: () => openDrawer() },
    { name: "Cerrar sesión", desc: "Salir de la sesión", key: "L", run: () => logoutFlow() },
  ];

  const isAdmin = state.session?.role === "admin";
  cmdkItems = base
    .filter((x) => !x.admin || isAdmin)
    .filter((x) => (x.name + " " + x.desc).toLowerCase().includes((q || "").trim().toLowerCase()));

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
    row.addEventListener("click", () => {
      it.run();
      closeCmdk();
    });
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

/* ===================== Supabase init ===================== */
async function initSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return supabaseClient;
  } catch (e) {
    console.warn("Supabase init error", e);
    return null;
  }
}

async function fetchProfileForUser(user) {
  const sb = await initSupabaseClient();
  if (!sb || !user?.id) {
    const email = user?.email || "";
    return { username: email.split("@")[0] || "usuario", role: "user" };
  }
  const { data, error } = await sb.from("profiles").select("username,display_name,role").eq("id", user.id).maybeSingle();
  if (error) console.warn("Profile fetch error", error);
  const email = user.email || "";
  return {
    username: data?.display_name || data?.username || (email.split("@")[0] || "usuario"),
    role: data?.role || "user",
  };
}

async function applySupabaseSession(user, opts = {}) {
  if (!user) return false;
  const profile = await fetchProfileForUser(user);
  setSession(profile.username, profile.role, user.email || "");
  try {
    cloudSetUser(user);
    cloudBootstrap();
  } catch {}
  if (opts.toastMessage) {
    toast({ title: "Bienvenido", message: opts.toastMessage, type: "ok" });
  }
  return true;
}

function setAuthMode(mode) {
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
  if (email) email.autocomplete = "email";
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
  const isGuest = role === "guest";
  // Notas y Stats quedan disponibles para todos los usuarios.
  // El sistema de roles se mantiene para futuras secciones exclusivas de admin.
  $$(".tab").forEach((t) => {
    const req = t.getAttribute("data-requires-role");
    if (!req) return;

    const tabId = t.getAttribute("data-tab");
    const allowForAll = tabId === "notes" || tabId === "stats";
    const ok = allowForAll ? true : req === role;

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

  // El botón de reinicio global solo para admin (nunca invitado)
  $("#btnReset").style.display = (isAdmin && !isGuest) ? "inline-flex" : "none";
}

function setSession(username, role, email = "") {
  state.session = { u: username, role, email, ts: Date.now() };
  localStorage.setItem(LS.session, JSON.stringify(state.session));
  $("#who").textContent = `${username} (${role})`;
  lockByRole(role);
  showGate(false);
  switchTab("overview");
  toast({ title: "Sesión iniciada", message: `${username} conectado`, type: "ok" });
  try {
    scheduleInstallUIAfterLogin();
  } catch {}
  try { maybeShowOnboarding(); } catch {}
}

/* ===================== Datos demo + Modo invitado ===================== */
function demoSeedData() {
  const today = new Date();
  const iso = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return toISODate(d);
  };
  const tasks = [
    { title: "Bienvenido a TRX 👋 — toca para ver el detalle", priority: "high", status: "todo", category: "task", tags: ["intro"], startDate: iso(0), endDate: iso(0), color: "#2b6cff" },
    { title: "Arrastra tareas entre columnas en Kanban", priority: "med", status: "doing", category: "task", tags: ["tip"], startDate: iso(0), endDate: iso(1), color: "#66e3a8" },
    { title: "Revisar informe mensual", priority: "med", status: "todo", category: "task", tags: ["trabajo"], startDate: iso(2), endDate: iso(2) },
    { title: "Reunión de equipo", priority: "high", status: "todo", category: "event", tags: ["trabajo"], startDate: iso(1), endDate: iso(1), startTime: "10:00", endTime: "11:00", color: "#f59e0b" },
    { title: "Clase de guitarra", priority: "low", status: "todo", category: "event", tags: ["música"], startDate: iso(3), endDate: iso(3), startTime: "18:00", endTime: "19:00" },
    { title: "Primera tarea completada ✓", priority: "low", status: "done", category: "task", tags: ["intro"], startDate: iso(-1), endDate: iso(-1) },
  ].map((t) => normalizeTask({ id: uid(), createdAt: Date.now(), ...t }));

  const notes = [
    { id: uid(), text: "Estas son notas tipo post-it. Fija las importantes con el icono ★.", pinned: true, createdAt: Date.now() },
    { id: uid(), text: "Usa ⌘K (o el botón) para buscar y ejecutar acciones rápido.", pinned: false, createdAt: Date.now() - 1000 },
  ];

  return { tasks, notes };
}

// Entra en modo invitado: datos demo en memoria, todo de solo lectura.
function enterGuestMode() {
  state.guest = true;
  const seed = demoSeedData();
  state.tasks = seed.tasks;
  state.notes = seed.notes;
  state.lists = [];
  state.listItems = {};
  state.session = { u: "Invitado", role: "guest", email: "", ts: Date.now() };

  $("#who").textContent = "Invitado (demo)";
  lockByRole("guest");
  showGate(false);
  document.body.classList.add("isGuest");
  switchTab("overview");
  renderAll();
  showGuestBanner();
  toast({ title: "Modo invitado", message: "Explora la demo. Crea una cuenta para guardar.", type: "info", timeout: 3600 });
}

// Sale del modo invitado y vuelve al login (sin tocar la nube).
function exitGuestMode() {
  state.guest = false;
  state.session = null;
  state.tasks = [];
  state.notes = [];
  document.body.classList.remove("isGuest");
  hideGuestBanner();
  showGate(true);
}

function showGuestBanner() {
  if ($("#guestBanner")) return;
  const bar = document.createElement("div");
  bar.id = "guestBanner";
  bar.className = "guestBanner";
  bar.innerHTML = `
    <span class="guestBannerText">Estás en modo invitado (demo). Los cambios no se guardan.</span>
    <button type="button" id="guestSignupBtn" class="btn primary sm">Crear cuenta</button>
  `;
  document.body.appendChild(bar);
  $("#guestSignupBtn").addEventListener("click", () => {
    exitGuestMode();
    setAuthMode("register");
  });
}
function hideGuestBanner() {
  $("#guestBanner")?.remove();
}

/* ===================== Onboarding ===================== */
const ONBOARD_KEY = "trx_onboarded_v1";
function maybeShowOnboarding() {
  try {
    if (localStorage.getItem(ONBOARD_KEY)) return;
  } catch {}
  if (state.guest) return; // los invitados ya ven el banner de demo
  showOnboarding();
}
function showOnboarding() {
  if ($("#onboard")) return;
  const ov = document.createElement("div");
  ov.id = "onboard";
  ov.className = "onboard";
  ov.innerHTML = `
    <div class="onboardCard" role="dialog" aria-modal="true" aria-labelledby="onboardTitle">
      <div class="onboardHead">
        <img src="icons/mi-logo.png" alt="" class="logoImg" />
        <div>
          <h2 id="onboardTitle">Bienvenido a TRX Panel</h2>
          <p class="muted">Tu panel de tareas, calendario y productividad.</p>
        </div>
      </div>
      <ul class="onboardList">
        <li><span class="ob-ic">✓</span><div><strong>Tareas y Kanban</strong><br><span class="muted">Crea tareas con prioridad, fechas, tags y colores.</span></div></li>
        <li><span class="ob-ic">📅</span><div><strong>Calendario y Agenda</strong><br><span class="muted">Visualiza todo por fechas, ideal en el móvil.</span></div></li>
        <li><span class="ob-ic">⏱</span><div><strong>Temporizador y Pomodoro</strong><br><span class="muted">Concéntrate con cuentas atrás configurables.</span></div></li>
        <li><span class="ob-ic">▦</span><div><strong>Estadísticas</strong><br><span class="muted">Mira tu progreso y tu racha de actividad.</span></div></li>
      </ul>
      <div class="onboardActions">
        <button type="button" id="onboardStart" class="btn primary">Empezar</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  const close = () => {
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch {}
    ov.classList.add("leaving");
    setTimeout(() => ov.remove(), 220);
  };
  $("#onboardStart").addEventListener("click", close);
}

async function clearSession() {
  try {
    const sb = await initSupabaseClient();
    if (sb) await sb.auth.signOut();
  } catch (e) {
    console.warn("Supabase signOut error", e);
  }
  state.session = null;
  state.guest = false;
  document.body.classList.remove("isGuest");
  hideGuestBanner();
  cloudUserId = null;
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
  }
  localStorage.removeItem(LS.session);
  $("#who").textContent = "";
  showGate(true);
  switchTab("overview");
  toast({ title: "Sesión cerrada", message: "Acceso finalizado", type: "info" });
}

function authErrorMessage(error, mode = "login") {
  const raw = (error?.message || error?.error_description || error || "").toString();
  const msg = raw.toLowerCase();
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return mode === "login" ? "Correo o contraseña incorrectos. Inicia sesión con tu EMAIL (no con nombre de usuario)." : "No se pudo crear la cuenta con esas credenciales.";
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
  if (!sb) return { ok: false, error: "Supabase no está configurado" };
  const e = (email || "").trim().toLowerCase();
  const p = password || "";
  const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p });
  if (error) return { ok: false, error: authErrorMessage(error, "login") };
  if (!data?.user) return { ok: false, error: "Sesión no disponible" };
  await applySupabaseSession(data.user, { toastMessage: "Acceso concedido" });
  return { ok: true };
}

async function tryRegister(name, email, password) {
  const sb = await initSupabaseClient();
  if (!sb) return { ok: false, error: "Supabase no está configurado" };
  const displayName = String(name || "").trim();
  const e = (email || "").trim().toLowerCase();
  const p = password || "";
  if (displayName.length < 2) return { ok: false, error: "Pon un nombre de al menos 2 caracteres" };
  if (p.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };

  const { data, error } = await sb.auth.signUp({
    email: e,
    password: p,
    options: { data: { username: displayName } },
  });
  if (error) return { ok: false, error: authErrorMessage(error, "register") };

  if (data?.user && data?.session) {
    try {
      await sb.from("profiles").update({ username: displayName, display_name: displayName }).eq("id", data.user.id);
    } catch {}
    await applySupabaseSession(data.user, { toastMessage: "Cuenta creada" });
    return { ok: true, registered: true };
  }

  return { ok: true, registered: true, needsEmailConfirm: true };
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

  // cerrar modales/overlays de tareas al cambiar de pestaña
  const taskCreatePanel = document.getElementById("taskCreatePanel");
  const taskControlsPanel = document.getElementById("taskControlsPanel");
  const tasksOverlay = document.getElementById("tasksOverlay");
  if (taskCreatePanel) taskCreatePanel.classList.remove("open");
  if (taskControlsPanel) taskControlsPanel.classList.remove("open");
  if (tasksOverlay) tasksOverlay.hidden = true;

  if (id === "tasks") {
    showTasksSkeleton();
    setTimeout(() => {
      hideTasksSkeleton();
      renderAll();
    }, 220);
  }
  if (id === "stats") {
    showStatsSkeleton();
    setTimeout(() => {
      hideStatsSkeleton();
      redrawChartsIfVisible();
    }, 260);
  }
  if (id === "timer") {
    setTimeout(() => {
      renderTimerUI(true);
    }, 20);
  }
  if (id === "agenda") {
    setTimeout(() => {
      renderAgenda();
    }, 10);
  }
  if (id === "lists") {
    setTimeout(() => {
      renderLists();
    }, 10);
  }
}

