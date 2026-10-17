export type SharedMediaContextTab = "links" | "location";

type SharedMediaContextItem = {
  attachment_type?: string;
};

export function filterSharedMediaContextItems<T extends SharedMediaContextItem>(
  items: readonly T[],
  tab: SharedMediaContextTab,
): T[] {
  const attachmentType = tab === "links" ? "link" : "location";
  return items.filter((item) => item.attachment_type === attachmentType);
}
