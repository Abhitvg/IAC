-- Migration 0014: Contact Provenance Evidence for Hard Line H4
-- Rejects self-asserted labels: contacts require verified provenance records
-- (source URL, content hash, retrieved_at, provider record ID)

ALTER TABLE people ADD COLUMN IF NOT EXISTS provenance_evidence jsonb;

