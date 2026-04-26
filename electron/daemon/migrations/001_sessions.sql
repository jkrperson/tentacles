CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  pid           INTEGER NOT NULL,
  cwd           TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  agent_type    TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  hook_id       TEXT,
  status        TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('running','needs_input','completed','idle','errored')),
  exit_code     INTEGER,
  last_activity INTEGER NOT NULL
);

CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);
CREATE INDEX idx_sessions_status ON sessions(status);
