-- Pin each queued notice to the connection explicitly selected when it was created.
ALTER TABLE iw_notice_posts ADD COLUMN connection TEXT;
ALTER TABLE iw_notice_posts ADD COLUMN repairable INTEGER NOT NULL DEFAULT 0;
-- Historical failed attempts lack authenticated refusal evidence and stay unresolved.
UPDATE iw_notice_posts SET state='uncertain',result='Unconfirmed provider effect; do not replay.' WHERE state IN ('sending','failed') OR (state='pending' AND attempts>0);
