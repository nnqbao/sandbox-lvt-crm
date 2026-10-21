function NavGlyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const NAV_ICONS = {
  reports: () => (
    <NavGlyph>
      <path d="M4 19.5V9.5" />
      <path d="M10 19.5V4.5" />
      <path d="M16 19.5v-7" />
      <path d="M22 19.5H2" />
    </NavGlyph>
  ),
  notifications: () => (
    <NavGlyph>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </NavGlyph>
  ),
  chat: () => (
    <NavGlyph>
      <path d="M5 16.5 3.5 20.5 8 18.2A8.2 8.2 0 1 0 5 16.5z" />
    </NavGlyph>
  ),
  duties: () => (
    <NavGlyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </NavGlyph>
  ),
  work: () => (
    <NavGlyph>
      <path d="M8.5 4.5h7l.8 2H20a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 20 21.5H4A1.5 1.5 0 0 1 2.5 20V8a1.5 1.5 0 0 1 1.5-1.5h3.7z" />
      <path d="m8.5 13.5 2.2 2.2 4.8-5" />
    </NavGlyph>
  ),
  homeroom: () => (
    <NavGlyph>
      <path d="M4 11.2 12 4.5l8 6.7" />
      <path d="M6.5 10.5V20.5h11V10.5" />
      <path d="M10 20.5v-5h4v5" />
    </NavGlyph>
  ),
  attendance: () => (
    <NavGlyph>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="m8.8 13.2 2.2 2.2 4.4-4.6" />
    </NavGlyph>
  ),
  'people-review': () => (
    <NavGlyph>
      <circle cx="9" cy="8.2" r="3" />
      <path d="M3.6 19.4c.9-3.2 2.8-4.8 5.4-4.8 1.2 0 2.2.3 3.1.9" />
      <path d="m16.8 10.2.9 2.1h2.2l-1.8 1.4.7 2.2-2-1.4-2 1.4.7-2.2-1.8-1.4h2.2z" />
    </NavGlyph>
  ),
  'staff-faults': () => (
    <NavGlyph>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 8.2v4.6" />
      <path d="M12 16.6h.01" />
    </NavGlyph>
  ),
  profile: () => (
    <NavGlyph>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c1.2-3.6 3.5-5.3 7-5.3s5.8 1.7 7 5.3" />
    </NavGlyph>
  ),
  users: () => (
    <NavGlyph>
      <circle cx="9" cy="8" r="2.8" />
      <path d="M3.6 19c1-3.2 2.9-4.7 5.4-4.7s4.4 1.5 5.4 4.7" />
      <circle cx="16.4" cy="8.6" r="2.2" />
      <path d="M15.2 14.4c2.2 0 3.9 1.2 4.8 3.8" />
    </NavGlyph>
  ),
  departments: () => (
    <NavGlyph>
      <path d="M4.5 20.5V8.4L12 4.5l7.5 3.9v12.1z" />
      <path d="M9.4 20.5v-5.2h5.2v5.2" />
      <path d="M9.5 11h.2M12 11h.2M14.5 11h.2M9.5 14h.2M12 14h.2M14.5 14h.2" />
    </NavGlyph>
  ),
  roles: () => (
    <NavGlyph>
      <path d="M12 3.5 19.5 7v5.2c0 4.4-3.1 7.4-7.5 8.8-4.4-1.4-7.5-4.4-7.5-8.8V7z" />
      <path d="m9.2 12.2 1.9 1.9 3.7-3.8" />
    </NavGlyph>
  ),
  positions: () => (
    <NavGlyph>
      <rect x="3.5" y="6.5" width="17" height="12.5" rx="2" />
      <circle cx="9" cy="12.7" r="2.2" />
      <path d="M13.2 11.2h5M13.2 14.4h3.6" />
    </NavGlyph>
  ),
  'school-years': () => (
    <NavGlyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      <path d="m12 12.4.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
    </NavGlyph>
  ),
  'display-settings': () => (
    <NavGlyph>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.1" />
      <circle cx="15" cy="16" r="2.1" />
    </NavGlyph>
  ),
  'design-library': () => (
    <NavGlyph>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <circle cx="17" cy="17" r="3.5" />
    </NavGlyph>
  ),
};

function fallbackIcon() {
  return (
    <NavGlyph>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </NavGlyph>
  );
}

export function navIconFor(id) {
  return (NAV_ICONS[id] || fallbackIcon)();
}
