/**
 * Keep this list aligned with the server-side DNA ingestion allowlist.
 * The import route rejects provider values outside this list.
 */
export const DNA_PROVIDERS = [
  "AncestryDNA",
  "23andMe",
  "MyHeritage",
  "LivingDNA",
  "FamilyTreeDNA",
] as const;

export type DnaProvider = (typeof DNA_PROVIDERS)[number];

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
};

export function contentTypeForDnaFile(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}