import { describe, expect, it } from "@jest/globals";
import { isTimelineMemoryVisible } from "../routes/diaspora.js";

const privateMemory = {
  visibility: "private",
  author_id: 101,
  title: "Private title",
  description: "Private description",
  memory_date: "1944-06-06T00:00:00.000Z",
  location_label: "Private location",
};

function timelineEventFor(
  memory: typeof privateMemory,
  userId: number,
  role: string,
) {
  if (!isTimelineMemoryVisible(memory, userId, role)) return undefined;
  return {
    title: memory.title,
    description: memory.description,
    date: memory.memory_date,
    location: memory.location_label,
  };
}

describe("family timeline memory visibility", () => {
  it("does not disclose private event fields to an unauthorized contributor or viewer", () => {
    expect(timelineEventFor(privateMemory, 202, "contributor")).toBeUndefined();
    expect(timelineEventFor(privateMemory, 303, "viewer")).toBeUndefined();
  });

  it("keeps private event fields available to its author and managers", () => {
    const expected = {
      title: "Private title",
      description: "Private description",
      date: "1944-06-06T00:00:00.000Z",
      location: "Private location",
    };
    expect(timelineEventFor(privateMemory, 101, "contributor")).toEqual(expected);
    expect(timelineEventFor(privateMemory, 202, "owner")).toEqual(expected);
    expect(timelineEventFor(privateMemory, 303, "curator")).toEqual(expected);
  });

  it("fails closed for branch and unknown visibility values", () => {
    expect(isTimelineMemoryVisible({ visibility: "branch", author_id: 101 }, 202, "viewer")).toBe(false);
    expect(isTimelineMemoryVisible({ visibility: "future", author_id: 101 }, 101, "contributor")).toBe(false);
  });
});