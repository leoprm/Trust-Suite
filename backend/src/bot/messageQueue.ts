/**
 * MessageQueue — semáforo de typing + cola FIFO para hermesBridge.
 *
 * Garantiza que solo un mensaje se envíe a Ari POR ÁRBOL a la vez.
 * Mensajes de diferentes árboles pueden procesarse en paralelo.
 * Mensajes adicionales del mismo árbol se encolan (max 5).
 * Cuando la cola está llena, se rechaza con mensaje de saturación.
 */

export type QueueState = "idle" | "typing";

export interface QueuedMessage {
  chatId: number;
  text: string;
  userId: number;
  messageId: number;
  role?: string;
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
    // Admin priority: always accepted, jumps to front of queue
    if (msg.role === "ADMIN") {
      this.queue.unshift(msg);
      return { accepted: true, position: 0 };
    }
    if (this.queue.length >= this.maxSize) {
      return {
        accepted: false,
        message: "🔄 Ari está saturada en este árbol, intenta en unos minutos.",
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

/**
 * Per-tree message queues — una cola por árbol para permitir
 * procesamiento paralelo entre diferentes árboles.
 * Messages dentro del mismo árbol se serializan.
 */
class TreeMessageQueueManager {
  private queues = new Map<string, MessageQueue>();

  getQueue(treeId: string | null): MessageQueue {
    const key = treeId || "__notree__";
    let q = this.queues.get(key);
    if (!q) {
      q = new MessageQueue();
      this.queues.set(key, q);
    }
    return q;
  }
}

export const treeMessageQueues = new TreeMessageQueueManager();
