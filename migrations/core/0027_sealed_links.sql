-- DELIV-005: each signer's current invitation link, sealed with AES-GCM under a key derived from the installation's
-- SESSION_SECRET (src/inkwell/links.ts), so Resend can send the same link again. A secret column: never archived or
-- exported (archive-policy.mjs), cleared when the link rotates, the signer signs or the envelope closes.
ALTER TABLE iw_signers ADD COLUMN link_sealed TEXT;
