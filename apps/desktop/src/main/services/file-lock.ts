import { EventEmitter } from "events"

export interface FileLock {
  filePath: string
  agentId: string
  lockedAt: string
}

export interface LockResult {
  success: boolean
  lock?: FileLock
  error?: string
}

export class FileLockManager extends EventEmitter {
  private locks: Map<string, FileLock> = new Map() // key: filePath

  /**
   * Acquires a lock for a file - returns success/error
   * Fails if file already locked by another agent
   */
  acquireLock(filePath: string, agentId: string): LockResult {
    const existing = this.locks.get(filePath)
    if (existing && existing.agentId !== agentId) {
      this.emit("lock:denied", { filePath, agentId, lockedBy: existing.agentId })
      return { 
        success: false, 
        error: `File ${filePath} is already locked by agent ${existing.agentId}` 
      }
    }
    
    const lock: FileLock = {
      filePath,
      agentId,
      lockedAt: new Date().toISOString()
    }
    this.locks.set(filePath, lock)
    this.emit("lock:acquired", lock)
    return { success: true, lock }
  }

  /**
   * Releases a lock - only succeeds if agentId matches
   */
  releaseLock(filePath: string, agentId: string): { success: boolean; error?: string } {
    const existing = this.locks.get(filePath)
    if (!existing) {
      return { success: false, error: "Lock not found" }
    }
    if (existing.agentId !== agentId) {
      return { success: false, error: "Cannot release lock owned by another agent" }
    }
    
    this.locks.delete(filePath)
    this.emit("lock:released", { filePath, agentId })
    return { success: true }
  }

  /**
   * Checks lock status for a file
   */
  checkLock(filePath: string): FileLock | null {
    return this.locks.get(filePath) || null
  }

  /**
   * Gets all locks for a specific agent
   */
  getLocksByAgent(agentId: string): FileLock[] {
    return Array.from(this.locks.values()).filter(l => l.agentId === agentId)
  }

  /**
   * Gets all current locks
   */
  getAllLocks(): FileLock[] {
    return Array.from(this.locks.values())
  }

  /**
   * Releases all locks for an agent (e.g., when agent disconnects)
   */
  releaseAllByAgent(agentId: string): number {
    const agentLocks = this.getLocksByAgent(agentId)
    for (const lock of agentLocks) {
      this.locks.delete(lock.filePath)
      this.emit("lock:released", { filePath: lock.filePath, agentId })
    }
    return agentLocks.length
  }

  /**
   * Checks if agent can acquire locks for given files
   */
  canLockFiles(filePaths: string[], agentId: string): { canLock: boolean; conflictingFiles: string[] } {
    const conflictingFiles: string[] = []
    for (const filePath of filePaths) {
      const existing = this.locks.get(filePath)
      if (existing && existing.agentId !== agentId) {
        conflictingFiles.push(filePath)
      }
    }
    return { canLock: conflictingFiles.length === 0, conflictingFiles }
  }
}

export const fileLockManager = new FileLockManager()