import { useTheme } from "@/providers/ThemeProvider";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle colour theme"
      className="flex items-center justify-center rounded-full transition-colors hover:text-lav"
      style={{
        width: 38,
        height: 38,
        background: "var(--surface)",
        border: "1px solid var(--nav-border)",
        color: "var(--text-3)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
    </button>
  );
}
