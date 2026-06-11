using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Security.Cryptography;

namespace F8Auth
{
    public class F8AuthClient
    {
        private static readonly HttpClient client = new HttpClient();
        
        private readonly string apiBase;
        private readonly string appName;
        private readonly string appSecret;
        private readonly string ownerId;
        private readonly string version;
        
        private string sessionId = null;
        private string hwid = null;

        public F8AuthClient(string apiBase, string appName = "F8AuthDemo", string ownerId = "demo_owner_id", string appSecret = "demo_secret_key", string version = "1.0.0")
        {
            this.apiBase = apiBase.TrimEnd('/');
            this.appName = appName;
            this.ownerId = ownerId;
            this.appSecret = appSecret;
            this.version = version;
            this.hwid = GetHWID();
        }

        public string GetSessionID() => sessionId;
        public string GetHardwareID() => hwid;

        private string GetHWID()
        {
            // Generates a hardware-bound unique identifier using System.Security.Cryptography
            string raw = Environment.MachineName + Environment.UserName + Environment.ProcessorCount;
            using (SHA256 sha256 = SHA256.Create())
            {
                byte[] bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
                StringBuilder builder = new StringBuilder();
                foreach (byte b in bytes)
                {
                    builder.Append(b.ToString("x2"));
                }
                return builder.ToString();
            }
        }

        public async Task<bool> Init()
        {
            string url = $"{apiBase}/api/client/init";
            var payload = new
            {
                name = appName,
                ownerid = ownerId,
                secret = appSecret,
                version = version
            };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content);
                string responseString = await response.Content.ReadAsStringAsync();
                
                using (JsonDocument doc = JsonDocument.Parse(responseString))
                {
                    JsonElement root = doc.RootElement;
                    if (root.GetProperty("success").GetBoolean())
                    {
                        sessionId = root.GetProperty("sessionid").GetString();
                        Console.WriteLine($"\n[+] Init successful!");
                        Console.WriteLine($"    - Session ID: {sessionId}");
                        if (root.TryGetProperty("download", out JsonElement dlElement) && dlElement.ValueKind == JsonValueKind.String)
                        {
                            string downloadUrl = dlElement.GetString();
                            if (!string.IsNullOrEmpty(downloadUrl))
                            {
                                Console.WriteLine($"    - Download URL: {downloadUrl}");
                            }
                        }
                        return true;
                    }
                    else
                    {
                        string message = root.GetProperty("message").GetString();
                        Console.WriteLine($"\n[-] Init failed: {message}");
                        if (root.TryGetProperty("download", out JsonElement dlElement) && dlElement.ValueKind == JsonValueKind.String)
                        {
                            string downloadUrl = dlElement.GetString();
                            if (!string.IsNullOrEmpty(downloadUrl))
                            {
                                Console.WriteLine($"[!] Please download the latest version here: {downloadUrl}");
                            }
                        }
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"\n[-] Failed to connect to F8Auth server: {e.Message}");
                return false;
            }
        }

        public async Task<bool> Register(string username, string password, string key)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                Console.WriteLine("[-] Error: Session not initialized (run Init first)!");
                return false;
            }
            string url = $"{apiBase}/api/client/register";
            var payload = new
            {
                sessionid = sessionId,
                username = username,
                password = password,
                key = key,
                hwid = hwid
            };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content);
                string responseString = await response.Content.ReadAsStringAsync();
                
                using (JsonDocument doc = JsonDocument.Parse(responseString))
                {
                    JsonElement root = doc.RootElement;
                    Console.WriteLine($"[*] Response: {root.GetProperty("message").GetString()}");
                    return root.GetProperty("success").GetBoolean();
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Connection error during registration: {e.Message}");
                return false;
            }
        }

        public async Task<bool> Login(string username, string password)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                Console.WriteLine("[-] Error: Session not initialized (run Init first)!");
                return false;
            }
            string url = $"{apiBase}/api/client/login";
            var payload = new
            {
                sessionid = sessionId,
                username = username,
                password = password,
                hwid = hwid
            };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content);
                string responseString = await response.Content.ReadAsStringAsync();
                
                using (JsonDocument doc = JsonDocument.Parse(responseString))
                {
                    JsonElement root = doc.RootElement;
                    if (root.GetProperty("success").GetBoolean())
                    {
                        JsonElement userData = root.GetProperty("user_data");
                        Console.WriteLine($"\n[+] Login successful! Welcome {userData.GetProperty("username").GetString()}");
                        Console.WriteLine($"    - Expires: {userData.GetProperty("expires").GetString()}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"\n[-] Login failed: {root.GetProperty("message").GetString()}");
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Connection error during login: {e.Message}");
                return false;
            }
        }

        public async Task<bool> LicenseOnly(string key)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                Console.WriteLine("[-] Error: Session not initialized (run Init first)!");
                return false;
            }
            string url = $"{apiBase}/api/client/license";
            var payload = new
            {
                sessionid = sessionId,
                key = key,
                hwid = hwid
            };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content);
                string responseString = await response.Content.ReadAsStringAsync();
                
                using (JsonDocument doc = JsonDocument.Parse(responseString))
                {
                    JsonElement root = doc.RootElement;
                    if (root.GetProperty("success").GetBoolean())
                    {
                        JsonElement userData = root.GetProperty("user_data");
                        Console.WriteLine("\n[+] Key authenticated successfully!");
                        Console.WriteLine($"    - Temporary User: {userData.GetProperty("username").GetString()}");
                        Console.WriteLine($"    - Expires: {userData.GetProperty("expires").GetString()}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"\n[-] Key validation failed: {root.GetProperty("message").GetString()}");
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Connection error during key validation: {e.Message}");
                return false;
            }
        }

        public async Task<string> GetVar(string name)
        {
            if (string.IsNullOrEmpty(sessionId))
            {
                Console.WriteLine("[-] Error: Session not initialized (run Init first)!");
                return null;
            }
            string url = $"{apiBase}/api/client/var";
            var payload = new { sessionid = sessionId, name = name };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, content);
                string responseString = await response.Content.ReadAsStringAsync();
                
                using (JsonDocument doc = JsonDocument.Parse(responseString))
                {
                    JsonElement root = doc.RootElement;
                    if (root.GetProperty("success").GetBoolean())
                    {
                        return root.GetProperty("value").GetString();
                    }
                    else
                    {
                        Console.WriteLine($"[-] Failed to fetch variable: {root.GetProperty("message").GetString()}");
                        return null;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Connection error during variable retrieval: {e.Message}");
                return null;
            }
        }

        public async Task<bool> SendLog(string msg)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
            string url = $"{apiBase}/api/client/log";
            var payload = new { sessionid = sessionId, message = msg };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                await client.PostAsync(url, content);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
