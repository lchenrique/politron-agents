import { useSyncExternalStore } from 'react';

const PERF_ENABLED = import.meta.env.DEV;
const MAX_ROLLING_SAMPLES = 400;

type PerfCounterMap = Record<string, number>;
type PerfOperation = {
  name: string;
  durationMs: number;
  at: number;
};

type InternalChatPerfState = {
  sessionStartedAt: number;
  bridgeEvents: number;
  storeMutations: number;
  renders: number;
  bridgeEventCounts: PerfCounterMap;
  storeMutationCounts: PerfCounterMap;
  renderCounts: PerfCounterMap;
  bridgeSamples: number[];
  storeSamples: number[];
  renderSamples: number[];
  lastBridgeOperation: PerfOperation | null;
  slowestBridgeOperation: PerfOperation | null;
  lastStoreMutation: PerfOperation | null;
  slowestStoreMutation: PerfOperation | null;
};

export type ChatPerfSnapshot = {
  enabled: boolean;
  sessionStartedAt: number;
  bridgeEvents: number;
  bridgeEventsPerSecond: number;
  storeMutations: number;
  storeMutationsPerSecond: number;
  renders: number;
  rendersPerSecond: number;
  bridgeEventCounts: PerfCounterMap;
  storeMutationCounts: PerfCounterMap;
  renderCounts: PerfCounterMap;
  lastBridgeOperation: PerfOperation | null;
  slowestBridgeOperation: PerfOperation | null;
  lastStoreMutation: PerfOperation | null;
  slowestStoreMutation: PerfOperation | null;
};

const listeners = new Set<() => void>();

const state: InternalChatPerfState = {
  sessionStartedAt: Date.now(),
  bridgeEvents: 0,
  storeMutations: 0,
  renders: 0,
  bridgeEventCounts: {},
  storeMutationCounts: {},
  renderCounts: {},
  bridgeSamples: [],
  storeSamples: [],
  renderSamples: [],
  lastBridgeOperation: null,
  slowestBridgeOperation: null,
  lastStoreMutation: null,
  slowestStoreMutation: null,
};

let notifyHandle: number | null = null;
let stateVersion = 0;
let cachedSnapshotVersion = -1;
let cachedSnapshot: ChatPerfSnapshot | null = null;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function pruneSamples(samples: number[], threshold: number) {
  while (samples.length > 0 && samples[0] < threshold) {
    samples.shift();
  }

  if (samples.length > MAX_ROLLING_SAMPLES) {
    samples.splice(0, samples.length - MAX_ROLLING_SAMPLES);
  }
}

function scheduleNotify() {
  if (!PERF_ENABLED || notifyHandle !== null) return;

  notifyHandle = window.requestAnimationFrame(() => {
    notifyHandle = null;
    stateVersion += 1;
    listeners.forEach((listener) => listener());
  });
}

function incrementCounter(map: PerfCounterMap, name: string, count = 1) {
  map[name] = (map[name] ?? 0) + count;
}

function recordSample(samples: number[], count = 1) {
  const ts = Date.now();
  for (let index = 0; index < count; index += 1) {
    samples.push(ts);
  }
  pruneSamples(samples, ts - 1000);
}

function sortCounters(map: PerfCounterMap): PerfCounterMap {
  return Object.fromEntries(
    Object.entries(map).sort((left, right) => right[1] - left[1])
  );
}

function createSnapshot(): ChatPerfSnapshot {
  const threshold = Date.now() - 1000;
  pruneSamples(state.bridgeSamples, threshold);
  pruneSamples(state.storeSamples, threshold);
  pruneSamples(state.renderSamples, threshold);

  return {
    enabled: PERF_ENABLED,
    sessionStartedAt: state.sessionStartedAt,
    bridgeEvents: state.bridgeEvents,
    bridgeEventsPerSecond: state.bridgeSamples.length,
    storeMutations: state.storeMutations,
    storeMutationsPerSecond: state.storeSamples.length,
    renders: state.renders,
    rendersPerSecond: state.renderSamples.length,
    bridgeEventCounts: sortCounters(state.bridgeEventCounts),
    storeMutationCounts: sortCounters(state.storeMutationCounts),
    renderCounts: sortCounters(state.renderCounts),
    lastBridgeOperation: state.lastBridgeOperation,
    slowestBridgeOperation: state.slowestBridgeOperation,
    lastStoreMutation: state.lastStoreMutation,
    slowestStoreMutation: state.slowestStoreMutation,
  };
}

function getSnapshot(): ChatPerfSnapshot {
  if (!PERF_ENABLED) {
    if (!cachedSnapshot) {
      cachedSnapshot = createSnapshot();
      cachedSnapshotVersion = stateVersion;
    }
    return cachedSnapshot;
  }

  if (cachedSnapshot && cachedSnapshotVersion === stateVersion) {
    return cachedSnapshot;
  }

  cachedSnapshot = createSnapshot();
  cachedSnapshotVersion = stateVersion;
  return cachedSnapshot;
}

function updateOperation(
  currentSlowest: PerfOperation | null,
  operation: PerfOperation
): PerfOperation {
  if (!currentSlowest || operation.durationMs > currentSlowest.durationMs) {
    return operation;
  }
  return currentSlowest;
}

export function useChatPerfSnapshot() {
  return useSyncExternalStore(
    (listener) => {
      if (!PERF_ENABLED) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    getSnapshot
  );
}

export function recordChatBridgeEvent(name: string, count = 1) {
  if (!PERF_ENABLED) return;

  state.bridgeEvents += count;
  incrementCounter(state.bridgeEventCounts, name, count);
  recordSample(state.bridgeSamples, count);
  scheduleNotify();
}

export function measureChatBridgeOperation<T>(name: string, operation: () => T): T {
  if (!PERF_ENABLED) return operation();

  const start = nowMs();
  const result = operation();
  const perfOperation: PerfOperation = {
    name,
    durationMs: nowMs() - start,
    at: Date.now(),
  };

  state.lastBridgeOperation = perfOperation;
  state.slowestBridgeOperation = updateOperation(state.slowestBridgeOperation, perfOperation);
  scheduleNotify();
  return result;
}

export function recordChatStoreMutation(name: string, durationMs: number) {
  if (!PERF_ENABLED) return;

  const mutation: PerfOperation = {
    name,
    durationMs,
    at: Date.now(),
  };

  state.storeMutations += 1;
  incrementCounter(state.storeMutationCounts, name);
  recordSample(state.storeSamples);
  state.lastStoreMutation = mutation;
  state.slowestStoreMutation = updateOperation(state.slowestStoreMutation, mutation);
  scheduleNotify();
}

export function measureChatStoreMutation<T>(name: string, operation: () => T, unchangedState?: T): T {
  if (!PERF_ENABLED) return operation();

  const start = nowMs();
  const result = operation();

  if (result !== unchangedState) {
    recordChatStoreMutation(name, nowMs() - start);
  }

  return result;
}

export function recordChatRender(name: string) {
  if (!PERF_ENABLED) return;

  state.renders += 1;
  incrementCounter(state.renderCounts, name);
  recordSample(state.renderSamples);
  scheduleNotify();
}

export function resetChatPerf() {
  if (!PERF_ENABLED) return;

  state.sessionStartedAt = Date.now();
  state.bridgeEvents = 0;
  state.storeMutations = 0;
  state.renders = 0;
  state.bridgeEventCounts = {};
  state.storeMutationCounts = {};
  state.renderCounts = {};
  state.bridgeSamples = [];
  state.storeSamples = [];
  state.renderSamples = [];
  state.lastBridgeOperation = null;
  state.slowestBridgeOperation = null;
  state.lastStoreMutation = null;
  state.slowestStoreMutation = null;
  scheduleNotify();
}
