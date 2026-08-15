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
const historyContainer = document.getElementById("history-container");

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
let currentPage = 1;
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
        
        // Flatten all run items
        let allItems = [];
        history.forEach((run, runIndex) => {
            run.items.forEach((item, itemIndex) => {
                allItems.push({
                    ...item,
                    timestamp: run.timestamp,
                    runIndex: runIndex,
                    itemIndex: itemIndex
                });
            });
        });
        
        if (allItems.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <p>Nenhuma oferta gerada ainda. Execute o agente acima para iniciar!</p>
                </div>`;
            const controlsContainer = document.getElementById("pagination-controls");
            if (controlsContainer) {
                controlsContainer.innerHTML = "";
                controlsContainer.style.display = "none";
            }
            return;
        }
        
        // Save history globally for clipboard access
        window.historyData = history;
        
        const totalItems = allItems.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // Bounds checking
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const pageItems = allItems.slice(startIndex, endIndex);
        
        historyContainer.innerHTML = "";
        
        pageItems.forEach((item) => {
            const card = document.createElement("div");
            card.className = "offer-card";
            card.style.border = "1px solid var(--border-color)";
            card.style.borderRadius = "12px";
            card.style.backgroundColor = "rgba(255, 255, 255, 0.01)";
            card.style.marginBottom = "15px";
            
            const discountTag = item.discount ? `<span class="offer-discount-badge">${item.discount}</span>` : "";
            const originalPrice = item.original_price ? `<span class="offer-price-original">${item.original_price}</span>` : "";
            
            const hasLink = !!item.affiliate_link;
            const copyPreview = item.copy.replace("[LINK_AFILIADO]", item.affiliate_link || "[COLE O LINK DE AFILIADO PARA ATIVAR]");
            const whatsappUrl = hasLink ? `https://api.whatsapp.com/send?text=${encodeURIComponent(item.copy.replace("[LINK_AFILIADO]", item.affiliate_link))}` : "#";
            
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
                        <small style="color: var(--text-muted); margin-top: 5px; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-calendar-day"></i> Gerado em: ${item.timestamp}
                        </small>
                    </div>
                </div>
                
                <div class="manual-link-builder-row" style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; margin: 10px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">1. Gere o link de afiliado oficial do ML:</span>
                        <button class="btn-copy-original" onclick="copyOriginalLink(this, '${item.original_link}')">
                            <i class="fa-regular fa-copy"></i> Copiar Link do Produto
                        </button>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center; width: 100%; margin-top: 5px;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); min-width: 140px;">2. Cole o link curto gerado:</span>
                        <input type="text" 
                               placeholder="meli.la/XXXX" 
                               value="${item.affiliate_link || ''}" 
                               style="flex-grow: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.3); color: var(--text-primary); font-size: 0.85rem;" />
                        <button class="btn-copy" onclick="saveAffiliateLink(this, '${item.timestamp}', '${item.title.replace(/'/g, "\\'")}')">
                            Salvar Link
                        </button>
                    </div>
                </div>
                
                <div class="offer-copy-section">
                    <div class="copy-header-row">
                        <span>Texto de Divulgação (WhatsApp):</span>
                        <button class="btn-copy" ${!hasLink ? 'disabled' : ''} onclick="copyToClipboard(this, ${item.runIndex}, ${item.itemIndex})">
                            <i class="fa-regular fa-copy"></i> Copiar Texto
                        </button>
                    </div>
                    <div class="offer-copy-box" id="copy-box-${item.runIndex}-${item.itemIndex}">${copyPreview}</div>
                </div>
                
                <div class="offer-actions">
                    <button class="btn-copy-image" onclick="copyImageToClipboard(this, '${item.image_url}')">
                        <i class="fa-regular fa-image"></i> Copiar Imagem
                    </button>
                    <a href="${whatsappUrl}" 
                       class="btn-whatsapp ${!hasLink ? 'disabled-btn' : ''}" 
                       ${!hasLink ? 'onclick="return false;"' : ''}
                       target="_blank">
                        <i class="fa-brands fa-whatsapp"></i> Enviar p/ WhatsApp
                    </a>
                </div>
            `;
            historyContainer.appendChild(card);
        });
        
        renderPaginationControls(totalPages);
        
    } catch (error) {
        historyContainer.innerHTML = `<div class="empty-state"><p>Erro ao carregar histórico: ${error.message}</p></div>`;
    }
}

// Render pagination buttons
function renderPaginationControls(totalPages) {
    const controlsContainer = document.getElementById("pagination-controls");
    if (!controlsContainer) return;
    
    if (totalPages <= 1) {
        controlsContainer.innerHTML = "";
        controlsContainer.style.display = "none";
        return;
    }
    
    controlsContainer.style.display = "flex";
    controlsContainer.innerHTML = `
        <button class="btn-page" id="btn-page-prev" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
            <i class="fa-solid fa-chevron-left"></i> Anterior
        </button>
        <span class="page-info">Página ${currentPage} de ${totalPages}</span>
        <button class="btn-page" id="btn-page-next" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
            Próxima <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

// Action to navigate between pages
function changePage(page) {
    currentPage = page;
    fetchHistory();
    // Scroll layout to top of history container smoothly
    const historyHeader = document.querySelector(".panel-history");
    if (historyHeader) {
        historyHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

window.changePage = changePage;

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
                const response = await request(getApiUrl("/api/generate-custom-offer"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: url })
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
    const hasLink = !!item.affiliate_link;
    const copyPreview = item.copy.replace("[LINK_AFILIADO]", item.affiliate_link || "[COLE O SEU LINK DE AFILIADO MANUALMENTE PARA ATIVAR]");
    const whatsappUrl = hasLink ? `https://api.whatsapp.com/send?text=${encodeURIComponent(item.copy.replace("[LINK_AFILIADO]", item.affiliate_link))}` : "#";

    customPreviewCard.innerHTML = `
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
        
        <div class="manual-link-builder-row" style="display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; margin: 10px 0;">
            <div style="display: flex; gap: 10px; align-items: center; width: 100%; flex-wrap: wrap;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); min-width: 160px;">Cole seu link de afiliado:</span>
                <input type="text" 
                       id="custom-affiliate-input"
                       placeholder="meli.la/XXXX" 
                       value="${item.affiliate_link || ''}" 
                       oninput="updateCustomAffiliateLink(this)"
                       style="flex-grow: 1; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.3); color: var(--text-primary); font-size: 0.85rem;" />
            </div>
        </div>
        
        <div class="offer-copy-section">
            <div class="copy-header-row">
                <span>Texto de Divulgação (WhatsApp):</span>
                <button class="btn-copy" id="btn-copy-custom" ${!hasLink ? 'disabled' : ''} onclick="copyCustomToClipboard(this)">
                    <i class="fa-regular fa-copy"></i> Copiar Texto
                </button>
            </div>
            <div class="offer-copy-box" id="copy-box-custom">${copyPreview}</div>
        </div>
        
        <div class="offer-actions">
            <button class="btn-copy-image" onclick="copyImageToClipboard(this, '${item.image_url}')">
                <i class="fa-regular fa-image"></i> Copiar Imagem
            </button>
            <a href="${whatsappUrl}" 
               id="btn-whatsapp-custom"
               class="btn-whatsapp ${!hasLink ? 'disabled-btn' : ''}" 
               ${!hasLink ? 'onclick="return false;"' : ''}
               target="_blank">
                <i class="fa-brands fa-whatsapp"></i> Enviar p/ WhatsApp
            </a>
        </div>
    `;
    customPreviewCard.style.display = "block";
}
window.renderCustomPreview = renderCustomPreview;

// Dynamic link update logic for custom generator (Real-time enablement)
function updateCustomAffiliateLink(input) {
    const linkValue = input.value.trim();
    if (!window.customGeneratedItem) return;

    window.customGeneratedItem.affiliate_link = linkValue;
    const hasLink = !!linkValue;

    // Update copy box text
    const copyBox = document.getElementById("copy-box-custom");
    if (copyBox) {
        copyBox.textContent = window.customGeneratedItem.copy.replace("[LINK_AFILIADO]", linkValue || "[COLE O SEU LINK DE AFILIADO MANUALMENTE PARA ATIVAR]");
    }

    // Update copy button state
    const btnCopy = document.getElementById("btn-copy-custom");
    if (btnCopy) {
        btnCopy.disabled = !hasLink;
    }

    // Update WhatsApp button state and URL
    const btnWhatsapp = document.getElementById("btn-whatsapp-custom");
    if (btnWhatsapp) {
        if (hasLink) {
            btnWhatsapp.classList.remove("disabled-btn");
            btnWhatsapp.removeAttribute("onclick");
            btnWhatsapp.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(window.customGeneratedItem.copy.replace("[LINK_AFILIADO]", linkValue))}`;
        } else {
            btnWhatsapp.classList.add("disabled-btn");
            btnWhatsapp.setAttribute("onclick", "return false;");
            btnWhatsapp.href = "#";
        }
    }
}
window.updateCustomAffiliateLink = updateCustomAffiliateLink;

// Copy text function for custom generator
function copyCustomToClipboard(button) {
    if (!window.customGeneratedItem) return;
    
    try {
        const text = window.customGeneratedItem.copy.replace("[LINK_AFILIADO]", window.customGeneratedItem.affiliate_link || "");
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
        showToast("Erro ao copiar texto.", "error");
    }
}
window.copyCustomToClipboard = copyCustomToClipboard;
