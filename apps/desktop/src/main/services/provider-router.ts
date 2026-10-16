/**
 * Provider Router - Agent Routing Logic
 * 
 * Phase 4: Integration
 * Routes messages to appropriate provider based on feature flags:
 * - dualProvider.internalAgent === "minimax" → InternalAgentService (MiniMax Direct)
 * - dualProvider.internalAgent === "opencode" → OpenCode SDK
 * - Executor agents always use OpenCode SDK
 */

import { EventEmitter } from "events"
import { createInternalAgentService, type InternalAgentService } from "./internal-agents"
import { featureStore } from "../config/features"
import type { SendMessageInput, StreamChunk, ProviderStatus } from "./internal-agents"

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported provider types
 */
export type ProviderType = "opencode" | "minimax"

/**
 * Agent type categories
 */
export type AgentCategory = "internal" | "executor"

/**
 * Provider interface - unified API for both providers
 */
export interface IAgentProvider {
  /** Send a message and get streaming response */
  sendMessage(input: SendMessageInput): Promise<void>
  /** Subscribe to streaming chunks */
  subscribe(handler: (chunk: StreamChunk) => void): () => void
  /** Get current provider status */
  getStatus(): ProviderStatus
  /** Get available tools */
  getAvailableTools(): Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
}

// =============================================================================
// PROVIDER ROUTER
// =============================================================================

/**
 * Provider Router - routes to appropriate provider based on feature flags
 */
class ProviderRouter extends EventEmitter {
  private opencodeProvider: IAgentProvider | null = null
  private minimaxProvider: InternalAgentService | null = null
  private currentProvider: IAgentProvider | null = null
  private currentAgentId: string | null = null
  private minimaxUnsubscribe: (() => void) | null = null

  constructor() {
    super()
    this.initializeProviders()
    
    // Listen for feature flag changes
    featureStore.on("change", () => {
      this.routeProvider()
    })
  }

  /**
   * Initialize both providers
   */
  private initializeProviders(): void {
    // OpenCode provider will be initialized when needed (lazy init)
    // MiniMax provider will be initialized when dual provider is enabled
    
    console.log("[ProviderRouter] Initialized")
    this.routeProvider()
  }

  /**
   * Route to appropriate provider based on feature flags
   */
  private routeProvider(): void {
    const shouldUseMiniMaxInternal = featureStore.shouldUseMiniMax()
    
    if (shouldUseMiniMaxInternal) {
      if (!this.minimaxProvider) {
        this.initializeMiniMaxProvider()
      }
      this.currentProvider = this.minimaxProvider
      console.log("[ProviderRouter] Routed to MiniMax (internal agents)")
    } else {
      // Use OpenCode SDK for default behavior
      // OpenCode SDK is used via the IPC bridge / vibeAPI
      this.currentProvider = null // Will use default IPC behavior
      console.log("[ProviderRouter] Routed to OpenCode SDK (default)")
    }
    
    this.emit("providerChanged", { provider: this.getCurrentProviderType() })
  }

  /**
   * Initialize MiniMax provider
   */
  private initializeMiniMaxProvider(): void {
    try {
      // Get MiniMax API key from environment
      const apiKey = process.env.MINIMAX_API_KEY
      
      if (!apiKey) {
        console.warn("[ProviderRouter] MiniMax API key not found - using OpenCode SDK")
        return
      }

      this.minimaxProvider = createInternalAgentService({
        apiKey,
        baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/anthropic",
        model: process.env.MINIMAX_MODEL || "MiniMax-M2.7",
        workspaceDirectory: process.cwd(),
      })

      this.minimaxUnsubscribe?.()
      this.minimaxUnsubscribe = this.minimaxProvider.subscribe((chunk) => {
        const chunkWithAgent =
          this.currentAgentId
            ? { ...chunk, agentId: this.currentAgentId }
            : chunk

        this.emit("chunk", chunkWithAgent)
      })

      // Also set as currentProvider for internal agent requests
      this.currentProvider = this.minimaxProvider

      console.log("[ProviderRouter] MiniMax provider initialized")
    } catch (error) {
      console.error("[ProviderRouter] Failed to initialize MiniMax provider:", error)
    }
  }

  /**
   * Ensure MiniMax provider is available for internal agents (CEO, RH, Tech Lead)
   * This bypasses feature flags - internal agents ALWAYS use MiniMax directly
   */
  ensureMiniMaxForInternalAgent(): IAgentProvider {
    // Force initialize MiniMax if not already done
    if (!this.minimaxProvider) {
      this.initializeMiniMaxProvider()
    }
    
    if (!this.minimaxProvider) {
      throw new Error('MiniMax provider not available - check MINIMAX_API_KEY')
    }
    
    // Force currentProvider to MiniMax for internal agents
    this.currentProvider = this.minimaxProvider
    
    return this.minimaxProvider
  }

  /**
   * Get current provider type
   */
  getCurrentProviderType(): ProviderType {
    if (featureStore.shouldUseMiniMax()) {
      return "minimax"
    }
    return "opencode"
  }

  /**
   * Get current provider
   */
  getProvider(): IAgentProvider | null {
    return this.currentProvider
  }

  /**
   * Check if using MiniMax for internal agents
   */
  isUsingMiniMax(): boolean {
    return featureStore.shouldUseMiniMax() && this.minimaxProvider !== null
  }

  /**
   * Check if a specific agent should use MiniMax
   */
  shouldAgentUseMiniMax(agentId: string): boolean {
    // Check feature flags
    if (!featureStore.isDualProviderActive()) {
      return false
    }

    // Check agent category - if it's an internal agent and internalAgent is set to minimax
    const config = featureStore.getFeature("dualProvider")
    return config.internalAgent === "minimax"
  }

  /**
   * Check if a specific agent should use OpenCode SDK (executor agents always use OpenCode)
   */
  shouldAgentUseOpenCode(agentId: string): boolean {
    // Executor agents always use OpenCode SDK
    if (this.isExecutorAgent(agentId)) {
      return true
    }

    // If dual provider is disabled, always use OpenCode
    if (!featureStore.isDualProviderActive()) {
      return true
    }

    // If internalAgent is set to opencode, use OpenCode
    return featureStore.getFeature("dualProvider").internalAgent === "opencode"
  }

  /**
   * Check if agent is an executor (always uses OpenCode SDK)
   */
  private isExecutorAgent(agentId: string): boolean {
    // Executor agents typically have specific prefixes or come from agent catalog
    const executorPrefixes = ["hephaestus", "oracle", "metis", "momus", "librarian"]
    return executorPrefixes.some(prefix => agentId.toLowerCase().startsWith(prefix))
  }

  /**
   * Get provider for specific agent
   */
  getProviderForAgent(agentId: string): IAgentProvider | null {
    if (this.shouldAgentUseOpenCode(agentId)) {
      return null // Use default IPC behavior
    }
    
    return this.currentProvider
  }

  /**
   * Send message through appropriate provider
   * For internal agents, useMiniMax=true bypasses feature flags
   */
  async sendMessage(input: SendMessageInput, useMiniMax?: boolean): Promise<void> {
    let provider: IAgentProvider | null = null
    
    if (useMiniMax) {
      // Force MiniMax for internal agents - bypasses feature flags
      provider = this.ensureMiniMaxForInternalAgent()
    } else {
      provider = this.getProviderForAgent(input.agentId)
    }
    
    if (provider) {
      this.currentAgentId = input.agentId
      await provider.sendMessage(input)
    } else {
      // Fall back to IPC - will be handled by the renderer via vibeAPI
      console.log("[ProviderRouter] Using IPC for agent:", input.agentId)
    }
  }

  /**
   * Subscribe to streaming chunks from the current provider
   * Returns unsubscribe function
   */
  subscribe(handler: (chunk: StreamChunk & { agentId?: string }) => void): () => void {
    this.on("chunk", handler)
    return () => this.off("chunk", handler)
  }

  /**
   * Dispose providers
   */
  dispose(): void {
    this.minimaxUnsubscribe?.()
    this.minimaxUnsubscribe = null

    if (this.minimaxProvider) {
      // InternalAgentService extends EventEmitter, but doesn't have a dispose method
      this.minimaxProvider = null
    }
    this.currentProvider = null
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

export const providerRouter = new ProviderRouter()

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Check if MiniMax should be used for an agent
 */
export const shouldUseProvider = (agentId: string): ProviderType => {
  return providerRouter.shouldAgentUseMiniMax(agentId) ? "minimax" : "opencode"
}

/**
 * Get the current provider type for UI display
 */
export const getCurrentProviderType = (): ProviderType => {
  return providerRouter.getCurrentProviderType()
}
