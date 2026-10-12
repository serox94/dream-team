CREATE TABLE IF NOT EXISTS auth_accounts (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 angler_id TEXT NOT NULL UNIQUE REFERENCES anglers(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS auth_accounts_max_insert BEFORE INSERT ON auth_accounts
WHEN NEW.active=1 AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1)>=3
BEGIN SELECT RAISE(ABORT,'MAX_ACTIVE_ACCOUNTS'); END;
CREATE TRIGGER IF NOT EXISTS auth_accounts_max_update BEFORE UPDATE OF active ON auth_accounts
WHEN NEW.active=1 AND OLD.active=0 AND (SELECT COUNT(*) FROM auth_accounts WHERE active=1)>=3
BEGIN SELECT RAISE(ABORT,'MAX_ACTIVE_ACCOUNTS'); END;
CREATE TABLE IF NOT EXISTS auth_credential (
 id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 iterations INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO auth_accounts(id,username,angler_id)
SELECT 'account-'||id,'Patryk',id FROM anglers WHERE id='patryk';
INSERT OR IGNORE INTO auth_accounts(id,username,angler_id)
SELECT 'account-'||id,'Maciek',id FROM anglers WHERE id='maciek';
ALTER TABLE auth_sessions ADD COLUMN account_id TEXT REFERENCES auth_accounts(id);
ALTER TABLE auth_sessions ADD COLUMN auth_version INTEGER;
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','28',CURRENT_TIMESTAMP);
