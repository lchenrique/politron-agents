/**
 * Feature Flags Configuration
 * 
 * Phase 4: Integration
 * Controls dual-provider activation and group chat features
 */

import { EventEmitter } from "events"

// =============================================================================
// FEATURE TYPES
// =============================================================================

export interface DualProviderConfig {
  /** Toggle for dual provider mode */
  enabled: boolean
  /** Internal agent provider: "opencode" | "minimax" */
  internalAgent: "opencode" | "minimax"
  /** Executor agent provider (always opencode) */
  executorAgent: "opencode"
}

export interface GroupChatConfig {
  /** Toggle for group chat mode */
  enabled: boolean
  /** Maximum participants in a group chat */
  maxParticipants: number
  /** Auto-create threads for multi-agent discussions */
  autoThreads: boolean
  /** Allow spontaneous contribution from idle agents */
  allowSpontaneousContribution: boolean
}

export interface FeatureFlags {
  dualProvider: DualProviderConfig
  groupChat: GroupChatConfig
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default feature flags - all disabled to preserve existing behavior
 */
export const DEFAULT_FEATURES: FeatureFlags = {
  dualProvider: {
    enabled: false,
    internalAgent: "minimax",
    executorAgent: "opencode",
  },
  groupChat: {
    enabled: false,
    maxParticipants: 10,
    autoThreads: true,
    allowSpontaneousContribution: false,
  },
}

// =============================================================================
// FEATURE STORE
// =============================================================================

/**
 * Feature flag store with event emission for UI updates
 */
class FeatureStore extends EventEmitter {
  private features: FeatureFlags

  constructor() {
    super()
    this.features = { ...DEFAULT_FEATURES }
  }

  /**
   * Get all feature flags
   */
  getFeatures(): FeatureFlags {
    return { ...this.features }
  }

  /**
   * Get specific feature flag
   */
  getFeature<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
    return { ...this.features[key] }
  }

  /**
   * Update dual provider config
   */
  setDualProvider(config: Partial<DualProviderConfig>): void {
    this.features.dualProvider = {
      ...this.features.dualProvider,
      ...config,
    }
    this.emit("change", this.features)
  }

  /**
   * Update group chat config
   */
  setGroupChat(config: Partial<GroupChatConfig>): void {
    this.features.groupChat = {
      ...this.features.groupChat,
      ...config,
    }
    this.emit("change", this.features)
  }

  /**
   * Toggle dual provider enabled state
   */
  toggleDualProvider(): boolean {
    this.features.dualProvider.enabled = !this.features.dualProvider.enabled
    this.emit("change", this.features)
    return this.features.dualProvider.enabled
  }

  /**
   * Toggle dual provider internal agent
   */
  toggleInternalAgent(): "opencode" | "minimax" {
    this.features.dualProvider.internalAgent =
      this.features.dualProvider.internalAgent === "minimax" ? "opencode" : "minimax"
    this.emit("change", this.features)
    return this.features.dualProvider.internalAgent
  }

  /**
   * Toggle group chat enabled state
   */
  toggleGroupChat(): boolean {
    this.features.groupChat.enabled = !this.features.groupChat.enabled
    this.emit("change", this.features)
    return this.features.groupChat.enabled
  }

  /**
   * Check if dual provider is active
   */
  isDualProviderActive(): boolean {
    return this.features.dualProvider.enabled
  }

  /**
   * Check if group chat is active
   */
  isGroupChatActive(): boolean {
    return this.features.groupChat.enabled
  }

  /**
   * Check if internal agent should use MiniMax
   */
  shouldUseMiniMax(): boolean {
    return (
      this.features.dualProvider.enabled &&
      this.features.dualProvider.internalAgent === "minimax"
    )
  }

  /**
   * Reset all features to defaults
   */
  reset(): void {
    this.features = { ...DEFAULT_FEATURES }
    this.emit("change", this.features)
  }
}

// Singleton instance
export const featureStore = new FeatureStore()

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Check if dual provider is enabled
 */
export const isDualProviderEnabled = () => featureStore.isDualProviderActive()

/**
 * Check if group chat is enabled
 */
export const isGroupChatEnabled = () => featureStore.isGroupChatActive()

/**
 * Get current internal agent type
 */
export const getInternalAgentType = () => featureStore.getFeature("dualProvider").internalAgent