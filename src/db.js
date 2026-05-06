const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

const dataDir = path.join(__dirname, '../data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new sqlite3.Database(path.join(dataDir, 'dx.db'))

// Promisify helpers
db.run_p = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function (err) { if (err) rej(err); else res(this) }))
db.all_p = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows)))
db.get_p = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row)))

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department TEXT DEFAULT '',
    participants TEXT DEFAULT '[]',
    meeting_date TEXT DEFAULT '',
    problem TEXT DEFAULT '',
    demo_link TEXT DEFAULT '',
    status TEXT DEFAULT 'feedback',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reject_reason TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    voter TEXT NOT NULL,
    vote_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(feedback_id, voter)
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    version TEXT NOT NULL,
    changelog TEXT DEFAULT '',
    demo_link TEXT DEFAULT '',
    status TEXT DEFAULT 'development',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS acceptances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL,
    person TEXT NOT NULL,
    department TEXT DEFAULT '',
    confirmed_use INTEGER DEFAULT 0,
    confirmed_trained INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(version_id, person)
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS training (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    type TEXT DEFAULT 'doc',
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`ALTER TABLE feedback ADD COLUMN priority INTEGER DEFAULT 0`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN module_type TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN attachment TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN attachment_name TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN deadline TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN expected_users TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN expected_outcome TEXT DEFAULT ''`,[],()=>{})
  db.run(`ALTER TABLE projects ADD COLUMN contact TEXT DEFAULT ''`,[],()=>{})

  // Module: Class Manager
  db.run(`CREATE TABLE IF NOT EXISTS cm_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    teacher TEXT DEFAULT '',
    schedule TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    max_students INTEGER DEFAULT 30,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS cm_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    dob TEXT DEFAULT '',
    address TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    joined_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Module: Attendance - Điểm danh học viên
  db.run(`CREATE TABLE IF NOT EXISTS cm_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'present',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Module: Scores - Điểm học viên (Toán, Văn, Anh)
  db.run(`CREATE TABLE IF NOT EXISTS cm_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    score REAL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Nhiều file đính kèm cho dự án
  db.run(`CREATE TABLE IF NOT EXISTS project_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Module: Factory Infrastructure Management - Quản lý hạ tầng nhà máy
  db.run(`CREATE TABLE IF NOT EXISTS inf_factories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    location TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS inf_level1 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factory_id INTEGER NOT NULL,
    sys_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    capacity REAL DEFAULT 0,
    unit TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS inf_level2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level1_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    capacity REAL DEFAULT 0,
    unit TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS inf_machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level2_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    demand REAL DEFAULT 0,
    duty_factor REAL DEFAULT 0.7,
    voltage REAL DEFAULT 380,
    power_factor REAL DEFAULT 0.85,
    status TEXT DEFAULT 'active',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Module: Asset Inventory - Kiểm kê tài sản
  db.run(`CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    location TEXT DEFAULT '',
    department TEXT DEFAULT '',
    status TEXT DEFAULT 'in_use',
    purchase_date TEXT DEFAULT '',
    purchase_value REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    description TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS asset_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_status TEXT DEFAULT '',
    new_status TEXT DEFAULT '',
    note TEXT DEFAULT '',
    changed_by TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS feedback_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)

  // Module: Task Logs - kết quả Claude Code báo về
  db.run(`CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT DEFAULT '',
    files_changed TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`)
})

module.exports = db
