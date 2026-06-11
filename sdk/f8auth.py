import requests
import hashlib
import uuid
import sys

# DEFAULT LOCAL TEST ENDPOINT
DEFAULT_API_BASE = "http://localhost:8000"

class F8AuthClient:
    def __init__(self, api_base, app_name, owner_id, app_secret, version):
        self.api_base = api_base.rstrip('/')
        self.app_name = app_name
        self.owner_id = owner_id
        self.app_secret = app_secret
        self.version = version
        self.session_id = None
        self.hwid = self.get_hwid()
        
    def get_hwid(self):
        # Generate hardware ID bound to node uuid
        node_str = str(uuid.getnode())
        return hashlib.sha256(node_str.encode()).hexdigest()

    def init(self):
        url = f"{self.api_base}/api/client/init"
        payload = {
            "name": self.app_name,
            "ownerid": self.owner_id,
            "secret": self.app_secret,
            "version": self.version
        }
        try:
            r = requests.post(url, json=payload).json()
            if r.get("success"):
                self.session_id = r["sessionid"]
                print(f"\n[+] Init successful!")
                print(f"    - Session ID: {self.session_id}")
                print(f"    - HWID Lock Enabled: {r.get('hwid_lock')}")
                if r.get("download"):
                    print(f"    - Download URL: {r.get('download')}")
                return True
            else:
                print(f"\n[-] Init failed: {r.get('message')}")
                if "download" in r and r["download"]:
                    print(f"[!] You can download the latest version here: {r['download']}")
                return False
        except Exception as e:
            print(f"\n[-] Failed to connect to F8Auth server: {e}")
            return False

    def register(self, username, password, key):
        if not self.session_id:
            print("[-] Error: Session not initialized (run init first)!")
            return False
        url = f"{self.api_base}/api/client/register"
        payload = {
            "sessionid": self.session_id,
            "username": username,
            "password": password,
            "key": key,
            "hwid": self.hwid
        }
        try:
            r = requests.post(url, json=payload).json()
            print(f"[*] Response: {r.get('message')}")
            return r.get("success", False)
        except Exception as e:
            print(f"[-] Connection error during registration: {e}")
            return False

    def login(self, username, password):
        if not self.session_id:
            print("[-] Error: Session not initialized (run init first)!")
            return False
        url = f"{self.api_base}/api/client/login"
        payload = {
            "sessionid": self.session_id,
            "username": username,
            "password": password,
            "hwid": self.hwid
        }
        try:
            r = requests.post(url, json=payload).json()
            if r.get("success"):
                user_data = r.get("user_data", {})
                print(f"\n[+] Login successful! Welcome {user_data.get('username')}")
                print(f"    - Level: {user_data.get('level')}")
                print(f"    - Expires: {user_data.get('expires')}")
                return True
            else:
                print(f"\n[-] Login failed: {r.get('message')}")
                return False
        except Exception as e:
            print(f"[-] Connection error during login: {e}")
            return False

    def license_only(self, key):
        if not self.session_id:
            print("[-] Error: Session not initialized (run init first)!")
            return False
        url = f"{self.api_base}/api/client/license"
        payload = {
            "sessionid": self.session_id,
            "key": key,
            "hwid": self.hwid
        }
        try:
            r = requests.post(url, json=payload).json()
            if r.get("success"):
                user_data = r.get("user_data", {})
                print(f"\n[+] Key authenticated successfully!")
                print(f"    - Temporary User: {user_data.get('username')}")
                print(f"    - Level: {user_data.get('level')}")
                print(f"    - Expires: {user_data.get('expires')}")
                return True
            else:
                print(f"\n[-] Key validation failed: {r.get('message')}")
                return False
        except Exception as e:
            print(f"[-] Connection error during key validation: {e}")
            return False

    def get_var(self, name):
        if not self.session_id:
            print("[-] Error: Session not initialized (run init first)!")
            return None
        url = f"{self.api_base}/api/client/var"
        payload = {
            "sessionid": self.session_id,
            "name": name
        }
        try:
            r = requests.post(url, json=payload).json()
            if r.get("success"):
                return r.get("value")
            else:
                print(f"[-] Failed to fetch variable: {r.get('message')}")
                return None
        except Exception as e:
            print(f"[-] Connection error during variable retrieval: {e}")
            return None

    def send_log(self, msg):
        if not self.session_id:
            return False
        url = f"{self.api_base}/api/client/log"
        payload = {
            "sessionid": self.session_id,
            "message": msg
        }
        try:
            requests.post(url, json=payload)
            return True
        except Exception:
            return False

# INTERACTIVE DEMO TESTING CLIENT (ASCII ONLY FOR WINDOWS COMPATIBILITY)
if __name__ == "__main__":
    print("=== F8Auth Client SDK Interactive Demo ===")
    
    api_endpoint = input(f"Enter F8Auth API Endpoint (default: {DEFAULT_API_BASE}): ").strip()
    if not api_endpoint:
        api_endpoint = DEFAULT_API_BASE
        
    app_name = input("Enter Application Name (default: F8AuthDemo): ").strip()
    if not app_name:
        app_name = "F8AuthDemo"
        
    owner_id = input("Enter Owner ID (default: demo_owner_id): ").strip()
    if not owner_id:
        owner_id = "demo_owner_id"
        
    app_secret = input("Enter App Secret (default: demo_secret_key): ").strip()
    if not app_secret:
        app_secret = "demo_secret_key"
        
    version = input("Enter Version (default: 1.0.0): ").strip()
    if not version:
        version = "1.0.0"
        
    client = F8AuthClient(api_endpoint, app_name, owner_id, app_secret, version)
    
    print("\n[*] Initializing session with F8Auth server...")
    if not client.init():
        print("[-] Initialization failed! Exiting.")
        sys.exit(1)
        
    while True:
        print("\n================ MENU ================")
        print("1. Register Account")
        print("2. Login Account")
        print("3. License Key Login (Direct)")
        print("4. Retrieve Secure Variable")
        print("5. Send Client Log")
        print("6. Exit")
        choice = input("Enter selection (1-6): ").strip()
        
        if choice == "1":
            user = input("Username: ").strip()
            pwd = input("Password: ").strip()
            key = input("License Key (default: F8AUTH-TEST-KEY): ").strip()
            if not key:
                key = "F8AUTH-TEST-KEY"
            client.register(user, pwd, key)
            
        elif choice == "2":
            user = input("Username: ").strip()
            pwd = input("Password: ").strip()
            client.login(user, pwd)
            
        elif choice == "3":
            key = input("License Key (default: F8AUTH-TEST-KEY): ").strip()
            if not key:
                key = "F8AUTH-TEST-KEY"
            client.license_only(key)
            
        elif choice == "4":
            var_name = input("Enter Variable Name (default: demo_variable): ").strip()
            if not var_name:
                var_name = "demo_variable"
            val = client.get_var(var_name)
            if val is not None:
                print(f"[+] Value: {val}")
                
        elif choice == "5":
            log_msg = input("Enter Log Message: ").strip()
            if client.send_log(log_msg):
                print("[+] Log sent successfully!")
            else:
                print("[-] Failed to send log.")
                
        elif choice == "6":
            print("[*] Exiting F8Auth SDK CLI demo.")
            break
        else:
            print("[-] Invalid choice. Select 1-6.")