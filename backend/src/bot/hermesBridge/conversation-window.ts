/**
 * ConversationWindow — in-memory per-tree window for proactive engagement.
 *
 * Each openWindow starts a countdown of 20 interactions. tickWindow decrements;
 * when it hits 0 the window auto-closes. resetWindow extends it back to 20.
 */

import type { WindowState } from "./types";

export class ConversationWindow {
  private windows: Map<string, WindowState> = new Map();

  /** Open a conversation window on a tree. Default 20-message lifespan. */
  openWindow(treeId: string, keyword?: string): WindowState {
    const state: WindowState = {
      treeId,
      keyword: keyword ?? null,
      remaining: 20,
      openedAt: new Date(),
    };
    this.windows.set(treeId, state);
    return state;
  }

  /** Decrement remaining count. Returns the new state, or null when expired. */
  tickWindow(treeId: string): WindowState | null {
    const state = this.windows.get(treeId);
    if (!state) return null;
    state.remaining--;
    if (state.remaining <= 0) {
      this.windows.delete(treeId);
      return null;
    }
    return state;
  }

  /** Extend window lifespan back to 20 messages. Returns state or null. */
  resetWindow(treeId: string): WindowState | null {
    const state = this.windows.get(treeId);
    if (!state) return null;
    state.remaining = 20;
    return state;
  }

  /** Force-close a window. */
  closeWindow(treeId: string): void {
    this.windows.delete(treeId);
  }

  /** Check if a tree has an active conversation window. */
  hasActiveWindow(treeId: string): boolean {
    return this.windows.has(treeId);
  }

  /** Get current window state (null if none). */
  getWindow(treeId: string): WindowState | null {
    return this.windows.get(treeId) ?? null;
  }

  /** Legacy alias for hasActiveWindow. */
  isWindowActive(treeId: string): boolean {
    return this.hasActiveWindow(treeId);
  }
}

export const conversationWindows = new ConversationWindow();
