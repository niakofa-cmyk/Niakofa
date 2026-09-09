/**
 * Compatibility entry point for the Admin Operations GIS workflow.
 *
 * The implementation lives in BoundaryImportsReviewWorkflow so the legacy
 * component import remains stable while the reviewer state machine evolves.
 */
export {
  BoundaryImportsReviewWorkflow as BoundaryImportsReviewSection,
  getBoundaryStage,
  isBoundaryActive,
  isBoundaryReadyToPromote,
} from "./BoundaryImportsReviewWorkflow";
export type { BoundaryImportRow } from "./BoundaryImportsReviewWorkflow";
