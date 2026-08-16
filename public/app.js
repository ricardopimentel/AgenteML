// API Base URL config (supports Firebase Hosting connection to remote FastAPI backends)
let apiBaseUrl = localStorage.getItem("backend_url") || "";

// API Endpoints
const API_CONFIG = "/api/config";
const API_STATUS = "/api/status";
const API_HISTORY = "/api/history";
const API_LOGS = "/api/logs";
const API_TRIGGER = "/api/trigger";
const API_TEST_EMAIL = "/api/test-email";

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
const mlHistoryContainer = document.getElementById("ml-history-container");
const shopeeHistoryContainer = document.getElementById("shopee-history-container");

const btnTrigger = document.getElementById("btn-trigger");
const btnTestEmail = document.getElementById("btn-test-email");
const btnInstallApp = document.getElementById("btn-install-app");
let deferredPrompt = null;

const lastRunTime = document.getElementById("last-run-time");
const lastRunStatus = document.getElementById("last-run-status");
const lastRunCount = document.getElementById("last-run-count");

// Intervals for polling
let statusInterval = null;
let logsInterval = null;
let logRefreshInterval = null; // Fast logs during execution
let serverTimeOffset = 0;
let clockTickingInterval = null;

// Pagination variables
let mlCurrentPage = 1;
let shopeeCurrentPage = 1;
const itemsPerPage = 5;

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
    if (btnTestEmail) {
        btnTestEmail.addEventListener("click", testSMTP);
    }
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

// Helper to get proxied image URLs to bypass referer/hotlinking blocks
function getProxiedImageUrl(imageUrl) {
    if (!imageUrl) return "";
    if (imageUrl.includes("sygmcdn.com") || imageUrl.includes("shopeemobile.com") || imageUrl.includes("mercadolivre.com") || imageUrl.includes("mlstatic.com") || imageUrl.includes("susercontent.com")) {
        return getApiUrl("/api/proxy-image?url=" + encodeURIComponent(imageUrl));
    }
    return imageUrl;
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
    if (clockTickingInterval) clearInterval(clockTickingInterval);
}

// Show app dashboard and load data
function showApp() {
    loginOverlay.style.display = "none";
    appContainer.style.display = "flex";
    
    // Switch to default tab
    switchTab('gerador-individual');
    
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
    
    // Start ticking clock
    startTickingClock();

    // Check for query parameters (e.g. from Chrome extension)
    const urlParams = new URLSearchParams(window.location.search);
    const affiliateLink = urlParams.get('affiliate_link');
    if (affiliateLink) {
        const urlInput = document.getElementById("custom-product-url");
        if (urlInput) {
            urlInput.value = affiliateLink;
            
            // Capture optional details from extension redirect
            window.extCapturedTitle = urlParams.get('title') || '';
            window.extCapturedPrice = urlParams.get('price') || '';
            window.extCapturedImage = urlParams.get('image_url') || '';
            window.extComparePrice = urlParams.get('compare_price') || '';
            window.extCompareLink = urlParams.get('compare_link') || '';
            window.extCompareStore = urlParams.get('compare_store') || '';
            
            // Switch to correct tab
            switchTab('gerador-individual');
            
            // Wait slightly for DOM to settle and trigger submit
            setTimeout(() => {
                const customOfferForm = document.getElementById("custom-offer-form");
                if (customOfferForm) {
                    customOfferForm.dispatchEvent(new Event('submit'));
                }
            }, 100);
        }
        // Clean URL query params without reloading the page
        window.history.replaceState({}, document.title, window.location.pathname);
    }
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

// Modal Control Functions
function openConfigModal() {
    const modal = document.getElementById("config-modal");
    if (modal) {
        modal.style.display = "flex";
        fetchConfig(); // Reload settings when opening modal
    }
}

function closeConfigModal() {
    const modal = document.getElementById("config-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

window.openConfigModal = openConfigModal;
window.closeConfigModal = closeConfigModal;

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
        closeConfigModal();
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
        
        // Update Server Time Offset
        if (data.server_time_br) {
            const serverDate = new Date(data.server_time_br.replace(" ", "T"));
            if (!isNaN(serverDate.getTime())) {
                serverTimeOffset = serverDate.getTime() - Date.now();
            }
        }
        
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
                currentPage = 1; // Reset to page 1 to see the new items!
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

// Test SMTP Server (Deprecated)
async function testSMTP() {
    if (!btnTestEmail) return;
    btnTestEmail.disabled = true;
    btnTestEmail.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Testando...`;
    
    const smtpServerEl = document.getElementById("SMTP_SERVER");
    const smtpPortEl = document.getElementById("SMTP_PORT");
    const smtpUserEl = document.getElementById("SMTP_USER");
    const smtpPasswordEl = document.getElementById("SMTP_PASSWORD");
    const receiverEmailEl = document.getElementById("RECEIVER_EMAIL");

    if (!smtpServerEl || !smtpPortEl || !smtpUserEl || !smtpPasswordEl || !receiverEmailEl) {
        btnTestEmail.disabled = false;
        btnTestEmail.innerHTML = `<i class="fa-regular fa-paper-plane"></i> Testar Conexão SMTP`;
        return;
    }
    
    const testData = {
        SMTP_SERVER: smtpServerEl.value,
        SMTP_PORT: parseInt(smtpPortEl.value) || 587,
        SMTP_USER: smtpUserEl.value,
        SMTP_PASSWORD: smtpPasswordEl.value,
        RECEIVER_EMAIL: receiverEmailEl.value
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

// Start ticking server clock
function startTickingClock() {
    if (clockTickingInterval) clearInterval(clockTickingInterval);
    
    const serverTimeEl = document.getElementById("server-time");
    
    clockTickingInterval = setInterval(() => {
        const serverNow = new Date(Date.now() + serverTimeOffset);
        
        const day = String(serverNow.getDate()).padStart(2, '0');
        const month = String(serverNow.getMonth() + 1).padStart(2, '0');
        const year = serverNow.getFullYear();
        
        const hours = String(serverNow.getHours()).padStart(2, '0');
        const minutes = String(serverNow.getMinutes()).padStart(2, '0');
        const seconds = String(serverNow.getSeconds()).padStart(2, '0');
        
        serverTimeEl.textContent = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// Fetch and Render History
async function fetchHistory() {
    try {
        const response = await request(getApiUrl(API_HISTORY));
        if (!response.ok) throw new Error("Falha ao carregar histórico");
        const history = await response.json();
        
        // Flatten and group all run items
        let mlItems = [];
        let shopeeItems = [];
        
        history.forEach((run, runIndex) => {
            run.items.forEach((item, itemIndex) => {
                const flatItem = {
                    ...item,
                    timestamp: run.timestamp,
                    runIndex: runIndex,
                    itemIndex: itemIndex
                };
                
                const linkToCheck = (item.original_link || item.affiliate_link || "").toLowerCase();
                const isShopee = linkToCheck.includes("shopee.com") || linkToCheck.includes("shope.ee");
                
                if (isShopee) {
                    shopeeItems.push(flatItem);
                } else {
                    mlItems.push(flatItem);
                }
            });
        });
        
        // Save history globally for clipboard access
        window.historyData = history;
        
        // Render ML History
        renderHistoryColumn(mlItems, mlHistoryContainer, "ml-pagination-controls", "ml", mlCurrentPage, changeMLPage);
        
        // Render Shopee History
        renderHistoryColumn(shopeeItems, shopeeHistoryContainer, "shopee-pagination-controls", "shopee", shopeeCurrentPage, changeShopeePage);
        
    } catch (error) {
        if (mlHistoryContainer) mlHistoryContainer.innerHTML = `<div class="empty-state"><p>Erro: ${error.message}</p></div>`;
        if (shopeeHistoryContainer) shopeeHistoryContainer.innerHTML = `<div class="empty-state"><p>Erro: ${error.message}</p></div>`;
    }
}

// Render a single history column (ML or Shopee)
function renderHistoryColumn(items, container, paginationId, storeType, page, changePageFn) {
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <i class="fa-solid fa-box-open" style="font-size: 1.8rem; opacity: 0.5;"></i>
                <p style="font-size: 0.85rem; margin-top: 5px;">Nenhuma oferta da ${storeType === 'ml' ? 'Mercado Livre' : 'Shopee'} gerada ainda.</p>
            </div>`;
        const paginationEl = document.getElementById(paginationId);
        if (paginationEl) {
            paginationEl.innerHTML = "";
            paginationEl.style.display = "none";
        }
        return;
    }
    
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Bounds checking
    let currentPageVal = page;
    if (currentPageVal > totalPages) currentPageVal = totalPages;
    if (currentPageVal < 1) currentPageVal = 1;
    
    // Set active page variables globally based on function reference
    if (changePageFn === changeMLPage) mlCurrentPage = currentPageVal;
    if (changePageFn === changeShopeePage) shopeeCurrentPage = currentPageVal;

    const startIndex = (currentPageVal - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageItems = items.slice(startIndex, endIndex);
    
    container.innerHTML = "";
    
    pageItems.forEach((item) => {
        const card = document.createElement("div");
        card.className = "offer-card";
        card.style.border = `1px solid ${storeType === 'ml' ? 'rgba(255, 230, 0, 0.15)' : 'rgba(238, 77, 45, 0.15)'}`;
        card.style.borderRadius = "12px";
        card.style.backgroundColor = "rgba(255, 255, 255, 0.01)";
        card.style.marginBottom = "15px";
        card.style.padding = "15px";
        
        const discountTag = item.discount ? `<span class="offer-discount-badge" style="background: ${storeType === 'ml' ? '#FFE600' : '#EE4D2D'}; color: #000; font-weight: bold; border-radius: 4px; padding: 2px 6px; font-size: 0.75rem;">${item.discount}</span>` : "";
        const originalPrice = item.original_price ? `<span class="offer-price-original">${item.original_price}</span>` : "";
        
        const hasLink = !!item.affiliate_link;
        const copyPreview = item.copy.replace("[LINK_AFILIADO]", item.affiliate_link || "[COLE O LINK DE AFILIADO PARA ATIVAR]");
        const whatsappUrl = hasLink ? `https://api.whatsapp.com/send?text=${encodeURIComponent(item.copy.replace("[LINK_AFILIADO]", item.affiliate_link))}` : "#";
        
        const brandActionText = storeType === 'ml' ? '1. Gere o link de afiliado oficial do ML:' : '1. Copie o link do produto Shopee:';
        
        card.innerHTML = `
            <div class="offer-product-info" style="display: flex; gap: 15px; margin-bottom: 12px;">
                <div class="offer-thumb-wrapper" style="width: 70px; height: 70px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color);">
                    <img src="${getProxiedImageUrl(item.image_url)}" class="offer-thumb" alt="Miniatura" style="max-width: 100%; max-height: 100%; object-fit: contain;">
                </div>
                <div class="offer-details" style="display: flex; flex-direction: column; justify-content: center; flex-grow: 1;">
                    <div class="offer-title" style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); line-height: 1.3; margin-bottom: 5px; word-break: break-word;">${item.title}</div>
                    <div class="offer-price-row" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        ${originalPrice}
                        <span class="offer-price-current" style="font-size: 1.1rem; font-weight: bold; color: var(--text-primary);">${item.price}</span>
                        ${discountTag}
                    </div>
                    <small style="color: var(--text-muted); margin-top: 5px; display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem;">
                        <i class="fa-solid fa-calendar-day"></i> Gerado em: ${item.timestamp}
                    </small>
                </div>
            </div>
            
            <div class="manual-link-builder-row" style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; margin: 10px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">${brandActionText}</span>
                    <button class="btn-copy-original" onclick="copyOriginalLink(this, '${item.original_link}')" style="padding: 4px 8px; font-size: 0.80rem;">
                        <i class="fa-regular fa-copy"></i> Copiar Link do Produto
                    </button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center; width: 100%; margin-top: 5px;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); min-width: 130px;">2. Cole o link de afiliado:</span>
                    <input type="text" 
                           placeholder="${storeType === 'ml' ? 'meli.la/XXXX' : 'shope.ee/XXXX'}" 
                           value="${item.affiliate_link || ''}" 
                           style="flex-grow: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.3); color: var(--text-primary); font-size: 0.85rem;" />
                    <button class="btn-copy" onclick="saveAffiliateLink(this, '${item.timestamp}', '${item.title.replace(/'/g, "\\'")}')" style="padding: 6px 12px; font-size: 0.85rem;">
                        Salvar Link
                    </button>
                </div>
            </div>
            
            <div class="offer-copy-section" style="margin-top: 12px;">
                <div class="copy-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">Texto de Divulgação (WhatsApp):</span>
                    <button class="btn-copy" ${!hasLink ? 'disabled' : ''} onclick="copyToClipboard(this, ${item.runIndex}, ${item.itemIndex})" style="padding: 4px 8px; font-size: 0.80rem;">
                        <i class="fa-regular fa-copy"></i> Copiar Texto
                    </button>
                </div>
                <div class="offer-copy-box" id="copy-box-${item.runIndex}-${item.itemIndex}" style="font-size: 0.85rem; padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 6px; white-space: pre-wrap; font-family: monospace; max-height: 120px; overflow-y: auto;">${copyPreview}</div>
            </div>
            
            <div class="offer-actions" style="display: flex; gap: 10px; margin-top: 12px;">
                <button class="btn-copy-image" onclick="copyImageToClipboard(this, '${item.image_url}')" style="flex: 1; padding: 8px 12px; font-size: 0.85rem;">
                    <i class="fa-regular fa-image"></i> Copiar Imagem
                </button>
                <a href="${whatsappUrl}" 
                   class="btn-whatsapp ${!hasLink ? 'disabled-btn' : ''}" 
                   ${!hasLink ? 'onclick="return false;"' : ''}
                   target="_blank"
                   style="flex: 1; padding: 8px 12px; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; gap: 5px; text-decoration: none;">
                    <i class="fa-brands fa-whatsapp"></i> Enviar p/ WhatsApp
                </a>
            </div>
        `;
        container.appendChild(card);
    });
    
    renderPaginationControlsSplit(totalPages, currentPageVal, paginationId, changePageFn);
}

// Render pagination buttons for split lists
function renderPaginationControlsSplit(totalPages, page, paginationId, changePageFn) {
    const controlsContainer = document.getElementById(paginationId);
    if (!controlsContainer) return;
    
    if (totalPages <= 1) {
        controlsContainer.innerHTML = "";
        controlsContainer.style.display = "none";
        return;
    }
    
    controlsContainer.style.display = "flex";
    controlsContainer.style.justifyContent = "center";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.gap = "10px";
    
    controlsContainer.innerHTML = "";
    
    const prevBtn = document.createElement("button");
    prevBtn.className = "btn-page";
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    if (page === 1) prevBtn.disabled = true;
    prevBtn.addEventListener("click", () => changePageFn(page - 1));
    
    const pageSpan = document.createElement("span");
    pageSpan.className = "page-info";
    pageSpan.textContent = `${page} / ${totalPages}`;
    pageSpan.style.fontSize = "0.85rem";
    
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn-page";
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    if (page === totalPages) nextBtn.disabled = true;
    nextBtn.addEventListener("click", () => changePageFn(page + 1));
    
    controlsContainer.appendChild(prevBtn);
    controlsContainer.appendChild(pageSpan);
    controlsContainer.appendChild(nextBtn);
}

function changeMLPage(page) {
    mlCurrentPage = page;
    fetchHistory();
}

function changeShopeePage(page) {
    shopeeCurrentPage = page;
    fetchHistory();
}

window.changeMLPage = changeMLPage;
window.changeShopeePage = changeShopeePage;

// PWA Installation Logic & Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker registrado com sucesso!', reg))
            .catch(err => console.log('Erro ao registrar o Service Worker:', err));
    });
}

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstallApp) {
        btnInstallApp.style.display = "inline-flex";
    }
});

if (btnInstallApp) {
    btnInstallApp.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User choice outcome: ${outcome}`);
        deferredPrompt = null;
        btnInstallApp.style.display = "none";
    });
}

window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (btnInstallApp) {
        btnInstallApp.style.display = "none";
    }
    showToast("Aplicativo instalado com sucesso!", "success");
});

// Copy to Clipboard Action
function copyToClipboard(button, runIndex, itemIndex) {
    if (!window.historyData) return;
    
    try {
        const item = window.historyData[runIndex].items[itemIndex];
        const text = item.copy.replace("[LINK_AFILIADO]", item.affiliate_link || "");
        
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

// Copy Image to Clipboard using proxy endpoint and Canvas conversion
async function copyImageToClipboard(button, imageUrl) {
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>...`;
    
    try {
        // Build the URL to our backend proxy image endpoint
        const proxyUrl = getApiUrl("/api/proxy-image?url=" + encodeURIComponent(imageUrl));
        
        // Fetch the image blob
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Erro ao baixar imagem do servidor proxy.");
        const blob = await response.blob();
        
        // Check if the clipboard API is supported
        if (!navigator.clipboard || !window.ClipboardItem) {
            throw new Error("API de Área de Transferência não suportada neste navegador.");
        }
        
        // ClipboardItem only supports PNG. Convert it.
        let pngBlob = blob;
        if (blob.type !== "image/png") {
            pngBlob = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((resultBlob) => {
                        if (resultBlob) resolve(resultBlob);
                        else reject(new Error("Falha na conversão para PNG."));
                    }, "image/png");
                };
                img.onerror = () => reject(new Error("Erro ao carregar imagem para conversão."));
                img.src = URL.createObjectURL(blob);
            });
        }
        
        // Copy to clipboard
        await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob })
        ]);
        
        button.className = "btn-copy-image copied";
        button.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
        showToast("Imagem copiada! Cole (Ctrl+V) no WhatsApp.", "success");
        
        setTimeout(() => {
            button.className = "btn-copy-image";
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 2000);
        
    } catch (error) {
        showToast("Falha ao copiar imagem: " + error.message, "error");
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
}

// Copy original product link to clipboard
function copyOriginalLink(button, url) {
    navigator.clipboard.writeText(url).then(() => {
        const originalHTML = button.innerHTML;
        button.className = "btn-copy-original copied";
        button.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
        
        setTimeout(() => {
            button.className = "btn-copy-original";
            button.innerHTML = originalHTML;
        }, 2000);
    }).catch(err => {
        showToast("Erro ao copiar link: " + err.message, "error");
    });
}
window.copyOriginalLink = copyOriginalLink;

// Save manual affiliate link to history.json
async function saveAffiliateLink(button, timestamp, title) {
    const card = button.closest(".offer-card");
    const input = card.querySelector(".manual-link-builder-row input");
    const linkValue = input.value.trim();
    
    if (!linkValue) {
        showToast("Por favor, insira o link de afiliado antes de salvar.", "error");
        return;
    }
    
    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>...`;
    
    try {
        const response = await request(getApiUrl("/api/update-affiliate-link"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                timestamp: timestamp,
                title: title,
                affiliate_link: linkValue
            })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Erro desconhecido");
        
        showToast("Link salvo com sucesso!", "success");
        fetchHistory(); // Refresh to update button states and texts
        
    } catch (error) {
        showToast("Erro ao salvar link: " + error.message, "error");
    } finally {
        button.disabled = false;
        button.innerHTML = "Salvar Link";
    }
}
window.saveAffiliateLink = saveAffiliateLink;

// Tab Navigation Control
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // Add active class to clicked button (matches onclick string)
    const clickedBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (clickedBtn) clickedBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });

    const activeContent = document.getElementById(`${tabId}-content`);
    if (activeContent) {
        activeContent.style.display = 'flex';
        activeContent.classList.add('active');
    }
}
window.switchTab = switchTab;

// Single Custom Offer Generator Logic
document.addEventListener("DOMContentLoaded", () => {
    const customOfferForm = document.getElementById("custom-offer-form");
    const btnGenerateCustom = document.getElementById("btn-generate-custom");
    const customPreviewCard = document.getElementById("custom-preview-card");

    if (customOfferForm) {
        customOfferForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const urlInput = document.getElementById("custom-product-url");
            const url = urlInput.value.trim();
            if (!url) return;

            btnGenerateCustom.disabled = true;
            btnGenerateCustom.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Gerando Anúncio...`;
            customPreviewCard.style.display = "none";
            customPreviewCard.innerHTML = "";

            try {
                const bodyParams = { url: url };
                if (window.extCapturedTitle) {
                    bodyParams.title = window.extCapturedTitle;
                    bodyParams.price = window.extCapturedPrice;
                    bodyParams.image_url = window.extCapturedImage;
                    
                    // Consume after usage so subsequent manually typed links do not reuse old data
                    window.extCapturedTitle = null;
                    window.extCapturedPrice = null;
                    window.extCapturedImage = null;
                }

                if (window.extComparePrice) {
                    bodyParams.compare_price = window.extComparePrice;
                    bodyParams.compare_link = window.extCompareLink;
                    bodyParams.compare_store = window.extCompareStore;
                    
                    window.extComparePrice = null;
                    window.extCompareLink = null;
                    window.extCompareStore = null;
                }

                const response = await request(getApiUrl("/api/generate-custom-offer"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bodyParams)
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.detail || "Erro ao gerar anúncio.");

                window.customGeneratedItem = result.item;
                renderCustomPreview(result.item);
                showToast("Anúncio gerado com sucesso!", "success");
            } catch (error) {
                showToast("Erro ao processar: " + error.message, "error");
            } finally {
                btnGenerateCustom.disabled = false;
                btnGenerateCustom.innerHTML = `<i class="fa-solid fa-magic"></i> Gerar Anúncio com IA`;
            }
        });
    }
});

// Render Dynamic Custom Preview Card
function renderCustomPreview(item) {
    const customPreviewCard = document.getElementById("custom-preview-card");
    if (!customPreviewCard) return;

    const discountTag = item.discount ? `<span class="offer-discount-badge">${item.discount}</span>` : "";
    const originalPrice = item.original_price ? `<span class="offer-price-original">${item.original_price}</span>` : "";
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(item.copy)}`;

    let comparisonBox = "";
    if (item.comparison) {
        const comp = item.comparison;
        comparisonBox = `
            <div class="comparison-alert-box" style="margin: 15px 0; padding: 12px 15px; border-radius: 8px; background: rgba(16, 185, 129, 0.05); border: 1px dashed rgba(16, 185, 129, 0.25); display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; color: #10B981;">
                    <i class="fa-solid fa-circle-info" style="font-size: 1rem;"></i>
                    <span>Preço menor encontrado na ${comp.store}!</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">Preço: <strong style="color: var(--text-primary); font-size: 0.95rem;">${comp.price}</strong></span>
                    <button class="btn-copy" onclick="copyToClipboardText(this, '${comp.link}')" style="padding: 4px 10px; font-size: 0.80rem; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fa-regular fa-copy"></i> Copiar Link da Oferta
                    </button>
                </div>
            </div>
        `;
    }

    customPreviewCard.innerHTML = `
        <div class="offer-product-info">
            <div class="offer-thumb-wrapper">
                <img src="${getProxiedImageUrl(item.image_url)}" class="offer-thumb" alt="Miniatura">
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
        
        ${comparisonBox}
        
        <div class="offer-copy-section" style="margin-top: 15px;">
            <div class="copy-header-row">
                <span>Texto de Divulgação (WhatsApp):</span>
                <button class="btn-copy" id="btn-copy-custom" onclick="copyCustomToClipboard(this)">
                    <i class="fa-regular fa-copy"></i> Copiar Texto
                </button>
            </div>
            <div class="offer-copy-box" id="copy-box-custom">${item.copy}</div>
        </div>
        
        <div class="offer-actions">
            <button class="btn-copy-image" onclick="copyImageToClipboard(this, '${item.image_url}')">
                <i class="fa-regular fa-image"></i> Copiar Imagem
            </button>
            <a href="${whatsappUrl}" 
               id="btn-whatsapp-custom"
               class="btn-whatsapp" 
               target="_blank">
                <i class="fa-brands fa-whatsapp"></i> Enviar p/ WhatsApp
            </a>
        </div>
    `;
    customPreviewCard.style.display = "block";
}
window.renderCustomPreview = renderCustomPreview;

function copyToClipboardText(button, text) {
    if (!text) return;
    try {
        navigator.clipboard.writeText(text).then(() => {
            const originalHTML = button.innerHTML;
            button.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
            setTimeout(() => {
                button.innerHTML = originalHTML;
            }, 2000);
        });
    } catch (e) {
        showToast("Erro ao copiar link.", "error");
    }
}
window.copyToClipboardText = copyToClipboardText;

// Copy text function for custom generator
function copyCustomToClipboard(button) {
    if (!window.customGeneratedItem) return;
    
    try {
        navigator.clipboard.writeText(window.customGeneratedItem.copy).then(() => {
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
        showToast("Erro ao copiar texto.", "error");
    }
}
window.copyCustomToClipboard = copyCustomToClipboard;
