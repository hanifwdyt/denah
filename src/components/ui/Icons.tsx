import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const ICursor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3l6 17 2.5-6.5L20 11 5 3z" />
  </svg>
);

export const IWall = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 17l8-11 10 8" />
    <circle cx="3" cy="17" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="11" cy="6" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="21" cy="14" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IDoor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 20V4h9v16" />
    <path d="M14 4a6 6 0 0 1 6 6v10" opacity="0.5" />
    <path d="M3 20h18" />
  </svg>
);

export const IWindow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" rx="1" />
    <path d="M12 5v14M4 12h16" />
  </svg>
);

export const IPan = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v8M12 11V7m0 4c0-1 1.5-1.5 1.5 0v3m0-3c0-1 2-1 2 .5V16a4 4 0 0 1-4 4H10a4 4 0 0 1-3.2-1.6L4 14.5c-.7-1 .6-2.2 1.6-1.4L8 15" />
  </svg>
);

export const IUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
  </svg>
);

export const IRedo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15 7l5 5-5 5" />
    <path d="M20 12H9a5 5 0 0 0 0 10h1" />
  </svg>
);

export const ITrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7" />
  </svg>
);

export const IGrid = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
  </svg>
);

export const IMagnet = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 4v7a6 6 0 0 0 12 0V4" />
    <path d="M6 8h4M14 8h4" />
  </svg>
);

export const IRuler = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="8" width="19" height="8" rx="1" transform="rotate(0)" />
    <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
  </svg>
);

export const ISpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </svg>
);

export const ICube = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 2.5l8.5 5v9L12 21.5 3.5 16.5v-9L12 2.5z" />
    <path d="M3.5 7.5L12 12.5l8.5-5M12 12.5v9" />
  </svg>
);

export const IFurniture = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
    <path d="M3 13a2 2 0 0 1 2 2v2h14v-2a2 2 0 0 1 2-2 2 2 0 0 1 2 2v0M3 13a2 2 0 0 0-2 2M3 13v4m18 0v2M3 17v2" />
    <path d="M7 11h10" />
  </svg>
);

export const ISave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v6h7M8 21v-7h8v7" />
  </svg>
);

export const IOpen = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v3H3z" />
    <path d="M3 12h18l-2 7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1l-2-7z" />
  </svg>
);

export const IExport = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 15V3m0 0l-4 4m4-4l4 4" />
    <path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
  </svg>
);

export const IRotate = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v4h-4" />
  </svg>
);

export const IZone = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 8l8-4 8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4 8-4V8" opacity="0.55" />
    <path d="M12 12v8" opacity="0.55" />
  </svg>
);

export const IPanel = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M15 4v16" />
  </svg>
);

export const IClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IPlan = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <path d="M3 9h7V3M14 21v-6h7M10 9v12" />
  </svg>
);

export const ILabel = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 5h11l5 7-5 7H4z" />
    <path d="M8 12h0.01M11 12h0.01" />
  </svg>
);

export const IHelp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2.2-2.6 4" />
    <path d="M12 17h0.01" />
  </svg>
);

export const ILegend = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M7 9h2M7 13h2M7 17h2M12 9h5M12 13h5M12 17h5" />
  </svg>
);

export const IPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const ILayers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" opacity="0.55" />
  </svg>
);

export const IFlipH = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v18" />
    <path d="M8 7L4 12l4 5z" />
    <path d="M16 7l4 5-4 5z" opacity="0.55" />
  </svg>
);

export const ISwing = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 20V4h6" />
    <path d="M11 4a9 9 0 0 1 9 9" opacity="0.6" />
    <path d="M5 20h15" />
  </svg>
);

export const IWarn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4M12 17h0.01" />
  </svg>
);

export const IVector = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="4" height="4" rx="0.5" />
    <rect x="17" y="17" width="4" height="4" rx="0.5" />
    <path d="M7 5h6a4 4 0 0 1 4 4v8" />
  </svg>
);

export const IPencil = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 4l6 6L9 21l-6 1 1-6L14 4z" />
    <path d="M12.5 5.5l6 6" />
  </svg>
);

export const IUser = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </svg>
);
