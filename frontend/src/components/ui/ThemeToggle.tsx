import { useTheme } from "@/providers/ThemeProvider";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle colour theme"
      className="flex items-center justify-center shrink-0 transition-colors hover:text-lav"
      style={{
        width: 36,
        height: 36,
        borderRadius: "var(--r-sm)",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-3)",
      }}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}
