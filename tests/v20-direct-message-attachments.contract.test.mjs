import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

describe("Niakofa V20 Direct-message attachment contracts", () => {
  it("defines durable attachment storage linked to Direct messages", async () => {
    const sql = await read("lib/db/migrations/0146_direct_message_attachments.sql");
    const schema = await read("lib/db/src/schema/direct-message-attachments.ts");
    assert.match(sql, /direct_message_attachments/);
    assert.match(sql, /REFERENCES direct_messages/);
    assert.match(sql, /5242880/);
    assert.match(schema, /directMessageAttachmentsTable/);
  });

  it("keeps media private and conversation-scoped", async () => {
    const route = await read("artifacts/api-server/src/routes/direct-messages.ts");
    const storage = await read("artifacts/api-server/src/lib/storage.ts");
    assert.match(route, /direct-messages\/\$\{conversationId\}/);
    assert.match(route, /isConversationMember/);
    assert.match(route, /streamOrRedirectAsset/);
    assert.match(storage, /Cache-Control.*private, no-store/);
    assert.doesNotMatch(route, /storage_key:\s*directMessageAttachmentsTable\.storage_key[\s\S]{0,300}media_url/);
  });

  it("limits attachment count and size in both client and server", async () => {
    const route = await read("artifacts/api-server/src/routes/direct-messages.ts");
    const composer = await read("artifacts/pay-it-forward/src/components/messages/MessageComposerWithAttachments.tsx");
    assert.match(route, /MAX_DIRECT_ATTACHMENT_BYTES = 5 \* 1024 \* 1024/);
    assert.match(route, /MAX_DIRECT_ATTACHMENTS = 5/);
    assert.match(composer, /MAX_BYTES = 5 \* 1024 \* 1024/);
    assert.match(composer, /MAX_ATTACHMENTS = 5/);
  });

  it("keeps Direct, Requests, and Hubs in one Messages product", async () => {
    const architecture = await read("docs/reference/niakofa-v20/README.md");
    const messagesPage = await read("artifacts/pay-it-forward/src/pages/messages.tsx");
    assert.match(architecture, /All \| Direct \| Requests \| Hubs/);
    assert.match(messagesPage, /MessagesShell/);
    assert.match(messagesPage, /HubMessagesPanel/);
  });
});