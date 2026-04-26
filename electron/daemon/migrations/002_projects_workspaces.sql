CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  icon        TEXT,
  added_at    INTEGER NOT NULL,
  sort_order  REAL NOT NULL
);

CREATE INDEX idx_projects_sort_order ON projects(sort_order);

CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('main','worktree')),
  branch        TEXT NOT NULL,
  worktree_path TEXT,
  linked_pr     TEXT,
  linked_issue  TEXT,
  status        TEXT NOT NULL CHECK (status IN ('active','merged','stale','tearing_down')),
  name          TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  sort_order    REAL NOT NULL DEFAULT 0
);

CREATE INDEX idx_workspaces_project_id ON workspaces(project_id);
CREATE INDEX idx_workspaces_sort_order ON workspaces(project_id, sort_order);
