// Small inline icons. Decorative: the buttons that use them carry their own text label.

type IconProps = { size?: number };

function svg(size: number) {
  return { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

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
export const HomeIcon = ({ size = 24 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M12 3 3 10.5V21h6.2v-6h5.6v6H21V10.5L12 3Z" /></svg>
);
export const SearchIcon = ({ size = 24 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 5 5" />
  </svg>
);
export const SettingsIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M4 7h9M19 7h1M4 12h3M12 12h8M4 17h11M20 17h0" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="9.5" cy="12" r="2.2" />
    <circle cx="17.5" cy="17" r="2.2" />
  </svg>
);
export const ExternalIcon = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const LibraryIcon = ({ size = 24 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor"><path d="M4 4h3.5v16H4zM9.5 4H13v16H9.5zM15 5.2l3.4-.9 3 14.5-3.4.9z" /></svg>
);

/** A heart: outline when not liked, filled when liked. */
export const HeartIcon = ({ size = 20, filled = false }: IconProps & { filled?: boolean }) => (
  <svg {...svg(size)} {...line} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5s-7.2-4.4-9.4-9.3C1.2 8 3 5 6.2 5c2 0 3.6 1.1 5.8 3.4C14.2 6.1 15.8 5 17.8 5c3.2 0 5 3 3.6 6.2-2.2 4.9-9.4 9.3-9.4 9.3Z" />
  </svg>
);
/** Three dots, one above the other: "more options". */
export const MoreIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)} fill="currentColor">
    <circle cx="12" cy="5" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="12" cy="19" r="1.9" />
  </svg>
);
/** Lines of text: "lyrics". */
export const LyricsIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M4 6h16M4 11h16M4 16h10" />
  </svg>
);
export const ChevronRightIcon = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="m9 6 6 6-6 6" /></svg>
);
export const ChevronLeftIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="m15 6-6 6 6 6" /></svg>
);
export const ChevronDownIcon = ({ size = 24 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="m6 9 6 6 6-6" /></svg>
);
export const ShareIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" /></svg>
);
/** A list with a plus: "add to list". */
export const ListPlusIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="M4 7h11M4 12h7M4 17h7M17 13v8M13 17h8" /></svg>
);
/** A screen on a stand: "Stage mode". */
export const StageIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);
export const CloseIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const CheckIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)} {...line}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const ShuffleIcon = ({ size = 22 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);
/** The repeat arrows; with `one` a small 1 sits in the middle. */
export const RepeatIcon = ({ size = 22, one = false }: IconProps & { one?: boolean }) => (
  <svg {...svg(size)} {...line}>
    <path d="m17 2 4 4-4 4M3 12v-2a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 12v2a4 4 0 0 1-4 4H3" />
    {one ? <path d="m10.5 10.5 1.5-1v6" strokeWidth="1.8" /> : null}
  </svg>
);
export const FilterIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </svg>
);
export const PlusIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const ListIcon = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)} {...line}>
    <path d="M3 6h12M3 12h12M3 18h8M18 14v8M14 18h8" />
  </svg>
);
// The six small pictures behind the Explore tiles (sun, note, book, cross, people, smile), drawn large and faint.
export const TileIcon = ({ index, size = 60 }: { index: number; size?: number }) => {
  const props = { ...svg(size), fill: 'none', stroke: 'rgba(255,255,255,0.34)', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (((index % 6) + 6) % 6) {
    case 0:
      return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>;
    case 1:
      return <svg {...props}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
    case 2:
      return <svg {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
    case 3:
      return <svg {...props}><path d="M12 2v20M5 8h14" /></svg>;
    case 4:
      return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>;
  }
};
