
// Simple In-Memory Priority Queue (backed by DB in production)
export class QueueManager {
  constructor() {
    this.queue = [];
  }

  enqueue(call) {
    // Scoring Logic: VIPs (high LTV) get +50 points
    const score = (call.priority || 0) + (call.isVip ? 50 : 0);
    this.queue.push({ ...call, score, joinedAt: Date.now() });
    this.queue.sort((a, b) => b.score - a.score); // High score first
    console.log(`[Queue] Admitted call from ${call.phoneNumber}. Queue depth: ${this.queue.length}`);
  }

  dequeue(agentId) {
    if (this.queue.length === 0) return null;
    const call = this.queue.shift();
    console.log(`[Queue] Routing ${call.phoneNumber} to agent ${agentId}`);
    return call;
  }

  getStats() {
    return {
      depth: this.queue.length,
      maxWait: this.queue.length > 0 ? (Date.now() - this.queue[0].joinedAt) / 1000 : 0
    };
  }
}

export const globalQueue = new QueueManager();
