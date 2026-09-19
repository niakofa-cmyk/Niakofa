import { describe, expect, it } from "@jest/globals";
import {
  createNiaPipeline,
  createNiaPipelineContext,
  NiaPipeline,
} from "../middleware/nia-pipeline.js";

describe("Nia staged pipeline", () => {
  it("runs middleware in deterministic order and supports early termination", async () => {
    const order: string[] = [];
    const pipeline = new NiaPipeline()
      .use("receive", async (_context, next) => { order.push("receive:before"); await next(); order.push("receive:after"); })
      .use("receive", async (context, next) => { order.push("receive:guard"); context.stop("blocked"); await next(); })
      .use("receive", async () => { order.push("receive:unreachable"); });
    const context = createNiaPipelineContext({ sessionId: "session-1", userId: 7, message: " hello " });

    await pipeline.run("receive", context);

    expect(order).toEqual(["receive:before", "receive:guard", "receive:after"]);
    expect(context.stopped).toBe(true);
    expect(context.stopReason).toBe("blocked");
  });

  it("normalizes the receive envelope and records each built-in stage", async () => {
    const pipeline = createNiaPipeline();
    const context = createNiaPipelineContext({ sessionId: "session-1", userId: null, message: " hello " });

    await pipeline.run("receive", context);
    await pipeline.run("interpret", context);
    context.output = "Hi";
    await pipeline.run("send", context);

    expect(context.envelope.message).toBe("hello");
    expect(context.metadata).toEqual({ interpreted: true, sent: true });
    expect(context.output).toBe("Hi");
  });
});