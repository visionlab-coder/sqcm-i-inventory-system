-- Phase 4 staging: pin search_path on invoker functions reported by Supabase advisors.
-- public CREATE is revoked by migration 023, and pg_catalog is resolved explicitly first.
ALTER FUNCTION public.default_organization_id()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.set_audit_organization()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.ensure_asset_financial_profile()
  SET search_path = pg_catalog, public;
