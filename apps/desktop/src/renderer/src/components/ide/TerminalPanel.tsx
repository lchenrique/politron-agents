import { useEffect, useRef, useState, memo } from "react";
import { useAtomValue } from "jotai";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { activeTeamAtom } from "@/hooks/atoms";

const RealTerminal = memo(() => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const vibeAPIRef = useRef<any>(null);
  const activeTeam = useAtomValue(activeTeamAtom);
  const hasNavigatedRef = useRef(false);
  const lastProjectPathRef = useRef<string | null>(null);
  const [platform, setPlatform] = useState<string>('win32'); // default to win32

  const buildNavigationCommand = (targetPath: string) => {
    if (platform === 'win32') {
      return `Set-Location -LiteralPath "${targetPath.replace(/"/g, '""')}"\r`;
    }

    return `cd "${targetPath.replace(/"/g, '\\"')}"\n`;
  };

  // Get platform on mount
  useEffect(() => {
    if (window.vibeAPI.system?.getPlatform) {
      window.vibeAPI.system.getPlatform().then(setPlatform);
    }
  }, []);

  const getThemeColors = () => {
    const style = getComputedStyle(document.documentElement);
    const getVar = (name: string) => style.getPropertyValue(name).trim();

    return {
      background: 'transparent !important',
      foreground: getVar('--foreground') || '#cccccc',
      cursor: getVar('--primary') || '#6366f1',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
      black: '#000000',
      red: getVar('--destructive') || '#f87171',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#ffffff',
    };
  };

  useEffect(() => {
    if (!terminalRef.current || !activeTeam?.projectPath) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
      theme: getThemeColors(),
      allowProposedApi: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to Backend
    const vibeAPI = (window as any).vibeAPI;
    vibeAPIRef.current = vibeAPI;
    if (vibeAPI?.terminal) {
      vibeAPI.terminal.create({
        rows: term.rows,
        cols: term.cols,
        cwd: activeTeam.projectPath
      });

      const unbindData = vibeAPI.terminal.onData((data: string) => {
        term.write(data);
      });

      term.onData((data) => {
        vibeAPI.terminal.write(data);
      });

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          vibeAPI.terminal.resize({
            cols: term.cols,
            rows: term.rows
          });
        }
      });
      resizeObserver.observe(terminalRef.current);

      // Handle Theme Changes
      const themeObserver = new MutationObserver(() => {
        term.options.theme = getThemeColors();
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']
      });

      hasNavigatedRef.current = false;
      lastProjectPathRef.current = activeTeam.projectPath;

      return () => {
        unbindData();
        resizeObserver.disconnect();
        themeObserver.disconnect();
        term.dispose();
      };
    }

    return () => {
      term.dispose();
    };
  }, []);

  // Effect to handle project path changes - send cd command when activeTeam changes after initial mount
  useEffect(() => {
    if (!activeTeam?.projectPath || !vibeAPIRef.current?.terminal || !xtermRef.current) return;

    // Skip if same path or already navigated
    if (activeTeam.projectPath === lastProjectPathRef.current || hasNavigatedRef.current) return;

    // Small delay to ensure terminal is ready after project switch
    const timer = setTimeout(() => {
      if (vibeAPIRef.current?.terminal && activeTeam?.projectPath) {
        hasNavigatedRef.current = true;
        lastProjectPathRef.current = activeTeam.projectPath;
        const cdCommand = buildNavigationCommand(activeTeam.projectPath);
        vibeAPIRef.current.terminal.write(cdCommand);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [activeTeam, platform]);

  return (
    <div className="flex-1 w-full h-full bg-background overflow-hidden relative">
      <div ref={terminalRef} className="w-full h-full terminal-container" />
    </div>
  );
});

RealTerminal.displayName = 'RealTerminal';

const TerminalPlaceholder = () => (
  <div className="flex-1 w-full h-full bg-background flex flex-col items-center justify-center text-center p-8">
    <div className="w-16 h-16 rounded-2xl bg-ide-surface-1 border border-ide-border flex items-center justify-center mb-4">
      <svg 
        className="w-8 h-8 text-ide-text-dim" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={1.5} 
          d="M6 9l6 6 6-6" 
        />
      </svg>
    </div>
    <h3 className="text-ide-text font-medium text-sm mb-1">Nenhum projeto selecionado</h3>
    <p className="text-ide-text-dim text-xs max-w-[200px]">
      Selecione um projeto na barra lateral para abrir o terminal
    </p>
  </div>
);

const TerminalPanel = memo(() => {
  const [activeTab, setActiveTab] = useState("terminal");
  const activeTeam = useAtomValue(activeTeamAtom);
  const hasProject = !!activeTeam?.projectPath;

  return (
    <div className="flex flex-col h-full flex-1 min-h-[150px]">
      <div className="flex border-ide-border border-b h-[38px] items-center px-3 gap-0.5 shrink-0 bg-ide-surface-1">
        {["terminal", "logs"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 h-[38px] flex items-center text-[11px] font-medium transition-all cursor-pointer border-b-2 ${
              activeTab === tab
                ? "text-ide-text border-b-ide-indigo"
                : "text-ide-text-dim border-b-transparent hover:text-ide-text-dim/80"
            }`}
          >
            <span className="capitalize">{tab}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 relative overflow-hidden h-full">
        <div className={`h-full ${activeTab === "terminal" ? "block" : "hidden"}`}>
          {hasProject ? <RealTerminal /> : <TerminalPlaceholder />}
        </div>

        <div className={`flex-1 overflow-y-auto p-2.5 flex flex-col gap-0.5 scrollbar-thin h-full ${activeTab === "logs" ? "block" : "hidden"}`}>
          {[
            { time: "14:32:01", from: "SP", fromColor: "text-ide-indigo", to: "FE", toColor: "text-ide-green-bright", msg: "task assigned: LoginForm.tsx" },
            { time: "14:32:01", from: "SP", fromColor: "text-ide-indigo", to: "BA", toColor: "text-ide-amber-bright", msg: "task assigned: auth.service.ts" },
            { time: "14:32:05", from: "FE", fromColor: "text-ide-green-bright", to: "", toColor: "", msg: "começando LoginForm...", ok: true },
            { time: "14:32:08", from: "BA", fromColor: "text-ide-amber-bright", to: "", toColor: "", msg: "configurando JWT strategy", ok: false },
            { time: "14:32:12", from: "FE", fromColor: "text-ide-green-bright", to: "", toColor: "", msg: "LoginForm.tsx saved \u2713", ok: true },
          ].map((log, i) => (
            <div key={i} className="text-[10px] font-mono flex gap-1.5 items-start px-1 py-0.5 rounded hover:bg-white/5 transition-colors">
              <span className="text-white/20 shrink-0">{log.time}</span>
              <span className={`font-medium shrink-0 ${log.fromColor}`}>{log.from}</span>
              {log.to && (
                <>
                  <span className="text-white/20 shrink-0">→</span>
                  <span className={`shrink-0 ${log.toColor}`}>{log.to}</span>
                </>
              )}
              <span className={`flex-1 ${log.ok ? "text-ide-green-bright" : "text-ide-text-dim"}`}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
