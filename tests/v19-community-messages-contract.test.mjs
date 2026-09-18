import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

describe("Niakofa V19 Community + Messages contracts", () => {
  it("mounts the existing Meta-style Direct pane", async () => {
    const page = await source("artifacts/pay-it-forward/src/pages/messages.tsx");
    assert.match(page, /import \{ MetaStyleDirectPane \} from "@\/components\/messages\/MetaStyleDirectPane"/);
    assert.match(page, /activeMode === "direct"[\s\S]*MetaStyleDirectPane/);
  });

  it("keeps one four-mode Messages product", async () => {
    const tabs = await source("artifacts/pay-it-forward/src/components/messages/MessageTypeTabs.tsx");
    for (const label of ["All", "Direct", "Requests", "Hubs"]) assert.match(tabs, new RegExp(`label: "${label}"`));
  });

  it("does not expose fake attachment controls", async () => {
    const composer = await source("artifacts/pay-it-forward/src/components/messages/MessageComposer.tsx");
    assert.doesNotMatch(composer, /Attachments \(coming soon\)|Emoji \(coming soon\)/);
    assert.match(composer, /aria-label="Send message"/);
  });

  it("presents the Hub read model as a chronological stream", async () => {
    const panel = await source("artifacts/pay-it-forward/src/components/community/HubCommunityFeedPanel.tsx");
    assert.match(panel, /useMemo/);
    assert.match(panel, /Latest in this Hub/);
    assert.match(panel, /\.sort\(\(a, b\) => Date\.parse\(b\.createdAt \?\? ""\) - Date\.parse\(a\.createdAt \?\? ""\)\)/);
  });

  it("keeps actionable completion reconciliation hooks", async () => {
    const page = await source("artifacts/pay-it-forward/src/pages/request-active.tsx");
    const helper = await source("artifacts/pay-it-forward/src/lib/readCompletionError.ts");
    assert.match(page, /readCompletionError/);
    assert.match(page, /refetchQueries\(\{ queryKey: getGetRequestQueryKey\(requestId\) \}\)/);
    assert.match(helper, /status === 403/);
    assert.match(helper, /status === 404/);
    assert.match(helper, /status === 409/);
  });

  it("keeps the selected-Hub Spirals context explicit", async () => {
    const spirals = await source("artifacts/pay-it-forward/src/components/CommunitySpiralsTab.tsx");
    assert.match(spirals, /Hub → local Community Spirals/);
    assert.match(spirals, /do not require GPS/);
  });
});