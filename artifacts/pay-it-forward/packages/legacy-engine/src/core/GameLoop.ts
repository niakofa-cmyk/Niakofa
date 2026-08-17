export interface System {
  /** Called every frame with the real-time delta in seconds. */
  tick(dtSeconds: number): void;
}

/**
 * GameLoop
 * --------
 * Framework-agnostic. In a PixiJS host you drive this from
 * app.ticker.add((ticker) => gameLoop.tick(ticker.deltaMS / 1000)).
 * Everything the engine does happens through registered systems, in
 * registration order, each frame - there is no other update path.
 */
export class GameLoop {
  private systems: System[] = [];
  private running = false;
  private accumulator = 0;
  private readonly fixedStep: number;
  private readonly maxStepsPerFrame: number;

  constructor(options: { fixedStepSeconds?: number; maxStepsPerFrame?: number } = {}) {
    this.fixedStep = options.fixedStepSeconds ?? 1 / 60;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
  }

  register(system: System): () => void {
    this.systems.push(system);
    return () => {
      this.systems = this.systems.filter((s) => s !== system);
    };
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Advance the loop by a real-time delta (seconds), using a fixed-step
   * accumulator so combat hit-frame timing is deterministic regardless of
   * render framerate.
   */
  tick(dtSeconds: number): void {
    if (!this.running) return;
    this.accumulator += dtSeconds;
    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < this.maxStepsPerFrame) {
      for (const system of this.systems) system.tick(this.fixedStep);
      this.accumulator -= this.fixedStep;
      steps += 1;
    }
    // If we hit maxStepsPerFrame (e.g. tab was backgrounded), drop the
    // remainder instead of spiraling - correctness over catch-up.
    if (steps === this.maxStepsPerFrame) {
      this.accumulator = 0;
    }
  }
}
