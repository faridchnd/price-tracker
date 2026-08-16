// ذخیره محلی محصولات
let products = JSON.parse(localStorage.getItem('products')) || [];

// بارگذاری اولیه صفحه
document.addEventListener('DOMContentLoaded', function() {
    renderProducts();
    updateStats();
});

// اضافه کردن محصول جدید
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
    
    // پاک کردن فرم
    document.getElementById('productName').value = '';
    document.getElementById('productUrl').value = '';
    
    // نمایش پیام موفقیت
    showToast('محصول با موفقیت اضافه شد! ✅');
}

// استخراج نام سایت از URL
function extractSiteName(url) {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return 'نامشخص';
    }
}

// رندر کردن جدول محصولات
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

// فرمت قیمت
function formatPrice(price) {
    if (!price || price === 'خطا') return price || '-';
    return parseInt(price).toLocaleString('fa-IR');
}

// کلاس وضعیت
function getStatusClass(status) {
    if (status === 'OK' || status === 'موفق') return 'status-ok';
    if (status.includes('خطا') || status.includes('پیدا نشد')) return 'status-error';
    return 'status-loading';
}

// حذف محصول
function deleteProduct(id) {
    if (confirm('آیا مطمئن هستید؟')) {
        products = products.filter(p => p.id !== id);
        saveProducts();
        renderProducts();
        updateStats();
        showToast('محصول حذف شد');
    }
}

// پاک کردن همه
function clearAll() {
    if (confirm('آیا مطمئن هستید که می‌خواهید همه محصولات حذف شوند؟')) {
        products = [];
        saveProducts();
        renderProducts();
        updateStats();
        showToast('همه محصولات حذف شدند');
    }
}

// ذخیره محصولات
function saveProducts() {
    localStorage.setItem('products', JSON.stringify(products));
}

// بروزرسانی آمار
function updateStats() {
    const statsDiv = document.getElementById('stats');
    const productCount = document.getElementById('productCount');
    const lastUpdate = document.getElementById('lastUpdate');
    
    if (products.length > 0) {
        statsDiv.style.display = 'flex';
        productCount.textContent = products.length;
        
        const lastUpdateTime = Math.max(...products.map(p => p.lastUpdate || 0));
        lastUpdate.textContent = lastUpdateTime ? 
            new Date(lastUpdateTime).toLocaleString('fa-IR') : 'هرگز';
    } else {
        statsDiv.style.display = 'none';
    }
}

// بروزرسانی همه قیمت‌ها
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
        
        // تاخیر کوتاه بین درخواست‌ها
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    modal.style.display = 'none';
    updateBtn.disabled = false;
    updateStats();
    showToast('بروزرسانی کامل شد! 🎉');
}

// گرفتن قیمت از یک URL
async function fetchPrice(url) {
    try {
        // تشخیص نوع سایت
        if (url.includes('digikala.com')) {
            return await fetchDigikalaPrice(url);
        } else if (url.includes('torob.com')) {
            return await fetchTorobPrice(url);
        } else {
            return await fetchGenericPrice(url);
        }
    } catch (error) {
        return { price: null, status: 'خطا در دریافت قیمت' };
    }
}

// قیمت دیجی‌کالا
async function fetchDigikalaPrice(url) {
    const match = url.match(/dkp-(\d+)/);
    if (!match) return { price: null, status: 'کد محصول پیدا نشد' };
    
    const productId = match[1];
    const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://api.digikala.com/v2/product/${productId}/`)}`;
    
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        const productData = JSON.parse(data.contents);
        
        const variant = productData.data.product.default_variant;
        if (variant && variant.price) {
            const price = Math.round(variant.price.selling_price / 10);
            return { price: price, status: 'موفق' };
        }
        return { price: null, status: 'قیمت پیدا نشد' };
    } catch (error) {
        return { price: null, status: 'خطا در API دیجی‌کالا' };
    }
}

// قیمت ترب (با CORS proxy)
async function fetchTorobPrice(url) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const html = data.contents;
        
        // جستجو برای قیمت در HTML
        const priceRegex = /([\d,۰-۹]+)\s*تومان/g;
        const matches = html.match(priceRegex);
        
        if (matches && matches.length > 0) {
            const priceText = matches[0];
            const cleanPrice = priceText
                .replace(/[^\d۰-۹]/g, '')
                .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
            
            if (cleanPrice) {
                return { price: parseInt(cleanPrice), status: 'موفق' };
            }
        }
        
        return { price: null, status: 'قیمت پیدا نشد' };
    } catch (error) {
        return { price: null, status: 'خطا در دسترسی به ترب' };
    }
}

// قیمت سایت‌های عمومی
async function fetchGenericPrice(url) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const html = data.contents;
        
        // الگوهای مختلف برای تشخیص قیمت
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
        return { price: null, status: 'خطای دسترسی' };
    }
}

// Export به CSV
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

// نمایش Toast
function showToast(message) {
    // ساخت element موقت
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
    
    // انیمیشن ورود
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // حذف خودکار
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
