export * from "./generated/api";
// `export type *` (TS 5.0+) prevents value/type name collisions when orval
// generates both a Zod const (api.ts) and a TS interface (types/) with the
// same identifier — e.g. InviteBusinessMemberBody.
// Path-plus-query operations can legitimately generate the same name in both
// files (for example, GetCommunityHubMediaParams). Keep the generated type
// surface available under a namespace instead of making the package fail to
// compile on an ambiguous wildcard export.
export * as generatedTypes from "./generated/types";
