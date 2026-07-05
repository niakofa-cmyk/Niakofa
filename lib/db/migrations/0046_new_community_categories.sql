-- Migration 0046: Add 6 new community-support categories to help_request_category enum
-- These categories exist in the OpenAPI spec and frontend form (request-new.tsx)
-- but were never added to the PostgreSQL enum, causing constraint errors on insert.
-- Uses IF NOT EXISTS to be safe on re-run (idempotent).

ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'legal_aid';
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'financial_coaching';
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'job_assistance';
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'language_help';
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'mental_health_peer';
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'technology_help';
