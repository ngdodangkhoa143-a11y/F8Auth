import sqlite3
import os
import uuid
import shutil
from datetime import datetime, timedelta

DB_NAME = "f8auth.db"
LOCAL_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), DB_NAME)

# Vercel Serverless Function compatibility: use /tmp writeable folder
if os.environ.get("VERCEL") == "1":
    DB_PATH = os.path.join("/tmp", DB_NAME)
    if not os.path.exists(DB_PATH) and os.path.exists(LOCAL_DB_PATH):
        try:
            shutil.copy2(LOCAL_DB_PATH, DB_PATH)
        except Exception as e:
            pass
else:
    DB_PATH = LOCAL_DB_PATH

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for better concurrency and foreign keys support
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Developers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS developers (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT DEFAULT '',
        created_at TEXT NOT NULL
    )
    """)
    
    # Check if email column exists, if not, add it (safe schema migration)
    try:
        cursor.execute("ALTER TABLE developers ADD COLUMN email TEXT DEFAULT '';")
    except sqlite3.OperationalError:
        pass # Already exists
    
    # Developer sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dev_sessions (
        token TEXT PRIMARY KEY,
        developer_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE CASCADE
    )
    """)
    
    # Applications table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        secret TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        download_url TEXT NOT NULL DEFAULT '',
        hwid_lock INTEGER NOT NULL DEFAULT 1, -- 1 = Enabled, 0 = Disabled
        enabled INTEGER NOT NULL DEFAULT 1,    -- 1 = Enabled, 0 = Disabled
        banned INTEGER NOT NULL DEFAULT 0,     -- 1 = Banned, 0 = Active
        ban_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES developers(id) ON DELETE CASCADE
    )
    """)
    
    # License Keys table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS license_keys (
        id TEXT PRIMARY KEY,
        key_string TEXT UNIQUE NOT NULL,
        app_id TEXT NOT NULL,
        duration_days INTEGER NOT NULL, -- duration in days
        expiry_date TEXT,               -- set on first activation (ISO format)
        level INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'unused', -- 'unused', 'active', 'expired'
        hwid TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    )
    """)
    
    # Users registered to apps
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        hwid TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        key_used TEXT,
        created_at TEXT NOT NULL,
        last_login TEXT,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
        UNIQUE(app_id, username)
    )
    """)
    
    # Variables table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS variables (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
        UNIQUE(app_id, name)
    )
    """)
    
    # Files table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_url TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    )
    """)
    
    # Logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    )
    """)
    
    # Client sessions table (temporary sessions for integration SDK)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_sessions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        validated INTEGER NOT NULL DEFAULT 0,
        username TEXT,
        key_string TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()

# Developers Operations
def create_developer(username, password_hash, email=""):
    conn = get_db_connection()
    dev_id = uuid.uuid4().hex
    now = datetime.now().isoformat()
    try:
        conn.execute(
            "INSERT INTO developers (id, username, password_hash, email, created_at) VALUES (?, ?, ?, ?, ?)",
            (dev_id, username, password_hash, email, now)
        )
        conn.commit()
        return {"id": dev_id, "username": username, "email": email, "created_at": now}
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_developer_by_username(username):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM developers WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_developer_by_id(dev_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM developers WHERE id = ?", (dev_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

# Developer Sessions Operations
def create_dev_session(dev_id, token, expires_at):
    conn = get_db_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO dev_sessions (token, developer_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, dev_id, now, expires_at.isoformat())
    )
    conn.commit()
    conn.close()

def get_dev_session(token):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM dev_sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    if row:
        session = dict(row)
        expires_at = datetime.fromisoformat(session["expires_at"])
        if expires_at > datetime.now():
            return session
        else:
            delete_dev_session(token)
    return None

def delete_dev_session(token):
    conn = get_db_connection()
    conn.execute("DELETE FROM dev_sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

# Applications Operations
def create_application(name, secret, owner_id):
    conn = get_db_connection()
    app_id = uuid.uuid4().hex
    now = datetime.now().isoformat()
    try:
        conn.execute(
            "INSERT INTO applications (id, name, secret, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (app_id, name, secret, owner_id, now)
        )
        conn.commit()
        return {"id": app_id, "name": name, "secret": secret, "owner_id": owner_id, "created_at": now}
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_applications(owner_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM applications WHERE owner_id = ? ORDER BY created_at DESC", (owner_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_application_by_id(app_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_application_by_name(name):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM applications WHERE name = ?", (name,)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_application(app_id, version, download_url, hwid_lock, enabled, banned, ban_reason):
    conn = get_db_connection()
    conn.execute(
        """UPDATE applications 
           SET version = ?, download_url = ?, hwid_lock = ?, enabled = ?, banned = ?, ban_reason = ? 
           WHERE id = ?""",
        (version, download_url, hwid_lock, enabled, banned, ban_reason, app_id)
    )
    conn.commit()
    conn.close()

def delete_application(app_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()

# License Keys Operations
def create_keys(app_id, keys_list):
    conn = get_db_connection()
    now = datetime.now().isoformat()
    inserted_keys = []
    
    # We execute inserts in a transaction
    try:
        for k in keys_list:
            key_id = uuid.uuid4().hex
            key_string = k["key_string"]
            duration_days = k["duration_days"]
            level = k.get("level", 1)
            note = k.get("note", "")
            
            conn.execute(
                """INSERT INTO license_keys (id, key_string, app_id, duration_days, level, status, note, created_at)
                   VALUES (?, ?, ?, ?, ?, 'unused', ?, ?)""",
                (key_id, key_string, app_id, duration_days, level, note, now)
            )
            inserted_keys.append({
                "id": key_id,
                "key_string": key_string,
                "duration_days": duration_days,
                "level": level,
                "note": note,
                "status": "unused",
                "created_at": now
            })
        conn.commit()
        return inserted_keys
    except sqlite3.IntegrityError:
        conn.rollback()
        return None
    finally:
        conn.close()

def get_keys(app_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM license_keys WHERE app_id = ? ORDER BY created_at DESC", (app_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_key_by_string(key_string):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM license_keys WHERE key_string = ?", (key_string,)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_key_hwid(key_id, hwid):
    conn = get_db_connection()
    conn.execute("UPDATE license_keys SET hwid = ? WHERE id = ?", (hwid, key_id))
    conn.commit()
    conn.close()

def update_key_status(key_id, status, expiry_date=None):
    conn = get_db_connection()
    if expiry_date:
        conn.execute("UPDATE license_keys SET status = ?, expiry_date = ? WHERE id = ?", (status, expiry_date, key_id))
    else:
        conn.execute("UPDATE license_keys SET status = ? WHERE id = ?", (status, key_id))
    conn.commit()
    conn.close()

def reset_key_hwid(key_id):
    conn = get_db_connection()
    conn.execute("UPDATE license_keys SET hwid = NULL WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()

def delete_key(key_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM license_keys WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()

def delete_all_keys(app_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM license_keys WHERE app_id = ?", (app_id,))
    conn.commit()
    conn.close()

# App Users Operations
def create_user(app_id, username, password_hash, hwid, key_used, level):
    conn = get_db_connection()
    user_id = uuid.uuid4().hex
    now = datetime.now().isoformat()
    try:
        conn.execute(
            """INSERT INTO users (id, app_id, username, password_hash, hwid, level, key_used, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, app_id, username, password_hash, hwid, level, key_used, now)
        )
        conn.commit()
        return {"id": user_id, "app_id": app_id, "username": username, "level": level, "created_at": now}
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_user_by_username(app_id, username):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM users WHERE app_id = ? AND username = ?", (app_id, username)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_users(app_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM users WHERE app_id = ? ORDER BY created_at DESC", (app_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_user_hwid(user_id, hwid):
    conn = get_db_connection()
    conn.execute("UPDATE users SET hwid = ? WHERE id = ?", (hwid, user_id))
    conn.commit()
    conn.close()

def update_user_level(user_id, level):
    conn = get_db_connection()
    conn.execute("UPDATE users SET level = ? WHERE id = ?", (level, user_id))
    conn.commit()
    conn.close()

def update_user_password(user_id, password_hash):
    conn = get_db_connection()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
    conn.commit()
    conn.close()

def update_user_login_time(user_id):
    conn = get_db_connection()
    now = datetime.now().isoformat()
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))
    conn.commit()
    conn.close()

def delete_user(user_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

# Variables Operations
def create_variable(app_id, name, value):
    conn = get_db_connection()
    var_id = uuid.uuid4().hex
    try:
        conn.execute(
            "INSERT INTO variables (id, app_id, name, value) VALUES (?, ?, ?, ?)",
            (var_id, app_id, name, value)
        )
        conn.commit()
        return {"id": var_id, "app_id": app_id, "name": name, "value": value}
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_variables(app_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM variables WHERE app_id = ? ORDER BY name ASC", (app_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_variable_by_name(app_id, name):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM variables WHERE app_id = ? AND name = ?", (app_id, name)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_variable(var_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM variables WHERE id = ?", (var_id,))
    conn.commit()
    conn.close()

# Files Operations
def create_file(app_id, name, file_url, level):
    conn = get_db_connection()
    file_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO files (id, app_id, name, file_url, level) VALUES (?, ?, ?, ?, ?)",
        (file_id, app_id, name, file_url, level)
    )
    conn.commit()
    conn.close()
    return {"id": file_id, "app_id": app_id, "name": name, "file_url": file_url, "level": level}

def get_files(app_id):
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM files WHERE app_id = ? ORDER BY name ASC", (app_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_file_by_id(file_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_file(file_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()

# Logs Operations
def create_log(app_id, action, details, ip_address):
    conn = get_db_connection()
    log_id = uuid.uuid4().hex
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO logs (id, app_id, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (log_id, app_id, action, details, ip_address, now)
    )
    conn.commit()
    conn.close()

def get_logs(app_id, limit=200):
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT * FROM logs WHERE app_id = ? ORDER BY created_at DESC LIMIT ?", 
        (app_id, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def clear_logs(app_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM logs WHERE app_id = ?", (app_id,))
    conn.commit()
    conn.close()

# Client SDK Session Operations
def create_client_session(session_id, app_id, expires_at):
    conn = get_db_connection()
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO client_sessions (id, app_id, validated, created_at, expires_at) VALUES (?, ?, 0, ?, ?)",
        (session_id, app_id, now, expires_at.isoformat())
    )
    conn.commit()
    conn.close()

def get_client_session(session_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM client_sessions WHERE id = ?", (session_id,)).fetchone()
    conn.close()
    if row:
        session = dict(row)
        expires_at = datetime.fromisoformat(session["expires_at"])
        if expires_at > datetime.now():
            return session
        else:
            delete_client_session(session_id)
    return None

def validate_client_session(session_id, username=None, key_string=None):
    conn = get_db_connection()
    conn.execute(
        "UPDATE client_sessions SET validated = 1, username = ?, key_string = ? WHERE id = ?",
        (username, key_string, session_id)
    )
    conn.commit()
    conn.close()

def delete_client_session(session_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM client_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()

# Initialize DB on import if not exists
init_db()
