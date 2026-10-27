-- Provider cursor is installation state; it is never restored with business records.
CREATE TABLE iw_google_reply_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),mailbox_hash TEXT NOT NULL,history_id TEXT NOT NULL);
