// Line icons the cards use, drawn on a 24 px grid with a 1.8 px stroke in currentColor.

const Icon = ({ d }: { d: string }) => <svg className="ik-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export const DocIcon = () => <Icon d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 15.5h5M10 9h2" />
export const SheetIcon = () => <Icon d="M7 3h7l4 4v14H7zM14 3v4h4M9.5 11h6M9.5 14h6M9.5 17h4" />
export const BuildingIcon = () => <Icon d="M6 21V5l6-2v18M12 8h6v13M4 21h16M8.5 8h1M8.5 11h1M8.5 14h1M14.5 11h1M14.5 14h1M14.5 17h1" />
export const FolderIcon = () => <Icon d="M3 7.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-8l-2-2.5H4a1 1 0 0 0-1 1z" />
export const MailIcon = () => <Icon d="M3.5 6h17v12h-17zM3.8 6.4l8.2 6.4 8.2-6.4" />
export const CalendarIcon = () => <Icon d="M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4" />
export const ChatIcon = () => <Icon d="M12 4.5c4.7 0 8.5 3 8.5 6.8S16.7 18 12 18c-1 0-2-.1-2.8-.4L4.5 19.5l1.3-3.6C4.4 14.7 3.5 13 3.5 11.3 3.5 7.5 7.3 4.5 12 4.5z" />
export const WarnIcon = () => <Icon d="M12 4l9 16H3zM12 10v4.5M12 17.2v.3" />
export const InfoIcon = () => <Icon d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.8v.3" />
export const BellIcon = () => <Icon d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4" />
export const BellOffIcon = () => <Icon d="M6 16.5V11a6 6 0 0 1 9.5-4.9M18 11v5.5l1.5 1.5H8M10 20.5h4M4 4l16 16" />
export const RepeatIcon = () => <Icon d="M4.5 10.5A7 7 0 0 1 17 7l2 2M19.5 13.5A7 7 0 0 1 7 17l-2-2M19 4.5V9h-4.5M5 19.5V15h4.5" />
export const ClockIcon = () => <Icon d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2" />
export const StopIcon = () => <Icon d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM6 6l12 12" />
export const EyeIcon = () => <Icon d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
