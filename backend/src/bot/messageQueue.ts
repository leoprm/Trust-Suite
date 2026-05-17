/**
 * MessageQueue — semáforo de typing + cola FIFO para hermesBridge.
 *
 * Garantiza que solo un mensaje se envíe a Ari a la vez.
 * Los mensajes adicionales se encolan (max 5).
 * Cuando la cola está llena, se rechaza con mensaje de saturación.
 */

export type QueueState = "idle" | "typing";

export interface QueuedMessage {
  chatId: number;
  text: string;
  userId: number;
  messageId: number;
}

export interface EnqueueResult {
  accepted: boolean;
  position?: number;
  message?: string;
}

export class MessageQueue {
  private state: QueueState = "idle";
  private queue: QueuedMessage[] = [];
  private maxSize = 5;

  enqueue(msg: QueuedMessage): EnqueueResult {
    if (this.state === "idle") {
      this.state = "typing";
      return { accepted: true, position: 0 };
    }
    if (this.queue.length >= this.maxSize) {
      return {
        accepted: false,
        message: "🔄 Ari está saturada, intenta en unos minutos.",
      };
    }
    this.queue.push(msg);
    return { accepted: true, position: this.queue.length };
  }

  dequeue(): QueuedMessage | null {
    const next = this.queue.shift() || null;
    if (!next) {
      this.state = "idle";
    }
    return next;
  }

  /**
   * Drains the queue sequentially using the provided processor.
   * Each dequeued message is passed to processor() one at a time.
   * When the queue is empty, state returns to 'idle'.
   */
  async drain(
    processor: (msg: QueuedMessage) => Promise<void>,
  ): Promise<void> {
    let next = this.dequeue();
    while (next) {
      try {
        await processor(next);
      } catch (err) {
        console.error("[MessageQueue] drain processor error:", err);
      }
      next = this.dequeue();
    }
  }

  getState(): QueueState {
    return this.state;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  reset(): void {
    this.state = "idle";
    this.queue = [];
  }
}

/** Singleton — una sola cola para todas las llamadas a Ari. */
export const messageQueue = new MessageQueue();
