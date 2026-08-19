function svg(paths, extra = "") {
  return (cls = "") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${extra}</svg>`;
}

export const icons = {
  dashboard: svg('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'),
  transactions: svg('<path d="M7 3 3 7l4 4"/><path d="M3 7h13a4 4 0 0 1 4 4v1"/><path d="M17 21l4-4-4-4"/><path d="M21 17H8a4 4 0 0 1-4-4v-1"/>'),
  wallet: svg('<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-4a2 2 0 1 0 0 4h5"/>'),
  handCoins: svg('<circle cx="8" cy="8" r="5"/><path d="M13 15l3 3 6-6"/><path d="M3 19c1-2 3-3 5-3s3.5.5 5 2"/>'),
  receipt: svg('<path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-3 2-3-2-3 2-3-2V3a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6"/>'),
  pie: svg('<path d="M21.2 15.2A10 10 0 1 1 12 2v10z"/>'),
  store: svg('<path d="M3 9l1-5h16l1 5"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/>'),
  hardHat: svg('<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><path d="M12 8v3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  bar: svg('<path d="M4 20V10M12 20V4M20 20v-7"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  arrows: svg('<path d="M7 3 3 7l4 4"/><path d="M3 7h13a4 4 0 0 1 4 4v1"/><path d="M17 21l4-4-4-4"/><path d="M21 17H8a4 4 0 0 1-4-4v-1"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  down: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v6l3 3"/>'),
  up: svg('<circle cx="12" cy="12" r="10"/><path d="M8 12l4-4 4 4"/><path d="M12 8v8"/>'),
  trendUp: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  trendDown: svg('<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'),
  piggy: svg('<path d="M19 9a3 3 0 0 0-3-3H8a5 5 0 0 0-5 5v1a2 2 0 0 0 2 2h1"/><path d="M6 14v3M18 14v3"/><path d="M2 12h2"/><circle cx="16" cy="8" r=".5" fill="currentColor"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
  download: svg('<path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>'),
  pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  rotateCcw: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  languages: svg('<path d="M4 5h9M7 3v2m0 0c0 4-2 7-5 9m3-4c1 1 3 2 5 2"/><path d="M14 21l4-9 4 9"/><path d="M15.5 18h5"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  wifiOff: svg('<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 6 0"/><path d="M5 12.5a10 10 0 0 1 3-2.2M19 12.5a10 10 0 0 0-3.2-2.4"/><path d="M2 8.5a15 15 0 0 1 4.5-3"/><path d="M22 8.5a15 15 0 0 0-6-3.5"/><circle cx="12" cy="20" r="1" fill="currentColor"/>'),
  check: svg('<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>'),
  alert: svg('<path d="M12 9v4"/><circle cx="12" cy="16.5" r=".5" fill="currentColor"/><path d="M10.3 3.9 2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.7 1.7 0 0 0-3.4 0z"/>'),
  xcircle: svg('<circle cx="12" cy="12" r="10"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  phone: svg('<path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2z"/>'),
  calendarPlus: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M12 13v6M9 16h6"/>'),
  rupee: svg('<path d="M6 3h11M6 8h11M6 3c4 0 6 2 6 5s-2 5-6 5h-1l7 8"/>'),
  shield: svg('<path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/>'),
  shieldOff: svg('<path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/><path d="M2 2l20 20"/>'),
  userPlus: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M22 11h-6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M2 2l20 20"/><path d="M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.6 13.6 0 0 1-3.1 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/>'),
  backup: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
};

export function iconHtml(name, cls = "") {
  const fn = icons[name];
  return fn ? fn(cls) : "";
}
