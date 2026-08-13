// API Base URL config (supports Firebase Hosting connection to remote FastAPI backends)
let apiBaseUrl = localStorage.getItem("backend_url") || "";

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const loginForm = document.getElementById("login-form");
const loginPasswordInput = document.getElementById("login-password");
const loginBackendUrlInput = document.getElementById("login-backend-url");
const backendUrlGroup = document.getElementById("backend-url-group");
const loginErrorMsg = document.getElementById("login-error-msg");

const appContainer = document.getElementById("app-container");
const configForm = document.getElementById("config-form");
const schedulerStatus = document.getElementById("scheduler-status");
const nextRunTime = document.getElementById("next-run-time");
const logsConsole = document.getElementById("logs-console");
const historyContainer = document.getElementById("history-container");

const btnTrigger = document.getElementById("btn-trigger");
const btnTestEmail = document.getElementById("btn-test-email");

const lastRunTime = document.getElementById("last-run-time");
const lastRunStatus = document.getElementById("last-run-status");
const lastRunCount = document.getElementById("last-run-count");

// Intervals for polling
let statusInterval = null;
let logsInterval = null;
let logRefreshInterval = null; // Fast logs during execution

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
    setupHostingEnvironment();
    
    // Check if user is already authenticated
    const savedPassword = localStorage.getItem("admin_password");
    if (savedPassword) {
        showApp();
    } else {
        showLogin();
    }
    
    // Setup login form submit
    loginForm.addEventListener("submit", handleLogin);
    
    // Setup config form submit
    configForm.addEventListener("submit", saveConfig);
    
    // Setup manual trigger
    btnTrigger.addEventListener("click", triggerAgent);
    
    // Setup SMTP test
    btnTestEmail.addEventListener("click", testSMTP);
});

// Configure hosting environment (Firebase vs Localhost)
function setupHostingEnvironment() {
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isLocal) {
        // Show Backend URL configuration on the login screen if hosted on Firebase
        backendUrlGroup.style.display = "block";
        if (apiBaseUrl) {
            loginBackendUrlInput.value = apiBaseUrl;
        }
    } else {
        // Default to relative paths on localhost
        backendUrlGroup.style.display = "none";
        apiBaseUrl = "";
        localStorage.removeItem("backend_url");
    }
}

// Get final API URL
function getApiUrl(path) {
    return apiBaseUrl + path;
}

// Fetch headers helper
function getHeaders() {
    return {
        "Content-Type": "application/json",
        "X-Admin-Password": localStorage.getItem("admin_password") || ""
    };
}

// Handle login request
async function handleLogin(e) {
    e.preventDefault();
    loginErrorMsg.style.display = "none";
    
    const password = loginPasswordInput.value;
    
    // If remote, save the backend URL
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!isLocal) {
        let backendUrl = loginBackendUrlInput.value.trim();
        if (backendUrl) {
            // Strip trailing slash
            if (backendUrl.endsWith("/")) {
                backendUrl = backendUrl.slice(0, -1);
            }
            // Ensure protocol is defined
            if (!backendUrl.startsWith("http://") && !backendUrl.startsWith("https://")) {
                backendUrl = "https://" + backendUrl;
            }
            apiBaseUrl = backendUrl;
            localStorage.setItem("backend_url", backendUrl);
        } else {
            apiBaseUrl = "";
            localStorage.removeItem("backend_url");
        }
    }
    
    try {
        const response = await fetch(getApiUrl("/api/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: password })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.detail || "Senha inválida.");
        
        // Save auth password
        localStorage.setItem("admin_password", password);
        
        // Hide login and show dashboard
        showApp();
        showToast("Bem-vindo ao painel!", "success");
    } catch (error) {
        loginErrorMsg.querySelector("span").textContent = error.message;
        loginErrorMsg.style.display = "flex";
    }
}

// Show login screen
function showLogin() {
    loginOverlay.style.display = "flex";
    appContainer.style.display = "none";
    
    // Stop polling
    if (statusInterval) clearInterval(statusInterval);
    if (logsInterval) clearInterval(logsInterval);
    if (logRefreshInterval) clearInterval(logRefreshInterval);
}

// Show app dashboard and load data
function showApp() {
    loginOverlay.style.display = "none";
    appContainer.style.display = "flex";
    
    // Load initial data
    fetchConfig();
    fetchStatus();
    fetchHistory();
    fetchLogs();
    
    // Start polling status and logs
    if (statusInterval) clearInterval(statusInterval);
    statusInterval = setInterval(fetchStatus, 10000);
    
    if (logsInterval) clearInterval(logsInterval);
    logsInterval = setInterval(fetchLogs, 15000);
}

// Logout action
function logout() {
    localStorage.removeItem("admin_password");
    // We keep the backend URL so they don't have to type it again
    loginPasswordInput.value = "";
    showLogin();
    showToast("Você saiu do painel.", "info");
}

// Handle API requests and capture 401s
async function request(url, options = {}) {
    options.headers = {
        ...options.headers,
        ...getHeaders()
    };
    
    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            // Authentication expired/failed
            logout();
            throw new Error("Sessão expirada. Faça login novamente.");
        }
        return response;
    } catch (error) {
        if (error.message.includes("Failed to fetch")) {
            throw new Error("Não foi possível conectar ao servidor backend em " + (apiBaseUrl || "localhost"));
        }
        throw error;
    }
}

// Helper: Show notification toast
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    const toastIcon = document.getElementById("toast-icon");
    const toastMsg = document.getElementById("toast-message");
    
    toastMsg.textContent = message;
    
    // Reset classes
    toastIcon.className = "fa-solid";
    
    if (type === "success") {
        toastIcon.classList.add("fa-circle-check", "success");
    } else if (type === "error") {
        toastIcon.classList.add("fa-circle-xmark", "error");
    } else {
        toastIcon.classList.add("fa-circle-info", "info");
    }
    
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}

// Helper: Toggle Password View
function togglePasswordVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    const buttonIcon = document.querySelector(`#${fieldId} ~ .toggle-password i`);
    
    if (input.type === "password") {
        input.type = "text";
        buttonIcon.className = "fa-regular fa-eye-slash";
    } else {
        input.type = "password";
        buttonIcon.className = "fa-regular fa-eye";
    }
}

// Fetch Configurations
async function fetchConfig() {
    try {
        const response = await request(getApiUrl(API_CONFIG));
        if (!response.ok) throw new Error("Falha ao carregar configurações");
        const data = await response.json();
        
        // Fill form fields
        for (const key in data) {
            const input = document.getElementById(key);
            if (input) input.value = data[key];
        }
    } catch (error) {
        showToast(error.message, "error");
    }
}

// Save Configurations
async function saveConfig(e) {
    e.preventDefault();
    
    const configData = {
        MERCADO_LIVRE_AFFILIATE_ID: document.getElementById("MERCADO_LIVRE_AFFILIATE_ID").value,
        GEMINI_API_KEY: document.getElementById("GEMINI_API_KEY").value,
        SMTP_SERVER: document.getElementById("SMTP_SERVER").value,
        SMTP_PORT: parseInt(document.getElementById("SMTP_PORT").value) || 587,
        SMTP_USER: document.getElementById("SMTP_USER").value,
        SMTP_PASSWORD: document.getElementById("SMTP_PASSWORD").value,
        RECEIVER_EMAIL: document.getElementById("RECEIVER_EMAIL").value,
        POST_TIMES: document.getElementById("POST_TIMES").value,
        ADMIN_PASSWORD: document.getElementById("ADMIN_PASSWORD").value
    };
    
    try {
        const response = await request(getApiUrl(API_CONFIG), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configData)
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Erro desconhecido");
        
        // If password was successfully updated, sync in localStorage so we don't get logged out!
        localStorage.setItem("admin_password", configData.ADMIN_PASSWORD);
        
        showToast(result.message, "success");
        fetchStatus();
    } catch (error) {
        showToast("Falha ao salvar configurações: " + error.message, "error");
    }
}

// Fetch Status
async function fetchStatus() {
    try {
        const response = await request(getApiUrl(API_STATUS));
        if (!response.ok) throw new Error("Falha ao buscar status");
        const data = await response.json();
        
        // Update Scheduler State
        if (data.scheduler_running) {
            schedulerStatus.className = "status-badge active";
            schedulerStatus.querySelector(".status-label").textContent = "Agendador Ativo";
        } else {
            schedulerStatus.className = "status-badge";
            schedulerStatus.querySelector(".status-label").textContent = "Agendador Inativo";
        }
        
        // Update Next Run Time
        nextRunTime.textContent = data.next_run ? data.next_run : "Aguardando";
        
        // Update Latest Run Details
        const latest = data.latest_run;
        if (latest && latest.timestamp) {
            lastRunTime.textContent = latest.timestamp.split(" ")[1] || latest.timestamp;
            
            // Clean up status text and styling
            lastRunStatus.textContent = latest.status;
            lastRunStatus.className = "summary-value";
            
            if (latest.status === "Sucesso") {
                lastRunStatus.classList.add("sucesso");
            } else if (latest.status.includes("Falha") || latest.status.includes("Erro")) {
                lastRunStatus.classList.add("falha");
            }
            
            lastRunCount.textContent = latest.items_count;
            
            // If the background job finished and we were listening to log details, clear the fast refresh
            if (latest.status !== "Executando" && logRefreshInterval) {
                clearInterval(logRefreshInterval);
                logRefreshInterval = null;
                btnTrigger.disabled = false;
                btnTrigger.innerHTML = `<i class="fa-solid fa-bolt"></i> Executar Agente Agora`;
                fetchHistory(); // Refresh history list
            }
        }
    } catch (error) {
        console.error("Status check error:", error);
    }
}

// Fetch logs
async function fetchLogs() {
    try {
        const response = await request(getApiUrl(API_LOGS));
        if (!response.ok) throw new Error("Falha ao buscar logs");
        const data = await response.json();
        
        // Save scroll height
        const wasAtBottom = logsConsole.scrollHeight - logsConsole.clientHeight <= logsConsole.scrollTop + 5;
        
        logsConsole.textContent = data.logs;
        
        // Auto scroll to bottom if user was already at bottom
        if (wasAtBottom) {
            logsConsole.scrollTop = logsConsole.scrollHeight;
        }
    } catch (error) {
        logsConsole.textContent = "Erro ao recuperar console: " + error.message;
    }
}

// Trigger Agent Now
async function triggerAgent() {
    btnTrigger.disabled = true;
    btnTrigger.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Executando...`;
    
    try {
        const response = await request(getApiUrl(API_TRIGGER), { method: "POST" });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.detail || "Erro desconhecido");
        
        showToast("Execução agendada! Monitorando logs...", "success");
        
        // Set short interval to refresh logs and status while executing
        fetchStatus();
        fetchLogs();
        
        if (logRefreshInterval) clearInterval(logRefreshInterval);
        logRefreshInterval = setInterval(() => {
            fetchLogs();
            fetchStatus();
        }, 1500);
        
    } catch (error) {
        showToast("Erro ao disparar agente: " + error.message, "error");
        btnTrigger.disabled = false;
        btnTrigger.innerHTML = `<i class="fa-solid fa-bolt"></i> Executar Agente Agora`;
    }
}

// Test SMTP Server
async function testSMTP() {
    btnTestEmail.disabled = true;
    btnTestEmail.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Testando...`;
    
    const testData = {
        SMTP_SERVER: document.getElementById("SMTP_SERVER").value,
        SMTP_PORT: parseInt(document.getElementById("SMTP_PORT").value) || 587,
        SMTP_USER: document.getElementById("SMTP_USER").value,
        SMTP_PASSWORD: document.getElementById("SMTP_PASSWORD").value,
        RECEIVER_EMAIL: document.getElementById("RECEIVER_EMAIL").value
    };
    
    try {
        const response = await fetch(getApiUrl(API_TEST_EMAIL), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testData)
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Falha desconhecida");
        
        showToast(result.message, "success");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        btnTestEmail.disabled = false;
        btnTestEmail.innerHTML = `<i class="fa-regular fa-paper-plane"></i> Testar Conexão SMTP`;
    }
}

// Fetch and Render History
async function fetchHistory() {
    try {
        const response = await request(getApiUrl(API_HISTORY));
        if (!response.ok) throw new Error("Falha ao carregar histórico");
        const history = await response.json();
        
        if (history.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhuma oferta gerada ainda. Execute o agente acima para iniciar!</p>
                </div>`;
            return;
        }
        
        historyContainer.innerHTML = "";
        
        history.forEach((run, runIndex) => {
            const runGroup = document.createElement("div");
            runGroup.className = "run-group";
            
            // Header for group
            const header = document.createElement("div");
            header.className = "run-group-header";
            header.innerHTML = `
                <span><i class="fa-solid fa-calendar-day"></i> Envio em: ${run.timestamp}</span>
                <span>${run.items.length} produto(s)</span>
            `;
            runGroup.appendChild(header);
            
            // Iterate run items
            run.items.forEach((item, itemIndex) => {
                const card = document.createElement("div");
                card.className = "offer-card";
                
                const discountTag = item.discount ? `<span class="offer-discount-badge">${item.discount}</span>` : "";
                const originalPrice = item.original_price ? `<span class="offer-price-original">${item.original_price}</span>` : "";
                
                card.innerHTML = `
                    <div class="offer-product-info">
                        <div class="offer-thumb-wrapper">
                            <img src="${item.image_url}" class="offer-thumb" alt="Miniatura">
                        </div>
                        <div class="offer-details">
                            <div class="offer-title">${item.title}</div>
                            <div class="offer-price-row">
                                ${originalPrice}
                                <span class="offer-price-current">${item.price}</span>
                                ${discountTag}
                            </div>
                        </div>
                    </div>
                    
                    <div class="offer-copy-section">
                        <div class="copy-header-row">
                            <span>Texto de Divulgação (WhatsApp):</span>
                            <button class="btn-copy" onclick="copyToClipboard(this, ${runIndex}, ${itemIndex})">
                                <i class="fa-regular fa-copy"></i> Copiar Texto
                            </button>
                        </div>
                        <div class="offer-copy-box" id="copy-box-${runIndex}-${itemIndex}">${item.copy}</div>
                    </div>
                    
                    <div class="offer-actions">
                        <a href="${item.affiliate_link}" class="btn-link-ml" target="_blank">
                            <i class="fa-solid fa-up-right-from-square"></i> Link de Afiliado
                        </a>
                    </div>
                `;
                runGroup.appendChild(card);
            });
            
            historyContainer.appendChild(runGroup);
        });
        
        // Save history globally for clipboard access
        window.historyData = history;
        
    } catch (error) {
        historyContainer.innerHTML = `<div class="empty-state"><p>Erro ao carregar histórico: ${error.message}</p></div>`;
    }
}

// Copy to Clipboard Action
function copyToClipboard(button, runIndex, itemIndex) {
    if (!window.historyData) return;
    
    try {
        const text = window.historyData[runIndex].items[itemIndex].copy;
        
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = button.innerHTML;
            button.className = "btn-copy copied";
            button.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
            
            setTimeout(() => {
                button.className = "btn-copy";
                button.innerHTML = originalHTML;
            }, 2000);
        }).catch(err => {
            showToast("Erro ao copiar: " + err.message, "error");
        });
    } catch (error) {
        showToast("Erro ao copiar dados do histórico.", "error");
    }
}
