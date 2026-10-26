// Small inline icons. Decorative: the buttons that use them carry their own text label.

type IconProps = { size?: number };

function svg(size: number) {
  return { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
}

export const PlayIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
);
export const PauseIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
);
export const NextIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M6 5.5v13l9-6.5-9-6.5ZM16.5 5H19v14h-2.5z" /></svg>
);
export const PrevIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M18 5.5v13L9 12l9-6.5ZM5 5h2.5v14H5z" /></svg>
);
export const HomeIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M12 3 3 10.5V21h6.2v-6h5.6v6H21V10.5L12 3Z" /></svg>
);
export const SearchIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>
);
export const SettingsIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h9M19 7h1M4 12h3M12 12h8M4 17h11M20 17h0" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="9.5" cy="12" r="2.2" />
    <circle cx="17.5" cy="17" r="2.2" />
  </svg>
);
export const ExternalIcon = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
