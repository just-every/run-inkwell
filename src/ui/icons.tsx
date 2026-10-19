// The app's line icons, drawn on a 24 px grid in the current text colour.
const paths = {
  envelope: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  movein: <><path d="M12 4v10M8 10l4 4 4-4" /><path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14" /></>,
  archive: <><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" /><path d="M5 9v8.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V9M10 13h4" /></>,
  agent: <><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8l1.6 2.3 2.8-.4.9 2.6 2.6 1-.4 2.8 2.3 1.6-2.3 1.6.4 2.8-2.6 1-.9 2.6-2.8-.4L12 21.2l-1.6-2.3-2.8.4-.9-2.6-2.6-1 .4-2.8L2.2 12l2.3-1.6-.4-2.8 2.6-1 .9-2.6 2.8.4z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  document: <><path d="M7 3.5h7l4.5 4.5v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" /><path d="M13.5 3.5V8.5h5M9 12.5h6M9 16h4" /></>,
  back: <path d="M19 12H6M11 7l-5 5 5 5" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
  pen: <path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8zM13.5 7l3.5 3.5" />,
  chart: <><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.7 2.7L16 9.6" /></>,
}
export type IconName = keyof typeof paths
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="iw-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
