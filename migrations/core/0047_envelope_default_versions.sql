-- ADMIN-004: retain each explicit default save for the future ADMIN-005 account log.
-- Installation settings/history stay local until the account audit restore merge hook ships.
CREATE TABLE iw_envelope_default_versions (
 version INTEGER PRIMARY KEY, actor TEXT NOT NULL, at TEXT NOT NULL,
 before_value TEXT NOT NULL, after_value TEXT NOT NULL
);
CREATE TRIGGER iw_envelope_defaults_no_update BEFORE UPDATE ON iw_envelope_default_versions
BEGIN SELECT RAISE(ABORT,'Envelope default history is append-only'); END;
CREATE TRIGGER iw_envelope_defaults_no_delete BEFORE DELETE ON iw_envelope_default_versions
BEGIN SELECT RAISE(ABORT,'Envelope default history is append-only'); END;
