-- DELIV-008: sender notifications. Each notice is a feed row for one member; its channel posts wait in iw_notice_posts
-- until sent. Each member's choices per event and channel, and the webhook URLs they connected (sealed, with a masked
-- form to show), are installation state.
CREATE TABLE iw_notices (id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, envelope_id TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL, title TEXT NOT NULL, recipient TEXT NOT NULL DEFAULT '');
CREATE INDEX iw_notices_by_operator ON iw_notices(operator_id, at DESC, id DESC);
CREATE TABLE iw_notice_posts (id TEXT PRIMARY KEY, notice_id TEXT NOT NULL, operator_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('slack','teams','nook')), body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', result TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX iw_notice_posts_pending ON iw_notice_posts(state);
CREATE TABLE iw_notice_prefs (operator_id TEXT NOT NULL, event TEXT NOT NULL, channel TEXT NOT NULL, enabled INTEGER NOT NULL, PRIMARY KEY(operator_id, event, channel));
CREATE TABLE iw_notice_channels (operator_id TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('slack','teams','nook')), sealed TEXT NOT NULL, masked TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(operator_id, channel));
