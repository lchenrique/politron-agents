import React, { useMemo } from 'react';
import { useChatPerfSnapshot, resetChatPerf } from '../../perf/chatPerf';
import { useChatStore } from '../../store/chatStore';

function formatMs(value?: number | null): string {
  if (value == null) return '-';
  return `${value.toFixed(value >= 10 ? 1 : 2)}ms`;
}

function topEntries(source: Record<string, number>, limit = 4) {
  return Object.entries(source).slice(0, limit);
}

export function ChatPerfOverlay() {
  const snapshot = useChatPerfSnapshot();
  const blockCount = useChatStore((state) => state.blockIds.length);
  const turnCount = useChatStore((state) => state.turnIds.length);
  const isStreaming = useChatStore((state) => state.ui.isStreaming);

  const topBridgeEvents = useMemo(
    () => topEntries(snapshot.bridgeEventCounts),
    [snapshot.bridgeEventCounts]
  );
  const topStoreMutations = useMemo(
    () => topEntries(snapshot.storeMutationCounts),
    [snapshot.storeMutationCounts]
  );
  const topRenders = useMemo(
    () => topEntries(snapshot.renderCounts),
    [snapshot.renderCounts]
  );

  if (!snapshot.enabled) return null;

  return (
    <div className="absolute top-3 right-3 z-20 w-[320px] rounded-xl border border-emerald-500/20 bg-zinc-950/90 shadow-2xl backdrop-blur pointer-events-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Chat Perf
          </div>
          <div className="text-[11px] text-zinc-500">
            renderer instrumentation
          </div>
        </div>
        <button
          type="button"
          onClick={() => resetChatPerf()}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 py-3 text-[11px]">
        <div className="rounded-lg bg-zinc-900/80 p-2">
          <div className="text-zinc-500">evt/s</div>
          <div className="text-sm font-semibold text-zinc-100">{snapshot.bridgeEventsPerSecond}</div>
          <div className="text-zinc-500">total {snapshot.bridgeEvents}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/80 p-2">
          <div className="text-zinc-500">store/s</div>
          <div className="text-sm font-semibold text-zinc-100">{snapshot.storeMutationsPerSecond}</div>
          <div className="text-zinc-500">total {snapshot.storeMutations}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/80 p-2">
          <div className="text-zinc-500">render/s</div>
          <div className="text-sm font-semibold text-zinc-100">{snapshot.rendersPerSecond}</div>
          <div className="text-zinc-500">total {snapshot.renders}</div>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-3 text-[11px]">
        <div className="grid grid-cols-3 gap-2 text-zinc-400">
          <div>turns {turnCount}</div>
          <div>blocks {blockCount}</div>
          <div>{isStreaming ? 'streaming on' : 'streaming off'}</div>
        </div>

        <div className="space-y-1">
          <div className="text-zinc-500">bridge ops</div>
          <div className="text-zinc-300">
            last {snapshot.lastBridgeOperation?.name ?? '-'} {formatMs(snapshot.lastBridgeOperation?.durationMs)}
          </div>
          <div className="text-zinc-400">
            slowest {snapshot.slowestBridgeOperation?.name ?? '-'} {formatMs(snapshot.slowestBridgeOperation?.durationMs)}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-zinc-500">store ops</div>
          <div className="text-zinc-300">
            last {snapshot.lastStoreMutation?.name ?? '-'} {formatMs(snapshot.lastStoreMutation?.durationMs)}
          </div>
          <div className="text-zinc-400">
            slowest {snapshot.slowestStoreMutation?.name ?? '-'} {formatMs(snapshot.slowestStoreMutation?.durationMs)}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-zinc-500">top bridge</div>
          {topBridgeEvents.length === 0 ? (
            <div className="text-zinc-600">sem eventos ainda</div>
          ) : (
            topBridgeEvents.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-zinc-300">
                <span className="truncate">{name}</span>
                <span className="text-zinc-500">{count}</span>
              </div>
            ))
          )}
        </div>

        <div className="space-y-1">
          <div className="text-zinc-500">top store</div>
          {topStoreMutations.length === 0 ? (
            <div className="text-zinc-600">sem mutações ainda</div>
          ) : (
            topStoreMutations.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-zinc-300">
                <span className="truncate">{name}</span>
                <span className="text-zinc-500">{count}</span>
              </div>
            ))
          )}
        </div>

        <div className="space-y-1">
          <div className="text-zinc-500">top renders</div>
          {topRenders.length === 0 ? (
            <div className="text-zinc-600">sem renders ainda</div>
          ) : (
            topRenders.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between gap-3 text-zinc-300">
                <span className="truncate">{name}</span>
                <span className="text-zinc-500">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
