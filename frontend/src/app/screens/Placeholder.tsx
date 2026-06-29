import { Mark } from "@/components/brand/Logo";

export function ComingTogether({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: "calc(100vh - 64px)" }}>
      <div className="anim-floaty">
        <Mark size={52} />
      </div>
      <h2 className="font-display mt-6" style={{ fontWeight: 700, fontSize: 24, color: "var(--text)" }}>
        {title}
      </h2>
      <p className="mt-2 max-w-sm" style={{ color: "var(--text-3)", fontSize: 14, lineHeight: 1.6 }}>
        {blurb}
      </p>
    </div>
  );
}
