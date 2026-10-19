-- Explicit release migration only. Existing business rows and credentials are untouched.
ALTER TABLE auth_accounts ADD COLUMN protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1));
CREATE TABLE auth_account_credentials (
 account_id TEXT PRIMARY KEY REFERENCES auth_accounts(id), salt TEXT NOT NULL,
 password_hash TEXT NOT NULL, iterations INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 must_change INTEGER NOT NULL DEFAULT 1 CHECK(must_change IN (0,1))
);
DROP TRIGGER auth_accounts_max_insert;
DROP TRIGGER auth_accounts_max_update;
CREATE TRIGGER auth_accounts_max_insert BEFORE INSERT ON auth_accounts
WHEN NEW.active=1 AND NEW.protected=0 AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1 AND protected=0)>=3
BEGIN SELECT RAISE(ABORT,'MAX_ACTIVE_ACCOUNTS'); END;
CREATE TRIGGER auth_accounts_max_update BEFORE UPDATE ON auth_accounts
WHEN NEW.active=1 AND NEW.protected=0 AND (OLD.active=0 OR OLD.protected=1) AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1 AND protected=0)>=3
BEGIN SELECT RAISE(ABORT,'MAX_ACTIVE_ACCOUNTS'); END;
CREATE TRIGGER auth_accounts_keep_last_update BEFORE UPDATE OF active ON auth_accounts
WHEN OLD.active=1 AND NEW.active=0 AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ACCOUNT'); END;
CREATE TRIGGER auth_accounts_keep_last_delete BEFORE DELETE ON auth_accounts
WHEN OLD.active=1 AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1)<=1
BEGIN SELECT RAISE(ABORT,'LAST_ACTIVE_ACCOUNT'); END;
CREATE TRIGGER auth_accounts_protected_delete BEFORE DELETE ON auth_accounts WHEN OLD.protected=1
BEGIN SELECT RAISE(ABORT,'PROTECTED_ACCOUNT'); END;
CREATE TRIGGER auth_accounts_protected_update BEFORE UPDATE ON auth_accounts
WHEN OLD.protected=1 AND (NEW.protected<>1 OR NEW.active<>1 OR NEW.username<>OLD.username OR NEW.id<>OLD.id OR NEW.angler_id<>OLD.angler_id)
BEGIN SELECT RAISE(ABORT,'PROTECTED_ACCOUNT'); END;
CREATE TABLE content_translations (
 entity TEXT NOT NULL, record_id TEXT NOT NULL, field TEXT NOT NULL, language TEXT NOT NULL CHECK(language IN ('pl','en')),
 source_hash TEXT NOT NULL, translated_text TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES auth_accounts(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(entity,record_id,field,language)
);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','29',CURRENT_TIMESTAMP);
