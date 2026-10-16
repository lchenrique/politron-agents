import { useEffect, useMemo, useState } from "react";
import JSON5 from "json5";
import { ArrowLeft, FolderOpen, Loader2, Plus, Save, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/features/chat/store/chatStore";
import { useSessionStore } from "@/features/chat/store/sessionStore";
import { clearAllPersistedTranscripts } from "@/features/chat/hooks/useOpencodeTranscriptBridge";
import { useWorkspaceActiveTeam, useWorkspaceSettingsSection } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Diagnostics = Awaited<ReturnType<typeof window.vibeAPI.opencode.getConfigDiagnostics>>;
type EditorData = Awaited<ReturnType<typeof window.vibeAPI.opencode.getConfigEditorData>>;
type JsonSectionKey = "permissionsJson" | "toolsJson";
type McpServerType = "local" | "remote";
type SettingsSection = "defaults" | "providers" | "mcp" | "permissions" | "tools" | "advanced" | "features";

interface SectionMeta {
  title: string;
  description: string;
  kicker: string;
  hint: string;
  accent: string;
}

interface McpServerDraft {
  localId: string;
  name: string;
  type: McpServerType;
  enabled: boolean;
  commandText: string;
  url: string;
  environmentText: string;
  headersText: string;
  timeoutText: string;
  extras: Record<string, unknown>;
}

function getDefaultScope(hasProject: boolean): "global" | "project" {
  return hasProject ? "project" : "global";
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Não definido";
  if (typeof value === "boolean") return value ? "Ativo" : "Desativado";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Vazio";
  return String(value);
}

function formatEditorPath(path: string): string {
  return path || "Caminho indisponível";
}

const sectionMeta: Record<SettingsSection, SectionMeta> = {
  defaults: {
    title: "Geral",
    description: "Ajuste o comportamento padrão, identidade e preferências básicas do OpenCode.",
    kicker: "Base da configuração",
    hint: "Essas opções afetam como a CLI se comporta por padrão.",
    accent: "from-emerald-500/20 via-emerald-500/10 to-transparent",
  },
  providers: {
    title: "Providers",
    description: "Gerencie modelos, chaves e endpoints dos provedores conectados.",
    kicker: "Integrações de IA",
    hint: "Aqui você sente a mudança na hora: cada provider tem credenciais e modelos próprios.",
    accent: "from-sky-500/20 via-sky-500/10 to-transparent",
  },
  mcp: {
    title: "MCP",
    description: "Organize servidores locais e remotos com estrutura clara e validação.",
    kicker: "Ferramentas conectadas",
    hint: "Essa seção reúne o que normalmente ficava escondido em JSON cru.",
    accent: "from-violet-500/20 via-violet-500/10 to-transparent",
  },
  permissions: {
    title: "Permissões",
    description: "Defina regras e aprovações que controlam o que a CLI pode fazer.",
    kicker: "Controle de acesso",
    hint: "Mudanças aqui alteram os limites de execução e aprovação.",
    accent: "from-amber-500/20 via-amber-500/10 to-transparent",
  },
  tools: {
    title: "Tools",
    description: "Ajuste flags, automações e recursos avançados do ambiente.",
    kicker: "Ajustes finos",
    hint: "Use essa área para comportamento operacional e experimentos.",
    accent: "from-cyan-500/20 via-cyan-500/10 to-transparent",
  },
  advanced: {
    title: "Avançado",
    description: "Veja warnings e caminhos de leitura detectados pelo sistema.",
    kicker: "Diagnóstico",
    hint: "Essa visão ajuda a entender de onde vem a configuração carregada.",
    accent: "from-zinc-500/20 via-zinc-500/10 to-transparent",
  },
  features: {
    title: "Features",
    description: "Controle recursos experimentais como dual-provider e group chat.",
    kicker: "Experimentação",
    hint: "Essas opções ativam funcionalidades em desenvolvimento. Mantenha desativado se não souber o que está fazendo.",
    accent: "from-orange-500/20 via-orange-500/10 to-transparent",
  },
};

function createEmptyMcpServer(type: McpServerType = "local"): McpServerDraft {
  return { localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", type, enabled: true, commandText: "", url: "", environmentText: "", headersText: "", timeoutText: "", extras: {} };
}

function objectToKeyValueLines(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${String(v)}`).join("\n");
}

function parseKeyValueLines(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) throw new Error(`Linha inválida: "${line}". Use key=value.`);
    const key = line.slice(0, separatorIndex).trim();
    const parsedValue = line.slice(separatorIndex + 1).trim();
    if (!key) throw new Error(`Chave vazia na linha "${line}".`);
    result[key] = parsedValue;
  }
  return result;
}

function buildMcpDraftsFromJson(mcpJson: string): McpServerDraft[] {
  if (!mcpJson.trim()) return [];
  try {
    const parsed = JSON5.parse(mcpJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    return Object.entries(parsed as Record<string, unknown>).map(([name, rawValue]) => {
      const config = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? (rawValue as Record<string, unknown>) : {};
      const { type: _type, enabled, command, url, environment, headers, timeout, ...extras } = config;
      return {
        localId: `${name}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        type: config.type === "remote" ? "remote" : "local",
        enabled: enabled !== false,
        commandText: Array.isArray(command) ? command.map((item) => String(item)).join("\n") : "",
        url: typeof url === "string" ? url : "",
        environmentText: objectToKeyValueLines(environment),
        headersText: objectToKeyValueLines(headers),
        timeoutText: typeof timeout === "number" ? String(timeout) : "",
        extras,
      };
    });
  } catch {
    return [];
  }
}

function serializeMcpDrafts(mcpDrafts: McpServerDraft[]): string {
  const output: Record<string, unknown> = {};
  for (const draft of mcpDrafts) {
    const name = draft.name.trim();
    if (!name) continue;
    const next: Record<string, unknown> = { ...(draft.extras || {}) };
    delete next.type; delete next.enabled; delete next.command; delete next.url; delete next.environment; delete next.headers; delete next.timeout;
    next.type = draft.type;
    next.enabled = draft.enabled;
    if (draft.type === "local") {
      const command = draft.commandText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (command.length > 0) next.command = command;
      if (draft.environmentText.trim()) next.environment = parseKeyValueLines(draft.environmentText);
    } else {
      const url = draft.url.trim();
      if (url) next.url = url;
      if (draft.headersText.trim()) next.headers = parseKeyValueLines(draft.headersText);
    }
    const timeout = draft.timeoutText.trim();
    if (timeout) {
      const parsedTimeout = Number(timeout);
      if (!Number.isFinite(parsedTimeout)) throw new Error(`Timeout inválido para ${name}`);
      next.timeout = parsedTimeout;
    }
    output[name] = next;
  }
  return Object.keys(output).length === 0 ? "" : JSON.stringify(output, null, 2);
}

const SettingsScreen = () => {
  const activeTeam = useWorkspaceActiveTeam();
  const activeSection = useWorkspaceSettingsSection();
  const activeMeta = sectionMeta[activeSection];
  const clearChat = useChatStore((state) => state.clearChat);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [editor, setEditor] = useState<EditorData | null>(null);
  const [scope, setScope] = useState<"global" | "project">(getDefaultScope(Boolean(activeTeam?.projectPath)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState<"conversations" | "board-project" | "board-all" | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mcpDrafts, setMcpDrafts] = useState<McpServerDraft[]>([]);

  // Feature flags state
  const [features, setFeatures] = useState({
    dualProvider: {
      enabled: false,
      internalAgent: "minimax" as "opencode" | "minimax",
      executorAgent: "opencode" as const,
    },
    groupChat: {
      enabled: false,
      maxParticipants: 10,
      autoThreads: true,
      allowSpontaneousContribution: false,
    },
  });

  useEffect(() => {
    let mounted = true;
    async function loadDiagnostics() {
      setLoading(true);
      setError(null);
      try {
        const [data, draft] = await Promise.all([
          window.vibeAPI.opencode.getConfigDiagnostics({ projectPath: activeTeam?.projectPath }),
          window.vibeAPI.opencode.getConfigEditorData({ scope, projectPath: activeTeam?.projectPath }),
        ]);
        if (!mounted) return;
        setDiagnostics(data);
        setEditor(draft);
        setMcpDrafts(buildMcpDraftsFromJson(draft.mcpJson));
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadDiagnostics();
    return () => {
      mounted = false;
    };
  }, [activeTeam?.projectPath, scope, refreshTick]);

  useEffect(() => {
    setScope(getDefaultScope(Boolean(activeTeam?.projectPath)));
  }, [activeTeam?.projectPath]);

  const providerModelOptions = diagnostics?.models ?? editor?.models ?? [];
  const editorWarnings = editor?.warnings ?? [];
  const mcpValidationErrors = useMemo(() => {
    const seen = new Set<string>();
    return mcpDrafts.map((server) => {
      const name = server.name.trim();
      if (!name) return "Nome do servidor MCP é obrigatório.";
      if (seen.has(name)) return `Servidor MCP duplicado: ${name}`;
      seen.add(name);
      if (server.type === "remote" && !server.url.trim()) return `URL é obrigatória para ${name}`;
      if (server.type === "local" && !server.commandText.trim()) return `Command é obrigatório para ${name}`;
      try {
        if (server.environmentText.trim()) parseKeyValueLines(server.environmentText);
        if (server.headersText.trim()) parseKeyValueLines(server.headersText);
        if (server.timeoutText.trim() && !Number.isFinite(Number(server.timeoutText.trim()))) return `Timeout inválido para ${name}`;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return null;
    });
  }, [mcpDrafts]);
  const mcpErrorList = mcpValidationErrors.filter(Boolean) as string[];
  const serializedMcpJson = useMemo(() => {
    try {
      return serializeMcpDrafts(mcpDrafts);
    } catch {
      return "";
    }
  }, [mcpDrafts]);
  const jsonSectionErrors = useMemo(() => {
    if (!editor) return {} as Record<JsonSectionKey, string | null>;
    const validate = (label: string, value: string): string | null => {
      if (!value.trim()) return null;
      try {
        JSON5.parse(value);
        return null;
      } catch (error) {
        return error instanceof Error ? `${label}: ${error.message}` : `${label}: JSON inválido`;
      }
    };
    return {
      permissionsJson: validate("permission", editor.permissionsJson),
      toolsJson: validate("tools", editor.toolsJson),
    };
  }, [editor]);
  const invalidJsonSections = Object.values(jsonSectionErrors).filter(Boolean);
  const canSave = Boolean(editor) && invalidJsonSections.length === 0 && mcpErrorList.length === 0 && !loading && !saving;
  const configSummary = diagnostics?.mergedSummary;
  const handleSave = async () => {
    if (!editor || invalidJsonSections.length > 0 || mcpErrorList.length > 0) return;
    setSaving(true);
    try {
      const result = await window.vibeAPI.opencode.saveConfigEditorData({
        scope,
        projectPath: activeTeam?.projectPath,
        defaults: editor.defaults,
        providers: editor.providers,
        mcpJson: serializedMcpJson,
        permissionsJson: editor.permissionsJson,
        toolsJson: editor.toolsJson,
      });
      toast.success("Configuração salva", { description: result.targetPath });
      setRefreshTick((value) => value + 1);
    } catch (err) {
      toast.error("Falha ao salvar config", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const updateDefault = (key: keyof EditorData["defaults"], value: string | boolean) => {
    setEditor((current) => {
      if (!current) return current;
      return { ...current, defaults: { ...current.defaults, [key]: value === "" ? undefined : value } };
    });
  };

  const updateProvider = (providerId: string, updater: (provider: EditorData["providers"][number]) => EditorData["providers"][number]) => {
    setEditor((current) => {
      if (!current) return current;
      return { ...current, providers: current.providers.map((provider) => (provider.id === providerId ? updater(provider) : provider)) };
    });
  };

  const updateJsonSection = (key: JsonSectionKey, value: string) => {
    setEditor((current) => {
      if (!current) return current;
      return { ...current, [key]: value };
    });
  };

  const updateMcpServer = (localId: string, updater: (server: McpServerDraft) => McpServerDraft) => {
    setMcpDrafts((current) => current.map((server) => (server.localId === localId ? updater(server) : server)));
  };

  const confirmDestructiveAction = (label: string, body: string, typedConfirmation?: string): boolean => {
    const message = `${label}\n\n${body}`;
    if (!typedConfirmation) {
      return window.confirm(message);
    }

    const response = window.prompt(`${message}\n\nDigite ${typedConfirmation} para confirmar.`);
    return response === typedConfirmation;
  };

  const clearConversationData = (showToast = true) => {
    clearChat();
    useSessionStore.getState().clearAllSessionState();
    clearAllPersistedTranscripts();
    if (showToast) {
      toast.success("Conversas apagadas", { description: "Histórico local e sessões do chat foram limpos." });
    }
  };

  const clearProjectBoard = async () => {
    if (!activeTeam) {
      toast.error("Nenhum projeto ativo", { description: "Selecione um projeto antes de apagar o board." });
      return;
    }

    setResetting("board-project");
    try {
      const result = await window.vibeAPI.workspace.clearBoard({ scope: "project", teamId: activeTeam.id });
      if (!result.success) {
        throw new Error(result.error || "Falha ao limpar o board do projeto");
      }
      toast.success("Board do projeto apagado", { description: `${result.deleted} task(s) removida(s).` });
      setRefreshTick((value) => value + 1);
    } catch (err) {
      toast.error("Falha ao apagar board", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setResetting(null);
    }
  };

  const clearAllBoard = async () => {
    setResetting("board-all");
    try {
      const result = await window.vibeAPI.workspace.clearBoard({ scope: "all" });
      if (!result.success) {
        throw new Error(result.error || "Falha ao limpar o board");
      }
      toast.success("Board apagado", { description: `${result.deleted} task(s) removida(s).` });
      setRefreshTick((value) => value + 1);
    } catch (err) {
      toast.error("Falha ao apagar board", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setResetting(null);
    }
  };

  const clearEverything = async () => {
    if (!confirmDestructiveAction("Apagar tudo?", "Isso remove conversas e board do workspace.", "APAGAR TUDO")) {
      return;
    }

    setResetting("all");
    try {
      clearConversationData(false);
      const result = await window.vibeAPI.workspace.clearBoard({ scope: "all" });
      if (!result.success) {
        throw new Error(result.error || "Falha ao limpar o board");
      }
      toast.success("Workspace limpo", { description: "Conversas e board foram apagados." });
      setRefreshTick((value) => value + 1);
    } catch (err) {
      toast.error("Falha ao apagar tudo", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setResetting(null);
    }
  };

  if (!editor) {
    return (
      <div className="h-full w-full overflow-hidden p-3 pt-1">
        <div className="h-full rounded-3xl overflow-hidden bg-background/80 border border-border/60 shadow-2xl">
          <div className="flex h-full items-center justify-center">
            {loading ? (
              <Card className="border-border/60 bg-card/80">
                <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando configurações...
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border-border/60 bg-card/80">
                <CardContent className="flex items-start gap-3 py-6 text-sm text-destructive">
                  <ArrowLeft className="mt-0.5 h-4 w-4" />
                  <span>{error}</span>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const renderSection = () => {
    if (activeSection === "defaults") {
      return (
        <div className="space-y-6">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">Username</Label>
            <Input 
              id="username" 
              value={editor.defaults.username ?? ""} 
              onChange={(event) => updateDefault("username", event.target.value)} 
              className="max-w-md"
            />
          </div>

          {/* Default Agent */}
          <div className="space-y-2">
            <Label htmlFor="default_agent" className="text-sm font-medium">Default Agent</Label>
            <Input 
              id="default_agent" 
              value={editor.defaults.default_agent ?? ""} 
              onChange={(event) => updateDefault("default_agent", event.target.value)} 
              className="max-w-md"
            />
          </div>

          {/* Log Level */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Log Level</Label>
            <Select value={editor.defaults.logLevel ?? ""} onValueChange={(value) => updateDefault("logLevel", value)}>
              <SelectTrigger className="max-w-xs"><SelectValue placeholder="Selecionar nível" /></SelectTrigger>
              <SelectContent>{["DEBUG", "INFO", "WARN", "ERROR"].map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Model</Label>
            <Select value={editor.defaults.model ?? ""} onValueChange={(value) => updateDefault("model", value)}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecionar modelo" /></SelectTrigger>
              <SelectContent>{providerModelOptions.map((model) => <SelectItem key={`${model.providerID}:${model.id}`} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Small Model */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Small Model</Label>
            <Select value={editor.defaults.small_model ?? ""} onValueChange={(value) => updateDefault("small_model", value)}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecionar modelo" /></SelectTrigger>
              <SelectContent>{providerModelOptions.map((model) => <SelectItem key={`small:${model.providerID}:${model.id}`} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Share */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Share</Label>
            <Select value={editor.defaults.share ?? ""} onValueChange={(value) => updateDefault("share", value)}>
              <SelectTrigger className="max-w-xs"><SelectValue placeholder="Política de share" /></SelectTrigger>
              <SelectContent>{["manual", "auto", "disabled"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Autoupdate */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Autoupdate</Label>
            <Select value={typeof editor.defaults.autoupdate === "boolean" ? String(editor.defaults.autoupdate) : editor.defaults.autoupdate ?? ""} onValueChange={(value) => updateDefault("autoupdate", value === "true" ? true : value === "false" ? false : value)}>
              <SelectTrigger className="max-w-xs"><SelectValue placeholder="Auto update" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ativo</SelectItem>
                <SelectItem value="false">Desativado</SelectItem>
                <SelectItem value="notify">Notificar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Snapshot Toggle */}
          <div className="flex items-center gap-3">
            <Switch 
              checked={Boolean(editor.defaults.snapshot)} 
              onCheckedChange={(checked) => updateDefault("snapshot", checked)} 
            />
            <div>
              <Label className="text-sm font-medium cursor-pointer" onClick={() => updateDefault("snapshot", !editor.defaults.snapshot)}>Snapshot</Label>
              <p className="text-xs text-muted-foreground">Captura o estado da conversa/configuração</p>
            </div>
          </div>
        </div>
      );
    }

    switch (activeSection) {
      case "defaults":
        return (
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Geral</CardTitle>
              <CardDescription>Comportamento padrão da CLI e identidade da sessão</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["username", configSummary?.username],
                ["logLevel", configSummary?.logLevel],
                ["model", configSummary?.model],
                ["small_model", configSummary?.small_model],
                ["default_agent", configSummary?.default_agent],
                ["share", configSummary?.share],
                ["autoupdate", configSummary?.autoupdate],
                ["snapshot", configSummary?.snapshot],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border/60 bg-background/50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{key}</div>
                  <div className="mt-1 text-sm text-foreground">{formatValue(value)}</div>
                </div>
              ))}

              <div className="xl:col-span-3 mt-2 grid gap-4 rounded-2xl border border-border/60 bg-background/50 p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">username</Label>
                  <Input id="username" value={editor.defaults.username ?? ""} onChange={(event) => updateDefault("username", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_agent">default_agent</Label>
                  <Input id="default_agent" value={editor.defaults.default_agent ?? ""} onChange={(event) => updateDefault("default_agent", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>logLevel</Label>
                  <Select value={editor.defaults.logLevel ?? ""} onValueChange={(value) => updateDefault("logLevel", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar nível" /></SelectTrigger>
                    <SelectContent>{["DEBUG", "INFO", "WARN", "ERROR"].map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>model</Label>
                  <Select value={editor.defaults.model ?? ""} onValueChange={(value) => updateDefault("model", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar modelo" /></SelectTrigger>
                    <SelectContent>{providerModelOptions.map((model) => <SelectItem key={`${model.providerID}:${model.id}`} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>small_model</Label>
                  <Select value={editor.defaults.small_model ?? ""} onValueChange={(value) => updateDefault("small_model", value)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar modelo" /></SelectTrigger>
                    <SelectContent>{providerModelOptions.map((model) => <SelectItem key={`small:${model.providerID}:${model.id}`} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>share</Label>
                  <Select value={editor.defaults.share ?? ""} onValueChange={(value) => updateDefault("share", value)}>
                    <SelectTrigger><SelectValue placeholder="Política de share" /></SelectTrigger>
                    <SelectContent>{["manual", "auto", "disabled"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>autoupdate</Label>
                  <Select value={typeof editor.defaults.autoupdate === "boolean" ? String(editor.defaults.autoupdate) : editor.defaults.autoupdate ?? ""} onValueChange={(value) => updateDefault("autoupdate", value === "true" ? true : value === "false" ? false : value)}>
                    <SelectTrigger><SelectValue placeholder="Auto update" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Desativado</SelectItem>
                      <SelectItem value="notify">Notificar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-3 md:col-span-2 xl:col-span-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">snapshot</div>
                    <div className="text-xs text-muted-foreground">Captura o estado da conversa/configuração</div>
                  </div>
                  <Switch checked={Boolean(editor.defaults.snapshot)} onCheckedChange={(checked) => updateDefault("snapshot", checked)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "providers":
        return (
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Providers</CardTitle>
              <CardDescription>Chaves, endpoints, modelos e ativação por provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editor.providers.length ? editor.providers.map((provider) => (
                <details key={provider.id} className="rounded-2xl border border-border/60 bg-background/50 p-4" open={provider.active}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{provider.name || provider.id}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{provider.id} · {provider.api || "provider"}</div>
                    </div>
                    <Badge variant={provider.active ? "secondary" : "outline"}>{provider.active ? "Ativo" : "Inativo"}</Badge>
                  </summary>
                  <Separator className="my-4" />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor={`provider-name-${provider.id}`}>name</Label><Input id={`provider-name-${provider.id}`} value={provider.name ?? ""} onChange={(event) => updateProvider(provider.id, (current) => ({ ...current, name: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor={`provider-api-${provider.id}`}>api</Label><Input id={`provider-api-${provider.id}`} value={provider.api ?? ""} onChange={(event) => updateProvider(provider.id, (current) => ({ ...current, api: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor={`provider-key-${provider.id}`}>apiKey</Label><Input id={`provider-key-${provider.id}`} type="password" value={provider.options.apiKey ?? ""} onChange={(event) => updateProvider(provider.id, (current) => ({ ...current, options: { ...current.options, apiKey: event.target.value } }))} /></div>
                    <div className="space-y-2"><Label htmlFor={`provider-base-${provider.id}`}>baseURL</Label><Input id={`provider-base-${provider.id}`} value={provider.options.baseURL ?? ""} onChange={(event) => updateProvider(provider.id, (current) => ({ ...current, options: { ...current.options, baseURL: event.target.value } }))} /></div>
                    <div className="space-y-2"><Label htmlFor={`provider-enterprise-${provider.id}`}>enterpriseUrl</Label><Input id={`provider-enterprise-${provider.id}`} value={provider.options.enterpriseUrl ?? ""} onChange={(event) => updateProvider(provider.id, (current) => ({ ...current, options: { ...current.options, enterpriseUrl: event.target.value } }))} /></div>
                    <div className="space-y-2"><Label>Status</Label><div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-3"><div className="text-xs text-muted-foreground">Ativo no OpenCode</div><Switch checked={provider.active} onCheckedChange={(checked) => updateProvider(provider.id, (current) => ({ ...current, active: checked }))} /></div></div>
                  </div>
                </details>
              )) : <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">Nenhum provider detectado pelo SDK ainda.</div>}
            </CardContent>
          </Card>
        );
      case "mcp":
        return (
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">MCP</CardTitle>
              <CardDescription>Servidores locais e remotos em campos estruturados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/50 p-4">
                <div><div className="text-sm font-medium text-foreground">Servidores MCP</div><div className="text-xs text-muted-foreground">A configuração é salva no JSON final do OpenCode.</div></div>
                <Button type="button" variant="outline" size="sm" onClick={() => setMcpDrafts((current) => [...current, createEmptyMcpServer()])}><Plus className="mr-2 h-4 w-4" />Novo servidor</Button>
              </div>
              {mcpDrafts.length ? (
                <div className="space-y-4">
                  {mcpDrafts.map((server, index) => {
                    const error = mcpValidationErrors[index];
                    return (
                      <div key={server.localId} className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><div className="text-sm font-semibold text-foreground">Servidor MCP {index + 1}</div><div className="text-xs text-muted-foreground">Defina o nome único e o tipo de conexão</div></div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setMcpDrafts((current) => current.filter((item) => item.localId !== server.localId))}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2"><Label>Nome</Label><Input value={server.name} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, name: event.target.value }))} placeholder="meu-servidor-mcp" /></div>
                          <div className="space-y-2"><Label>Tipo</Label><Select value={server.type} onValueChange={(value) => updateMcpServer(server.localId, (current) => ({ ...current, type: value as McpServerType }))}><SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger><SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="remote">Remoto</SelectItem></SelectContent></Select></div>
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-3"><div><div className="text-sm font-medium text-foreground">Ativo</div><div className="text-xs text-muted-foreground">Servidor disponível no arranque</div></div><Switch checked={server.enabled} onCheckedChange={(checked) => updateMcpServer(server.localId, (current) => ({ ...current, enabled: checked }))} /></div>
                        {server.type === "local" ? (
                          <>
                            <div className="space-y-2"><Label>Command</Label><Textarea value={server.commandText} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, commandText: event.target.value }))} className="min-h-[110px] font-mono text-xs" placeholder={"bun\nx\nmy-mcp-command"} /><p className="text-xs text-muted-foreground">Uma linha por argumento do comando</p></div>
                            <div className="space-y-2"><Label>Environment</Label><Textarea value={server.environmentText} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, environmentText: event.target.value }))} className="min-h-[110px] font-mono text-xs" placeholder={"MY_ENV_VAR=value"} /><p className="text-xs text-muted-foreground">Formato `key=value`, uma linha por variável</p></div>
                          </>
                        ) : (
                          <>
                            <div className="space-y-2"><Label>URL</Label><Input value={server.url} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, url: event.target.value }))} placeholder="https://mcp.example.com/mcp" /></div>
                            <div className="space-y-2"><Label>Headers</Label><Textarea value={server.headersText} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, headersText: event.target.value }))} className="min-h-[110px] font-mono text-xs" placeholder={"Authorization=Bearer token"} /><p className="text-xs text-muted-foreground">Formato `key=value`, uma linha por header</p></div>
                          </>
                        )}
                        <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Timeout</Label><Input value={server.timeoutText} onChange={(event) => updateMcpServer(server.localId, (current) => ({ ...current, timeoutText: event.target.value }))} placeholder="5000" /></div><div className="rounded-xl border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">Campos extras do schema original são preservados no salvamento.</div></div>
                        {error ? <p className="text-xs text-destructive">{error}</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : <div className="rounded-xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">Nenhum servidor MCP configurado ainda.</div>}
              {mcpErrorList.length ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">Corrija os servidores MCP acima antes de salvar.</div> : null}
            </CardContent>
          </Card>
        );
      case "permissions":
      case "tools":
        return (
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">{activeSection === "permissions" ? "Permissões" : "Tools"}</CardTitle>
              <CardDescription>{activeSection === "permissions" ? "Regras e aprovações" : "Flags e ajustes finos"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor={activeSection === "permissions" ? "permissions-json" : "tools-json"}>{activeSection === "permissions" ? "permission" : "tools"}</Label>
              <Textarea
                id={activeSection === "permissions" ? "permissions-json" : "tools-json"}
                value={activeSection === "permissions" ? editor.permissionsJson : editor.toolsJson}
                onChange={(event) => updateJsonSection(activeSection === "permissions" ? "permissionsJson" : "toolsJson", event.target.value)}
                className={cn("min-h-[360px] font-mono text-xs", jsonSectionErrors[activeSection === "permissions" ? "permissionsJson" : "toolsJson"] ? "border-destructive/70 focus-visible:ring-destructive/60" : undefined)}
                placeholder="{ ... }"
              />
              {jsonSectionErrors[activeSection === "permissions" ? "permissionsJson" : "toolsJson"] ? <p className="text-xs text-destructive">{jsonSectionErrors[activeSection === "permissions" ? "permissionsJson" : "toolsJson"]}</p> : null}
            </CardContent>
          </Card>
        );
      case "features":
        return (
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Features</CardTitle>
              <CardDescription>Controle recursos experimentais como dual-provider e group chat</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-border/60 bg-background/50 p-4 text-sm text-muted-foreground">
                Estas opções ativam funcionalidades em desenvolvimento. Mantenha desativado se não souber o que está fazendo.
              </div>

              {/* Dual Provider Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Dual Provider</div>
                  <div className="text-xs text-muted-foreground">
                    Usar MiniMax Direct para agentes internos em vez do OpenCode SDK
                  </div>
                </div>
                <Switch
                  checked={features.dualProvider.enabled}
                  onCheckedChange={() => setFeatures((current) => ({
                    ...current,
                    dualProvider: {
                      ...current.dualProvider,
                      enabled: !current.dualProvider.enabled,
                    },
                  }))}
                />
              </div>

              {/* Internal Agent Provider Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Internal Agent Provider</div>
                  <div className="text-xs text-muted-foreground">
                    Current: {features.dualProvider.internalAgent}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFeatures((current) => ({
                    ...current,
                    dualProvider: {
                      ...current.dualProvider,
                      internalAgent: current.dualProvider.internalAgent === "minimax" ? "opencode" : "minimax",
                    },
                  }))}
                >
                  Switch to {features.dualProvider.internalAgent === "minimax" ? "OpenCode" : "MiniMax"}
                </Button>
              </div>

              {/* Group Chat Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 p-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Group Chat</div>
                  <div className="text-xs text-muted-foreground">
                    Ativar @mention routing e agent threads
                  </div>
                </div>
                <Switch
                  checked={features.groupChat.enabled}
                  onCheckedChange={() => setFeatures((current) => ({
                    ...current,
                    groupChat: {
                      ...current.groupChat,
                      enabled: !current.groupChat.enabled,
                    },
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        );
      default:
        return (
          <div className="space-y-4">
            {editorWarnings.length ? <Card className="border-border/60 bg-card/80"><CardContent className="pt-6 space-y-2">{editorWarnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{warning}</div>)}</CardContent></Card> : null}
            <Card className="border-border/60 bg-card/80">
              <CardHeader><CardTitle className="text-base">Arquivos detectados</CardTitle><CardDescription>Locais possíveis de leitura para global, projeto e configuração customizada</CardDescription></CardHeader>
                <CardContent className="space-y-3">{diagnostics?.sources.map((source) => <div key={`${source.label}:${source.path}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 p-3"><div className="min-w-0"><div className="text-sm font-medium text-foreground">{source.label}</div><div className="truncate text-xs text-muted-foreground">{source.path}</div></div>{source.exists ? <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20">Encontrado</Badge> : <Badge variant="outline">Ausente</Badge>}</div>)}</CardContent>
            </Card>
            <Card className="border-border/60 border-destructive/30 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Limpeza do workspace</CardTitle>
                <CardDescription>Ações destrutivas para apagar conversas e board sem mexer nas configs</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="text-sm font-semibold text-foreground">Conversas</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Apaga histórico persistido, sessões em cache e a conversa ativa.</p>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-4 w-full"
                    disabled={resetting === "conversations"}
                    onClick={() => {
                      if (!confirmDestructiveAction("Apagar conversas?", "Isso remove todo o histórico de chat salvo localmente.")) {
                        return;
                      }
                      setResetting("conversations");
                      try {
                        clearConversationData();
                      } finally {
                        setResetting(null);
                      }
                    }}
                  >
                    {resetting === "conversations" ? "Apagando..." : "Apagar conversas"}
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="text-sm font-semibold text-foreground">Board do projeto</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Remove só as tasks do projeto ativo e mantém equipes e agentes.</p>
                  <Button
                    type="button"
                    variant="destructive"
                    className="mt-4 w-full"
                    disabled={resetting === "board-project" || !activeTeam}
                    onClick={() => {
                      if (!activeTeam) {
                        toast.error("Nenhum projeto ativo", { description: "Selecione um projeto para apagar o board." });
                        return;
                      }
                      if (!confirmDestructiveAction("Apagar board do projeto?", `Isso remove todas as tasks do projeto ${activeTeam.name}.`)) {
                        return;
                      }
                      void clearProjectBoard();
                    }}
                  >
                    {resetting === "board-project" ? "Apagando..." : "Apagar board do projeto"}
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/50 p-4 md:col-span-2">
                  <div className="text-sm font-semibold text-foreground">Board de todos os projetos</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Limpa todas as tasks do workspace inteiro, mas preserva as equipes.</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto"
                      disabled={resetting === "board-all"}
                      onClick={() => {
                        if (!confirmDestructiveAction("Apagar todos os boards?", "Isso remove todas as tasks do workspace.")) {
                          return;
                        }
                        void clearAllBoard();
                      }}
                    >
                      {resetting === "board-all" ? "Apagando..." : "Apagar board de todos"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={resetting === "all"}
                      onClick={() => {
                        void clearEverything();
                      }}
                    >
                      {resetting === "all" ? "Apagando tudo..." : "Apagar tudo"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full flex-col">
        {/* Simple Header */}
        <div className="flex items-center justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{activeMeta.title}</h1>
            <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">{formatEditorPath(editor.targetPath)}</span>
            <Button variant="outline" size="sm" onClick={() => setRefreshTick((value) => value + 1)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Recarregar
            </Button>
            <Button onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
            {/* Scope Selector */}
            <div className="flex items-center gap-4 pb-4 border-b border-border/30">
              <span className="text-sm text-muted-foreground">Escopo:</span>
              <Select value={scope} onValueChange={(value) => setScope(value as "global" | "project")}>
                <SelectTrigger className="w-32 h-8"><SelectValue placeholder="Escopo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="project" disabled={!activeTeam?.projectPath}>Projeto</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant={editor.exists ? "secondary" : "outline"}>{editor.exists ? "Salvo em arquivo" : "Novo"}</Badge>
            </div>

            {renderSection()}
          </div>
        </ScrollArea>

        <div className="border-t border-border/60 px-6 py-3 text-xs text-muted-foreground">
          {canSave ? "Pronto para salvar." : "Ajuste os campos inválidos antes de salvar."}
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
