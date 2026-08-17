/**
 * EventBus
 * --------
 * Every system in the Living World Engine (time, weather, NPCs, quests,
 * combat, animation) talks to every other system exclusively through
 * events + WorldState. Nothing calls another system's methods directly.
 * That's what keeps "weather changes -> NPCs go inside -> a quest unlocks"
 * possible without weather code knowing anything about quests.
 */

export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners[event];
    if (!set || set.size === 0) return;
    // Copy to array: listeners may subscribe/unsubscribe during emit.
    for (const listener of Array.from(set)) {
      listener(payload);
    }
  }

  clear(event?: keyof Events): void {
    if (event) {
      this.listeners[event]?.clear();
    } else {
      this.listeners = {};
    }
  }
}
