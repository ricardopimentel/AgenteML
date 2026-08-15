document.addEventListener("DOMContentLoaded", function() {
    const urlInput = document.getElementById("affiliate-url");
    const btnGenerate = document.getElementById("btn-generate");
    const statusMsg = document.getElementById("status");

    function showStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = "status-msg " + (type === "success" ? "status-success" : "status-info");
        statusMsg.style.display = "block";
    }

    // 1. Try to read URL from clipboard
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
            const trimmed = text.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                if (trimmed.includes("mercadolivre.com") || trimmed.includes("mercadolibre.com") || trimmed.includes("meli.la")) {
                    urlInput.value = trimmed;
                    showStatus("Link detectado na área de transferência!", "success");
                }
            }
        }).catch(err => {
            // Silence clipboard read errors/permissions block and keep field empty
        });
    }

    // 2. Click event to redirect
    btnGenerate.addEventListener("click", function() {
        const affiliateLink = urlInput.value.trim();
        if (!affiliateLink) {
            showStatus("Por favor, cole um link de afiliado válido.", "info");
            return;
        }

        const dashboardBaseUrl = "https://agente-ml-backend.onrender.com/";
        const redirectUrl = dashboardBaseUrl + "?affiliate_link=" + encodeURIComponent(affiliateLink);

        if (typeof chrome !== "undefined" && chrome.tabs) {
            chrome.tabs.create({ url: redirectUrl });
        } else {
            // Fallback for debugging in regular browser tabs
            window.open(redirectUrl, "_blank");
        }
    });
});
