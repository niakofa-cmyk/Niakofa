export type NiaPipelineStage = "receive" | "interpret" | "send";

export type NiaEnvelope = {
  id: string;
  receivedAt: string;
  sessionId: string;
  userId: number | null;
  message: string;
};

export type NiaPipelineContext = {
  envelope: NiaEnvelope;
  metadata: Record<string, unknown>;
  output: string | null;
  stopped: boolean;
  stopReason: string | null;
  stop: (reason: string) => void;
};

export type NiaPipelineMiddleware = (
  context: NiaPipelineContext,
  next: () => Promise<void>,
) => Promise<void> | void;

export function createNiaPipelineContext(input: {
  sessionId: string;
  userId: number | null;
  message: string;
  id?: string;
  receivedAt?: string;
}): NiaPipelineContext {
  const context: NiaPipelineContext = {
    envelope: {
      id: input.id ?? `${input.sessionId}:${input.receivedAt ?? new Date().toISOString()}`,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
      sessionId: input.sessionId,
      userId: input.userId,
      message: input.message.trim(),
    },
    metadata: {},
    output: null,
    stopped: false,
    stopReason: null,
    stop(reason: string) {
      context.stopped = true;
      context.stopReason = reason;
    },
  };
  return context;
}

export class NiaPipeline {
  private readonly middleware: Record<NiaPipelineStage, NiaPipelineMiddleware[]> = {
    receive: [],
    interpret: [],
    send: [],
  };

  use(stage: NiaPipelineStage, handler: NiaPipelineMiddleware): this {
    this.middleware[stage].push(handler);
    return this;
  }

  async run(stage: NiaPipelineStage, context: NiaPipelineContext): Promise<NiaPipelineContext> {
    const handlers = this.middleware[stage];
    let index = -1;
    const dispatch = async (nextIndex: number): Promise<void> => {
      if (context.stopped || nextIndex <= index) return;
      index = nextIndex;
      const handler = handlers[nextIndex];
      if (!handler) return;
      await handler(context, () => dispatch(nextIndex + 1));
    };
    await dispatch(0);
    return context;
  }
}

export function createNiaPipeline(): NiaPipeline {
  return new NiaPipeline()
    .use("receive", async (context, next) => {
      context.envelope.message = context.envelope.message.trim();
      if (!context.envelope.message) context.stop("empty_message");
      await next();
    })
    .use("interpret", async (context, next) => {
      context.metadata.interpreted = true;
      await next();
    })
    .use("send", async (context, next) => {
      context.metadata.sent = true;
      await next();
    });
}