/// <reference types="vite/client" />
import type { AppAPI } from '../../shared/v9'

declare global {
interface Window {
 vibeAPI: {
 windowControls: {
 minimize: () => Promise<void>;
 maximize: () => Promise<void>;
 close: () => Promise<void>;
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
}
}
