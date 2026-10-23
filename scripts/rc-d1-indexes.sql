-- Optional additive indexes; schema and all row values remain unchanged.
CREATE INDEX IF NOT EXISTS translation_jobs_status_time ON translation_jobs(status,updated_at,entity,record_id,field);
