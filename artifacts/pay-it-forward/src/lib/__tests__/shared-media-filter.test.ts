import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSharedMediaContextItems } from "../shared-media-filter";

describe("Shared Media context filters", () => {
  it("shows stored link attachments in the plural Links tab", () => {
    const link = { id: 7, attachment_type: "link", link_url: "https://example.test" };
    const other = { id: 8, attachment_type: "file", link_url: null };

    assert.deepEqual(filterSharedMediaContextItems([link, other], "links"), [link]);
  });

  it("keeps location attachments in the Location tab", () => {
    const location = { id: 9, attachment_type: "location" };
    const link = { id: 10, attachment_type: "link" };

    assert.deepEqual(filterSharedMediaContextItems([location, link], "location"), [location]);
  });
});
