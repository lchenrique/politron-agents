/// <reference types="vite/client" />
import type { WorkspaceAPI } from '../../shared/v9'

interface VibeSdkSession {
 id: string;
 title?: string;
 directory?: string;
 time?: {
 created: number;
 updated: number;
 compacting?: number;
 };
}

interface VibeManagedSession {
 agentId: string;
 status: string;
 session: VibeSdkSession;
}

declare global {
interface Window {
 vibeAPI: {
 windowControls: {
 minimize: () => Promise<void>;
 maximize: () => Promise<void>;
 close: () => Promise<void>;
 };
 platform: string;
 dialog: {
 pickProjectFolder: () => Promise<string | null>;
 };
 agent: {
 ensure: (input: { agentId: string; teamId?: string; role: string; agentSlug?: string; systemPrompt?: string; systemPromptPath?: string; workspaceDirectory?: string }) => Promise<VibeManagedSession>;
 send: (input: { agentId: string; message: string; model?: { modelID: string; providerID: string } }) => Promise<void>;
 stop: (agentId: string) => Promise<void>;
 subscribe: (agentId: string) => Promise<void>;
 };
 ceo: {
 ensure: (input: { agentId: string; role?: string; agentSlug?: string; systemPrompt?: string; systemPromptPath?: string; workspaceDirectory?: string }) => Promise<VibeManagedSession>;
 send: (input: { agentId: string; message: string; model?: { modelID: string; providerID: string } }) => Promise<void>;
 subscribe: () => Promise<void>;
 };
  team: {
  create: (input: { name: string; projectPath: string; projectName?: string; projectColor?: string; templateId?: string }) => Promise<any>;
  delete: (teamId: string) => Promise<boolean>;
  get: (teamId: string) => Promise<any>;
  list: () => Promise<any[]>;
  hire: (input: { teamId: string; agent: any }) => Promise<any>;
  fire: (input: { teamId: string; agentId: string }) => Promise<any>;
  setTechLead: (input: { teamId: string; agentId: string }) => Promise<any>;
  pause: (teamId: string) => Promise<any>;
  resume: (teamId: string) => Promise<any>;
  createFromTemplate: (input: { templateId: string; teamName?: string; projectPath?: string }) => Promise<any>;
  updateAgent: (teamId: string, agentId: string, updates: Record<string, unknown>) => Promise<any>;
  };
 template: {
 list: () => Promise<any[]>;
 get: (templateId: string) => Promise<any>;
 };
 agentTemplate: {
 list: () => Promise<any[]>;
 };
  pipeline: {
    addTask: (input: { teamId: string; agentId: string; description: string; files: string[]; dependsOn: string[]; branchName?: string }) => Promise<any>;
    start: (taskId: string) => Promise<any>;
    updateTaskStatus: (input: { taskId: string; status: "backlog" | "triage" | "ready" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled"; note?: string; actorAgentId?: string; actorAgentName?: string; blockedReason?: string; result?: string; observations?: string }) => Promise<any>;
    getStatus: (teamId: string) => Promise<any>;
    getTasks: (teamId: string) => Promise<any[]>;
  };
 worktree: {
 create: (input: { basePath: string; teamSlug: string; agentSlug: string; branchName: string; agentId: string; teamId: string }) => Promise<any>;
 remove: (worktreePath: string) => Promise<any>;
 list: (basePath: string) => Promise<any[]>;
 merge: (input: { worktreePath: string; branchName: string; targetBranch?: string }) => Promise<any>;
 };
 lock: {
 acquire: (input: { filePath: string; agentId: string }) => Promise<any>;
 release: (input: { filePath: string; agentId: string }) => Promise<any>;
 check: (filePath: string) => Promise<any>;
 list: () => Promise<any[]>;
 };
 onAgentChunk: (callback: (data: any) => void) => void;
 onAgentReasoning: (callback: (data: any) => void) => void;
 onAgentTool: (callback: (data: any) => void) => void;
 onAgentActivity: (callback: (data: any) => void) => void;
 onAgentHandoff: (callback: (data: unknown) => void) => void;
 onCommunicationUpdate: (callback: (data: unknown) => void) => void;
 onAgentStatus: (callback: (data: any) => void) => void;
 onAgentDone: (callback: (data: any) => void) => void;
 onAgentError: (callback: (data: any) => void) => void;
 onCeoAskHuman: (callback: (data: any) => void) => void;
 onPipelineUpdate: (callback: (data: any) => void) => void;
 onTeamCreated: (callback: (data: any) => void) => void;
 onTeamDeleted: (callback: (data: any) => void) => void;
 onTeamUpdated: (callback: (data: any) => void) => void;
 onTeamAgentAdded: (callback: (data: any) => void) => void;
 onTeamAgentRemoved: (callback: (data: any) => void) => void;
 onTeamTechLeadChanged: (callback: (data: any) => void) => void;
 onTeamPaused: (callback: (data: any) => void) => void;
 onTeamResumed: (callback: (data: any) => void) => void;
 onTaskAdded: (callback: (data: any) => void) => void;
 onTaskStarted: (callback: (data: any) => void) => void;
  onTaskCompleted: (callback: (data: any) => void) => void;
  onTaskFailed: (callback: (data: any) => void) => void;
  onTaskBlocked: (callback: (data: any) => void) => void;
  onTaskUpdated: (callback: (data: any) => void) => void;
  onTaskDelegated: (callback: (data: any) => void) => void;
  onPipelineStatusChanged: (callback: (data: any) => void) => void;
 onWorktreeCreated: (callback: (data: any) => void) => void;
 onWorktreeRemoved: (callback: (data: any) => void) => void;
 onWorktreeError: (callback: (data: any) => void) => void;
 onLockAcquired: (callback: (data: any) => void) => void;
 onLockReleased: (callback: (data: any) => void) => void;
  onLockDenied: (callback: (data: any) => void) => void;
  session: {
    list: () => Promise<any[]>;
    create: (input?: { directory?: string; agentSlug?: string; systemPrompt?: string }) => Promise<any>;
    delete: (sessionId: string) => Promise<boolean>;
    get: (sessionId: string) => Promise<any>;
    messages: (sessionId: string) => Promise<any[]>;
    prompt: (input: {
      sessionId: string;
      message: string;
      agentId: string;
      teamId?: string;
      role: "global-ceo" | "global-agent" | "tech-lead" | "team-agent";
      agentSlug?: string;
      systemPrompt?: string;
      systemPromptPath?: string;
      workspaceDirectory?: string;
      model?: { modelID: string; providerID: string };
    }) => Promise<{ success: boolean }>;
    subscribe: (sessionId: string) => Promise<void>;
  };
  opencode: {
    listModels: () => Promise<Array<{ id: string; providerID: string; name: string }>>;
    getConfigDiagnostics: (input?: { projectPath?: string }) => Promise<{
      sdkReady: boolean;
      providers: Array<{
        id: string;
        name?: string;
        api?: string;
        modelCount: number;
        models: Array<{ id: string; name: string; family?: string; status?: string }>;
        optionKeys: string[];
        env: string[];
        hasHeaders: boolean;
      }>;
      models: Array<{ id: string; providerID: string; name: string }>;
      sources: Array<{ scope: "global" | "project" | "custom"; label: string; path: string; exists: boolean }>;
      env: {
        OPENCODE_CONFIG?: string;
        OPENCODE_CONFIG_DIR?: string;
        OPENCODE_TUI_CONFIG?: string;
      };
      mergedSummary: {
        username?: string;
        logLevel?: string;
        model?: string;
        small_model?: string;
        default_agent?: string;
        share?: string;
        autoupdate?: boolean | "notify";
        snapshot?: boolean;
        disabled_providers: string[];
        enabled_providers: string[];
        providerCount: number;
        mcpCount: number;
        commandCount: number;
        toolCount: number;
        skillsPaths: number;
        skillsUrls: number;
        watcherIgnoreCount: number;
      };
      warnings: string[];
    }>;
    getConfigEditorData: (input?: { scope?: "global" | "project"; projectPath?: string }) => Promise<{
      scope: "global" | "project";
      targetPath: string;
      exists: boolean;
      defaults: {
        username?: string;
        logLevel?: string;
        model?: string;
        small_model?: string;
        default_agent?: string;
        share?: string;
        autoupdate?: boolean | "notify";
        snapshot?: boolean;
      };
      providers: Array<{
        id: string;
        name?: string;
        api?: string;
        active: boolean;
        options: {
          apiKey?: string;
          baseURL?: string;
          enterpriseUrl?: string;
          setCacheKey?: boolean;
          timeout?: number;
          chunkTimeout?: number;
        };
      }>;
      models: Array<{ id: string; providerID: string; name: string }>;
      mcpJson: string;
      permissionsJson: string;
      toolsJson: string;
      warnings: string[];
    }>;
    saveConfigEditorData: (input: {
      scope: "global" | "project";
      projectPath?: string;
      defaults: {
        username?: string;
        logLevel?: string;
        model?: string;
        small_model?: string;
        default_agent?: string;
        share?: string;
        autoupdate?: boolean | "notify";
        snapshot?: boolean;
      };
      providers: Array<{
        id: string;
        name?: string;
        api?: string;
        active: boolean;
        options: {
          apiKey?: string;
          baseURL?: string;
          enterpriseUrl?: string;
          setCacheKey?: boolean;
          timeout?: number;
          chunkTimeout?: number;
        };
      }>;
      mcpJson: string;
      permissionsJson: string;
      toolsJson: string;
    }) => Promise<{ success: true; targetPath: string; warnings: string[] }>;
  };
  workspace: {
    clearBoard: (input?: { scope?: "project" | "all"; teamId?: string }) => Promise<{ success: boolean; deleted: number; error?: string }>;
  };
  };
  workspaceAPI: WorkspaceAPI;
}
}
