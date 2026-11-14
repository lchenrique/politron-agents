/// <reference types="vite/client" />
import type { AppAPI } from '../../shared/v9'
import type { RealtimeAPI } from '../../shared/realtime'
import type { ProvidersAPI } from '../../shared/providers'
import type { SkillsAPI } from '../../shared/skills'
import type { UpdatesAPI } from '../../shared/updates'

declare global {
interface Window {
  hostsAPI?: import('../../shared/hosts').HostsAPI
  telegramAPI?: import('../../shared/telegram').TelegramAPI
  triggersAPI?: import('../../shared/triggers').TriggersAPI
  memoryAPI?: import('../../shared/memory').MemoryAPI
  computerUseAPI?: import('../../shared/computer-use').ComputerUseAPI
  /** Ausente nos testes do renderer sem preload. */
  platformBrowserAPI?: import('../../shared/platform-browser').PlatformBrowserAPI
 vibeAPI: {
 windowControls: {
 minimize: () => Promise<void>;
 maximize: () => Promise<void>;
 close: () => Promise<void>;
 showMain: () => Promise<void>;
 showMascot: () => Promise<void>;
 closeMascot: () => Promise<void>;
 setZoom: (level: number) => Promise<void>;
 getZoom: () => Promise<number>;
 };
 platform: string;
 terminal: {
 create: (input: { rows: number; cols: number; workspaceId: string }) => Promise<boolean>;
 close: () => Promise<boolean>;
 write: (data: string) => void;
 resize: (input: { cols: number; rows: number }) => void;
 onData: (callback: (data: string) => void) => () => void;
 onExit: (callback: (data: { exitCode: number; signal?: number }) => void) => () => void;
 };
 };
  appAPI: AppAPI;
  realtimeAPI: RealtimeAPI;
  providersAPI: ProvidersAPI;
  skillsAPI: SkillsAPI;
  updatesAPI: UpdatesAPI;
}
}
