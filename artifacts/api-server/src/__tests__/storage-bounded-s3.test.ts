import { describe, expect, it, jest } from "@jest/globals";
import { collectAssetBuffer } from "../lib/storage";

describe("bounded cloud storage body reads", () => {
  it("aborts a streamed body as soon as the byte limit is exceeded", async () => {
    const cancel = jest.fn();
    async function* body(): AsyncGenerator<Uint8Array> {
      yield Buffer.from("1234");
      yield Buffer.from("5678");
    }

    await expect(collectAssetBuffer(body(), 7, cancel))
      .rejects.toThrow("STORAGE_OBJECT_TOO_LARGE");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("accepts a body at the exact byte limit", async () => {
    async function* body(): AsyncGenerator<Uint8Array> {
      yield Buffer.from("1234");
      yield Buffer.from("5678");
    }

    await expect(collectAssetBuffer(body(), 8)).resolves.toEqual(Buffer.from("12345678"));
  });
});