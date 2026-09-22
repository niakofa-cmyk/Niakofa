import { createHash } from "node:crypto";

export const DNA_PROVIDERS = [
  "AncestryDNA",
  "23andMe",
  "MyHeritage",
  "LivingDNA",
  "FamilyTreeDNA",
] as const;

export type DnaProvider = (typeof DNA_PROVIDERS)[number];

export const MAX_DNA_FILE_BYTES = 30 * 1024 * 1024;
export const DNA_RETENTION_DAYS = 90;

export type ParsedDnaDataset = {
  provider: DnaProvider;
  sourceFormat: "csv" | "txt" | "json";
  markerCount: number;
  fingerprint: string;
  markerSketch: number[];
};

export class DnaImportError extends Error {
  constructor(
    public readonly code:
      | "DNA_FILE_EMPTY"
      | "DNA_FILE_TOO_LARGE"
      | "DNA_FILE_FORMAT_UNSUPPORTED"
      | "DNA_DATASET_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "DnaImportError";
  }
}

function isDnaProvider(value: string): value is DnaProvider {
  return (DNA_PROVIDERS as readonly string[]).includes(value);
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(normaliseHeader(header)));
}

function parseJsonDataset(text: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DnaImportError("DNA_DATASET_INVALID", "The DNA JSON file could not be parsed.");
  }
  if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (parsed && typeof parsed === "object") {
    const records = (parsed as Record<string, unknown>).markers ?? (parsed as Record<string, unknown>).data;
    if (Array.isArray(records)) return records.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  throw new DnaImportError("DNA_DATASET_INVALID", "The DNA JSON file does not contain marker records.");
}

function parseMarkers(text: string, sourceFormat: ParsedDnaDataset["sourceFormat"]): string[] {
  if (sourceFormat === "json") {
    return parseJsonDataset(text).map((record) => {
      const entries = new Map(Object.entries(record).map(([key, value]) => [normaliseHeader(key), String(value ?? "").trim()]));
      const rsid = entries.get("rsid") ?? entries.get("marker") ?? entries.get("snp");
      const chromosome = entries.get("chromosome") ?? entries.get("chrom") ?? entries.get("chr");
      const position = entries.get("position") ?? entries.get("pos") ?? entries.get("location");
      const genotype = entries.get("genotype") ?? entries.get("result") ?? entries.get("alleles") ?? entries.get("allele");
      if (!rsid || !chromosome || !position || !genotype) return "";
      return `${rsid}|${chromosome}|${position}|${genotype}`.toUpperCase();
    }).filter(Boolean);
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataLines = lines.filter((line) => !line.startsWith("#") && !line.startsWith("//"));
  if (dataLines.length < 2) return [];

  const delimiter = dataLines[0].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(dataLines[0], delimiter);
  const rsidColumn = findColumn(headers, ["rsid", "marker", "snp", "snpid"]);
  const chromosomeColumn = findColumn(headers, ["chromosome", "chrom", "chr"]);
  const positionColumn = findColumn(headers, ["position", "pos", "location"]);
  const genotypeColumn = findColumn(headers, ["genotype", "result", "alleles", "allele"]);

  // Provider exports are allowed to have comment preambles, but they must
  // still expose the four fields needed for a trustworthy parsed summary.
  if ([rsidColumn, chromosomeColumn, positionColumn, genotypeColumn].some((column) => column < 0)) {
    return [];
  }

  return dataLines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter);
    const rsid = cells[rsidColumn]?.trim();
    const chromosome = cells[chromosomeColumn]?.trim();
    const position = cells[positionColumn]?.trim();
    const genotype = cells[genotypeColumn]?.trim();
    if (!rsid || !chromosome || !position || !genotype) return "";
    return `${rsid}|${chromosome}|${position}|${genotype}`.toUpperCase();
  }).filter(Boolean);
}

export function parseDnaExport(
  providerValue: string,
  fileName: string,
  buffer: Buffer,
): ParsedDnaDataset {
  if (!isDnaProvider(providerValue)) {
    throw new DnaImportError("DNA_FILE_FORMAT_UNSUPPORTED", "That DNA provider is not supported.");
  }
  if (buffer.length === 0) {
    throw new DnaImportError("DNA_FILE_EMPTY", "The DNA file is empty.");
  }
  if (buffer.length > MAX_DNA_FILE_BYTES) {
    throw new DnaImportError("DNA_FILE_TOO_LARGE", "DNA files must be 30 MB or smaller.");
  }

  const extension = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!extension || !["csv", "txt", "json"].includes(extension)) {
    throw new DnaImportError("DNA_FILE_FORMAT_UNSUPPORTED", "Upload a CSV, TXT, or JSON raw DNA export.");
  }

  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const markers = parseMarkers(text, extension as ParsedDnaDataset["sourceFormat"]);
  const validMarkers = markers.filter((marker) => /\|[0-9XYM]+\|[0-9]+\|[ACGTN-]+$/.test(marker));
  if (validMarkers.length < 2) {
    throw new DnaImportError(
      "DNA_DATASET_INVALID",
      "The file did not contain at least two valid DNA marker records. Download the raw genotype export from your provider and try again.",
    );
  }

  const canonical = [...new Set(validMarkers)].sort().join("\n");
  // Keep only the lowest 128 32-bit digests. This permits a privacy-conscious
  // cohort similarity check without retaining raw marker records. It is a
  // matching heuristic, not an IBD segment calculation.
  const markerSketch = [...new Set([...new Set(validMarkers)].map((marker) =>
    createHash("sha256").update(marker).digest().readUInt32BE(0),
  ))].sort((a, b) => a - b).slice(0, 128);
  return {
    provider: providerValue,
    sourceFormat: extension as ParsedDnaDataset["sourceFormat"],
    markerCount: new Set(validMarkers).size,
    fingerprint: createHash("sha256").update(canonical).digest("hex"),
    markerSketch,
  };
}