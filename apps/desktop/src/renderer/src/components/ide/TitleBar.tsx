import type { CSSProperties } from "react";
import { Minus, Square, Terminal, X, MessageSquare, Layout } from "lucide-react";
import { ThemeSelector } from "./ThemeSelector";

interface TitleBarProps {
    terminalOpen: boolean;
    activeTab: "chat" | "board";
    onTabChange: (tab: "chat" | "board") => void;
    onToggleTerminal: () => void;
    className?: string;
}

const TitleBar = ({ terminalOpen, activeTab, onTabChange, onToggleTerminal, className }: TitleBarProps) => {
    const isWindows = window.vibeAPI.platform === "win32";


    if (isWindows) {
        return (
            <div
                className={`h-10 glass-header  flex items-stretch shrink-0 select-none ${className}`}
                style={{ WebkitAppRegion: "drag" } as CSSProperties}
            >
                <div className="flex-1 flex items-center px-4 min-w-0 gap-5">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="w-4 h-4 rounded-md bg-ide-indigo/80 border border-ide-indigo/40 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                        </div>
                        <div className="text-xs font-bold text-ide-text/90 tracking-tight">POLITRON</div>
                    </div>


                    <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                        {["File", "Edit", "View"].map((menu) => (
                            <button
                                key={menu}
                                className="px-2 py-1 text-[11px] text-ide-text-dim hover:text-ide-text hover:bg-white/5 rounded-md font-medium"
                            >
                                {menu}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-center mr-2" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                    <ThemeSelector />
                </div>

                <div className="flex items-stretch" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                    <button
                        onClick={onToggleTerminal}
                        className={`w-10 flex items-center justify-center ${terminalOpen
                            ? "text-ide-text-dim hover:text-ide-text hover:bg-white/5"
                            : "text-ide-text-dim/50 hover:text-ide-text hover:bg-white/5"
                            }`}
                        title="Terminal"
                    >
                        <Terminal className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-white/5 self-center mx-1" />
                    <button
                        onClick={() => window.vibeAPI.windowControls.minimize()}
                        className="w-11 flex items-center justify-center text-ide-text-dim hover:text-ide-text hover:bg-white/5 "
                        title="Minimizar"
                    >
                        <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => window.vibeAPI.windowControls.maximize()}
                        className="w-11 flex items-center justify-center text-ide-text-dim hover:text-ide-text hover:bg-white/5 "
                        title="Maximizar"
                    >
                        <Square className="w-2.5 h-2.5" />
                    </button>
                    <button
                        onClick={() => window.vibeAPI.windowControls.close()}
                        className="w-11 flex items-center justify-center text-ide-text-dim hover:text-white hover:bg-[#c42b1c] "
                        title="Fechar"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="h-[42px] glass-header flex items-center px-4 gap-3 shrink-0"
            style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
            <div className="flex gap-2">
                <button
                    onClick={() => window.vibeAPI.windowControls.close()}
                    className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/10 cursor-pointer hover:brightness-110 shadow-xs"
                    style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                    title="Close"
                />
                <button
                    onClick={() => window.vibeAPI.windowControls.minimize()}
                    className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/10 cursor-pointer hover:brightness-110 shadow-xs"
                    style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                    title="Minimize"
                />
                <button
                    onClick={() => window.vibeAPI.windowControls.maximize()}
                    className="w-3 h-3 rounded-full bg-[#28c840] border border-black/10 cursor-pointer hover:brightness-110 shadow-xs"
                    style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                    title="Maximize"
                />
            </div>

            <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
                <ThemeSelector />
                <button
                    onClick={onToggleTerminal}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer ${terminalOpen ? "text-ide-text hover:bg-white/10" : "text-ide-text-dim"
                        }`}
                    title="Toggle Terminal"
                >
                    <Terminal className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
