#pragma once
#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <windows.h>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

namespace F8Auth {

    // Simple JSON parsing helpers (raw substring search) for header-only convenience without requiring external json libraries.
    // In production, developers should use nlohmann/json or similar libraries.
    inline std::string GetJsonValue(const std::string& json, const std::string& key) {
        size_t keyPos = json.find("\"" + key + "\"");
        if (keyPos == std::string::npos) return "";

        size_t valuePos = json.find(":", keyPos);
        if (valuePos == std::string::npos) return "";

        // Skip spaces and colons
        valuePos++;
        while (valuePos < json.length() && (json[valuePos] == ' ' || json[valuePos] == '"')) {
            valuePos++;
        }

        // Find end of value
        size_t endPos = valuePos;
        bool isString = (json[valuePos - 1] == '"');
        
        if (isString) {
            endPos = json.find("\"", valuePos);
        } else {
            // Find end of number / bool (stop at comma, brace or space)
            while (endPos < json.length() && json[endPos] != ',' && json[endPos] != '}' && json[endPos] != ' ' && json[endPos] != '\n' && json[endPos] != '\r') {
                endPos++;
            }
        }

        if (endPos == std::string::npos) return "";
        return json.substr(valuePos, endPos - valuePos);
    }

    class Client {
    private:
        std::wstring apiHost;
        int apiPort;
        bool isHttps;
        
        std::string appName;
        std::string appSecret;
        std::string ownerId;
        std::string appVersion;

        std::string sessionId;
        std::string hwid;

        // Windows HTTP POST Request
        std::string SendPostRequest(const std::wstring& path, const std::string& jsonPayload) {
            std::string responseData = "";
            HINTERNET hSession = WinHttpOpen(L"F8Auth C++ Client/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
            if (!hSession) return "{\"success\":false,\"message\":\"Failed to initialize HTTP Session\"}";

            HINTERNET hConnect = WinHttpConnect(hSession, apiHost.c_str(), apiPort, 0);
            if (!hConnect) {
                WinHttpCloseHandle(hSession);
                return "{\"success\":false,\"message\":\"Failed to connect to host\"}";
            }

            DWORD flags = isHttps ? WINHTTP_FLAG_SECURE : 0;
            HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
            if (!hRequest) {
                WinHttpCloseHandle(hConnect);
                WinHttpCloseHandle(hSession);
                return "{\"success\":false,\"message\":\"Failed to open request handle\"}";
            }

            // If HTTPS, we can set secure options (ignore expired cert for local development if needed, but in production make sure cert is valid)
            if (isHttps) {
                DWORD dwSecFlags = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE | SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID;
                WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURITY_FLAGS, &dwSecFlags, sizeof(dwSecFlags));
            }

            std::wstring headers = L"Content-Type: application/json\r\n";
            BOOL bResults = WinHttpSendRequest(hRequest, headers.c_str(), -1, (LPVOID)jsonPayload.c_str(), jsonPayload.length(), jsonPayload.length(), 0);

            if (bResults) {
                bResults = WinHttpReceiveResponse(hRequest, NULL);
            }

            if (bResults) {
                DWORD dwSize = 0;
                do {
                    DWORD dwDownloaded = 0;
                    if (!WinHttpQueryDataAvailable(hRequest, &dwSize)) break;
                    if (dwSize == 0) break;

                    char* pszOutBuffer = new char[dwSize + 1];
                    ZeroMemory(pszOutBuffer, dwSize + 1);

                    if (WinHttpReadData(hRequest, (LPVOID)pszOutBuffer, dwSize, &dwDownloaded)) {
                        responseData.append(pszOutBuffer, dwDownloaded);
                    }
                    delete[] pszOutBuffer;
                } while (dwSize > 0);
            }

            WinHttpCloseHandle(hRequest);
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return responseData;
        }

        // Standard Windows HWID Generator
        std::string GenerateHWID() {
            HW_PROFILE_INFOA hwProfileInfo;
            if (GetCurrentHwProfileA(&hwProfileInfo)) {
                std::string guid = hwProfileInfo.szHwProfileGuid;
                // Clean GUID braces
                if (guid.front() == '{') guid.erase(0, 1);
                if (guid.back() == '}') guid.pop_back();
                return guid;
            }
            return "WINDOWS-FALLBACK-HWID-2026";
        }

    public:
        Client(const std::wstring& host, int port, bool https, const std::string& name = "F8AuthDemo", const std::string& secret = "demo_secret_key", const std::string& owner = "demo_owner_id", const std::string& version = "1.0.0") 
            : apiHost(host), apiPort(port), isHttps(https), appName(name), appSecret(secret), ownerId(owner), appVersion(version) {
            hwid = GenerateHWID();
        }

        std::string GetSessionID() const { return sessionId; }
        std::string GetHardwareID() const { return hwid; }

        // Initialize connection
        bool Init(std::string& outMessage) {
            std::stringstream ss;
            ss << "{"
               << "\"name\":\"" << appName << "\","
               << "\"ownerid\":\"" << ownerId << "\","
               << "\"secret\":\"" << appSecret << "\","
               << "\"version\":\"" << appVersion << "\""
               << "}";
            
            std::string response = SendPostRequest(L"/api/client/init", ss.str());
            std::string success = GetJsonValue(response, "success");
            outMessage = GetJsonValue(response, "message");

            if (success == "true") {
                sessionId = GetJsonValue(response, "sessionid");
                return true;
            }
            return false;
        }

        // Register new user accounts
        bool Register(const std::string& username, const std::string& password, const std::string& key, std::string& outMessage) {
            if (sessionId.empty()) {
                outMessage = "Session not initialized";
                return false;
            }
            std::stringstream ss;
            ss << "{"
               << "\"sessionid\":\"" << sessionId << "\","
               << "\"username\":\"" << username << "\","
               << "\"password\":\"" << password << "\","
               << "\"key\":\"" << key << "\","
               << "\"hwid\":\"" << hwid << "\""
               << "}";

            std::string response = SendPostRequest(L"/api/client/register", ss.str());
            std::string success = GetJsonValue(response, "success");
            outMessage = GetJsonValue(response, "message");

            return (success == "true");
        }

        // Login User
        bool Login(const std::string& username, const std::string& password, std::string& outMessage) {
            if (sessionId.empty()) {
                outMessage = "Session not initialized";
                return false;
            }
            std::stringstream ss;
            ss << "{"
               << "\"sessionid\":\"" << sessionId << "\","
               << "\"username\":\"" << username << "\","
               << "\"password\":\"" << password << "\","
               << "\"hwid\":\"" << hwid << "\""
               << "}";

            std::string response = SendPostRequest(L"/api/client/login", ss.str());
            std::string success = GetJsonValue(response, "success");
            outMessage = GetJsonValue(response, "message");

            return (success == "true");
        }

        // Direct Key Login (no user profile registration)
        bool LicenseOnly(const std::string& key, std::string& outMessage) {
            if (sessionId.empty()) {
                outMessage = "Session not initialized";
                return false;
            }
            std::stringstream ss;
            ss << "{"
               << "\"sessionid\":\"" << sessionId << "\","
               << "\"key\":\"" << key << "\","
               << "\"hwid\":\"" << hwid << "\""
               << "}";

            std::string response = SendPostRequest(L"/api/client/license", ss.str());
            std::string success = GetJsonValue(response, "success");
            outMessage = GetJsonValue(response, "message");

            return (success == "true");
        }

        // Fetch secure application variable
        std::string GetVariable(const std::string& varName, std::string& outMessage) {
            if (sessionId.empty()) {
                outMessage = "Session not initialized";
                return "";
            }
            std::stringstream ss;
            ss << "{"
               << "\"sessionid\":\"" << sessionId << "\","
               << "\"name\":\"" << varName << "\""
               << "}";

            std::string response = SendPostRequest(L"/api/client/var", ss.str());
            std::string success = GetJsonValue(response, "success");
            
            if (success == "true") {
                return GetJsonValue(response, "value");
            }
            outMessage = GetJsonValue(response, "message");
            return "";
        }

        // Send log messages
        void SendLog(const std::string& message) {
            if (sessionId.empty()) return;
            std::stringstream ss;
            ss << "{"
               << "\"sessionid\":\"" << sessionId << "\","
               << "\"message\":\"" << message << "\""
               << "}";

            SendPostRequest(L"/api/client/log", ss.str());
        }
    };
}
