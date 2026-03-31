import { useEffect } from "react";
import { useAtom } from "jotai";
import { themeAtom } from "@/hooks/atoms/workspace";

const THEMES = [
  { id: "default", label: "Vibe Dark" },
  { id: "opencode", label: "OpenCode" },
  { id: "cursor", label: "Cursor" },
  { id: "tokyonight", label: "Tokyo Night" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "nord", label: "Nord" },
  { id: "aura", label: "Aura" },
];

export function ThemeSelector() {
  const [theme, setTheme] = useAtom(themeAtom);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // A minimalist dropdown to switch themes
  return (
    <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        className="h-6 text-[11px] bg-transparent text-ide-text-dim border border-transparent hover:border-ide-border hover:bg-ide-surface-2 rounded outline-none px-1.5 cursor-pointer transition-colors"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id} className="bg-ide-surface text-ide-text">
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
