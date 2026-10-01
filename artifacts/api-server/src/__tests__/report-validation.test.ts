import { describe, expect, it } from "@jest/globals";
import { CreateReportBody, SPARK_REPORT_TYPES } from "../lib/report-validation";

const baseReport = {
  reporter_id: 12,
  reported_community_story_id: 44,
  description: "This report includes enough detail for review.",
};

describe("Spark and Moment report reasons", () => {
  it.each(SPARK_REPORT_TYPES)("accepts %s for a Spark or Moment", (type) => {
    expect(CreateReportBody.safeParse({ ...baseReport, type }).success).toBe(true);
  });

  it("rejects a generic or unknown reason for a Spark or Moment", () => {
    expect(CreateReportBody.safeParse({ ...baseReport, type: "other" }).success).toBe(false);
    expect(CreateReportBody.safeParse({ ...baseReport, type: "explicit_content" }).success).toBe(false);
  });

  it("rejects Spark-only reasons when the report targets another kind of content", () => {
    expect(CreateReportBody.safeParse({
      reporter_id: 12,
      reported_user_id: 44,
      type: "sexual_content",
      description: "This report includes enough detail for review.",
    }).success).toBe(false);
  });

  it("rejects missing or ambiguous targets", () => {
    expect(CreateReportBody.safeParse({
      reporter_id: 12,
      type: "harassment",
      description: "This report includes enough detail for review.",
    }).success).toBe(false);
    expect(CreateReportBody.safeParse({
      ...baseReport,
      reported_user_id: 44,
      type: "hate_or_harassment",
    }).success).toBe(false);
  });

  it("keeps existing user-report reasons valid for their original target", () => {
    expect(CreateReportBody.safeParse({
      reporter_id: 12,
      reported_user_id: 44,
      type: "harassment",
      description: "This report includes enough detail for review.",
    }).success).toBe(true);
  });
});