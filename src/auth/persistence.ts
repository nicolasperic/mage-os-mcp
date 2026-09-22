/**
 * Persistence ports for the session and operation stores.
 *
 * The stores own the domain logic (expiry, the operation state machine,
 * idempotency); they delegate only raw storage to a `Repository`. The default
 * is in-memory (fine for a single stdio process), and a real deployment swaps
 * in a shared backend (Redis, a DB) so sessions and operations survive restarts
 * and are consistent across workers — without touching the store logic.
 *
 * The interface is async because any external backend is: keeping it async here
 * means the swap is a drop-in, not a rewrite.
 */
export interface Repository<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  count(): Promise<number>;
}

/** Default adapter: process-local memory. Not shared across workers. */
export class InMemoryRepository<T> implements Repository<T> {
  private readonly map = new Map<string, T>();

  async get(key: string): Promise<T | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async count(): Promise<number> {
    return this.map.size;
  }
}
