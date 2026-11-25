import type { RgbEvent, RgbTransfer } from '@utexo/webrgb';
import { WebRgbError } from './errors.js';

type Listener = (transfer: RgbTransfer) => void;

/** Timers of any host (browser, worker, Node); the build has no DOM lib. */
const timers = globalThis as unknown as {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(timer: unknown): void;
};

const EVENTS: readonly RgbEvent[] = ['transferReceived', 'transferSettled'];
const RECEIVE_KINDS = new Set(['ReceiveBlind', 'ReceiveWitness']);

/** A receive the sender has answered: it left `WaitingCounterparty` alive. */
function received(transfer: RgbTransfer): boolean {
  return (
    RECEIVE_KINDS.has(String(transfer.kind)) &&
    transfer.status !== 'WaitingCounterparty' &&
    transfer.status !== 'Failed'
  );
}

/**
 * `transferReceived` and `transferSettled` for one provider. It reads the
 * wallet's transfers (local state, no sync) every `pollMs` while at least
 * one listener is attached and the session is enabled, and compares them
 * with the previous read: the first read only records what is there.
 */
export class TransferEvents {
  private readonly listeners = new Map<RgbEvent, Set<Listener>>(
    EVENTS.map((event) => [event, new Set()])
  );
  private timer?: unknown;
  private known?: Map<string, RgbTransfer>;
  private inflight?: Promise<void>;
  private generation = 0;

  constructor(
    private readonly read: () => Promise<RgbTransfer[]>,
    private readonly active: () => boolean,
    private readonly pollMs: number
  ) {}

  on(event: RgbEvent, listener: Listener): void {
    this.listenersOf(event, listener).add(listener);
    if (!this.timer) {
      this.timer = timers.setInterval(() => void this.poll(), this.pollMs);
      (this.timer as { unref?: () => void }).unref?.();
      void this.poll();
    }
  }

  off(event: RgbEvent, listener: Listener): void {
    this.listenersOf(event, listener).delete(listener);
    if ([...this.listeners.values()].every((set) => set.size === 0))
      this.stop();
  }

  /** Drops every listener and stops polling, as on revoke. */
  clear(): void {
    for (const set of this.listeners.values()) set.clear();
    this.stop();
  }

  /**
   * One read and comparison; a call while one runs waits for that one.
   * Exposed for hosts that drive their own timer.
   */
  poll(): Promise<void> {
    if (!this.active()) return Promise.resolve();
    this.inflight ??= this.compare().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async compare(): Promise<void> {
    const generation = this.generation;
    try {
      const transfers = await this.read();
      // Listeners left (or came back) while the read ran: start afresh.
      if (generation !== this.generation) return;
      const next = new Map(
        transfers.map((transfer) => [String(transfer.transferId), transfer])
      );
      const previous = this.known;
      this.known = next;
      if (!previous) return;
      for (const [id, transfer] of next) {
        const before = previous.get(id);
        if (received(transfer) && (!before || !received(before)))
          this.emit('transferReceived', transfer);
        if (transfer.status === 'Settled' && before?.status !== 'Settled')
          this.emit('transferSettled', transfer);
      }
    } catch {
      // A failed read is retried on the next tick; events are best effort.
    }
  }

  private emit(event: RgbEvent, transfer: RgbTransfer): void {
    if (!this.active()) return;
    for (const listener of [...this.listeners.get(event)!]) {
      try {
        listener({ ...transfer });
      } catch {
        // A page's listener must not stop delivery to the others.
      }
    }
  }

  private listenersOf(event: RgbEvent, listener: Listener): Set<Listener> {
    const set = this.listeners.get(event);
    if (!set || typeof listener !== 'function')
      throw new WebRgbError('INVALID_PARAMS', 'Unknown event or listener');
    return set;
  }

  private stop(): void {
    if (this.timer) timers.clearInterval(this.timer);
    this.timer = undefined;
    this.known = undefined;
    this.generation += 1;
  }
}
