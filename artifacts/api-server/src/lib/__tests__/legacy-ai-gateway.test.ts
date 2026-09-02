import { __resetLegacyAIGatewayForTests, getLegacyAIModel, getLegacyAIMetrics } from "../legacy-ai-gateway";
describe("Legacy AI Gateway configuration and privacy-safe metrics", () => {
 const original=process.env.LEGACY_AI_MODEL;
 afterEach(()=>{process.env.LEGACY_AI_MODEL=original;__resetLegacyAIGatewayForTests();});
 test("uses default when unset",()=>{delete process.env.LEGACY_AI_MODEL;expect(getLegacyAIModel()).toBe("claude-3-5-haiku-20241022");});
 test("accepts allowed model",()=>{process.env.LEGACY_AI_MODEL="claude-3-5-sonnet-20241022";expect(getLegacyAIModel()).toBe("claude-3-5-sonnet-20241022");});
 test("rejects unknown model",()=>{process.env.LEGACY_AI_MODEL="unexpected-expensive-model";expect(getLegacyAIModel()).toBe("claude-3-5-haiku-20241022");});
 test("trims whitespace-only configuration",()=>{process.env.LEGACY_AI_MODEL="   ";expect(getLegacyAIModel()).toBe("claude-3-5-haiku-20241022");});
 test("metrics are aggregate only",()=>{expect(Object.keys(getLegacyAIMetrics())).not.toContain("prompt");expect(Object.keys(getLegacyAIMetrics())).not.toContain("content");});
});