// ذخیره محلی محصولات
let products = JSON.parse(localStorage.getItem('products')) || [];

document.addEventListener('DOMContentLoaded', function() {
    renderProducts();
    updateStats();
});

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
    if (status === 'OK' || status === 'موفق') return 'status-ok';
    if (status.includes('خطا') || status.includes('پیدا نشد')) return 'status-error';
    return 'status-loading';
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

// =================== توابع دریافت قیمت ===================
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
        console.error('Error fetching price:', error);
        return { price: null, status: 'خطای شبکه یا CORS' };
    }
}

// دریافت HTML از یک URL با چند پروکسی مختلف
async function fetchWithProxies(url) {
    const proxies = [
        // اول corsproxy.io (رایگان، نسبتاً پایدار)
        (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        // بعد allorigins نسخه raw
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        // بعد codetabs
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    for (const proxyFn of proxies) {
        const proxyUrl = proxyFn(url);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000); // ۱۵ ثانیه timeout
            const res = await fetch(proxyUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
                const text = await res.text();
                return text;
            }
        } catch (e) {
            console.warn('Proxy failed:', proxyUrl, e.message);
            continue;
        }
    }
    throw new Error('All proxies failed');
}

// دیجی‌کالا: دریافت HTML و استخراج با XPath
async function fetchDigikalaPrice(url) {
    try {
        const html = await fetchWithProxies(url);
        
        // الگوهای مختلف برای قیمت دیجی‌کالا
        const patterns = [
            // الگوی اصلی قیمت فروش
            /<span[^>]*data-testid="price-final"[^>]*>([\d,۰-۹]+)/i,
            /<span[^>]*class="[^"]*color-800[^"]*"[^>]*>([\d,۰-۹]+)/i,
            // قیمت با تخفیف
            /<div[^>]*class="[^"]*product-price[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\d,۰-۹]+)/i,
            // قیمت فروشنده
            /<div[^>]*class="[^"]*seller-price[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\d,۰-۹]+)/i,
            // الگوی JSON-LD
            /"price"\s*:\s*"?([\d,۰-۹]+)"?/i,
            // الگوی عمومی
            /([\d,۰-۹]+)\s*تومان/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                let priceStr = match[1];
                // تمیز کردن قیمت
                let cleanPrice = priceStr
                    .replace(/[^\d۰-۹]/g, '') // حذف همه چیز جز اعداد
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0); // تبدیل فارسی به انگلیسی
                
                if (cleanPrice && parseInt(cleanPrice) > 1000) { // قیمت منطقی
                    return { price: parseInt(cleanPrice), status: 'موفق' };
                }
            }
        }
        
        // اگه هیچ الگویی کار نکرد، سعی می‌کنیم span هایی که عدد دارن پیدا کنیم
        const spanMatches = html.match(/<span[^>]*>([\d,۰-۹]+)<\/span>/gi);
        if (spanMatches) {
            for (const spanMatch of spanMatches) {
                const numberMatch = spanMatch.match(/>([\d,۰-۹]+)</);
                if (numberMatch) {
                    let cleanPrice = numberMatch[1]
                        .replace(/[^\d۰-۹]/g, '')
                        .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                    
                    const price = parseInt(cleanPrice);
                    // قیمت‌های دیجی‌کالا معمولاً بالای ۱۰۰۰ تومان هستن
                    if (price > 1000 && price < 100000000) {
                        return { price: price, status: 'موفق (تخمین)' };
                    }
                }
            }
        }
        
        return { price: null, status: 'قیمت پیدا نشد' };
    } catch (error) {
        console.error('Digikala HTML error:', error);
        return { price: null, status: 'خطا در دسترسی' };
    }
}

// ترب: دریافت HTML با الگوهای بهتر
async function fetchTorobPrice(url) {
    try {
        const html = await fetchWithProxies(url);
        
        // الگوهای مختلف برای ترب
        const patterns = [
            // الگوی اصلی ترب
            /<div[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]*?([\d,۰-۹]+)\s*تومان/i,
            /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\d,۰-۹]+)/i,
            // الگوی فروشنده
            /<div[^>]*class="[^"]*seller-price[^"]*"[^>]*>[\s\S]*?([\d,۰-۹]+)/i,
            // الگوی عمومی تومان
            /([\d,۰-۹]+)\s*تومان/gi,
            // JSON در صفحه
            /"price"\s*:\s*"?([\d,۰-۹]+)"?/i,
            // الگوی div که عدد داره
            /<div[^>]*>([\d,۰-۹]+)<\/div>/gi
        ];
        
        // اول الگوهای خاص رو امتحان می‌کنیم
        for (let i = 0; i < patterns.length - 1; i++) {
            const pattern = patterns[i];
            const match = html.match(pattern);
            if (match) {
                let priceStr = match[1];
                let cleanPrice = priceStr
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                
                const price = parseInt(cleanPrice);
                if (price > 1000 && price < 100000000) {
                    return { price: price, status: 'موفق' };
                }
            }
        }
        
        // آخر هم تمام matches تومان رو چک می‌کنیم
        const tomanMatches = html.match(/([\d,۰-۹]+)\s*تومان/gi);
        if (tomanMatches) {
            const prices = [];
            for (const match of tomanMatches) {
                const numberMatch = match.match(/([\d,۰-۹]+)/);
                if (numberMatch) {
                    let cleanPrice = numberMatch[1]
                        .replace(/[^\d۰-۹]/g, '')
                        .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                    
                    const price = parseInt(cleanPrice);
                    if (price > 1000 && price < 100000000) {
                        prices.push(price);
                    }
                }
            }
            
            if (prices.length > 0) {
                // کمترین قیمت رو برمی‌گردونیم (احتمالاً قیمت اصلیه)
                const minPrice = Math.min(...prices);
                return { price: minPrice, status: 'موفق (کمترین قیمت)' };
            }
        }
        
        return { price: null, status: 'قیمت پیدا نشد در HTML' };
    } catch (error) {
        console.error('Torob HTML error:', error);
        return { price: null, status: 'خطا در دسترسی به HTML' };
    }
}

// سایت‌های عمومی (مثل بالندر)
async function fetchGenericPrice(url) {
    try {
        const html = await fetchWithProxies(url);
        
        // الگوهای تشخیص قیمت
        const patterns = [
            /"price"\s*:\s*"?([\d.,۰-۹]+)"?/i,
            /class\s*=\s*["'][^"']*price[^"']*["'][^>]*>([\d.,۰-۹\s]+)/i,
            /woocommerce-Price-amount[^>]*>([\d.,۰-۹\s]+)/i,
            /([\d,۰-۹]+)\s*تومان/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                let price = match[1]
                    .replace(/[^\d۰-۹]/g, '')
                    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
                if (price && parseInt(price) > 0) {
                    return { price: parseInt(price), status: 'موفق' };
                }
            }
        }
        
        return { price: null, status: 'قیمت پیدا نشد' };
    } catch (error) {
        console.error('Generic error:', error);
        return { price: null, status: 'خطای دسترسی' };
    }
}

// =================== بروزرسانی همه ===================
async function updateAllPrices() {
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
            
            const result = await fetchPrice(product.url);
            product.price = result.price;
            product.status = result.status;
            product.lastUpdate = Date.now();
            
        } catch (error) {
            product.status = 'خطای شبکه';
        }
        
        renderProducts();
        saveProducts();
        
        // تاخیر کوتاه
        await new Promise(resolve => setTimeout(resolve, 1200));
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
