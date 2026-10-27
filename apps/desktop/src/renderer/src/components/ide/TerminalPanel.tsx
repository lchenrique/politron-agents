import { useEffect, useRef, useState, memo } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { AgentTerminalSessions } from "./AgentTerminalSessions";

const RealTerminal = memo(({ workspaceId }: { workspaceId?: string | null }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const vibeAPIRef = useRef<any>(null);

  const getThemeColors = () => {
    const style = getComputedStyle(document.documentElement);
    const getVar = (name: string) => style.getPropertyValue(name).trim();

    // Tokens do sistema em hex: o terminal segue o modo Light/Dark sem paleta própria.
    const primary = getVar('--primary') || '#a197ff';
    return {
      background: 'transparent !important',
      foreground: getVar('--foreground') || '#ececf1',
      cursor: primary,
      cursorAccent: getVar('--background') || '#16171b',
      selectionBackground: /^#[0-9a-f]{6}$/i.test(primary) ? primary + '40' : 'rgba(140, 130, 245, 0.25)',
      black: getVar('--muted') || '#202127',
      red: getVar('--destructive') || '#ef6168',
      green: getVar('--success') || '#43c38a',
      yellow: getVar('--warning') || '#e8a840',
      blue: getVar('--info') || '#6ea8fa',
      magenta: getVar('--syntax-keyword') || '#b9a6ff',
      cyan: getVar('--syntax-function') || '#8fb8ff',
      white: getVar('--foreground') || '#ececf1',
    };
  };

  useEffect(() => {
    if (!terminalRef.current || !workspaceId) return;

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
      // Host remoto: o terminal manual continua indisponível; mostra o motivo em vez de falhar em silêncio.
      Promise.resolve(vibeAPI.terminal.create({
        rows: term.rows,
        cols: term.cols,
        workspaceId
      })).catch((error: unknown) => term.write('\r\n' + (error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Terminal indisponível.') + '\r\n'));

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
  }, [workspaceId]);

  return (
    <div className="flex-1 w-full h-full bg-background overflow-hidden relative">
      <div ref={terminalRef} className="w-full h-full terminal-container" />
    </div>
  );
});

RealTerminal.displayName = 'RealTerminal';

const TerminalPlaceholder = () => (
  <div className="flex-1 w-full h-full bg-background flex flex-col items-center justify-center text-center p-8">
    <div className="w-14 h-14 rounded-xl bg-muted border border-border flex items-center justify-center mb-4">
      <svg
        className="w-7 h-7 text-muted-foreground"
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
    <h3 className="text-foreground font-medium text-sm mb-1">Nenhum projeto selecionado</h3>
    <p className="text-muted-foreground text-xs max-w-[220px]">
      Selecione um projeto na barra lateral para abrir o terminal
    </p>
  </div>
);

const TAB_LABELS: Record<string, string> = { terminal: "Terminal", agents: "Saída dos agentes", logs: "Logs" };

const TerminalPanel = memo(({ workspaceId, conversationId, showLogs = true }: { workspaceId?: string | null; conversationId?: string; showLogs?: boolean }) => {
  const [activeTab, setActiveTab] = useState("terminal");
  const [externalError, setExternalError] = useState("");
  const hasProject = !!workspaceId;
  const tabs = ["terminal", ...(conversationId ? ["agents"] : []), ...(showLogs ? ["logs"] : [])];
  // Ação separada e explícita: abre o terminal do sistema só neste computador, nunca no host remoto.
  const openExternal = () => {
    if (!workspaceId) return;
    setExternalError("");
    void window.appAPI.openExternalTerminal(workspaceId).catch((error: unknown) => setExternalError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : "Não foi possível abrir o terminal do sistema."));
  };

  return (
    <div className="flex flex-col h-full flex-1 min-h-[150px]">
      <div className="flex border-border border-b h-[34px] items-center px-2 gap-0.5 shrink-0 bg-muted/40">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 h-[34px] flex items-center text-[11px] font-medium transition-colors cursor-pointer border-b-2 ${
              activeTab === tab
                ? "text-foreground border-b-primary"
                : "text-muted-foreground border-b-transparent hover:text-foreground"
            }`}
          >
            <span>{TAB_LABELS[tab]}</span>
          </button>
        ))}
        {hasProject && <button type="button" onClick={openExternal} title="Abre o terminal do sistema na pasta do projeto, fora do Boobot" className="ml-auto px-2 h-[26px] rounded text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">Abrir terminal externo</button>}
      </div>
      {externalError && <p role="alert" className="shrink-0 px-3 py-1 text-[11px] text-destructive">{externalError}</p>}

      <div className="flex-1 relative overflow-hidden h-full">
        <div className={`h-full ${activeTab === "terminal" ? "block" : "hidden"}`}>
          {hasProject ? <RealTerminal workspaceId={workspaceId} /> : <TerminalPlaceholder />}
        </div>

        {conversationId && <div className={`h-full ${activeTab === "agents" ? "block" : "hidden"}`}>
          {hasProject ? <AgentTerminalSessions key={`${workspaceId}:${conversationId}`} workspaceId={workspaceId!} conversationId={conversationId} /> : <TerminalPlaceholder />}
        </div>}

        <div className={`flex-1 overflow-y-auto p-2.5 flex flex-col gap-0.5 scrollbar-thin h-full ${activeTab === "logs" ? "block" : "hidden"}`}>
          {[
            { time: "14:32:01", from: "SP", fromColor: "text-primary", to: "FE", toColor: "text-success", msg: "task assigned: LoginForm.tsx" },
            { time: "14:32:01", from: "SP", fromColor: "text-primary", to: "BA", toColor: "text-warning", msg: "task assigned: auth.service.ts" },
            { time: "14:32:05", from: "FE", fromColor: "text-success", to: "", toColor: "", msg: "começando LoginForm...", ok: true },
            { time: "14:32:08", from: "BA", fromColor: "text-warning", to: "", toColor: "", msg: "configurando JWT strategy", ok: false },
            { time: "14:32:12", from: "FE", fromColor: "text-success", to: "", toColor: "", msg: "LoginForm.tsx saved \u2713", ok: true },
          ].map((log, i) => (
            <div key={i} className="text-[10px] font-mono flex gap-1.5 items-start px-1 py-0.5 rounded hover:bg-accent transition-colors">
              <span className="text-faint-foreground shrink-0">{log.time}</span>
              <span className={`font-medium shrink-0 ${log.fromColor}`}>{log.from}</span>
              {log.to && (
                <>
                  <span className="text-faint-foreground shrink-0">→</span>
                  <span className={`shrink-0 ${log.toColor}`}>{log.to}</span>
                </>
              )}
              <span className={`flex-1 ${log.ok ? "text-success" : "text-muted-foreground"}`}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
