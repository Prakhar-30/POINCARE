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
  plus: <path d="M12 5v14M5 12h14" />,
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
