-- Tenant website/domain — a search hint for company-context enrichment (CTX-2).
-- Optional; when set, web-search enrichment targets this company directly
-- instead of guessing a domain from the slug (which found the wrong "Vizta").
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS domain text;
