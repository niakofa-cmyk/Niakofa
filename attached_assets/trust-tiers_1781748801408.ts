export function getTierName(trustScore: number, helpCount: number): string {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}
