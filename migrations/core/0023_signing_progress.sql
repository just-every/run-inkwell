-- SIGNX-001: what a signer has entered so far, saved so they can finish later from the same link. Unsigned entries,
-- not evidence and not archived; cleared when they sign or the envelope is declined or voided, erased with the envelope.
ALTER TABLE iw_signers ADD COLUMN progress TEXT;
