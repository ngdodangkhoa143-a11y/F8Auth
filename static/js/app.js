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
        select.innerHTML = '<option value="">-- Chọn ứng dụng --</option>';
        
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
        } else {
            currentState.selectedAppId = null;
            localStorage.removeItem("f8auth_selected_appid");
            document.getElementById("no-app-overlay").classList.remove("hidden");
            document.getElementById("dashboard-content").classList.add("hidden");
        }
    } catch (err) {
        showToast("Không thể tải danh sách ứng dụng", "danger");
    }
}

async function handleCreateApp(e) {
    e.preventDefault();
    const name = document.getElementById("create-app-name").value;
    try {
        const app = await apiRequest("/api/developer/apps", "POST", { name });
        showToast(`Đã tạo ứng dụng '${name}' thành công!`, "success");
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
async function renderOverview(app) {
    document.getElementById("overview-app-title").innerText = app.name;
    
    // Populate credentials
    document.getElementById("cred-app-name").value = app.name;
    document.getElementById("cred-app-secret").value = app.secret;
    document.getElementById("cred-owner-id").value = app.owner_id;
    document.getElementById("cred-api-url").value = API_BASE;
    
    // Update app status widgets
    const statusDotEnabled = document.getElementById("status-dot-enabled");
    const statusTextEnabled = document.getElementById("status-text-enabled");
    if (app.enabled) {
        statusDotEnabled.className = "status-dot green";
        statusTextEnabled.innerText = "Ứng dụng đang hoạt động (Online)";
    } else {
        statusDotEnabled.className = "status-dot red";
        statusTextEnabled.innerText = "Ứng dụng đang bị khóa (Offline)";
    }
    
    const statusDotHwid = document.getElementById("status-dot-hwid");
    const statusTextHwid = document.getElementById("status-text-hwid");
    if (app.hwid_lock) {
        statusDotHwid.className = "status-dot green";
        statusTextHwid.innerText = "Khóa HWID: Bật";
    } else {
        statusDotHwid.className = "status-dot red";
        statusTextHwid.innerText = "Khóa HWID: Tắt";
    }

    const statusDotBan = document.getElementById("status-dot-ban");
    const statusTextBan = document.getElementById("status-text-ban");
    if (app.banned) {
        statusDotBan.className = "status-dot red";
        statusTextBan.innerText = `Ứng dụng bị BAN (${app.ban_reason || 'Không rõ lý do'})`;
    } else {
        statusDotBan.className = "status-dot green";
        statusTextBan.innerText = "Trạng thái ứng dụng: Tốt";
    }
    
    // Fetch stats
    try {
        const keys = await apiRequest(`/api/developer/apps/${app.id}/keys`);
        const users = await apiRequest(`/api/developer/apps/${app.id}/users`);
        const vars = await apiRequest(`/api/developer/apps/${app.id}/variables`);
        const files = await apiRequest(`/api/developer/apps/${app.id}/files`);
        
        document.getElementById("stat-total-keys").innerText = keys.length;
        document.getElementById("stat-total-users").innerText = users.length;
        document.getElementById("stat-total-vars").innerText = vars.length;
        document.getElementById("stat-total-files").innerText = files.length;
    } catch (e) {
        console.error("Failed to load statistics: ", e);
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
        const matchesQuery = k.key_string.toLowerCase().includes(query) || k.note.toLowerCase().includes(query);
        const matchesStatus = statusFilter === 'all' || k.status === statusFilter;
        return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Không tìm thấy License Key nào</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(k => {
        const tr = document.createElement("tr");
        
        // Status Badge
        let statusBadge = `<span class="badge-status unused">Unused</span>`;
        if (k.status === 'active') statusBadge = `<span class="badge-status active">Active</span>`;
        if (k.status === 'expired') statusBadge = `<span class="badge-status expired">Expired</span>`;
        
        // Formatted dates
        const expStr = k.expiry_date ? new Date(k.expiry_date).toLocaleString('vi-VN') : 'Chưa kích hoạt';
        const hwidStr = k.hwid ? k.hwid : '<span style="color:var(--text-muted)">Trống</span>';
        
        tr.innerHTML = `
            <td>
                <span class="copyable-key" onclick="copyKeyText('${k.key_string}')" title="Click để copy key" style="font-family:'JetBrains Mono', monospace; cursor:pointer; font-weight:600; text-decoration: underline; color:#a78bfa;">
                    ${k.key_string}
                </span>
            </td>
            <td>${k.duration_days} ngày</td>
            <td>${expStr}</td>
            <td>Level ${k.level}</td>
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
    const length = parseInt(document.getElementById("gen-length").value);
    const prefix = document.getElementById("gen-prefix").value;
    const duration_days = parseInt(document.getElementById("gen-duration").value);
    const level = parseInt(document.getElementById("gen-level").value);
    const note = document.getElementById("gen-note").value;

    try {
        const res = await apiRequest(`/api/developer/apps/${currentState.selectedAppId}/keys`, "POST", {
            amount, length, prefix, duration_days, level, note
        });
        showToast(`Đã sinh ${amount} License Key thành công!`, "success");
        closeModal("modal-generate-keys");
        e.target.reset();
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Không tìm thấy người dùng nào</td></tr>';
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
            <td>
                <select onchange="changeUserLevel('${u.id}', this.value)" style="background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:#fff; border-radius:4px; padding:0.2rem 0.5rem; font-size:0.8rem;">
                    ${Array.from({length: 10}, (_, i) => i + 1).map(l => `<option value="${l}" ${u.level == l ? 'selected' : ''}>Level ${l}</option>`).join('')}
                </select>
            </td>
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Không tìm thấy tệp tin an toàn nào</td></tr>';
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
                <td><span class="badge-status active">Level ${f.level}+</span></td>
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
    const clickedTab = Array.from(document.querySelectorAll(".sdk-tab")).find(t => t.innerText.toLowerCase().includes(lang === 'python' ? 'python' : 'c++'));
    if (clickedTab) clickedTab.classList.add("active");
    
    // Toggle active code panel
    document.querySelectorAll(".sdk-code-block").forEach(b => {
        b.classList.remove("active");
    });
    document.getElementById(`sdk-content-${lang}`).classList.add("active");
}

function renderSdkGuide(app) {
    const pythonCode = document.getElementById("python-code");
    const cppCode = document.getElementById("cpp-code");

    // Dynamic Python template code
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
            print(f"[+] Cấp độ: {r['user_data']['level']} - Hạn dùng: {r['user_data']['expires']}")
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
            # Lấy thử một biến bảo mật tên là 'premium_offset'
            val = client.get_var("premium_offset")
            if val:
                print(f"[+] Nhận biến bảo mật thành công: premium_offset = {val}")
            client.send_log("User logged in and read secret variables")
    elif choice == "3":
        k = input("Nhập License Key: ")
        client.license_only(k)
`;

    // Dynamic C++ template code
    cppCode.textContent = `#pragma once
#include <iostream>
#include <string>
#include <windows.h>
#include <winhttp.h>

// Nhắc nhở: Bạn cần liên kết thư viện WinHttp (Thêm #pragma comment(lib, "winhttp.lib"))
#pragma comment(lib, "winhttp.lib")

namespace F8Auth {
    const std::wstring API_HOST = L"${window.location.hostname}";
    const int API_PORT = ${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)};
    const bool IS_HTTPS = ${window.location.protocol === 'https:' ? 'true' : 'false'};
    
    const std::string APP_NAME = "${app.name}";
    const std::string APP_SECRET = "${app.secret}";
    const std::string OWNER_ID = "${app.owner_id}";
    const std::string VERSION = "${app.version}";

    // Hàm gọi HTTP POST Request thuần bằng thư viện WinHTTP trên Windows
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

    // C++ HWID Generator dựa trên ổ cứng hoặc thông tin CPU đơn giản
    std::string GetHWID() {
        HW_PROFILE_INFO hwProfileInfo;
        if (GetCurrentHwProfileA(&hwProfileInfo)) {
            return std::string(hwProfileInfo.szHwProfileGuid); // Dạng {GUID}
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
            
            // Một chuỗi parser JSON thô sơ để kiểm tra thành công (Bạn nên tích hợp thư viện nlohmann/json)
            if (res.find("\\"success\\":true") != std::string::npos) {
                // Parse session id thô sơ
                size_t pos = res.find("\\"sessionid\\":\\"");
                if (pos != std::string::npos) {
                    session_id = res.substr(pos + 13, 16); // Lấy 16 ký tự session ID
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
        if (btn) btn.innerText = "Hide";
    } else {
        input.type = "password";
        if (btn) btn.innerText = "Show";
    }
}
