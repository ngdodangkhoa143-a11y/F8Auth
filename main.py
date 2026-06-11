import uvicorn
from fastapi import FastAPI, Depends, HTTPException, Request, Header, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import hashlib
import uuid
import os
from datetime import datetime, timedelta

import database as db

# Create directories if not exist (safe for read-only systems like Vercel)
try:
    os.makedirs("static/css", exist_ok=True)
    os.makedirs("static/js", exist_ok=True)
    os.makedirs("templates", exist_ok=True)
    os.makedirs("sdk", exist_ok=True)
except Exception:
    pass

app = FastAPI(
    title="F8Auth API",
    description="Backend API for F8Auth License Management System",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Password hashing helper
def hash_password(password: str) -> str:
    salt = "F8AuthSystemSalt__#2026"
    return hashlib.sha256((password + salt).encode()).hexdigest()

# Dependency to check developer token
def get_current_developer(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Header format: Bearer <token>
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    session = db.get_dev_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    
    developer = db.get_developer_by_id(session["developer_id"])
    if not developer:
        raise HTTPException(status_code=401, detail="Developer not found")
        
    return developer

# ==================== PYDANTIC SCHEMAS ====================
class DevRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: str = Field(..., min_length=3)

class DevLogin(BaseModel):
    username: str
    password: str

class AppCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=50)

class AppSettingsUpdate(BaseModel):
    version: str
    download_url: str
    hwid_lock: int
    enabled: int
    banned: int
    ban_reason: str

class KeysGenerate(BaseModel):
    amount: int = Field(1, ge=1, le=100)
    length: int = Field(16, ge=8, le=32)
    prefix: str = Field("", max_length=10)
    duration_days: int = Field(30, ge=1, le=3650)
    level: int = Field(1, ge=1, le=100)
    note: str = Field("", max_length=100)

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    level: int = Field(1, ge=1)

class UserLevelUpdate(BaseModel):
    level: int = Field(..., ge=1)

class UserPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=6)

class VarCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    value: str

class FileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    file_url: str
    level: int = Field(1, ge=1)

# Client SDK Schemas
class ClientInit(BaseModel):
    name: str
    ownerid: str
    secret: str
    version: str

class ClientRegister(BaseModel):
    sessionid: str
    username: str
    password: str
    key: str
    hwid: str

class ClientLogin(BaseModel):
    sessionid: str
    username: str
    password: str
    hwid: str

class ClientLicense(BaseModel):
    sessionid: str
    key: str
    hwid: str

class ClientVar(BaseModel):
    sessionid: str
    name: str

class ClientFile(BaseModel):
    sessionid: str
    fileid: str

class ClientLog(BaseModel):
    sessionid: str
    message: str

# ==================== MAIN PAGE ROUTE ====================
@app.get("/", response_class=HTMLResponse)
def read_root():
    index_path = os.path.join("templates", "index.html")
    if not os.path.exists(index_path):
        return "<h3>Index.html template has not been created yet. Please wait.</h3>"
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

# ==================== DEVELOPER AUTH APIs ====================
@app.post("/api/auth/register")
def register_developer(data: DevRegister):
    pwd_hash = hash_password(data.password)
    result = db.create_developer(data.username, pwd_hash, data.email)
    if not result:
        raise HTTPException(status_code=400, detail="Username already exists")
    return {"message": "Registration successful", "user": result}

@app.post("/api/auth/login")
def login_developer(data: DevLogin):
    dev = db.get_developer_by_username(data.username)
    if not dev:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    pwd_hash = hash_password(data.password)
    if dev["password_hash"] != pwd_hash:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    
    # Generate token
    token = uuid.uuid4().hex + uuid.uuid4().hex
    expires_at = datetime.now() + timedelta(days=7)
    db.create_dev_session(dev["id"], token, expires_at)
    
    return {
        "message": "Login successful",
        "token": token,
        "username": dev["username"],
        "id": dev["id"]
    }

@app.get("/api/auth/me")
def get_me(dev = Depends(get_current_developer)):
    return {
        "id": dev["id"],
        "username": dev["username"],
        "email": dev.get("email", ""),
        "created_at": dev["created_at"]
    }

@app.post("/api/auth/logout")
def logout_developer(authorization: Optional[str] = Header(None)):
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            db.delete_dev_session(parts[1])
    return {"message": "Logged out successfully"}

# ==================== DEVELOPER APP APIs ====================
@app.get("/api/developer/apps")
def get_apps(dev = Depends(get_current_developer)):
    return db.get_applications(dev["id"])

@app.post("/api/developer/apps")
def create_app(data: AppCreate, dev = Depends(get_current_developer)):
    secret = uuid.uuid4().hex
    app_record = db.create_application(data.name, secret, dev["id"])
    if not app_record:
        raise HTTPException(status_code=400, detail="Application name already exists")
    db.create_log(app_record["id"], "App Created", f"Application '{data.name}' was created successfully.", "127.0.0.1")
    return app_record

@app.get("/api/developer/apps/{app_id}")
def get_app_details(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return app_record

@app.post("/api/developer/apps/{app_id}/settings")
def update_app_settings(app_id: str, data: AppSettingsUpdate, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    db.update_application(
        app_id, 
        data.version, 
        data.download_url, 
        data.hwid_lock, 
        data.enabled, 
        data.banned, 
        data.ban_reason
    )
    db.create_log(app_id, "Settings Updated", "Application settings were updated.", "127.0.0.1")
    return {"message": "Settings updated successfully"}

@app.delete("/api/developer/apps/{app_id}")
def delete_app(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    db.delete_application(app_id)
    return {"message": "Application deleted successfully"}

# ==================== DEVELOPER KEYS APIs ====================
@app.get("/api/developer/apps/{app_id}/keys")
def get_app_keys(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return db.get_keys(app_id)

@app.post("/api/developer/apps/{app_id}/keys")
def generate_app_keys(app_id: str, data: KeysGenerate, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    keys_list = []
    import random
    import string
    
    chars = string.ascii_uppercase + string.digits
    for _ in range(data.amount):
        # Generate random key
        random_part = "".join(random.choice(chars) for _ in range(data.length))
        key_str = f"{data.prefix}{random_part}"
        keys_list.append({
            "key_string": key_str,
            "duration_days": data.duration_days,
            "level": data.level,
            "note": data.note
        })
        
    result = db.create_keys(app_id, keys_list)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to generate keys (duplicate key conflict)")
    
    db.create_log(app_id, "Keys Generated", f"Generated {data.amount} license keys.", "127.0.0.1")
    return result

@app.delete("/api/developer/keys/{key_id}")
def delete_key(key_id: str, dev = Depends(get_current_developer)):
    # Verify key belongs to app owned by developer
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT k.*, a.owner_id, a.id as app_id FROM license_keys k 
           JOIN applications a ON k.app_id = a.id 
           WHERE k.id = ?""", (key_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="License key not found")
        
    db.delete_key(key_id)
    db.create_log(row["app_id"], "Key Deleted", f"Key '{row['key_string']}' was deleted.", "127.0.0.1")
    return {"message": "License key deleted"}

@app.post("/api/developer/keys/{key_id}/reset-hwid")
def reset_key_hwid(key_id: str, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT k.*, a.owner_id, a.id as app_id FROM license_keys k 
           JOIN applications a ON k.app_id = a.id 
           WHERE k.id = ?""", (key_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="License key not found")
        
    db.reset_key_hwid(key_id)
    db.create_log(row["app_id"], "Key HWID Reset", f"HWID for Key '{row['key_string']}' was reset.", "127.0.0.1")
    return {"message": "License key HWID reset successful"}

@app.delete("/api/developer/apps/{app_id}/keys/clear")
def delete_all_keys(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    db.delete_all_keys(app_id)
    db.create_log(app_id, "Keys Cleared", "All license keys were deleted.", "127.0.0.1")
    return {"message": "All keys deleted successfully"}

# ==================== DEVELOPER USERS APIs ====================
@app.get("/api/developer/apps/{app_id}/users")
def get_app_users(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return db.get_users(app_id)

@app.post("/api/developer/apps/{app_id}/users")
def create_app_user(app_id: str, data: UserCreate, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    pwd_hash = hash_password(data.password)
    result = db.create_user(app_id, data.username, pwd_hash, None, "Created by Dev", data.level)
    if not result:
        raise HTTPException(status_code=400, detail="Username already registered in this application")
    
    db.create_log(app_id, "User Created", f"User '{data.username}' was manually created.", "127.0.0.1")
    return result

@app.delete("/api/developer/users/{user_id}")
def delete_user(user_id: str, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT u.*, a.owner_id, a.id as app_id FROM users u 
           JOIN applications a ON u.app_id = a.id 
           WHERE u.id = ?""", (user_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete_user(user_id)
    db.create_log(row["app_id"], "User Deleted", f"User '{row['username']}' was deleted.", "127.0.0.1")
    return {"message": "User deleted"}

@app.post("/api/developer/users/{user_id}/reset-hwid")
def reset_user_hwid(user_id: str, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT u.*, a.owner_id, a.id as app_id FROM users u 
           JOIN applications a ON u.app_id = a.id 
           WHERE u.id = ?""", (user_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.update_user_hwid(user_id, None)
    db.create_log(row["app_id"], "User HWID Reset", f"HWID for User '{row['username']}' was reset.", "127.0.0.1")
    return {"message": "User HWID reset successful"}

@app.post("/api/developer/users/{user_id}/level")
def update_user_level(user_id: str, data: UserLevelUpdate, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT u.*, a.owner_id, a.id as app_id FROM users u 
           JOIN applications a ON u.app_id = a.id 
           WHERE u.id = ?""", (user_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.update_user_level(user_id, data.level)
    db.create_log(row["app_id"], "User Level Updated", f"Level for User '{row['username']}' updated to {data.level}.", "127.0.0.1")
    return {"message": "User level updated"}

@app.post("/api/developer/users/{user_id}/password")
def update_user_password(user_id: str, data: UserPasswordUpdate, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT u.*, a.owner_id, a.id as app_id FROM users u 
           JOIN applications a ON u.app_id = a.id 
           WHERE u.id = ?""", (user_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="User not found")
        
    pwd_hash = hash_password(data.password)
    db.update_user_password(user_id, pwd_hash)
    db.create_log(row["app_id"], "User Password Changed", f"Password for User '{row['username']}' was changed.", "127.0.0.1")
    return {"message": "User password updated"}

# ==================== DEVELOPER VARIABLES APIs ====================
@app.get("/api/developer/apps/{app_id}/variables")
def get_app_variables(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return db.get_variables(app_id)

@app.post("/api/developer/apps/{app_id}/variables")
def create_app_variable(app_id: str, data: VarCreate, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    result = db.create_variable(app_id, data.name, data.value)
    if not result:
        raise HTTPException(status_code=400, detail="Variable name already exists in this application")
    
    db.create_log(app_id, "Variable Created", f"Variable '{data.name}' was created.", "127.0.0.1")
    return result

@app.delete("/api/developer/variables/{var_id}")
def delete_variable(var_id: str, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT v.*, a.owner_id, a.id as app_id FROM variables v 
           JOIN applications a ON v.app_id = a.id 
           WHERE v.id = ?""", (var_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Variable not found")
        
    db.delete_variable(var_id)
    db.create_log(row["app_id"], "Variable Deleted", f"Variable '{row['name']}' was deleted.", "127.0.0.1")
    return {"message": "Variable deleted"}

# ==================== DEVELOPER FILES APIs ====================
@app.get("/api/developer/apps/{app_id}/files")
def get_app_files(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return db.get_files(app_id)

@app.post("/api/developer/apps/{app_id}/files")
def create_app_file(app_id: str, data: FileCreate, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    
    result = db.create_file(app_id, data.name, data.file_url, data.level)
    db.create_log(app_id, "File Added", f"File '{data.name}' was added.", "127.0.0.1")
    return result

@app.delete("/api/developer/files/{file_id}")
def delete_file(file_id: str, dev = Depends(get_current_developer)):
    conn = db.get_db_connection()
    row = conn.execute(
        """SELECT f.*, a.owner_id, a.id as app_id FROM files f 
           JOIN applications a ON f.app_id = a.id 
           WHERE f.id = ?""", (file_id,)
    ).fetchone()
    conn.close()
    
    if not row or row["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="File not found")
        
    db.delete_file(file_id)
    db.create_log(row["app_id"], "File Deleted", f"File '{row['name']}' was deleted.", "127.0.0.1")
    return {"message": "File deleted"}

# ==================== DEVELOPER LOGS APIs ====================
@app.get("/api/developer/apps/{app_id}/logs")
def get_app_logs(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    return db.get_logs(app_id)

@app.delete("/api/developer/apps/{app_id}/logs/clear")
def clear_app_logs(app_id: str, dev = Depends(get_current_developer)):
    app_record = db.get_application_by_id(app_id)
    if not app_record or app_record["owner_id"] != dev["id"]:
        raise HTTPException(status_code=404, detail="Application not found")
    db.clear_logs(app_id)
    db.create_log(app_id, "Logs Cleared", "System logs were cleared by developer.", "127.0.0.1")
    return {"message": "Logs cleared successfully"}


# ==================== CLIENT SDK INTEGRATION APIs ====================

@app.post("/api/client/init")
def client_init(data: ClientInit, request: Request):
    ip = request.client.host
    app_record = db.get_application_by_name(data.name)
    
    if not app_record:
        return JSONResponse(status_code=200, content={"success": False, "message": "Application not found"})
        
    if app_record["secret"] != data.secret or app_record["owner_id"] != data.ownerid:
        db.create_log(app_record["id"], "Failed Init", "Init credentials mismatch", ip)
        return JSONResponse(status_code=200, content={"success": False, "message": "Application credentials mismatch"})
        
    if not app_record["enabled"]:
        return JSONResponse(status_code=200, content={"success": False, "message": "Application is currently disabled by developer"})
        
    if app_record["banned"]:
        reason = app_record["ban_reason"] or "No reason provided"
        return JSONResponse(status_code=200, content={"success": False, "message": f"Application is banned. Reason: {reason}"})
        
    # Version check
    if app_record["version"] != data.version:
        return JSONResponse(status_code=200, content={
            "success": False, 
            "message": f"Version mismatch. Update required!",
            "download": app_record["download_url"]
        })
        
    # Generate client session
    session_id = uuid.uuid4().hex[:16]
    expires_at = datetime.now() + timedelta(hours=2)
    db.create_client_session(session_id, app_record["id"], expires_at)
    
    db.create_log(app_record["id"], "Client Init", f"Session '{session_id}' initialized", ip)
    
    return {
        "success": True,
        "sessionid": session_id,
        "message": "Initialized successfully",
        "download": app_record["download_url"],
        "hwid_lock": bool(app_record["hwid_lock"])
    }

@app.post("/api/client/register")
def client_register(data: ClientRegister, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid or expired session. Please re-initialize."})
        
    app_id = session["app_id"]
    app_record = db.get_application_by_id(app_id)
    
    # Check license key
    key_record = db.get_key_by_string(data.key)
    if not key_record or key_record["app_id"] != app_id:
        db.create_log(app_id, "Register Failed", f"Key '{data.key}' not found or belongs to another application.", ip)
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid license key"})
        
    if key_record["status"] != 'unused':
        return JSONResponse(status_code=200, content={"success": False, "message": f"License key has already been used and is {key_record['status']}"})
        
    # Create user
    pwd_hash = hash_password(data.password)
    # HWID lock logic
    hwid = data.hwid if app_record["hwid_lock"] else None
    
    user_record = db.create_user(app_id, data.username, pwd_hash, hwid, data.key, key_record["level"])
    if not user_record:
        return JSONResponse(status_code=200, content={"success": False, "message": "Username already exists in this application"})
        
    # Update key status
    expiry = (datetime.now() + timedelta(days=key_record["duration_days"])).isoformat()
    db.update_key_status(key_record["id"], "active", expiry)
    db.update_key_hwid(key_record["id"], hwid)
    
    # Validate session
    db.validate_client_session(data.sessionid, username=data.username, key_string=data.key)
    
    db.create_log(app_id, "User Registered", f"Username: '{data.username}' registered using Key: '{data.key}'", ip)
    
    return {"success": True, "message": "Registration successful. You can now login!"}

@app.post("/api/client/login")
def client_login(data: ClientLogin, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid or expired session. Please re-initialize."})
        
    app_id = session["app_id"]
    app_record = db.get_application_by_id(app_id)
    
    user = db.get_user_by_username(app_id, data.username)
    if not user:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid username or password"})
        
    pwd_hash = hash_password(data.password)
    if user["password_hash"] != pwd_hash:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid username or password"})
        
    # HWID check
    if app_record["hwid_lock"]:
        if user["hwid"] is None:
            # First login, bind HWID
            db.update_user_hwid(user["id"], data.hwid)
            user["hwid"] = data.hwid
            db.create_log(app_id, "HWID Bound", f"User '{data.username}' HWID bound to '{data.hwid}'", ip)
        elif user["hwid"] != data.hwid:
            db.create_log(app_id, "HWID Mismatch", f"User '{data.username}' login failed due to HWID mismatch. Expected: {user['hwid']}, Got: {data.hwid}", ip)
            return JSONResponse(status_code=200, content={"success": False, "message": "Hardware ID mismatch. Please ask developer to reset HWID."})
            
    # Check expiry through key
    key_used = user["key_used"]
    if key_used and key_used != "Created by Dev":
        key_record = db.get_key_by_string(key_used)
        if key_record:
            if key_record["expiry_date"]:
                expiry_dt = datetime.fromisoformat(key_record["expiry_date"])
                if expiry_dt < datetime.now():
                    db.update_key_status(key_record["id"], "expired")
                    db.create_log(app_id, "Key Expired", f"User '{data.username}' login failed (key '{key_used}' expired)", ip)
                    return JSONResponse(status_code=200, content={"success": False, "message": "License key has expired"})
            
    # Validate session
    db.validate_client_session(data.sessionid, username=data.username, key_string=key_used)
    db.update_user_login_time(user["id"])
    
    # Find expiry date string
    expiry_str = "Lifetime"
    if key_used and key_used != "Created by Dev":
        key_record = db.get_key_by_string(key_used)
        if key_record and key_record["expiry_date"]:
            expiry_str = key_record["expiry_date"]
            
    db.create_log(app_id, "User Login", f"User '{data.username}' logged in successfully", ip)
    
    return {
        "success": True,
        "message": "Login successful",
        "user_data": {
            "username": user["username"],
            "level": user["level"],
            "created_at": user["created_at"],
            "expires": expiry_str
        }
    }

@app.post("/api/client/license")
def client_license(data: ClientLicense, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid or expired session. Please re-initialize."})
        
    app_id = session["app_id"]
    app_record = db.get_application_by_id(app_id)
    
    key_record = db.get_key_by_string(data.key)
    if not key_record or key_record["app_id"] != app_id:
        db.create_log(app_id, "License Auth Failed", f"Key '{data.key}' not found or belongs to another application.", ip)
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid license key"})
        
    if key_record["status"] == "expired":
        return JSONResponse(status_code=200, content={"success": False, "message": "License key has expired"})
        
    # Check expiry if active
    if key_record["status"] == "active" and key_record["expiry_date"]:
        expiry_dt = datetime.fromisoformat(key_record["expiry_date"])
        if expiry_dt < datetime.now():
            db.update_key_status(key_record["id"], "expired")
            db.create_log(app_id, "Key Expired", f"License check failed for Key '{data.key}' (expired)", ip)
            return JSONResponse(status_code=200, content={"success": False, "message": "License key has expired"})
            
    # If unused, activate it
    if key_record["status"] == "unused":
        expiry = (datetime.now() + timedelta(days=key_record["duration_days"])).isoformat()
        db.update_key_status(key_record["id"], "active", expiry)
        db.update_key_hwid(key_record["id"], data.hwid if app_record["hwid_lock"] else None)
        key_record["status"] = "active"
        key_record["expiry_date"] = expiry
        key_record["hwid"] = data.hwid if app_record["hwid_lock"] else None
        db.create_log(app_id, "Key Activated", f"Key '{data.key}' was activated", ip)
    else:
        # Check HWID lock
        if app_record["hwid_lock"]:
            if key_record["hwid"] is None:
                db.update_key_hwid(key_record["id"], data.hwid)
                key_record["hwid"] = data.hwid
            elif key_record["hwid"] != data.hwid:
                db.create_log(app_id, "HWID Mismatch", f"Key '{data.key}' license check failed due to HWID mismatch. Expected: {key_record['hwid']}, Got: {data.hwid}", ip)
                return JSONResponse(status_code=200, content={"success": False, "message": "Hardware ID mismatch. Please ask developer to reset HWID."})
                
    # Validate session
    db.validate_client_session(data.sessionid, username=f"key_{data.key[:8]}", key_string=data.key)
    
    db.create_log(app_id, "Key Login", f"Key '{data.key}' validated successfully", ip)
    
    return {
        "success": True,
        "message": "Key authenticated successfully",
        "user_data": {
            "username": f"key_{data.key[:8]}",
            "level": key_record["level"],
            "created_at": key_record["created_at"],
            "expires": key_record["expiry_date"]
        }
    }

@app.post("/api/client/var")
def client_var(data: ClientVar, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid session"})
        
    if not session["validated"]:
        return JSONResponse(status_code=200, content={"success": False, "message": "Session not logged in or authorized"})
        
    app_id = session["app_id"]
    var_record = db.get_variable_by_name(app_id, data.name)
    if not var_record:
        return JSONResponse(status_code=200, content={"success": False, "message": "Variable not found"})
        
    db.create_log(app_id, "Client Var Read", f"Session retrieved variable '{data.name}'", ip)
    return {"success": True, "value": var_record["value"]}

@app.post("/api/client/file")
def client_file(data: ClientFile, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid session"})
        
    if not session["validated"]:
        return JSONResponse(status_code=200, content={"success": False, "message": "Session not logged in or authorized"})
        
    app_id = session["app_id"]
    file_record = db.get_file_by_id(data.fileid)
    if not file_record or file_record["app_id"] != app_id:
        return JSONResponse(status_code=200, content={"success": False, "message": "File not found"})
        
    # Check level permission
    # Get user level
    user_level = 1
    if session["username"]:
        user = db.get_user_by_username(app_id, session["username"])
        if user:
            user_level = user["level"]
        else:
            # Check key
            key_record = db.get_key_by_string(session["key_string"])
            if key_record:
                user_level = key_record["level"]
                
    if user_level < file_record["level"]:
        db.create_log(app_id, "File Read Blocked", f"Session blocked from file '{file_record['name']}' due to level mismatch (User level: {user_level}, File level: {file_record['level']})", ip)
        return JSONResponse(status_code=200, content={"success": False, "message": "Your user level is insufficient to download this file"})
        
    db.create_log(app_id, "Client File Download", f"Session retrieved file URL for '{file_record['name']}'", ip)
    return {
        "success": True, 
        "name": file_record["name"],
        "file_url": file_record["file_url"]
    }

@app.post("/api/client/log")
def client_log(data: ClientLog, request: Request):
    ip = request.client.host
    session = db.get_client_session(data.sessionid)
    if not session:
        return JSONResponse(status_code=200, content={"success": False, "message": "Invalid session"})
        
    app_id = session["app_id"]
    # Log message
    db.create_log(app_id, "Client Log", f"[Session: {data.sessionid}] {data.message}", ip)
    return {"success": True}


# Start the FastAPI server locally
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
