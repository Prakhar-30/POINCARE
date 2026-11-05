import { useTheme } from "@/providers/ThemeProvider";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className="icon-btn rounded-full"
      style={{ borderRadius: 999, boxShadow: "var(--shadow-sm)" }}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={17} aria-hidden="true" />
    </button>
  );
}
