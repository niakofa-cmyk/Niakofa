import { z } from "zod";

export const SPARK_REPORT_TYPES = [
  "sexual_content",
  "hate_or_harassment",
  "self_harm",
  "copyright_or_ip",
] as const;

const REPORT_TYPES = [
  "suspicious_request",
  "suspicious_helper",
  "fraud",
  "harassment",
  "fake_profile",
  "dangerous_behavior",
  "spam",
  "commercial_pricing",
  "spam_or_solicitation",
  "unsafe_or_harmful",
  ...SPARK_REPORT_TYPES,
  "other",
  "sos",
] as const;

export const CreateReportBody = z.object({
  reporter_id: z.number().int().positive(),
  reported_user_id: z.number().int().positive().nullable().optional(),
  reported_request_id: z.number().int().positive().nullable().optional(),
  reported_griot_story_id: z.number().int().positive().nullable().optional(),
  reported_community_story_id: z.number().int().positive().nullable().optional(),
  type: z.enum(REPORT_TYPES),
  description: z.string().min(10).max(2000),
}).superRefine((report, ctx) => {
  const targetCount = [
    report.reported_user_id,
    report.reported_request_id,
    report.reported_griot_story_id,
    report.reported_community_story_id,
  ].filter(value => value !== undefined && value !== null).length;
  if (targetCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Specify exactly one report target",
    });
  }

  const isSparkReason = (SPARK_REPORT_TYPES as readonly string[]).includes(report.type);
  const targetsSpark = report.reported_community_story_id != null;
  if (targetsSpark && !isSparkReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      message: "Choose a specific safety reason for a Spark or Moment report",
    });
  } else if (!targetsSpark && isSparkReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["type"],
      message: "This reason is only available for Spark or Moment reports",
    });
  }
});