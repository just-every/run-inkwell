-- Imported provider evidence remains separate from Inkwell signing records.
CREATE TABLE iw_imported_archives (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL UNIQUE,
 value TEXT NOT NULL CHECK(json_valid(value)),
 revision TEXT NOT NULL
);
