import assert from "node:assert/strict";
import test from "node:test";
import { certifyObjectStorage } from "./verify-object-storage.mjs";

class PutObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
class HeadObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
class GetObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
class DeleteObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
const commands = {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
};

function fakeClient(options = {}) {
  let object;
  let initialHeadCount = 0;
  return {
    async send(command) {
      if (command instanceof PutObjectCommand) {
        object = Buffer.from(command.input.Body);
        if (options.putAcceptedThenFails) {
          throw new Error("client lost response after accepting PUT");
        }
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        if (options.uncertainDelete && object === undefined) {
          const error = new Error("uncertain absence check");
          error.name = "Forbidden";
          error.$metadata = { httpStatusCode: 403 };
          throw error;
        }
        if (object === undefined) {
          const error = new Error("missing");
          error.name = "NotFound";
          error.$metadata = { httpStatusCode: 404 };
          throw error;
        }
        initialHeadCount += 1;
        if (initialHeadCount === 1) {
          return {
            ContentLength: options.sizeMismatch
              ? object.length + 1
              : object.length,
          };
        }
        return { ContentLength: object.length };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: options.getMismatch ? Buffer.from("wrong") : object };
      }
      if (command instanceof DeleteObjectCommand) {
        if (!options.uncertainDelete) object = undefined;
        if (options.uncertainDelete) {
          throw new Error("DELETE response lost");
        }
        return {};
      }
      throw new Error("Unexpected command");
    },
  };
}

const run = (options = {}) =>
  certifyObjectStorage({
    client: fakeClient(options),
    commands,
    bucket: "fake-bucket",
    key: "media-assets/_probe/test/opaque-id.txt",
    body: Buffer.from("tiny certification body\n"),
    timeoutMs: 25,
  });

test("PUT, exact-size HEAD, exact-body/hash GET, and verified DELETE succeed", async () => {
  const result = await run();
  assert.equal(result.ok, true);
  assert.equal(result.probe, "put-head-get-delete");
  assert.equal(result.deleted, true);
  assert.equal(result.bytes, Buffer.byteLength("tiny certification body\n"));
});

test("size mismatch fails but cleanup is verified", async () => {
  await assert.rejects(run({ sizeMismatch: true }), {
    message: /HEAD size mismatch.*cleanup verified absent/,
    cleanupComplete: true,
  });
});

test("GET body mismatch fails but cleanup is verified", async () => {
  await assert.rejects(run({ getMismatch: true }), {
    message: /GET body mismatch.*cleanup verified absent/,
    cleanupComplete: true,
  });
});

test("accepted PUT followed by client error is cleaned up", async () => {
  await assert.rejects(run({ putAcceptedThenFails: true }), (error) => {
    assert.match(error.message, /CLEANUP INCOMPLETE: PUT outcome ambiguous/);
    assert.equal(error.cleanupComplete, false);
    assert.equal(
      error.manualCleanupKey,
      "media-assets/_probe/test/opaque-id.txt",
    );
    return true;
  });
});

test("a late PUT commit after cleanup HEAD 404 still requires manual reconciliation", async () => {
  let object;
  const client = {
    async send(command) {
      if (command instanceof PutObjectCommand) {
        return new Promise((_, reject) => {
          setTimeout(() => {
            object = Buffer.from(command.input.Body);
            reject(new Error("client timeout after delayed provider commit"));
          }, 50);
        });
      }
      if (command instanceof DeleteObjectCommand) {
        object = undefined;
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        if (object !== undefined) return { ContentLength: object.length };
        const error = new Error("missing");
        error.name = "NotFound";
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      throw new Error("Unexpected command");
    },
  };

  await assert.rejects(
    certifyObjectStorage({
      client,
      commands,
      bucket: "fake-bucket",
      key: "media-assets/_probe/test/late-commit-id.txt",
      body: Buffer.from("late commit body\n"),
      timeoutMs: 10,
    }),
    (error) => {
      assert.match(error.message, /CLEANUP INCOMPLETE: PUT outcome ambiguous/);
      assert.match(error.message, /current absence cannot rule out a late commit/);
      assert.equal(error.cleanupComplete, false);
      assert.equal(error.cleanupAttempts, 1);
      assert.equal(
        error.manualCleanupKey,
        "media-assets/_probe/test/late-commit-id.txt",
      );
      return true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(object?.toString(), "late commit body\n");
});

test("unverifiable DELETE fails loudly and supplies only opaque manual key", async () => {
  await assert.rejects(
    run({ uncertainDelete: true }),
    (error) => {
      assert.match(error.message, /CLEANUP INCOMPLETE/);
      assert.equal(error.cleanupComplete, false);
      assert.equal(
        error.manualCleanupKey,
        "media-assets/_probe/test/opaque-id.txt",
      );
      assert.equal(error.cleanupAttempts, 3);
      return true;
    },
  );
});