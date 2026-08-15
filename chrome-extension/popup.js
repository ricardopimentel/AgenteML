document.addEventListener("DOMContentLoaded", function() {
    const urlInput = document.getElementById("affiliate-url");
    const btnGenerate = document.getElementById("btn-generate");
    const statusMsg = document.getElementById("status");

    function showStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = "status-msg " + (type === "success" ? "status-success" : "status-info");
        statusMsg.style.display = "block";
    }

    // 1. Try to read active tab URL
    if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (tabs && tabs[0]) {
                const activeUrl = tabs[0].url;
                if (activeUrl && (
                    activeUrl.includes("mercadolivre.com") || 
                    activeUrl.includes("mercadolibre.com") || 
                    activeUrl.includes("meli.la")
                )) {
                    urlInput.value = activeUrl;
                    showStatus("Link da aba ativa capturado!", "success");
                }
            }
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
