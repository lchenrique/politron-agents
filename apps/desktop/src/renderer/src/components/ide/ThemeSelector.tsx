import { useTheme } from "@/components/theme-provider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

const THEMES = [
    { id: "default", label: "Vibe Dark" },
    { id: "cafeine", label: "Cafeine" },
    { id: "candyland", label: "Candy Land" },
    { id: "claude", label: "Claude" },
];

export function ThemeSelector() {
    const { theme, setTheme, mode, setMode } = useTheme();

    const toggleMode = () => {
        setMode(mode === "dark" ? "light" : "dark");
    };

    return (
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="h-7 w-[120px] text-[10px] uppercase tracking-wider font-bold border-border/10  transition-colors focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Tema" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border/50 shadow-xl">
                    {THEMES.map((t) => (
                        <SelectItem
                            key={t.id}
                            value={t.id}
                            className="text-[11px] font-medium"
                        >
                            {t.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button
                variant="ghost"
                size="icon"
                onClick={toggleMode}
                className="h-7 w-7 rounded-sm hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-all duration-300"
            >
                {mode === "dark" ? (
                    <Moon className="h-3.5 w-3.5 rotate-0 scale-100 transition-all" />
                ) : (
                    <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all underline-offset-1" />
                )}
                <span className="sr-only">Alternar modo</span>
            </Button>
        </div>
    );
}
