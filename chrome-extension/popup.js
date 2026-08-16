document.addEventListener("DOMContentLoaded", function() {
    const urlInput = document.getElementById("affiliate-url");
    const btnGenerate = document.getElementById("btn-generate");
    const statusMsg = document.getElementById("status");

    let extractedTitle = "";
    let extractedImage = "";
    let extractedPrice = "";

    let comparePrice = "";
    let compareLink = "";
    let compareStore = "";

    function showStatus(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = "status-msg " + (type === "success" ? "status-success" : "status-info");
        statusMsg.style.display = "block";
    }

    // Function to run inside the active tab context to scrape DOM
    function extractPageDOMDetails() {
        let title = "";
        let image = "";
        let price = "";

        try {
            // 1. Title
            const metaTitle = document.querySelector('meta[property="og:title"]');
            if (metaTitle) title = metaTitle.getAttribute('content');
            if (!title) title = document.title;
            if (title) {
                title = title.split(" | ")[0].split(" - ")[0].replace("Shopee Brasil", "").trim();
            }

            // 2. Image
            const metaImage = document.querySelector('meta[property="og:image"]');
            if (metaImage) image = metaImage.getAttribute('content');
            if (!image) {
                const imgEl = document.querySelector('img[src*="http2.mlstatic.com"], img[src*="mlstatic.com"], img[src*="shopee.com.br"], img[class*="product"]');
                if (imgEl) image = imgEl.src;
            }

            // 3. Price
            const metaPrice = document.querySelector('meta[property="product:sale_price:amount"], meta[itemprop="price"]');
            if (metaPrice) price = "R$ " + metaPrice.getAttribute('content');
            
            if (!price || price.includes("None") || price === "R$ ") {
                // Try general price text elements
                let priceEl = document.querySelector('[class*="price-current"], [class*="price__fraction"], [class*="andes-money-amount__fraction"]');
                if (priceEl) {
                    price = "R$ " + priceEl.textContent.trim();
                } else {
                    // Look for R$ string in body
                    const match = document.body.innerText.match(/R\$\s*\d+([.,]\d{2})?/);
                    if (match) price = match[0];
                }
            }
        } catch (e) {
            // Silence extraction errors
        }
        return { title, image, price };
    }

    function performPriceComparison(title, priceStr, activeUrl) {
        if (!title) return;
        
        let cleanedPrice = parseFloat(priceStr.replace(/[^\d,.]/g, '').replace(',', '.'));
        if (isNaN(cleanedPrice)) cleanedPrice = 0;
        
        const isMeli = activeUrl.includes("mercadolivre.com") || activeUrl.includes("mercadolibre.com") || activeUrl.includes("meli.la");
        const isShopee = activeUrl.includes("shopee.com") || activeUrl.includes("shope.ee");
        
        if (isMeli) {
            // Search on Shopee
            const query = encodeURIComponent(title);
            const searchUrl = `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${query}&limit=3&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
            
            fetch(searchUrl)
                .then(r => r.json())
                .then(data => {
                    const items = data.items || [];
                    if (items.length > 0) {
                        const firstItem = items[0].item_basic || items[0];
                        if (firstItem && firstItem.price) {
                            const shopeePrice = firstItem.price / 100000;
                            if (shopeePrice > 0 && (cleanedPrice === 0 || shopeePrice < cleanedPrice)) {
                                comparePrice = `R$ ${shopeePrice.toFixed(2).replace('.', ',')}`;
                                compareStore = "Shopee";
                                const slugName = firstItem.name || "produto";
                                compareLink = `https://shopee.com.br/${encodeURIComponent(slugName)}-i.${firstItem.shopid}.${firstItem.itemid}`;
                                showStatus(`Preço menor encontrado na Shopee: ${comparePrice}!`, "success");
                            }
                        }
                    }
                })
                .catch(err => console.log("Erro ao comparar com Shopee:", err));
        } else if (isShopee) {
            // Search on Mercado Livre
            const query = encodeURIComponent(title);
            const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=3`;
            
            fetch(searchUrl)
                .then(r => r.json())
                .then(data => {
                    const results = data.results || [];
                    if (results.length > 0) {
                        const firstItem = results[0];
                        if (firstItem && firstItem.price) {
                            const mlPrice = parseFloat(firstItem.price);
                            if (mlPrice > 0 && (cleanedPrice === 0 || mlPrice < cleanedPrice)) {
                                comparePrice = `R$ ${mlPrice.toFixed(2).replace('.', ',')}`;
                                compareStore = "Mercado Livre";
                                compareLink = firstItem.permalink;
                                showStatus(`Preço menor encontrado no Mercado Livre: ${comparePrice}!`, "success");
                            }
                        }
                    }
                })
                .catch(err => console.log("Erro ao comparar com Mercado Livre:", err));
        }
    }

    // 1. Try to read URL from clipboard first
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
            const trimmed = text.trim();
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                if (
                    trimmed.includes("mercadolivre.com") || 
                    trimmed.includes("mercadolibre.com") || 
                    trimmed.includes("meli.la") ||
                    trimmed.includes("shopee.com") ||
                    trimmed.includes("shope.ee")
                ) {
                    urlInput.value = trimmed;
                    showStatus("Link detectado na área de transferência!", "success");
                    return;
                }
            }
            // If clipboard has no valid link, fallback to active tab URL
            checkActiveTab();
        }).catch(err => {
            checkActiveTab();
        });
    } else {
        checkActiveTab();
    }

    function checkActiveTab() {
        if (typeof chrome !== "undefined" && chrome.tabs && chrome.scripting) {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs && tabs[0]) {
                    const activeUrl = tabs[0].url;
                    if (activeUrl && (
                        activeUrl.includes("mercadolivre.com") || 
                        activeUrl.includes("mercadolibre.com") || 
                        activeUrl.includes("meli.la") ||
                        activeUrl.includes("shopee.com") ||
                        activeUrl.includes("shope.ee")
                    )) {
                        urlInput.value = activeUrl;
                        showStatus("Link da aba ativa capturado!", "success");
                        
                        // Execute script to scrape DOM
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            func: extractPageDOMDetails
                        }, (results) => {
                            if (results && results[0] && results[0].result) {
                                const res = results[0].result;
                                if (res.title) extractedTitle = res.title;
                                if (res.image) extractedImage = res.image;
                                if (res.price) extractedPrice = res.price;

                                // Perform the comparison as soon as we have scraped active page details
                                performPriceComparison(extractedTitle, extractedPrice, activeUrl);
                            }
                        });
                    }
                }
            });
        }
    }

    // 2. Click event to redirect
    btnGenerate.addEventListener("click", function() {
        const affiliateLink = urlInput.value.trim();
        if (!affiliateLink) {
            showStatus("Por favor, cole um link de afiliado válido.", "info");
            return;
        }

        const dashboardBaseUrl = "https://agente-ml-backend.onrender.com/";
        let redirectUrl = dashboardBaseUrl + "?affiliate_link=" + encodeURIComponent(affiliateLink);

        // If the link matches the captured tab URL, pass the scraped metadata
        if (extractedTitle) {
            redirectUrl += "&title=" + encodeURIComponent(extractedTitle);
        }
        if (extractedPrice) {
            redirectUrl += "&price=" + encodeURIComponent(extractedPrice);
        }
        if (extractedImage) {
            redirectUrl += "&image_url=" + encodeURIComponent(extractedImage);
        }

        // Add comparison data if available
        if (comparePrice) {
            redirectUrl += "&compare_price=" + encodeURIComponent(comparePrice);
            redirectUrl += "&compare_link=" + encodeURIComponent(compareLink);
            redirectUrl += "&compare_store=" + encodeURIComponent(compareStore);
        }

        if (typeof chrome !== "undefined" && chrome.tabs) {
            chrome.tabs.create({ url: redirectUrl });
        } else {
            window.open(redirectUrl, "_blank");
        }
    });
});
