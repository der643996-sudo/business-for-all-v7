PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('owner','admin','editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL DEFAULT 'Business',
  academic_year TEXT NOT NULL DEFAULT '',
  study_level TEXT NOT NULL DEFAULT '',
  semester TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  resource_url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PDF',
  provider TEXT NOT NULL DEFAULT 'external',
  link_status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TEXT,
  content_type TEXT NOT NULL DEFAULT 'lectures',
  lecture_name TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0 CHECK(file_size >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  downloads INTEGER NOT NULL DEFAULT 0 CHECK(downloads >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high')),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subjects_taxonomy ON subjects(study_level,semester,department,academic_year,status);
CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_search ON resources(content_type,type,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_downloads ON resources(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_schedule ON announcements(status,pinned,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

INSERT OR IGNORE INTO settings(key,value) VALUES
  ('site_name','Business For All'),
  ('site_description','منصة تعليمية عصرية لطلاب إدارة الأعمال'),
  ('academic_year','2026/2027'),
  ('hero_badge','منصة المواد الدراسية'),
  ('footer_text','Business For All — كل المحتوى الأكاديمي في مكان واحد');
