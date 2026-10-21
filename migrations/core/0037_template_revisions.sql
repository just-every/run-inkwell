-- SEND-001: an installation-local live revision survives edits, deletion and restoration of earlier content.
CREATE TABLE iw_template_revisions (template_id TEXT PRIMARY KEY, revision TEXT NOT NULL);
INSERT INTO iw_template_revisions SELECT id,lower(hex(randomblob(16))) FROM iw_templates;
CREATE TRIGGER iw_template_revision_insert AFTER INSERT ON iw_templates BEGIN
  INSERT INTO iw_template_revisions VALUES(NEW.id,lower(hex(randomblob(16)))) ON CONFLICT(template_id) DO UPDATE SET revision=lower(hex(randomblob(16)));
END;
CREATE TRIGGER iw_template_revision_update AFTER UPDATE ON iw_templates BEGIN
  INSERT INTO iw_template_revisions VALUES(NEW.id,lower(hex(randomblob(16)))) ON CONFLICT(template_id) DO UPDATE SET revision=lower(hex(randomblob(16)));
END;
CREATE TRIGGER iw_template_revision_delete AFTER DELETE ON iw_templates BEGIN
  INSERT INTO iw_template_revisions VALUES(OLD.id,lower(hex(randomblob(16)))) ON CONFLICT(template_id) DO UPDATE SET revision=lower(hex(randomblob(16)));
END;
