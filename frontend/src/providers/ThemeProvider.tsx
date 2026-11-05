import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type Ctx = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void };

const ThemeContext = createContext<Ctx | null>(null);

function initial(): Theme {
  const saved = localStorage.getItem("poincare-theme");
  if (saved === "light" || saved === "dark") return saved;
  return "light"; // light is the default; the user can switch to dark and it's remembered
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("poincare-theme", theme);
    // Browser chrome (mobile address bar, PWA title bar) follows the page background.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#16131f" : "#f4f1f9");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
