-- ROUTE-008: the account's shared contact book, keyed by lower-case email. Installation state (not archived), like roles.
CREATE TABLE iw_contacts (email TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, company TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX iw_contacts_name ON iw_contacts(name COLLATE NOCASE);
