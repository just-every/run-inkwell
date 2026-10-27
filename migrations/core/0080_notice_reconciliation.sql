-- Pin each queued notice to the connection explicitly selected when it was created.
ALTER TABLE iw_notice_posts ADD COLUMN connection TEXT;
ALTER TABLE iw_notice_posts ADD COLUMN repairable INTEGER NOT NULL DEFAULT 0;
UPDATE iw_notice_posts SET connection=(SELECT sealed FROM iw_notice_channels c WHERE c.operator_id=iw_notice_posts.operator_id AND c.channel=iw_notice_posts.channel);
-- Historical failed attempts lack authenticated refusal evidence and stay unresolved.
UPDATE iw_notice_posts SET state='uncertain',result='Unconfirmed provider effect; do not replay.' WHERE state IN ('sending','failed') OR (state='pending' AND attempts>0);
