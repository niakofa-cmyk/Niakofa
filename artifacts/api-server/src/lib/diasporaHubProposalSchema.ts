import { z } from "zod";

const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter country code")
  .transform((value) => value.toUpperCase());

const subdivisionCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "Use a two-letter state code")
  .transform((value) => value.toUpperCase())
  .nullable()
  .optional();

export const ProposeHubSchema = z.object({
  name: z.string().trim().min(2).max(120),
  display_name: z.string().trim().min(2).max(160).optional(),
  region_label: z.string().trim().min(2).max(200),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  tag: z.string().max(20).optional(),
  hub_scope: z.enum(["country", "us_state"]),
  country_code: countryCodeSchema,
  subdivision_code: subdivisionCodeSchema,
  anchor_city: z.string().trim().min(2).max(120),
  note: z.string().trim().max(500).optional(),
}).superRefine((hub, ctx) => {
  if (hub.hub_scope === "country") {
    if (hub.country_code === "US") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["country_code"],
        message: "U.S. Hubs must use state-level geography",
      });
    }
    if (hub.subdivision_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subdivision_code"],
        message: "Country Hubs cannot include a state code",
      });
    }
    return;
  }

  if (hub.country_code !== "US") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["country_code"],
      message: "State Hubs must use the US country code",
    });
  }
  if (!hub.subdivision_code) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subdivision_code"],
      message: "State Hubs require a state code",
    });
  }
});