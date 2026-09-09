/* TRX visual primitives. Small geometric icons share one stroke and viewBox. */
const TRX_ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 12 3 3 5-6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m4 0h2m-8 3h2"/>',
  rows: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  board: '<rect x="3" y="4" width="5" height="15" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  note: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9ZM14 3v7h7M7 14h9M7 17h6"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l3 2M9 2h6m-3 0v4m6 1 2-2"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8v-6"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4m-3 14h2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  flame: '<path d="M12 2c1 6 7 6 7 12a7 7 0 1 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4 2-2 2-5 1-9Z"/>',
  leaf: '<path d="M20 3C8 2 2 6 5 15c9 4 16-2 15-12ZM3 21l12-12"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pin: '<path d="m8 3 8 0-1 7 4 4H5l4-4ZM12 14v8"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13"/>',
  grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
};
function trxIcon(name, cls = '') {
  return `<svg class="uiIcon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRX_ICONS[name] || TRX_ICONS.check}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = trxIcon(el.dataset.icon); });
}
function taskColorMarker(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || ''))
    ? `<span class="taskColorDot" style="background-color:${color}" role="img" aria-label="Color ${color}" title="Color ${color}"></span>` : '';
}
