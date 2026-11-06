import type { ReactNode, SVGProps } from "react";

// A small, consistent line-icon set (stroke 1.7, round caps) so we never reach for emoji.
const paths: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </>
  ),
  swap: (
    <>
      <path d="M7 4 4 7l3 3" />
      <path d="M4 7h13" />
      <path d="M17 20l3-3-3-3" />
      <path d="M20 17H7" />
    </>
  ),
  pool: (
    <>
      <path d="M12 3c4 4.5 6 7.5 6 10.5A6 6 0 0 1 6 13.5C6 10.5 8 7.5 12 3Z" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-4" />
      <path d="M12 16V8" />
      <path d="M16 16v-6" />
      <path d="M20 16v-9" />
    </>
  ),
  brain: (
    <>
      <path d="M4 9v6" />
      <path d="M4 12c2 1.5 3 3 8 3s6-1.5 8-3c-2-1.5-3-3-8-3S6 10.5 4 12Z" />
      <path d="M12 9V6" />
      <path d="M12 18v-3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M7 7l2.5 2.5M14.5 14.5 17 17M17 7l-2.5 2.5M9.5 14.5 7 17" />
    </>
  ),
  wave: (
    <>
      <path d="M3 12c2-4 3 4 5 0s3 4 5 0 3 4 5 0" />
    </>
  ),
  gauge: (
    <>
      <path d="M5 18a8 8 0 1 1 14 0" />
      <path d="M12 14l4-3" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  moon: <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </>
  ),
  check: <path d="M5 12l4 4L19 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.6 3.3M6.6 7.6C3.9 9.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  pause: (
    <>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19h16" />
      <path d="M4 15l5-5 4 3 7-7" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5Z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  curve: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M5 18C9 18 9 7 19 6" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  // the GitHub mark (Simple Icons, CC0), filled like xSocial
  github: (
    <path
      d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4 18.3 4.3 18.3 4.3c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"
      fill="currentColor"
      stroke="none"
    />
  ),
  xSocial: (
    <path
      d="M4 4h3.6l4.7 6.2L17.6 4H20l-6.5 7.6L20.5 20h-3.6l-5-6.6L6.2 20H3.8l7-8.1L4 4Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  spinner: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </>
  ),
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
