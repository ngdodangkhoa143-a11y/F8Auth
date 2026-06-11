// ==================== STATE MANAGEMENT ====================
let currentState = {
    token: localStorage.getItem("f8auth_token") || null,
    developer: null,
    apps: [],
    selectedAppId: localStorage.getItem("f8auth_selected_appid") || null,
    activeTab: 'overview',
    sdkLang: 'python'
};

const API_BASE = window.location.origin;

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", async () => {
    if (currentState.token) {
        const success = await fetchDeveloperProfile();
        if (success) {
            showView("view-dashboard");
            await loadDeveloperApps();
        } else {
            handleLogout(false);
            showView("view-landing");
        }
    } else {
        showView("view-landing");
    }
});

// ==================== TOAST SYSTEM ====================
function showToast(message, type = 'info') {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "🔔";
    if (type === 'success') icon = "✅";
    if (type === 'danger') icon = "❌";
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Auto remove after animation completes
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==================== ROUTING & VIEW TOGGLES ====================
function showView(viewId) {
    document.querySelectorAll(".view-section").forEach(sec => {
        sec.classList.remove("active");
    });
    const activeSec = document.getElementById(viewId);
    if (activeSec) {
        activeSec.classList.add("active");
    }
}

function showAuthPage(isRegister = false) {
    showView("view-auth");
    toggleAuthTab(isRegister);
}

function toggleAuthTab(isRegister) {
    const loginTabBtn = document.getElementById("tab-login-btn");
    const registerTabBtn = document.getElementById("tab-register-btn");
    const loginForm = document.getElementById("form-login");
    const registerForm = document.getElementById("form-register");

    if (isRegister) {
        loginTabBtn.classList.remove("active");
        registerTabBtn.classList.add("active");
        loginForm.classList.remove("active");
        registerForm.classList.add("active");
    } else {
        loginTabBtn.classList.add("active");
        registerTabBtn.classList.remove("active");
        loginForm.classList.add("active");
        registerForm.classList.remove("active");
    }
}

function scrollToFeatures() {
    document.getElementById("landing-features").scrollIntoView({ behavior: 'smooth' });
}

// ==================== MODAL SYSTEM ====================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}

// Close modal if clicked outside
window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
        e.target.classList.remove("active");
    }
});

// ==================== API HELPERS ====================
async function apiRequest(endpoint, method = 'GET', body = null, authenticated = true) {
    const headers = {
        'Content-Type': 'application/json'
    };
    if (authenticated && currentState.token) {
        headers['Authorization'] = `Bearer ${currentState.token}`;
    }

    const config = {
        method,
        headers
    };
    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 401 && authenticated) {
                showToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "danger");
                handleLogout(false);
            }
            throw new Error(data.detail || "Có lỗi xảy ra");
        }
        return data;
    } catch (err) {
        console.error("API Request Error:", err);
        throw err;
    }
}

// ==================== DEVELOPER AUTHENTICATION ====================
async function fetchDeveloperProfile() {
    try {
        const dev = await apiRequest("/api/auth/me", "GET");
        currentState.developer = dev;
        document.getElementById("sidebar-username").innerText = dev.username;
        return true;
    } catch (err) {
        return false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const span = submitBtn.querySelector("span");
    const spinner = submitBtn.querySelector(".spinner");
    
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    span.classList.add("hidden");
    spinner.classList.remove("hidden");

    try {
        const res = await apiRequest("/api/auth/login", "POST", { username, password }, false);
        localStorage.setItem("f8auth_token", res.token);
        currentState.token = res.token;
        showToast("Đăng nhập thành công!", "success");
        
        await fetchDeveloperProfile();
        showView("view-dashboard");
        await loadDeveloperApps();
        
        e.target.reset();
    } catch (err) {
        showToast(err.message, "danger");
    } finally {
        span.classList.remove("hidden");
        spinner.classList.add("hidden");
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const span = submitBtn.querySelector("span");
    const spinner = submitBtn.querySelector(".spinner");

    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    if (password !== confirm) {
        showToast("Mật khẩu xác nhận không khớp!", "danger");
        return;
    }

    span.classList.add("hidden");
    spinner.classList.remove("hidden");

    try {
        await apiRequest("/api/auth/register", "POST", { username, email, password }, false);
        showToast("Tạo tài khoản thành công! Hãy đăng nhập.", "success");
        toggleAuthTab(false); // Switch to login tab
        e.target.reset();
    } catch (err) {
        showToast(err.message, "danger");
    } finally {
        span.classList.remove("hidden");
        spinner.classList.add("hidden");
    }
}

function handleLogout(notify = true) {
    if (currentState.token) {
        fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentState.token}` }
        }).catch(() => {});
    }

    localStorage.removeItem("f8auth_token");
    localStorage.removeItem("f8auth_selected_appid");
    currentState.token = null;
    currentState.developer = null;
    currentState.apps = [];
    currentState.selectedAppId = null;
    
    if (notify) showToast("Đã đăng xuất tài khoản", "info");
    showView("view-landing");
}

// ==================== APP MANAGEMENT ====================
async function loadDeveloperApps() {
    try {
        const apps = await apiRequest("/api/developer/apps", "GET");
        currentState.apps = apps;
        
        const select = document.getElementById("dashboard-app-select");
        select.innerHTML = '<option value="">-- Chọn API --</option>';
        
        apps.forEach(app => {
            const opt = document.createElement("option");
            opt.value = app.id;
            opt.textContent = app.name;
            select.appendChild(opt);
        });

        // Restore selected application
        if (currentState.selectedAppId && apps.some(a => a.id === currentState.selectedAppId)) {
            select.value = currentState.selectedAppId;
            document.getElementById("no-app-overlay").classList.add("hidden");
            document.getElementById("dashboard-content").classList.remove("hidden");
            await loadActiveTabData();
        } else if (apps.length > 0) {
            const firstApp = apps[0].id;
            currentState.selectedAppId = firstApp;
            localStorage.setItem("f8auth_selected_appid", firstApp);
            select.value = firstApp;
            document.getElementById("no-app-overlay").classList.add("hidden");
            document.getElementById("dashboard-content").classList.remove("hidden");
            await loadActiveTabData();
        } else {
            currentState.selectedAppId = null;
            localStorage.removeItem("f8auth_selected_appid");
            document.getElementById("no-app-overlay").classList.remove("hidden");
            document.getElementById("dashboard-content").classList.add("hidden");
        }
    } catch (err) {
        showToast("Không thể tải danh sách API", "danger");
    }
}

async function handleCreateApp(e) {
    e.preventDefault();
    const name = document.getElementById("create-app-name").value;
    try {
        const app = await apiRequest("/api/developer/apps", "POST", { name });
        showToast(`Đã tạo API '${name}' thành công!`, "success");
        closeModal("modal-create-app");
        e.target.reset();
        
        // Auto select newly created app
        currentState.selectedAppId = app.id;
        localStorage.setItem("f8auth_selected_appid", app.id);
        
        await loadDeveloperApps();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function handleAppSelectChange() {
    const val = document.getElementById("dashboard-app-select").value;
    if (val) {
        currentState.selectedAppId = val;
        localStorage.setItem("f8auth_selected_appid", val);
        document.getElementById("no-app-overlay").classList.add("hidden");
        document.getElementById("dashboard-content").classList.remove("hidden");
        await loadActiveTabData();
    } else {
        currentState.selectedAppId = null;
        localStorage.removeItem("f8auth_selected_appid");
        document.getElementById("no-app-overlay").classList.remove("hidden");
        document.getElementById("dashboard-content").classList.add("hidden");
    }
}

// ==================== DASHBOARD TAB ROUTING ====================
function switchTab(tabId) {
    currentState.activeTab = tabId;
    
    // Update active nav item
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    document.getElementById(`menu-${tabId}`).classList.add("active");
    
    // Update active content tab
    document.querySelectorAll(".dashboard-tab-content").forEach(tab => {
        tab.classList.remove("active");
    });
    document.getElementById(`tab-${tabId}`).classList.add("active");

    loadActiveTabData();
}

async function loadActiveTabData() {
    if (!currentState.selectedAppId) return;

    const app = currentState.apps.find(a => a.id === currentState.selectedAppId);
    if (!app) return;

    switch (currentState.activeTab) {
        case 'overview':
            await renderOverview(app);
            break;
        case 'keys':
            await renderKeys();
            break;
        case 'users':
            await renderUsers();
            break;
        case 'variables':
            await renderVariables();
            break;
        case 'files':
            await renderFiles();
            break;
        case 'logs':
            await fetchAppLogs();
            break;
        case 'sdk':
            renderSdkGuide(app);
            break;
        case 'settings':
            await renderAppSettings(app);
            break;
    }
}

// ==================== TAB 1: OVERVIEW RENDERING ====================
async function renderOverview(currentApp) {
    const apiListContainer = document.getElementById("overview-api-list");
    if (!apiListContainer) return;
    
    apiListContainer.innerHTML = '<div style="color:var(--text-secondary);">Đang tải danh sách API...</div>';
    
    const totalApis = currentState.apps.length;
    const activeApis = currentState.apps.filter(app => app.enabled === 1 && app.banned === 0).length;
    
    document.getElementById("overview-total-apis").innerText = totalApis;
    document.getElementById("overview-active-apis").innerText = activeApis;
    
    try {
        let totalLicenses = 0;
        const keysPromises = currentState.apps.map(app => 
            apiRequest(`/api/developer/apps/${app.id}/keys`).catch(() => [])
        );
        const keysResults = await Promise.all(keysPromises);
        keysResults.forEach(keys => {
            totalLicenses += keys.length;
        });
        document.getElementById("overview-total-licenses").innerText = totalLicenses;
        
        if (currentState.apps.length === 0) {
            apiListContainer.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 40px 0;">Bạn chưa tạo API nào. Hãy nhập tên ở bên phải để tạo API mới!</div>';
            return;
        }
        
        apiListContainer.innerHTML = '';
        currentState.apps.forEach(app => {
            const isSelected = app.id === currentState.selectedAppId;
            const card = document.createElement("div");
            card.className = `api-card ${isSelected ? 'selected' : ''}`;
            
            let statusClass = "active";
            let statusText = "HOẠT ĐỘNG";
            if (app.banned === 1) {
                statusClass = "banned";
                statusText = "BỊ KHÓA";
            } else if (app.enabled === 0) {
                statusClass = "inactive";
                statusText = "TẠM DỪNG";
            }
            
            const pauseBtnLabel = app.enabled === 1 ? "Dừng" : "Kích hoạt";
            
            card.innerHTML = `
                <div class="api-card-header">
                    <div class="api-card-title-group">
                        <h2 class="api-card-title">${app.name}</h2>
                        <span class="api-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="api-card-actions">
                        <button class="api-action-btn" onclick="event.stopPropagation(); selectApi('${app.id}'); switchTab('settings');">
                            Sửa
                        </button>
                        <button class="api-action-btn" onclick="event.stopPropagation(); toggleApiStatus('${app.id}', ${app.enabled})">
                            ${pauseBtnLabel}
                        </button>
                        <button class="api-action-btn danger" onclick="event.stopPropagation(); deleteApi('${app.id}')">
                            Xóa
                        </button>
                    </div>
                </div>
                <p class="api-card-desc">Thông tin xác thực API - Sử dụng các thông tin này để tích hợp vào mã nguồn kết nối của bạn</p>
                <div class="api-card-fields">
                    <div class="input-group">
                        <label>TÊN ỨNG DỤNG (APP NAME)</label>
                        <div class="copy-input">
                            <input type="text" id="api-name-${app.id}" value="${app.name}" readonly/>
                            <button onclick="event.stopPropagation(); copyToClipboard('api-name-${app.id}', 'Đã copy Tên API')">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>ID CHỦ TÀI KHOẢN (OWNER ID)</label>
                        <div class="copy-input">
                            <input type="text" id="api-owner-${app.id}" value="${app.owner_id}" readonly/>
                            <button onclick="event.stopPropagation(); copyToClipboard('api-owner-${app.id}', 'Đã copy Owner ID')">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>MÃ BẢO MẬT (APP SECRET)</label>
                        <div class="copy-input">
                            <input type="password" id="api-secret-${app.id}" value="${app.secret}" readonly/>
                            <button onclick="event.stopPropagation(); togglePasswordVisibility('api-secret-${app.id}')">Hiện</button>
                            <button onclick="event.stopPropagation(); copyToClipboard('api-secret-${app.id}', 'Đã copy App Secret')">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="input-group">
                        <label>PHIÊN BẢN (APP VERSION)</label>
                        <div class="copy-input">
                            <input type="text" id="api-version-${app.id}" value="${app.version}" readonly/>
                            <button onclick="event.stopPropagation(); copyToClipboard('api-version-${app.id}', 'Đã copy Version')">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                </div>`;
            
            card.addEventListener("click", () => {
                selectApi(app.id);
            });
            
            apiListContainer.appendChild(card);
        });
    } catch (e) {
        apiListContainer.innerHTML = '<div style="color:var(--color-danger);">Không thể tải thông tin chi tiết API.</div>';
    }
}

function selectApi(appId) {
    currentState.selectedAppId = appId;
    localStorage.setItem("f8auth_selected_appid", appId);
    
    const select = document.getElementById("dashboard-app-select");
    if (select) select.value = appId;
    
    const activeApp = currentState.apps.find(a => a.id === appId);
    renderOverview(activeApp);
}

async function handleCreateApiSidebar(e) {
    e.preventDefault();
    const name = document.getElementById("create-api-name-sidebar").value;
    try {
        const app = await apiRequest("/api/developer/apps", "POST", { name });
        showToast(`Đã tạo API '${name}' thành công!`, "success");
        e.target.reset();
        
        currentState.selectedAppId = app.id;
        localStorage.setItem("f8auth_selected_appid", app.id);
        
        await loadDeveloperApps();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function toggleApiStatus(appId, currentEnabled) {
    const app = currentState.apps.find(a => a.id === appId);
    if (!app) return;
    const newEnabled = currentEnabled === 1 ? 0 : 1;
    try {
        await apiRequest(`/api/developer/apps/${appId}/settings`, "POST", {
            version: app.version,
            download_url: app.download_url || "",
            hwid_lock: app.hwid_lock,
            enabled: newEnabled,
            banned: app.banned,
            ban_reason: app.ban_reason || ""
        });
        showToast(newEnabled ? "Đã kích hoạt API!" : "Đã tạm dừng API!", "success");
        await loadDeveloperApps();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function deleteApi(appId) {
    const app = currentState.apps.find(a => a.id === appId);
    if (!app) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa API "${app.name}"? Thao tác này sẽ xóa toàn bộ keys, users, variables, files liên quan!`)) return;
    try {
        await apiRequest(`/api/developer/apps/${appId}`, "DELETE");
        showToast(`Đã xóa API "${app.name}" thành công!`, "info");
        if (currentState.selectedAppId === appId) {
            currentState.selectedAppId = null;
            localStorage.removeItem("f8auth_selected_appid");
        }
        await loadDeveloperApps();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 2: KEYS OPERATIONS ====================
let loadedKeys = [];
async function renderKeys() {
    const tbody = document.getElementById("keys-table-body");
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Đang tải danh sách key...</td></tr>';
    
    try {
        const keys = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/keys`);
        loadedKeys = keys;
        filterKeysTable(); // This handles rendering with search filter
    } catch (err) {
        showToast("Không thể tải danh sách license keys", "danger");
    }
}

function filterKeysTable() {
    const query = document.getElementById("search-keys-input").value.toLowerCase();
    const statusFilter = document.getElementById("filter-keys-select").value;
    const tbody = document.getElementById("keys-table-body");
    
    const filtered = loadedKeys.filter(k => {
        const matchesQuery = k.key_string.toLowerCase().includes(query) || (k.note || '').toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || k.status === statusFilter;
        return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Không tìm thấy License Key nào</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(k => {
        const tr = document.createElement("tr");
        
        // Status Badge
        let statusBadge = `<span class="badge-status unused">Chưa kích hoạt</span>`;
        if (k.status === 'active') statusBadge = `<span class="badge-status active">Đang hoạt động</span>`;
        if (k.status === 'expired') statusBadge = `<span class="badge-status expired">Đã hết hạn</span>`;
        
        // Formatted dates
        const expStr = k.expiry_date ? new Date(k.expiry_date).toLocaleString('vi-VN') : 'Chưa kích hoạt';
        const hwidStr = k.hwid ? k.hwid : '<span style="color:var(--text-muted)">Trống</span>';
        const durationText = k.duration_days >= 99999 ? "Trọn đời (Lifetime)" : `${k.duration_days} ngày`;
        
        tr.innerHTML = `
            <td>
                <span class="copyable-key" onclick="copyKeyText('${k.key_string}')" title="Click để copy key" style="font-family:'JetBrains Mono', monospace; cursor:pointer; font-weight:600; text-decoration: underline; color:#a78bfa;">
                    ${k.key_string}
                </span>
            </td>
            <td>${durationText}</td>
            <td>${expStr}</td>
            <td style="font-size:0.75rem; font-family:'JetBrains Mono', monospace;">${hwidStr}</td>
            <td style="color:var(--text-secondary)">${k.note || '-'}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="action-group-td">
                    <button class="btn-table-action" onclick="resetKeyHwid('${k.id}')" title="Reset HWID">🔄 Reset HWID</button>
                    <button class="btn-table-action danger" onclick="deleteKey('${k.id}')" title="Xóa Key">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function copyKeyText(text) {
    navigator.clipboard.writeText(text);
    showToast("Đã copy key vào clipboard", "success");
}

async function handleGenerateKeys(e) {
    e.preventDefault();
    const amount = parseInt(document.getElementById("gen-amount").value);
    const key_type = document.getElementById("gen-key-type").value;
    const custom_key = document.getElementById("gen-custom-key") ? document.getElementById("gen-custom-key").value : "";
    const duration_days = parseInt(document.getElementById("gen-duration").value);
    const level = parseInt(document.getElementById("gen-level").value);
    const note = document.getElementById("gen-note").value;

    const length = 7;
    const prefix = "";

    try {
        const res = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/keys`, "POST", {
            amount, length, prefix, duration_days, level, note, key_type, custom_key
        });
        showToast(`Đã tạo ${amount} License Key thành công!`, "success");
        closeModal("modal-generate-keys");
        e.target.reset();
        toggleKeyTypeInput();
        await renderKeys();
        
        // Download keys as text file option
        const keyStrings = res.map(k => k.key_string).join("\n");
        const blob = new Blob([keyStrings], { type: "text/plain;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `license_keys_${Date.now()}.txt`;
        link.click();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

function toggleKeyTypeInput() {
    const keyType = document.getElementById("gen-key-type").value;
    const customKeyContainer = document.getElementById("gen-custom-key-container");
    if (!customKeyContainer) return;
    if (keyType === "custom") {
        customKeyContainer.style.display = "block";
    } else {
        customKeyContainer.style.display = "none";
    }
}

async function resetKeyHwid(keyId) {
    try {
        await apiRequest(`/api/developer/keys/${keyId}/reset-hwid`, "POST");
        showToast("Reset HWID thành công!", "success");
        await renderKeys();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function deleteKey(keyId) {
    if (!confirm("Bạn có chắc chắn muốn xóa License Key này?")) return;
    try {
        await apiRequest(`/api/developer/keys/${keyId}`, "DELETE");
        showToast("Đã xóa license key", "info");
        await renderKeys();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function confirmClearAllKeys() {
    if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ License Keys của ứng dụng này? Thao tác không thể khôi phục!")) return;
    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/keys/clear`, "DELETE");
        showToast("Đã xóa tất cả license keys", "info");
        await renderKeys();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 3: APP USERS OPERATIONS ====================
let loadedUsers = [];
async function renderUsers() {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Đang tải danh sách người dùng...</td></tr>';
    
    try {
        const users = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/users`);
        loadedUsers = users;
        filterUsersTable();
    } catch (err) {
        showToast("Không thể tải danh sách người dùng", "danger");
    }
}

function filterUsersTable() {
    const query = document.getElementById("search-users-input").value.toLowerCase();
    const tbody = document.getElementById("users-table-body");
    
    const filtered = loadedUsers.filter(u => {
        return u.username.toLowerCase().includes(query) || (u.key_used && u.key_used.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Không tìm thấy người dùng nào</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(u => {
        const tr = document.createElement("tr");
        
        const regDate = new Date(u.created_at).toLocaleString('vi-VN');
        const loginDate = u.last_login ? new Date(u.last_login).toLocaleString('vi-VN') : 'Chưa đăng nhập';
        const hwidStr = u.hwid ? u.hwid : '<span style="color:var(--text-muted)">Chưa liên kết</span>';
        
        tr.innerHTML = `
            <td style="font-weight:600;">${u.username}</td>
            <td style="font-family:'JetBrains Mono', monospace; font-size:0.82rem; color:#a78bfa;">${u.key_used || '-'}</td>
            <td style="font-size:0.75rem; font-family:'JetBrains Mono', monospace;">${hwidStr}</td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${regDate}</td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${loginDate}</td>
            <td>
                <div class="action-group-td">
                    <button class="btn-table-action" onclick="resetUserHwid('${u.id}')" title="Reset HWID">🔄 HWID</button>
                    <button class="btn-table-action" onclick="openChangePasswordModal('${u.id}', '${u.username}')" title="Đổi Mật khẩu">🔑 Pwd</button>
                    <button class="btn-table-action danger" onclick="deleteUser('${u.id}')" title="Xóa User">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleCreateUserManual(e) {
    e.preventDefault();
    const username = document.getElementById("create-user-username").value;
    const password = document.getElementById("create-user-password").value;
    const level = parseInt(document.getElementById("create-user-level").value);

    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/users`, "POST", {
            username, password, level
        });
        showToast(`Đã tạo người dùng '${username}' thành công!`, "success");
        closeModal("modal-create-user");
        e.target.reset();
        await renderUsers();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function resetUserHwid(userId) {
    try {
        await apiRequest(`/api/developer/users/${userId}/reset-hwid`, "POST");
        showToast("Reset HWID thành công!", "success");
        await renderUsers();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

function openChangePasswordModal(userId, username) {
    document.getElementById("modal-pwd-user-id").value = userId;
    document.getElementById("modal-pwd-username").innerText = username;
    document.getElementById("update-user-password").value = '';
    openModal("modal-user-password");
}

async function handleUpdateUserPassword(e) {
    e.preventDefault();
    const userId = document.getElementById("modal-pwd-user-id").value;
    const password = document.getElementById("update-user-password").value;
    try {
        await apiRequest(`/api/developer/users/${userId}/password`, "POST", { password });
        showToast("Đổi mật khẩu thành công!", "success");
        closeModal("modal-user-password");
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function changeUserLevel(userId, newLevel) {
    try {
        await apiRequest(`/api/developer/users/${userId}/level`, "POST", { level: parseInt(newLevel) });
        showToast("Cập nhật Level thành công!", "success");
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function deleteUser(userId) {
    if (!confirm("Bạn có chắc chắn muốn xóa người dùng này?")) return;
    try {
        await apiRequest(`/api/developer/users/${userId}`, "DELETE");
        showToast("Đã xóa người dùng thành công", "info");
        await renderUsers();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 4: VARIABLES OPERATIONS ====================
async function renderVariables() {
    const tbody = document.getElementById("vars-table-body");
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Đang tải danh sách biến...</td></tr>';
    
    try {
        const vars = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/variables`);
        if (vars.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">Không tìm thấy biến an toàn nào</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        vars.forEach(v => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family:'JetBrains Mono', monospace; font-weight:600; color:#06b6d4;">${v.name}</td>
                <td>
                    <div class="copy-input">
                        <input type="password" id="var-val-${v.id}" readonly value="${v.value}">
                        <button onclick="togglePasswordVisibility('var-val-${v.id}')">Show</button>
                        <button onclick="copyToClipboard('var-val-${v.id}', 'Đã copy giá trị biến')">Copy</button>
                    </div>
                </td>
                <td style="text-align:center;">
                    <button class="btn-table-action danger" onclick="deleteVariable('${v.id}')">🗑️ Xóa</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        showToast("Không thể tải danh sách biến", "danger");
    }
}

async function handleCreateVariable(e) {
    e.preventDefault();
    const name = document.getElementById("create-var-name").value;
    const value = document.getElementById("create-var-value").value;

    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/variables`, "POST", { name, value });
        showToast(`Đã lưu biến '${name}' thành công!`, "success");
        closeModal("modal-create-var");
        e.target.reset();
        await renderVariables();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function deleteVariable(varId) {
    if (!confirm("Bạn có chắc chắn muốn xóa biến này?")) return;
    try {
        await apiRequest(`/api/developer/variables/${varId}`, "DELETE");
        showToast("Đã xóa biến thành công", "info");
        await renderVariables();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 5: SECURE FILES OPERATIONS ====================
async function renderFiles() {
    const tbody = document.getElementById("files-table-body");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Đang tải danh sách file...</td></tr>';
    
    try {
        const files = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/files`);
        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Không tìm thấy tệp tin an toàn nào</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        files.forEach(f => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-size:0.8rem; font-family:'JetBrains Mono', monospace; color:var(--text-muted);">${f.id}</td>
                <td style="font-weight:600;">${f.name}</td>
                <td style="font-size:0.8rem; font-family:'JetBrains Mono', monospace;">
                    <a href="${f.file_url}" target="_blank" style="color:#a78bfa; text-decoration:underline;">${f.file_url}</a>
                </td>
                <td style="text-align:center;">
                    <button class="btn-table-action danger" onclick="deleteFile('${f.id}')">🗑️ Xóa</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        showToast("Không thể tải danh sách tập tin", "danger");
    }
}

async function handleCreateFile(e) {
    e.preventDefault();
    const name = document.getElementById("create-file-name").value;
    const file_url = document.getElementById("create-file-url").value;
    const level = parseInt(document.getElementById("create-file-level").value);

    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/files`, "POST", { name, file_url, level });
        showToast(`Đã lưu tập tin '${name}' thành công!`, "success");
        closeModal("modal-create-file");
        e.target.reset();
        await renderFiles();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

async function deleteFile(fileId) {
    if (!confirm("Bạn có chắc chắn muốn xóa file này?")) return;
    try {
        await apiRequest(`/api/developer/files/${fileId}`, "DELETE");
        showToast("Đã xóa file thành công", "info");
        await renderFiles();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 6: LOGS OPERATIONS ====================
async function fetchAppLogs() {
    const container = document.getElementById("terminal-logs");
    container.innerHTML = '<span style="color:var(--text-muted);">Đang tải hệ thống nhật ký...</span>';
    
    try {
        const logs = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/logs`);
        if (logs.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted);">Hệ thống chưa ghi nhận log nào.</span>';
            return;
        }
        
        container.innerHTML = '';
        logs.forEach(l => {
            const row = document.createElement("div");
            row.className = "log-line";
            
            // Format log timestamp
            const date = new Date(l.created_at);
            const timeStr = date.toLocaleTimeString('vi-VN') + "." + String(date.getMilliseconds()).padStart(3, '0');
            
            // Action badge type coloring
            let tagClass = "info";
            const act = l.action.toLowerCase();
            if (act.includes("auth") || act.includes("login")) tagClass = "auth";
            else if (act.includes("init")) tagClass = "init";
            else if (act.includes("fail") || act.includes("mismatch") || act.includes("error")) tagClass = "error";
            else if (act.includes("create") || act.includes("updated") || act.includes("delete") || act.includes("clear")) tagClass = "admin";
            
            row.innerHTML = `
                <span class="log-time">[${timeStr}]</span>
                <span class="log-tag ${tagClass}">${l.action}</span>
                <span class="log-ip" style="color:#06b6d4; font-size:0.8rem;">[${l.ip_address}]</span>
                <span class="log-msg">${l.details}</span>
            `;
            container.appendChild(row);
        });
        
        // Auto scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        container.innerHTML = '<span style="color:var(--color-danger);">Lỗi tải hệ thống log.</span>';
    }
}

async function clearAppLogs() {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ logs lịch sử của app này?")) return;
    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/logs/clear`, "DELETE");
        showToast("Đã xóa toàn bộ logs lịch sử", "success");
        await fetchAppLogs();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== TAB 7: SDK GUIDE ====================
function switchSdkLang(lang) {
    currentState.sdkLang = lang;
    
    // Toggle tab active styles
    document.querySelectorAll(".sdk-tab").forEach(tab => {
        tab.classList.remove("active");
    });
    const clickedTab = Array.from(document.querySelectorAll(".sdk-tab")).find(t => t.getAttribute("onclick") && t.getAttribute("onclick").includes(lang));
    if (clickedTab) clickedTab.classList.add("active");
    
    // Toggle active code panel
    document.querySelectorAll(".sdk-code-block").forEach(b => {
        b.classList.remove("active");
    });
    const activeBlock = document.getElementById(`sdk-content-${lang}`);
    if (activeBlock) activeBlock.classList.add("active");
}

function renderSdkGuide(app) {
    const pythonCode = document.getElementById("python-code");
    const cppCode = document.getElementById("cpp-code");
    const csharpCode = document.getElementById("csharp-code");

    // Dynamic Python template code
    if (pythonCode) {
        pythonCode.textContent = `import requests
import hashlib
import uuid
import sys

# CẤU HÌNH THÔNG TIN KẾT NỐI F8AUTH
API_BASE = "${API_BASE}"
APP_NAME = "${app.name}"
APP_SECRET = "${app.secret}"
OWNER_ID = "${app.owner_id}"
VERSION = "${app.version}"

class F8AuthClient:
    def __init__(self):
        self.session_id = None
        self.hwid = self.get_hwid()
        
    def get_hwid(self):
        # Tạo Hardware ID duy nhất dựa trên thiết bị (Ví dụ sử dụng UUID node)
        return hashlib.sha256(str(uuid.getnode()).encode()).hexdigest()

    def init(self):
        url = f"{API_BASE}/api/client/init"
        payload = {
            "name": APP_NAME,
            "ownerid": OWNER_ID,
            "secret": APP_SECRET,
            "version": VERSION
        }
        try:
            r = requests.post(url, json=payload).json()
            if r.get("success"):
                self.session_id = r["sessionid"]
                print(f"[+] Khởi tạo thành công! Session ID: {self.session_id}")
                return True
            else:
                print(f"[-] Lỗi Init: {r.get('message')}")
                if "download" in r and r["download"]:
                    print(f"[!] Vui lòng tải bản cập nhật tại: {r['download']}")
                return False
        except Exception as e:
            print(f"[-] Kết nối thất bại: {e}")
            return False

    def register(self, username, password, key):
        if not self.session_id:
            print("[-] Chưa khởi tạo session!")
            return False
        url = f"{API_BASE}/api/client/register"
        payload = {
            "sessionid": self.session_id,
            "username": username,
            "password": password,
            "key": key,
            "hwid": self.hwid
        }
        r = requests.post(url, json=payload).json()
        print(f"[*] {r.get('message')}")
        return r.get("success", False)

    def login(self, username, password):
        if not self.session_id:
            print("[-] Chưa khởi tạo session!")
            return False
        url = f"{API_BASE}/api/client/login"
        payload = {
            "sessionid": self.session_id,
            "username": username,
            "password": password,
            "hwid": self.hwid
        }
        r = requests.post(url, json=payload).json()
        if r.get("success"):
            print(f"[+] Đăng nhập thành công! Chào mừng {r['user_data']['username']}")
            print(f"[+] Hạn dùng: {r['user_data']['expires']}")
            return True
        else:
            print(f"[-] Lỗi đăng nhập: {r.get('message')}")
            return False

    def license_only(self, key):
        if not self.session_id:
            print("[-] Chưa khởi tạo session!")
            return False
        url = f"{API_BASE}/api/client/license"
        payload = {
            "sessionid": self.session_id,
            "key": key,
            "hwid": self.hwid
        }
        r = requests.post(url, json=payload).json()
        if r.get("success"):
            print(f"[+] Đăng nhập key thành công!")
            print(f"[+] Hạn dùng: {r['user_data']['expires']}")
            return True
        else:
            print(f"[-] Lỗi kiểm tra key: {r.get('message')}")
            return False

    def get_var(self, name):
        url = f"{API_BASE}/api/client/var"
        payload = {"sessionid": self.session_id, "name": name}
        r = requests.post(url, json=payload).json()
        return r.get("value") if r.get("success") else None

    def send_log(self, msg):
        url = f"{API_BASE}/api/client/log"
        payload = {"sessionid": self.session_id, "message": msg}
        requests.post(url, json=payload)

# CHƯƠNG TRÌNH CHẠY THỬ
if __name__ == "__main__":
    client = F8AuthClient()
    if not client.init():
        sys.exit(1)
        
    print("\\n=== MENU THỬ NGHIỆM ===")
    print("1. Đăng ký tài khoản (Register)")
    print("2. Đăng nhập tài khoản (Login)")
    print("3. Đăng nhập trực tiếp bằng Key (License Only)")
    choice = input("Lựa chọn (1-3): ")
    
    if choice == "1":
        u = input("Tên đăng nhập mới: ")
        p = input("Mật khẩu: ")
        k = input("License Key kích hoạt: ")
        client.register(u, p, k)
    elif choice == "2":
        u = input("Tên đăng nhập: ")
        p = input("Mật khẩu: ")
        if client.login(u, p):
            val = client.get_var("demo_variable")
            if val:
                print(f"[+] Nhận biến bảo mật thành công: demo_variable = {val}")
            client.send_log("User logged in and read secret variables")
    elif choice == "3":
        k = input("Nhập License Key: ")
        client.license_only(k)
`;
    }

    // Dynamic C++ template code
    if (cppCode) {
        cppCode.textContent = `#pragma once
#include <iostream>
#include <string>
#include <windows.h>
#include <winhttp.h>

#pragma comment(lib, "winhttp.lib")

namespace F8Auth {
    const std::wstring API_HOST = L"${window.location.hostname}";
    const int API_PORT = ${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)};
    const bool IS_HTTPS = ${window.location.protocol === 'https:' ? 'true' : 'false'};
    
    const std::string APP_NAME = "${app.name}";
    const std::string APP_SECRET = "${app.secret}";
    const std::string OWNER_ID = "${app.owner_id}";
    const std::string VERSION = "${app.version}";

    std::string SendPostRequest(const std::wstring& path, const std::string& json_payload) {
        std::string response_data = "";
        HINTERNET hSession = WinHttpOpen(L"F8Auth C++ Client/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        if (!hSession) return "Error: Init HTTP Session failed";

        HINTERNET hConnect = WinHttpConnect(hSession, API_HOST.c_str(), API_PORT, 0);
        if (!hConnect) {
            WinHttpCloseHandle(hSession);
            return "Error: Connection failed";
        }

        DWORD flags = IS_HTTPS ? WINHTTP_FLAG_SECURE : 0;
        HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", path.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!hRequest) {
            WinHttpCloseHandle(hConnect);
            WinHttpCloseHandle(hSession);
            return "Error: Open Request failed";
        }

        std::wstring headers = L"Content-Type: application/json\\r\\n";
        BOOL bResults = WinHttpSendRequest(hRequest, headers.c_str(), -1, (LPVOID)json_payload.c_str(), json_payload.length(), json_payload.length(), 0);

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
                    response_data.append(pszOutBuffer, dwDownloaded);
                }
                delete[] pszOutBuffer;
            } while (dwSize > 0);
        }

        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return response_data;
    }

    std::string GetHWID() {
        HW_PROFILE_INFO hwProfileInfo;
        if (GetCurrentHwProfileA(&hwProfileInfo)) {
            return std::string(hwProfileInfo.szHwProfileGuid);
        }
        return "DEFAULT-HWID-FALLBACK";
    }

    class Client {
    public:
        std::string session_id = "";
        std::string hwid = "";

        Client() {
            hwid = GetHWID();
        }

        bool Init() {
            std::string payload = "{\\"name\\": \\"" + APP_NAME + "\\", \\"ownerid\\": \\"" + OWNER_ID + "\\", \\"secret\\": \\"" + APP_SECRET + "\\", \\"version\\": \\"" + VERSION + "\\" }";
            std::string res = SendPostRequest(L"/api/client/init", payload);
            
            if (res.find("\\"success\\":true") != std::string::npos) {
                size_t pos = res.find("\\"sessionid\\":\\"");
                if (pos != std::string::npos) {
                    session_id = res.substr(pos + 13, 16);
                    std::cout << "[+] Init Successful! Session ID: " << session_id << "\\n";
                    return true;
                }
            }
            std::cout << "[-] Init App Failed! Server Response: " << res << "\\n";
            return false;
        }

        bool Login(const std::string& user, const std::string& pass) {
            std::string payload = "{\\"sessionid\\":\\"" + session_id + "\\", \\"username\\":\\"" + user + "\\", \\"password\\":\\"" + pass + "\\", \\"hwid\\":\\"" + hwid + "\\" }";
            std::string res = SendPostRequest(L"/api/client/login", payload);
            if (res.find("\\"success\\":true") != std::string::npos) {
                std::cout << "[+] Logged In Successfully! Response: " << res << "\\n";
                return true;
            }
            std::cout << "[-] Login Failed: " << res << "\\n";
            return false;
        }
    };
}
`;
    }

    // Dynamic C# template code
    if (csharpCode) {
        csharpCode.textContent = `using System;
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
        
        private readonly string apiBase = "${API_BASE}";
        private readonly string appName = "${app.name}";
        private readonly string appSecret = "${app.secret}";
        private readonly string ownerId = "${app.owner_id}";
        private readonly string version = "${app.version}";
        
        private string sessionId = null;
        private string hwid = null;

        public F8AuthClient()
        {
            hwid = GetHWID();
        }

        private string GetHWID()
        {
            string raw = Environment.MachineName + Environment.UserName;
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
                        Console.WriteLine($"[+] Init Successful! Session ID: {sessionId}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"[-] Init Failed: {root.GetProperty("message").GetString()}");
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Connection failed: {e.Message}");
                return false;
            }
        }

        public async Task<bool> Register(string username, string password, string key)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
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
                    Console.WriteLine($"[*] {root.GetProperty("message").GetString()}");
                    return root.GetProperty("success").GetBoolean();
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Registration failed: {e.Message}");
                return false;
            }
        }

        public async Task<bool> Login(string username, string password)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
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
                        Console.WriteLine($"[+] Login Successful! Welcome {userData.GetProperty("username").GetString()}");
                        Console.WriteLine($"[+] Expires: {userData.GetProperty("expires").GetString()}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"[-] Login Failed: {root.GetProperty("message").GetString()}");
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Login failed: {e.Message}");
                return false;
            }
        }

        public async Task<bool> LicenseOnly(string key)
        {
            if (string.IsNullOrEmpty(sessionId)) return false;
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
                        Console.WriteLine("[+] Key Authenticated Successfully!");
                        Console.WriteLine($"[+] Expires: {userData.GetProperty("expires").GetString()}");
                        return true;
                    }
                    else
                    {
                        Console.WriteLine($"[-] Key Validation Failed: {root.GetProperty("message").GetString()}");
                        return false;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"[-] Key verification failed: {e.Message}");
                return false;
            }
        }

        public async Task<string> GetVar(string name)
        {
            if (string.IsNullOrEmpty(sessionId)) return null;
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
                    return null;
                }
            }
            catch { return null; }
        }

        public async Task SendLog(string msg)
        {
            if (string.IsNullOrEmpty(sessionId)) return;
            string url = $"{apiBase}/api/client/log";
            var payload = new { sessionid = sessionId, message = msg };

            try
            {
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                await client.PostAsync(url, content);
            }
            catch { }
        }
    }
}
`;
    }
}

function copySdkCode(elementId) {
    copyToClipboard(elementId, "Đã copy SDK Code vào clipboard");
}

// ==================== TAB 8: APP SETTINGS ====================
async function renderAppSettings(app) {
    document.getElementById("settings-app-version").value = app.version;
    document.getElementById("settings-download-url").value = app.download_url;
    document.getElementById("settings-hwid-lock").checked = app.hwid_lock === 1;
    document.getElementById("settings-app-enabled").checked = app.enabled === 1;
    
    const isBanned = app.banned === 1;
    document.getElementById("settings-app-banned").checked = isBanned;
    document.getElementById("settings-ban-reason").value = app.ban_reason;

    const reasonContainer = document.getElementById("ban-reason-container");
    if (isBanned) {
        reasonContainer.classList.remove("hidden");
    } else {
        reasonContainer.classList.add("hidden");
    }
}

function toggleBanReasonInput() {
    const isBanned = document.getElementById("settings-app-banned").checked;
    const reasonContainer = document.getElementById("ban-reason-container");
    if (isBanned) {
        reasonContainer.classList.remove("hidden");
    } else {
        reasonContainer.classList.add("hidden");
    }
}

async function saveAppSettings(e) {
    e.preventDefault();
    const version = document.getElementById("settings-app-version").value;
    const download_url = document.getElementById("settings-download-url").value;
    const hwid_lock = document.getElementById("settings-hwid-lock").checked ? 1 : 0;
    const enabled = document.getElementById("settings-app-enabled").checked ? 1 : 0;
    const banned = document.getElementById("settings-app-banned").checked ? 1 : 0;
    const ban_reason = document.getElementById("settings-ban-reason").value;

    try {
        await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/settings`, "POST", {
            version, download_url, hwid_lock, enabled, banned, ban_reason
        });
        showToast("Cập nhật cấu hình ứng dụng thành công!", "success");
        
        // Refresh local memory and screen
        await loadDeveloperApps();
    } catch (err) {
        showToast(err.message, "danger");
    }
}

// ==================== UTILITY FUNCTIONS ====================
function copyToClipboard(elementId, successMsg) {
    const input = document.getElementById(elementId);
    if (!input) return;
    
    input.select();
    input.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(input.value);
    showToast(successMsg, "success");
}

function togglePasswordVisibility(elementId) {
    const input = document.getElementById(elementId);
    if (!input) return;
    
    const btn = input.nextElementSibling;
    if (input.type === "password") {
        input.type = "text";
        if (btn) btn.innerText = "Ẩn";
    } else {
        input.type = "password";
        if (btn) btn.innerText = "Hiện";
    }
}

// ==================== REAL OAuth LOGINS (Popup Flow) ====================
let oauthPopup = null;

function openOAuthModal(provider) {
    const url = provider === 'google' 
        ? '/api/auth/google/redirect' 
        : '/api/auth/discord/redirect';
    
    // Open popup window centered on screen
    const w = 500, h = 650;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    oauthPopup = window.open(url, 'F8Auth OAuth', `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);
    
    if (!oauthPopup) {
        showToast("Popup bị chặn! Hãy cho phép popup trong trình duyệt.", "danger");
    }
}

// Listen for OAuth callback postMessage from popup
window.addEventListener('message', async function(event) {
    if (!event.data || event.data.type !== 'f8auth_oauth') return;
    
    if (event.data.error) {
        showToast("OAuth failed: " + event.data.error, "danger");
        return;
    }
    
    if (event.data.token) {
        localStorage.setItem("f8auth_token", event.data.token);
        currentState.token = event.data.token;
        showToast("Đăng nhập thành công qua OAuth!", "success");
        
        await fetchDeveloperProfile();
        showView("view-dashboard");
        await loadDeveloperApps();
    }
});

