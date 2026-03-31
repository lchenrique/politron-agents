import type { CSSProperties } from "react";
import { Minus, Square, Terminal, X } from "lucide-react";

interface TitleBarProps {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
}

const TitleBar = ({ terminalOpen, onToggleTerminal }: TitleBarProps) => {
  const isWindows = window.vibeAPI.platform === "win32";

  if (isWindows) {
    return (
      <div
        className="h-8 bg-ide-surface border-b border-ide-border flex items-stretch shrink-0 select-none"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="flex-1 flex items-center px-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-4 h-4 rounded-sm bg-ide-indigo/80 border border-ide-indigo/40 shrink-0" />
            <div className="text-[12px] text-ide-text truncate">VibeCoding IDE</div>
            <div className="text-[10px] text-ide-text-dim uppercase tracking-[0.18em]">MVP Startup</div>
          </div>
        </div>

        <button
          onClick={onToggleTerminal}
          className={`w-10 h-8 flex items-center justify-center transition-colors ${
            terminalOpen
              ? "text-ide-text-dim hover:text-ide-text hover:bg-ide-surface-2"
              : "text-ide-text-dim/50 hover:text-ide-text hover:bg-ide-surface-2"
          }`}
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Mostrar ou esconder terminal"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.vibeAPI.windowControls.minimize()}
          className="w-12 h-8 flex items-center justify-center text-ide-text-dim hover:text-ide-text hover:bg-ide-surface-2 transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Minimizar"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.vibeAPI.windowControls.maximize()}
          className="w-12 h-8 flex items-center justify-center text-ide-text-dim hover:text-ide-text hover:bg-ide-surface-2 transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Maximizar"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={() => window.vibeAPI.windowControls.close()}
          className="w-12 h-8 flex items-center justify-center text-ide-text-dim hover:text-white hover:bg-[#c42b1c] transition-colors"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="h-[38px] bg-ide-surface border-b border-ide-border flex items-center px-4 gap-3 shrink-0"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      <div className="flex gap-1.5">
        <button
          onClick={() => window.vibeAPI.windowControls.close()}
          className="w-3 h-3 rounded-full bg-[hsl(0,100%,67%)] cursor-pointer hover:brightness-125 transition-all"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Close"
        />
        <button
          onClick={() => window.vibeAPI.windowControls.minimize()}
          className="w-3 h-3 rounded-full bg-[hsl(45,100%,59%)] cursor-pointer hover:brightness-125 transition-all"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Minimize"
        />
        <button
          onClick={() => window.vibeAPI.windowControls.maximize()}
          className="w-3 h-3 rounded-full bg-[hsl(130,62%,52%)] cursor-pointer hover:brightness-125 transition-all"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          title="Maximize"
        />
      </div>
      <div className="flex-1 text-center text-xs text-ide-text-dim tracking-wider">vibecoding ide</div>
      <div className="text-[11px] text-ide-indigo bg-ide-indigo-dim border border-ide-indigo-border px-2 py-0.5 rounded">
        MVP Startup
      </div>
      <button
        onClick={onToggleTerminal}
        className={`w-[22px] h-[22px] flex items-center justify-center rounded cursor-pointer transition-all ml-2 ${
          terminalOpen ? "text-ide-text-dim hover:text-ide-text-muted hover:bg-ide-surface-2" : "text-ide-text-dim/50"
        }`}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        title="Toggle Terminal"
      >
        <Terminal className="w-4 h-4" />
      </button>
    </div>
  );
};

export default TitleBar;
