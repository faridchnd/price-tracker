// =================== ذخیره محلی و متغیرها ===================
let products = JSON.parse(localStorage.getItem('products')) || [];

// =================== رویدادها ===================
document.addEventListener('DOMContentLoaded', function() {
    renderProducts();
    updateStats();
});

// =================== مدیریت محصولات ===================
function addProduct() {
    const name = document.getElementById('productName').value.trim();
    const url = document.getElementById('productUrl').value.trim();
    
    if (!name || !url) {
        alert('لطفاً نام محصول و لینک را وارد کنید');
        return;
    }
    
    if (!url.startsWith('http')) {
        alert('لینک باید با http یا https شروع شود');
        return;
    }
    
    const product = {
        id: Date.now(),
        name: name,
        url: url,
        price: null,
        status: 'منتظر بروزرسانی',
        lastUpdate: null,
        site: extractSiteName(url)
    };
    
    products.push(product);
    saveProducts();
    renderProducts();
    updateStats();
    
    document.getElementById('productName').value = '';
    document.getElementById('productUrl').value = '';
    
    showToast('محصول اضافه شد! ✅');
}

function extractSiteName(url) {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return 'نامشخص';
    }
}

function deleteProduct(id) {
    if (confirm('آیا مطمئن هستید؟')) {
        products = products.filter(p => p.id !== id);
        saveProducts();
        renderProducts();
        updateStats();
        showToast('محصول حذف شد');
    }
}

function clearAll() {
    if (confirm('آیا مطمئن هستید که می‌خواهید همه محصولات حذف شوند؟')) {
        products = [];
        saveProducts();
        renderProducts();
        updateStats();
        showToast('همه محصولات حذف شدند');
    }
}

function saveProducts() {
    localStorage.setItem('products', JSON.stringify(products));
}

// =================== رندر و UI ===================
function renderProducts() {
    const tbody = document.getElementById('productsBody');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('productsTable');
    
    if (products.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    emptyState.style.display = 'none';
    
    tbody.innerHTML = products.map(product => `
        <tr>
            <td>
                <strong>${product.name}</strong><br>
                <small><a href="${product.url}" target="_blank" style="color:#667eea;">${product.url.substring(0, 50)}...</a></small>
            </td>
            <td>${product.site}</td>
            <td class="price">${formatPrice(product.price)}</td>
            <td><span class="status ${getStatusClass(product.status)}">${product.status}</span></td>
            <td>${product.lastUpdate ? new Date(product.lastUpdate).toLocaleString('fa-IR') : 'هرگز'}</td>
            <td>
                <button class="delete-btn" onclick="deleteProduct(${product.id})">حذف</button>
            </td>
        </tr>
    `).join('');
}

function formatPrice(price) {
    if (!price || price === 'خطا') return price || '-';
    return parseInt(price).toLocaleString('fa-IR');
}

function getStatusClass(status) {
    if (status === 'OK' || status === 'موفق' || status.includes('موفق')) return 'status-ok';
    if (status.includes('خطا') || status.includes('پیدا نشد') || status.includes('ناموجود')) return 'status-error';
    return 'status-loading';
}

function updateStats() {
    const statsDiv = document.getElementById('stats');
    if (products.length > 0) {
        statsDiv.style.display = 'flex';
        document.getElementById('productCount').textContent = products.length;
        const lastUpdateTime = Math.max(...products.map(p => p.lastUpdate || 0));
        document.getElementById('lastUpdate').textContent = lastUpdateTime ? 
            new Date(lastUpdateTime).toLocaleString('fa-IR') : 'هرگز';
    } else {
        statsDiv.style.display = 'none';
    }
}

// =================== پروکسی و دسترسی ===================
async function fetchWithProxies(url) {
    const proxies = [
        (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u) => `https://r.jina.ai/${u}`,
        (u) => `https://proxy.cors.sh/${u}`,
        (u) => `https://thingproxy.freeboard.io/fetch/${u}`
    ];

    let lastError = null;

    for (const proxyFn of proxies) {
        const proxyUrl = proxyFn(url);
        try {
            console.log(`تست پروکسی: ${proxyUrl.substring(0, 80)}...`);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            
            const res = await fetch(proxyUrl, { 
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            clearTimeout(timeout);

            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 500) {
                    console.log(`✅ پروکسی کار کرد: ${proxyUrl.substring(0, 50)}...`);
                    return text;
                }
                console.warn(`⚠️ پروکسی محتوای کوتاه برگردوند: ${text.length} کاراکتر`);
            } else {
                console.warn(`⚠️ پروکسی کد ${res.status} برگردوند`);
            }
        } catch (e) {
            lastError = e;
            console.warn(`❌ پروکسی خطا داد: ${e.message}`);
        }
    }
    
    throw new Error(`همه پروکسی‌ها شکست خوردند: ${lastError ? lastError.message : 'نامشخص'}`);
}

// =================== تشخیص نوع سایت ===================
async function fetchPrice(url) {
    try {
        if (url.includes('digikala.com')) {
            return await fetchDigikalaPrice(url);
        } else if (url.includes('torob.com')) {
            return await fetchTorobPrice(url);
        } else {
            return await fetchGenericPrice(url);
        }
    } catch (error) {
        console.error('خطای عمومی در دریافت قیمت:', error);
        return { price: null, status: 'خطای شبکه' };
    }
}

// =================== دیجی‌کالا (فقط HTML) ===================
async function fetchDigikalaPrice(url) {
    try {
        console.log('شروع دریافت قیمت دیجی‌کالا از:', url);
        
        // مطمئن شو URL صفحه محصول است
        const pageUrl = url.split('?')[0];
        const html = await fetchWithProxies(pageUrl);
        
        console.log(`HTML دیجی‌کالا دریافت شد: ${html.length} کاراکتر`);

        // ---- ۱) جستجو برای قیمت به ریال در JSON ----
        const rialPatterns = [
            /"selling_price"\s*:\s*(\d{4,})/,
            /"rrp_price"\s*:\s*(\d{4,})/,
            /"discount_price"\s*:\s*(\d{4,})/,
            /"price"\s*:\s*\{\s*"selling_price"\s*:\s*(\d{4,})/,
            /"price"\s*:\s*(\d{7,})/
        ];

        for (const pattern of rialPatterns) {
            const match = html.match(pattern);
            if (match) {
                const rial = parseInt(match[1]);
                const toman = Math.round(rial / 10);
                console.log(`قیمت از JSON پیدا شد: ${rial} ریال = ${toman} تومان`);
                if (toman > 1000 && toman < 500000000) {
                    return { price: toman, status: 'موفق (JSON)' };
                }
            }
        }

        // ---- ۲) JSON-LD structured data ----
        const ldMatch = html.match(/"@type"\s*:\s*"Offer"[\s\S]{0,500}?"price"\s*:\s*"?(\d{4,})"?/i);
        if (ldMatch) {
            const price = parseInt(ldMatch[1]);
            const toman = price > 10000 ? Math.round(price / 10) : price;
            console.log(`قیمت از JSON-LD: ${price} → ${toman} تومان`);
            if (toman > 1000 && toman < 500000000) {
                return { price: toman, status: 'موفق (JSON-LD)' };
            }
        }

        // ---- ۳) متن فارسی تومان ----
        const tomanMatches = html.match(/([\d,٬۰-۹]{4,})\s*تومان/g);
        if (tomanMatches && tomanMatches.length > 0) {
            const prices = [];
            for (const match of tomanMatches) {
                const cleanNum = match
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                const price = parseInt(cleanNum);
                if (price > 1000 && price < 500000000) {
                    prices.push(price);
                }
            }
            if (prices.length > 0) {
                const finalPrice = Math.min(...prices);
                console.log(`قیمت از متن فارسی: ${finalPrice} تومان (از ${prices.length} مورد)`);
                return { price: finalPrice, status: 'موفق (متن)' };
            }
        }

        // ---- ۴) بررسی موجودی ----
        if (/ناموجود|موجود نیست|out of stock/i.test(html)) {
            return { price: null, status: 'ناموجود' };
        }

        // ---- ۵) جستجوی عمومی اعداد ----
        const numberMatches = html.match(/(\d{6,})/g);
        if (numberMatches) {
            const potentialPrices = numberMatches
                .map(n => parseInt(n))
                .filter(n => n > 100000 && n < 5000000000)
                .map(n => Math.round(n / 10))
                .filter(n => n > 1000 && n < 500000000);
            
            if (potentialPrices.length > 0) {
                const finalPrice = Math.min(...potentialPrices);
                console.log(`قیمت احتمالی: ${finalPrice} تومان`);
                return { price: finalPrice, status: 'موفق (تخمین)' };
            }
        }

        console.log('هیچ قیمتی پیدا نشد در HTML دیجی‌کالا');
        return { price: null, status: 'قیمت پیدا نشد' };

    } catch (error) {
        console.error('خطا در دریافت قیمت دیجی‌کالا:', error);
        return { price: null, status: 'خطای دسترسی' };
    }
}

// =================== ترب ===================
async function fetchTorobPrice(url) {
    try {
        console.log('شروع دریافت قیمت ترب از:', url);
        
        const html = await fetchWithProxies(url);
        console.log(`HTML ترب دریافت شد: ${html.length} کاراکتر`);

        // الگوهای مختلف برای ترب
        const patterns = [
            /<div[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]{0,200}?([\d,۰-۹]{4,})\s*تومان/i,
            /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\d,۰-۹]{4,})/i,
            /<div[^>]*class="[^"]*seller[^"]*"[^>]*>[\s\S]{0,200}?([\d,۰-۹]{4,})/i,
            /"price"\s*:\s*"?([\d,۰-۹]{4,})"?/i
        ];
        
        // امتحان الگوهای خاص
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                const cleanPrice = match[1]
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                
                const price = parseInt(cleanPrice);
                console.log(`قیمت ترب از الگو پیدا شد: ${price} تومان`);
                if (price > 1000 && price < 100000000) {
                    return { price: price, status: 'موفق' };
                }
            }
        }
        
        // جستجوی عمومی تومان
        const allTomanMatches = html.match(/([\d,۰-۹]{4,})\s*تومان/gi);
        if (allTomanMatches) {
            const prices = [];
            for (const match of allTomanMatches) {
                const cleanPrice = match
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                
                const price = parseInt(cleanPrice);
                if (price > 1000 && price < 100000000) {
                    prices.push(price);
                }
            }
            
            if (prices.length > 0) {
                const finalPrice = Math.min(...prices);
                console.log(`قیمت ترب کمترین: ${finalPrice} تومان (از ${prices.length} مورد)`);
                return { price: finalPrice, status: 'موفق (کمترین)' };
            }
        }
        
        console.log('قیمت پیدا نشد در HTML ترب');
        return { price: null, status: 'قیمت پیدا نشد' };
        
    } catch (error) {
        console.error('خطا در دریافت قیمت ترب:', error);
        return { price: null, status: 'خطای دسترسی' };
    }
}

// =================== سایت‌های عمومی ===================
async function fetchGenericPrice(url) {
    try {
        console.log('شروع دریافت قیمت عمومی از:', url);
        
        const html = await fetchWithProxies(url);
        console.log(`HTML عمومی دریافت شد: ${html.length} کاراکتر`);
        
        // الگوهای عمومی
        const patterns = [
            /"price"\s*:\s*"?([\d.,۰-۹]{4,})"?/i,
            /class\s*=\s*["'][^"']*price[^"']*["'][^>]*>([\d.,۰-۹\s]{4,})/i,
            /woocommerce-Price-amount[^>]*>([\d.,۰-۹\s]{4,})/i,
            /([\d,۰-۹]{4,})\s*تومان/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                const cleanPrice = match[1]
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                
                const price = parseInt(cleanPrice);
                console.log(`قیمت عمومی پیدا شد: ${price}`);
                if (price > 100 && price < 100000000) {
                    return { price: price, status: 'موفق' };
                }
            }
        }
        
        return { price: null, status: 'قیمت پیدا نشد' };
    } catch (error) {
        console.error('خطا در دریافت قیمت عمومی:', error);
        return { price: null, status: 'خطای دسترسی' };
    }
}

// =================== بروزرسانی همه ===================
console.log('=== شروع بروزرسانی همه ===');async function updateAllPrices() {
    if (products.length === 0) {
        alert('محصولی برای بروزرسانی وجود ندارد');
        return;
    }
    
    const updateBtn = document.getElementById('updateBtn');
    const modal = document.getElementById('loadingModal');
    const progress = document.getElementById('loadingProgress');
    
    updateBtn.disabled = true;
    modal.style.display = 'flex';
    
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        progress.textContent = `در حال بروزرسانی ${i + 1} از ${products.length}: ${product.name}`;
        
        try {
            product.status = 'در حال بروزرسانی...';
            renderProducts();
            
            console.log(`\n=== شروع بروزرسانی ${product.name} ===`);
            const result = await fetchPrice(product.url);
            console.log(`نتیجه: قیمت=${result.price}, وضعیت=${result.status}`);
            
            product.price = result.price;
            product.status = result.status;
            product.lastUpdate = Date.now();
            
        } catch (error) {
            console.error(`خطا در بروزرسانی ${product.name}:`, error);
            product.status = 'خطای شبکه';
        }
        
        renderProducts();
        saveProducts();
        
        // تاخیر بین درخواست‌ها
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    modal.style.display = 'none';
    updateBtn.disabled = false;
    updateStats();
    showToast('بروزرسانی کامل شد! 🎉');
}

// =================== Export ===================
function exportToCSV() {
    if (products.length === 0) {
        alert('محصولی برای خروجی وجود ندارد');
        return;
    }
    
    const headers = ['نام محصول', 'سایت', 'قیمت', 'وضعیت', 'آخرین بروزرسانی', 'لینک'];
    const rows = products.map(p => [
        p.name,
        p.site,
        p.price || '-',
        p.status,
        p.lastUpdate ? new Date(p.lastUpdate).toLocaleString('fa-IR') : '-',
        p.url
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `قیمت‌ها-${new Date().toLocaleDateString('fa-IR')}.csv`;
    link.click();
    
    showToast('فایل CSV دانلود شد! 📊');
}

// =================== نمایش Toast ===================
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: bold;
        transform: translateX(100%);
        transition: transform 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateX(0)', 100);
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
