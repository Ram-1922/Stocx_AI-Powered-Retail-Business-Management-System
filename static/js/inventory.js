const API_BASE_URL = '/api/inventory';

class InventoryManager {
    constructor() {
        this.inventoryData = [];
        this.scannedProductsTemp = [];
        this.currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
        this.searchTimeout = null;
        
        this.currentFilterTab = 'all';

        this.cacheDOM();
        this.bindEvents();
        this.fetchData();
    }

    cacheDOM() {
        this.tbody = document.getElementById('inventoryBody');
        this.searchInput = document.getElementById('searchInput');
        this.sortSelect = document.getElementById('inventorySort'); 
        this.tabBtns = document.querySelectorAll('.inv-tab-btn');

        this.uploadForm = document.getElementById('uploadForm');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.statusMsg = document.getElementById('uploadStatus');
        
        this.totalValueEl = document.getElementById('totalValueStat');
        this.totalItemsEl = document.getElementById('totalItemsStat');
        
        this.historyModal = document.getElementById('historyModal');
        this.reviewModal = document.getElementById('reviewModal');
        this.closeHistoryBtn = this.historyModal.querySelector('.close-btn');
        this.closeReviewBtn = this.reviewModal.querySelector('.close-review-btn');
        
        this.saveInventoryBtn = document.getElementById('saveInventoryBtn');
        this.clearBtn = document.getElementById('clearInventoryBtn');
        this.manualAddBtn = document.getElementById('manualAddBtn');
    }

    bindEvents() {
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilterTab = e.target.getAttribute('data-tab');
                this.updateTabUI();
                this.applySearchAndSort();
            });
        });

        if (this.manualAddBtn) this.manualAddBtn.addEventListener('click', () => this.openProductModal());
        if (this.uploadForm) this.uploadForm.addEventListener('submit', this.handleUpload.bind(this));
        
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.applySearchAndSort(), 300);
        });

        if (this.sortSelect) this.sortSelect.addEventListener('change', () => this.applySearchAndSort());

        this.closeHistoryBtn.addEventListener('click', () => this.historyModal.classList.add('hidden'));
        this.closeReviewBtn.addEventListener('click', () => this.reviewModal.classList.add('hidden'));
        this.saveInventoryBtn.addEventListener('click', this.saveReviewedInventory.bind(this));

        const rescanBtn = document.getElementById('reviewRescanBtn');
        if (rescanBtn) rescanBtn.addEventListener('click', () => this.handleUpload(null, true));

        if (this.clearBtn) this.clearBtn.addEventListener('click', this.clearInventory.bind(this));
        
        document.addEventListener('click', () => {
            document.querySelectorAll('.more-options-menu').forEach(menu => {
                menu.classList.add('hidden');
            });
        });
    }

    updateTabUI() {
        const activeClass = "bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-500 shadow-sm border border-transparent";
        const inactiveClass = "bg-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 border border-transparent";
        
        this.tabBtns.forEach(btn => {
            if (btn.getAttribute('data-tab') === this.currentFilterTab) {
                btn.className = `inv-tab-btn px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeClass}`;
            } else {
                btn.className = `inv-tab-btn px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${inactiveClass}`;
            }
        });
    }

    async fetchData() {
        try {
            const res = await fetch(`${API_BASE_URL}/`);
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                this.inventoryData = data;
            } else {
                this.inventoryData = [];
                console.error("Backend Error:", data);
            }
            
            this.applySearchAndSort(); 
            this.updateStats();
            this.updateProductDatalist();
        } catch (error) {
            console.error("Failed to load inventory", error);
            this.inventoryData = [];
            this.applySearchAndSort();
        }
    }

    parseExpiryDate(expiryStr) {
        if (!expiryStr || expiryStr.toLowerCase() === 'unknown') return null;
        try {
            const parts = expiryStr.split('/');
            if (parts.length === 3) {
                const d = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                let y = parseInt(parts[2], 10);
                y = y < 100 ? 2000 + y : y; 
                return new Date(y, m, d);
            } else if (parts.length === 2) {
                const m = parseInt(parts[0], 10) - 1;
                let y = parseInt(parts[1], 10);
                y = y < 100 ? 2000 + y : y;
                return new Date(y, m + 1, 0); 
            }
        } catch(e) {}
        return null;
    }

    getExpiryColorClass(expiryStr) {
        const expDate = this.parseExpiryDate(expiryStr);
        if (!expDate) return 'text-slate-500 dark:text-slate-400 font-semibold';
        
        const now = new Date();
        now.setHours(0,0,0,0);
        if (expDate < now) return 'text-rose-500 font-extrabold'; 
        return 'text-emerald-500 font-extrabold'; 
    }

    isExpired(expiryStr) {
        const expDate = this.parseExpiryDate(expiryStr);
        if (!expDate) return false;
        const now = new Date();
        now.setHours(0,0,0,0);
        return expDate < now;
    }

    isValidFutureDate(dateStr) {
        if (!dateStr || dateStr.toLowerCase() === 'unknown') return true;
        const expDate = this.parseExpiryDate(dateStr);
        if (!expDate) return false; 
        const now = new Date();
        now.setHours(0,0,0,0);
        return expDate >= now;
    }

    applySearchAndSort() {
        const term = this.searchInput.value.toLowerCase().trim();
        const sortVal = this.sortSelect ? this.sortSelect.value : 'name-asc';

        if (!Array.isArray(this.inventoryData)) {
            this.renderTable([]);
            return;
        }

        let filtered = this.inventoryData.filter(item => {
            const nameMatch = (item.product_name || "").toLowerCase().includes(term);
            const agencyMatch = (item.agency || "").toLowerCase().includes(term);
            const matchesSearch = nameMatch || agencyMatch;
            
            if (!matchesSearch) return false;
            if (this.currentFilterTab === 'zero') return item.quantity <= 0;
            if (this.currentFilterTab === 'expired') return this.isExpired(item.expiry_date);
            if (this.currentFilterTab === 'returned') return item.returned_qty > 0 || item.is_returned;
            
            return true;
        });

        filtered.sort((a, b) => {
            if (sortVal === 'name-asc') return (a.product_name||"").localeCompare(b.product_name||"");
            if (sortVal === 'name-desc') return (b.product_name||"").localeCompare(a.product_name||"");
            if (sortVal === 'qty-desc') return (b.quantity||0) - (a.quantity||0);
            if (sortVal === 'qty-asc') return (a.quantity||0) - (b.quantity||0);
            
            if (sortVal === 'date-desc') {
                const dA = new Date(a.last_updated || a.date_of_purchase || 0).getTime();
                const dB = new Date(b.last_updated || b.date_of_purchase || 0).getTime();
                return dB - dA; 
            }
            
            if (sortVal.startsWith('expiry')) {
                const dateA = this.parseExpiryDate(a.expiry_date);
                const dateB = this.parseExpiryDate(b.expiry_date);
                
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1; 
                if (!dateB) return -1;
                
                if (sortVal === 'expiry-asc') return dateA.getTime() - dateB.getTime();
                return dateB.getTime() - dateA.getTime();
            }

            return 0;
        });

        this.renderTable(filtered);
    }

    renderTable(data) {
        this.tbody.innerHTML = '';
        const fragment = document.createDocumentFragment();

        if (data.length === 0) {
            this.tbody.innerHTML = `<tr><td colspan="9" class="text-center text-slate-500 py-10 font-medium">No items found matching your criteria.</td></tr>`;
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group";
            
            const rawExpiry = item.expiry_date || 'Unknown';
            const expiryColor = this.getExpiryColorClass(rawExpiry);

            // --- NEW: Contextual Quantity Badges ---
            let displayQty = item.quantity;
            let qtyBadgeClass = 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400';

            if (this.currentFilterTab === 'returned') {
                displayQty = item.returned_qty || item.quantity || 0; 
                qtyBadgeClass = 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
            } else if (this.currentFilterTab === 'expired') {
                qtyBadgeClass = 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400';
            } else if (this.currentFilterTab === 'zero') {
                qtyBadgeClass = 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400';
            }

            tr.innerHTML = `
                <td class="px-6 py-4 text-slate-900 dark:text-white font-bold">${item.product_name}</td>
                <td class="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs font-semibold">${item.agency || '-'}</td>
                
                <td class="px-6 py-4 text-center">
                    <span class="inline-flex items-center justify-center px-3 py-1 rounded-full font-bold ${qtyBadgeClass}">${displayQty}</span>
                </td>
                
                <td class="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300">${this.currencyFormatter.format(item.board_price)}</td>
                <td class="px-6 py-4 text-right font-extrabold text-blue-600 dark:text-blue-400">${this.currencyFormatter.format(item.net_amount || 0)}</td>
                <td class="px-6 py-4 text-right text-slate-500">${this.currencyFormatter.format(item.mrp)}</td>
                
                <td class="px-6 py-4 text-center ${expiryColor}">${rawExpiry}</td>
                
                <td class="px-6 py-4 text-center overflow-visible">
                    <div class="flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button class="history-btn w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-sky-100 hover:text-sky-600 dark:hover:bg-sky-900/40 dark:hover:text-sky-400 transition-all flex items-center justify-center shadow-sm" title="History">🕒</button>
                        <button class="edit-btn w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900/40 dark:hover:text-amber-400 transition-all flex items-center justify-center shadow-sm" title="Edit">✏️</button>
                        <button class="add-qty-btn w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600 hover:bg-brand-500 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Add Stock">➕</button>
                        
                        <div class="relative">
                            <button class="more-options-btn w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center shadow-sm" title="More">⋮</button>
                            <div class="more-options-menu hidden absolute right-8 top-0 mt-0 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-[99] overflow-hidden">
                                <button class="return-btn w-full text-left px-4 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2"><span>↩️</span> Return</button>
                                <button class="delete-btn w-full text-left px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center gap-2"><span>🗑️</span> Delete</button>
                            </div>
                        </div>
                    </div>
                </td>
                
                <td class="px-6 py-4 text-right text-slate-400 text-xs font-semibold">${item.date_of_purchase || 'Unknown'}</td>
            `;

            tr.querySelector('.history-btn').addEventListener('click', () => this.openHistory(item));
            tr.querySelector('.edit-btn').addEventListener('click', () => this.openProductModal(item));
            tr.querySelector('.add-qty-btn').addEventListener('click', () => this.handleAddQuantity(item));
            
            const moreBtn = tr.querySelector('.more-options-btn');
            const moreMenu = tr.querySelector('.more-options-menu');
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.more-options-menu').forEach(m => {
                    if (m !== moreMenu) m.classList.add('hidden');
                });
                moreMenu.classList.toggle('hidden');
            });

            tr.querySelector('.return-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.add('hidden');
                this.handleReturnProduct(item);
            });

            tr.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.add('hidden');
                this.handleDeleteProduct(item);
            });

            fragment.appendChild(tr);
        });

        this.tbody.appendChild(fragment);
    }

    updateStats() {
        let totalValue = 0;
        this.inventoryData.forEach(item => {
            const costForMath = parseFloat(item.true_cost || item.board_price) || 0; 
            const currentQty = parseInt(item.quantity) || 0;
            totalValue += (costForMath * currentQty); 
        });
        
        this.totalValueEl.textContent = this.currencyFormatter.format(totalValue);
        this.totalItemsEl.textContent = this.inventoryData.length;
    }

    openHistory(item) {
        document.getElementById('modalProductName').textContent = `${item.product_name} - Audit Log`;
        const hBody = document.getElementById('modalHistoryBody');
        hBody.innerHTML = '';

        const history = item.purchase_history ? [...item.purchase_history].reverse() : [];
        
        if (history.length === 0) {
            hBody.innerHTML = `<tr><td colspan="5" class="text-center text-slate-500 py-6">No history found.</td></tr>`;
        } else {
            history.forEach(record => {
                const rawExp = record.expiry || 'Unknown';
                const colorClass = this.getExpiryColorClass(rawExp);
                const isReturn = record.note === "Returned Product";

                hBody.innerHTML += `
                <tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td class="py-4 pr-4 text-sm font-medium text-slate-500 dark:text-slate-400">${record.date}</td>
                    <td class="py-4 pr-4">
                        <span class="inline-flex items-center justify-center px-3 py-1 rounded-full ${isReturn ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'} text-xs font-extrabold shadow-sm">${record.quantity_added > 0 ? '+' : ''}${record.quantity_added}</span>
                    </td>
                    <td class="py-4 pr-4 text-sm font-semibold text-slate-700 dark:text-slate-300">${this.currencyFormatter.format(record.board_price)}</td>
                    <td class="py-4 pr-4 text-sm ${colorClass}">${rawExp}</td>
                    <td class="py-4 text-sm font-medium text-slate-400 dark:text-slate-500">${this.currencyFormatter.format(record.mrp)}</td>
                </tr>
                `;
            });
        }
        this.historyModal.classList.remove('hidden');
    }

    async handleDeleteProduct(item) {
        const result = await this.openActionModal(
            "⚠️ Delete Product",
            `Are you sure you want to completely delete "${item.product_name}"? This will permanently remove its records.`,
            "none"
        );
        if (result.confirmed) {
            try {
                const res = await fetch(`${API_BASE_URL}/delete-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_name: item.product_name })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast("Product deleted successfully!");
                    await this.fetchData();
                } else {
                    this.showToast("Error: " + data.error, true);
                }
            } catch (error) {
                this.showToast("Failed to delete product.", true);
            }
        }
    }

    async handleReturnProduct(item) {
        const result = await this.openActionModal(
            "Return Product",
            `Enter quantity to return to the agency for "${item.product_name}":\n(Current Stock: ${item.quantity})`,
            "number",
            ""
        );
        if (result.confirmed && result.value.trim() !== "") {
            const qtyToReturn = parseInt(result.value);
            if (isNaN(qtyToReturn) || qtyToReturn <= 0) {
                this.showToast("Please enter a valid positive number.", true);
                return;
            }
            if (qtyToReturn > item.quantity) {
                this.showToast(`Cannot return more than available stock (${item.quantity}).`, true);
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/return-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_name: item.product_name, quantity: qtyToReturn })
                });
                const data = await res.json();
                if (res.ok) {
                    this.showToast("Product returned successfully!");
                    await this.fetchData();
                } else {
                    this.showToast("Error: " + data.error, true);
                }
            } catch (error) {
                this.showToast("Failed to return product.", true);
            }
        }
    }

    async handleUpload(e, isRescan = false) {
        if (e) e.preventDefault();
        
        let fileToUpload;
        if (isRescan) {
            fileToUpload = this.lastUploadedFile;
            this.reviewModal.classList.add('hidden'); 
        } else {
            const fileInput = document.getElementById('invoiceFile');
            if (!fileInput.files.length) {
                this.showToast("Please select an image file to upload.", true);
                return;
            }
            fileToUpload = fileInput.files[0];
            this.lastUploadedFile = fileToUpload; 
        }

        const formData = new FormData();
        formData.append('invoice', fileToUpload);

        this.uploadBtn.disabled = true;
        this.uploadBtn.textContent = isRescan ? 'Rescanning...' : 'Scanning with AI...';
        
        const overlay = document.getElementById('scanningOverlay');
        const scanText = document.getElementById('scanningText');
        
        const gifImage = overlay.querySelector('img');
        if (gifImage) {
            const originalSrc = gifImage.src.split('?')[0]; 
            gifImage.src = ''; 
            setTimeout(() => { gifImage.src = originalSrc + '?t=' + new Date().getTime(); }, 10);
        }
        
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.replace('opacity-0', 'opacity-100'), 20);

        const processingSteps = [
            "Uploading secure document...",
            "Enhancing image quality...",
            "Running Optical Character Recognition (OCR)...",
            "Extracting products and quantities...",
            "Cross-referencing pricing data...",
            "Finalizing invoice structure..."
        ];
        
        let stepIndex = 0;
        scanText.innerText = processingSteps[0];
        scanText.classList.remove('text-rose-400');
        scanText.classList.add('text-brand-300'); 
        
        const textInterval = setInterval(() => {
            stepIndex = (stepIndex + 1) % processingSteps.length; 
            scanText.innerText = processingSteps[stepIndex];
        }, 1200);

        try {
            const res = await fetch(`${API_BASE_URL}/upload-invoice`, { 
                method: 'POST', 
                body: formData 
            });
            
            const result = await res.json();
            clearInterval(textInterval); 

            if (!res.ok || result.error) throw new Error(result.error || result.message || "AI failed to read the document.");
            if (!result.products || result.products.length === 0) throw new Error("Scan completed, but no products were found in the image.");

            scanText.innerText = result.message || "⚡ AI Processing completed! Rendering results...";
            
            if (!isRescan && window.resetDropZone) {
                window.resetDropZone(); 
            }
            
            this.scannedProductsTemp = result.products;
            this.populateReviewModal();
            
            setTimeout(() => {
                overlay.classList.replace('opacity-100', 'opacity-0');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            }, 1000);

        } catch (error) {
            clearInterval(textInterval);
            scanText.innerText = "Error: " + error.message;
            scanText.classList.replace('text-brand-300', 'text-rose-400');
            
            setTimeout(() => {
                overlay.classList.replace('opacity-100', 'opacity-0');
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    scanText.classList.replace('text-rose-400', 'text-brand-300'); 
                }, 300);
            }, 3500); 
            
            this.showToast(error.message, true);
        } finally {
            this.uploadBtn.disabled = false;
            this.uploadBtn.textContent = 'Scan & Sync';
        }
    }

    async handleAddQuantity(item) {
        const result = await this.openActionModal(
            "Add Stock",
            `How many items are you adding to "${item.product_name}"?`,
            "number",
            "",
            true 
        );
        
        if (result.confirmed && result.value.trim() !== "") {
            const qtyToAdd = parseInt(result.value);
            const expVal = result.expiry ? result.expiry.trim() : "Unknown";
            
            if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
                this.showToast("Please enter a valid positive number.", true);
                return;
            }
            
            if (!this.isValidFutureDate(expVal)) {
                this.showToast("Expiry date must be today or in the future (DD/MM/YY)", true);
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/add-quantity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_name: item.product_name, quantity: qtyToAdd, expiry_date: expVal })
                });
                
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message);
                    await this.fetchData(); 
                } else {
                    this.showToast("Error: " + data.error, true);
                }
            } catch (error) {
                this.showToast("Failed to add quantity.", true);
            }
        }
    }

    createProductModal() {
        if (document.getElementById('multiFieldProductModal')) return;
        
        const modalHTML = `
        <div id="multiFieldProductModal" class="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md z-[150] flex items-center justify-center p-4 transition-opacity" style="display:none;">
            <div class="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden transform transition-all">
                <div class="px-8 py-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 id="mfModalTitle" class="text-xl font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                        <span class="text-brand-500">📝</span> Add Manual Product
                    </h3>
                    <button id="mfCloseX" class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center transition-all active:scale-90">✕</button>
                </div>
                <div class="p-8 space-y-5">
                    <input type="hidden" id="mfOldName">
                    <div class="group">
                        <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">Product Name</label>
                        <input type="text" id="mfName" list="productList" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                    </div>
                    <div class="grid grid-cols-2 gap-5">
                        <div class="group">
                            <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">Quantity</label>
                            <input type="number" id="mfQty" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                        </div>
                        <div class="group">
                            <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">Unit Cost (₹)</label>
                            <input type="number" step="0.01" id="mfCost" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-5">
                        <div class="group">
                            <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">MRP (₹)</label>
                            <input type="number" step="0.01" id="mfMrp" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                        </div>
                        <div class="group">
                            <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">Expiry Date</label>
                            <input type="text" id="mfExpiry" placeholder="DD/MM/YY" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                        </div>
                    </div>
                    <div class="group mt-5">
                        <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 group-focus-within:text-brand-500 transition-colors">Agency/Seller</label>
                        <input type="text" id="mfAgency" placeholder="Optional" class="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all shadow-sm">
                    </div>
                </div>
                <div class="px-8 py-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                    <button id="mfCancelBtn" class="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-all active:scale-95">Cancel</button>
                    <button id="mfSaveBtn" class="px-8 py-2.5 bg-gradient-to-r from-brand-500 to-accent-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all">Save Product</button>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const closeModal = () => document.getElementById('multiFieldProductModal').style.display = 'none';
        document.getElementById('mfCancelBtn').addEventListener('click', closeModal);
        document.getElementById('mfCloseX').addEventListener('click', closeModal);
        document.getElementById('mfSaveBtn').addEventListener('click', () => this.saveProductFromModal());
        
        const inputOrder = ['mfName', 'mfQty', 'mfCost', 'mfMrp', 'mfExpiry', 'mfAgency'];
        inputOrder.forEach((id, index) => {
            const inputEl = document.getElementById(id);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); 
                    if (index < inputOrder.length - 1) {
                        const nextInput = document.getElementById(inputOrder[index + 1]);
                        nextInput.focus();
                        if (nextInput.type === 'text' || nextInput.type === 'number') nextInput.select(); 
                    } else {
                        document.getElementById('mfSaveBtn').click();
                    }
                }
            });
        });
    }

    openProductModal(item = null) {
        this.createProductModal(); 
        
        const modal = document.getElementById('multiFieldProductModal');
        const title = document.getElementById('mfModalTitle');
        
        if (item) {
            title.textContent = "Edit Product Details";
            document.getElementById('mfOldName').value = item.product_name;
            document.getElementById('mfName').value = item.product_name;
            document.getElementById('mfQty').value = item.quantity;
            document.getElementById('mfCost').value = item.true_cost || item.board_price || item.cost || 0;
            document.getElementById('mfMrp').value = item.mrp || 0;
            document.getElementById('mfExpiry').value = (item.expiry_date && item.expiry_date !== "Unknown") ? item.expiry_date : "";
            document.getElementById('mfAgency').value = item.agency || "Manual Entry";
        } else {
            title.textContent = "Add Manual Product";
            document.getElementById('mfOldName').value = "";
            document.getElementById('mfName').value = "";
            document.getElementById('mfQty').value = 1;
            document.getElementById('mfCost').value = 0;
            document.getElementById('mfMrp').value = 0;
            document.getElementById('mfExpiry').value = "";
            document.getElementById('mfAgency').value = "Manual Entry";
        }
        
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('mfName').focus(), 50);
    }

    async saveProductFromModal() {
        const oldName = document.getElementById('mfOldName').value;
        const isEdit = oldName.trim() !== "";
        
        const qty = parseFloat(document.getElementById('mfQty').value) || 0;
        const cost = parseFloat(document.getElementById('mfCost').value) || 0;
        const expiryVal = document.getElementById('mfExpiry').value.trim();

        if (!this.isValidFutureDate(expiryVal)) {
            this.showToast("Expiry date must be today or in the future (DD/MM/YY)", true);
            return;
        }

        const productData = {
            product_name: document.getElementById('mfName').value.trim(),
            quantity: qty,
            cost: cost,
            mrp: parseFloat(document.getElementById('mfMrp').value) || 0,
            agency: document.getElementById('mfAgency').value.trim() || "Manual Entry",
            net_amount: qty * cost, 
            expiry_date: expiryVal !== "" ? expiryVal : "Unknown"
        };

        if (!productData.product_name) {
            this.showToast("Product name is required!", true);
            return;
        }

        const btn = document.getElementById('mfSaveBtn');
        btn.disabled = true;
        btn.textContent = "Saving...";

        try {
            if (isEdit) {
                const payload = { old_name: oldName, ...productData };
                const res = await fetch(`${API_BASE_URL}/edit-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await res.json();
                if (res.ok) {
                    this.showToast("Product updated successfully!");
                    document.getElementById('multiFieldProductModal').style.display = 'none';
                    await this.fetchData();
                } else throw new Error(data.error);
            } else {
                const res = await fetch(`${API_BASE_URL}/save-inventory`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ products: [productData] })
                });
                
                const data = await res.json();
                if (res.ok) {
                    this.showToast("Product added successfully!");
                    document.getElementById('multiFieldProductModal').style.display = 'none';
                    await this.fetchData();
                } else throw new Error(data.error);
            }
        } catch (error) {
            this.showToast(error.message || "Operation failed", true);
        } finally {
            btn.disabled = false;
            btn.textContent = "Save Product";
        }
    }

    async clearInventory() {
        const result = await this.openActionModal(
            "⚠️ Clear Inventory",
            "DANGER: Are you sure you want to completely wipe your inventory? This cannot be undone!",
            "none"
        );
        
        if (result.confirmed) {
            try {
                const res = await fetch(`${API_BASE_URL}/clear`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) {
                    this.showToast(data.message);
                    await this.fetchData(); 
                } else {
                    this.showToast("Error: " + data.error, true);
                }
            } catch (error) {
                this.showToast("Error clearing inventory.", true);
            }
        }
    }

    populateReviewModal() {
        const tbody = document.getElementById('reviewTableBody');
        tbody.innerHTML = '';
        
        this.scannedProductsTemp.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.id = `review-row-${index}`;
            tr.className = "hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group divide-x divide-slate-100 dark:divide-slate-700/50";
            
            const aiExpiry = (item.expiry_date && item.expiry_date !== "Unknown") ? item.expiry_date : "";
            const serialNum = item.serial || (index + 1);

            const inputClass = "w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none transition-all text-slate-800 dark:text-slate-200 font-semibold shadow-inner";
            
            const expiryInputClass = "w-full px-3 py-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 text-sm focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-slate-800 dark:text-slate-200 font-semibold shadow-inner placeholder-emerald-300 dark:placeholder-emerald-700";

           tr.innerHTML = `
                <td class="px-2 py-3 w-16">
                    <input type="text" class="${inputClass} text-center review-sno !px-1 text-slate-400" data-index="${index}" value="${serialNum}" tabindex="-1">
                </td>
                <td class="px-4 py-3">
                    <input type="text" class="${inputClass} review-name" list="productList" data-index="${index}" value="${item.product_name}">
                </td>
                <td class="px-3 py-3">
                    <input type="number" class="${inputClass} text-center review-qty" data-index="${index}" value="${item.quantity}">
                </td>
                <td class="px-3 py-3">
                    <input type="number" step="0.01" class="${inputClass} text-right review-price" data-index="${index}" value="${item.cost || 0}">
                </td>
                <td class="px-3 py-3">
                    <input type="number" step="0.01" class="${inputClass} text-right text-brand-600 dark:text-brand-400 font-bold bg-brand-50/30 dark:bg-brand-900/10 review-net" data-index="${index}" value="${item.net_amount || 0}">
                </td>
                <td class="px-3 py-3">
                    <input type="number" step="0.01" class="${inputClass} text-right review-mrp" data-index="${index}" value="${item.mrp || 0}">
                </td>
                <td class="px-3 py-3">
                    <input type="text" class="${expiryInputClass} text-center review-expiry" data-index="${index}" placeholder="DD/MM/YY" value="${aiExpiry}">
                </td>
                <td class="px-2 py-3 text-center">
                    <button type="button" class="delete-row-btn w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-500 transition-all flex items-center justify-center mx-auto active:scale-90" title="Remove Item">✕</button>
                </td>
            `;
            
            tr.querySelector('.review-net').addEventListener('input', () => this.updateReviewTotal());
            tr.querySelector('.delete-row-btn').addEventListener('click', () => {
                tr.style.opacity = '0';
                tr.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    tr.remove();
                    this.updateReviewTotal(); 
                }, 200); 
            });

            const expiryInput = tr.querySelector('.review-expiry');
            if (expiryInput) {
                expiryInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const allExpiries = Array.from(document.querySelectorAll('.review-expiry'));
                        const currentIndex = allExpiries.indexOf(this);
                        
                        if (currentIndex >= 0 && currentIndex < allExpiries.length - 1) {
                            allExpiries[currentIndex + 1].focus();
                        } else {
                            const saveBtn = document.getElementById('saveInventoryBtn');
                            if (saveBtn) {
                                saveBtn.focus();
                                saveBtn.classList.add('ring-4', 'ring-emerald-500/50');
                                setTimeout(() => saveBtn.classList.remove('ring-4', 'ring-emerald-500/50'), 1000);
                            }
                        }
                    }
                });
            }

            tbody.appendChild(tr);
        });

        this.reviewModal.classList.remove('hidden');
        this.updateReviewTotal();
    }

    updateReviewTotal() {
        let currentTotal = 0;
        const rows = document.querySelectorAll('#reviewTableBody tr');
        rows.forEach(row => {
            const netAmt = parseFloat(row.querySelector('.review-net').value) || 0;
            currentTotal += netAmt;
        });

        const totalDisplay = document.getElementById('reviewTotalDisplay');
        if (totalDisplay) {
            totalDisplay.textContent = this.currencyFormatter.format(currentTotal);
        }
    }

    async saveReviewedInventory() {
        this.saveInventoryBtn.disabled = true;
        this.saveInventoryBtn.textContent = 'Saving to Database...';

        const finalProducts = [];
        const rows = document.querySelectorAll('#reviewTableBody tr');
        
        let hasInvalidDate = false;

        rows.forEach(row => {
            const index = row.querySelector('.review-name').getAttribute('data-index');
            let product = { ...this.scannedProductsTemp[index] }; 
            
            product.serial = row.querySelector('.review-sno').value || "";
            product.product_name = row.querySelector('.review-name').value;
            product.quantity = parseFloat(row.querySelector('.review-qty').value) || 0;
            product.cost = parseFloat(row.querySelector('.review-price').value) || 0; 
            product.net_amount = parseFloat(row.querySelector('.review-net').value) || 0; 
            product.mrp = parseFloat(row.querySelector('.review-mrp').value) || 0;
            product.expiry_date = row.querySelector('.review-expiry').value || "Unknown";
            
            if (!this.isValidFutureDate(product.expiry_date)) {
                hasInvalidDate = true;
            }
            
            finalProducts.push(product);
        });

        if (hasInvalidDate) {
            this.showToast("One or more Expiry Dates are in the past. Please fix them.", true);
            this.saveInventoryBtn.disabled = false;
            this.saveInventoryBtn.innerHTML = `<span>Confirm & Save</span><span class="text-xl leading-none">→</span>`;
            return;
        }

        try {
            const formData = new FormData();
            formData.append('products', JSON.stringify(finalProducts));
            
            const isCredit = document.getElementById('addToCreditCheck').checked;
            formData.append('add_to_credit', isCredit);
            
            if (this.lastUploadedFile) formData.append('invoice_image', this.lastUploadedFile);

            const res = await fetch(`${API_BASE_URL}/save-inventory`, {
                method: 'POST',
                body: formData 
            });
            
            const result = await res.json();
            
            if (res.ok) {
                this.reviewModal.classList.add('hidden');
                this.statusMsg.className = 'status-msg success text-brand-600 dark:text-brand-400 font-semibold px-2';
                this.statusMsg.textContent = result.message;
                
                this.lastUploadedFile = null; 
                await this.fetchData();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.showToast("Error saving inventory: " + error.message, true);
        } finally {
            this.saveInventoryBtn.disabled = false;
            this.saveInventoryBtn.innerHTML = `<span>Confirm & Save</span><span class="text-xl leading-none">→</span>`;
            setTimeout(() => this.statusMsg.textContent = '', 5000);
        }
    }

    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = isError ? '#ef4444' : '#10b981'; 
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.style.zIndex = '9999';
        toast.style.transition = 'opacity 0.3s ease';
        toast.innerText = message;
        toast.style.fontWeight = 'bold';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    openActionModal(title, desc, inputType = 'none', defaultValue = '', showExpiry = false) {
        return new Promise((resolve) => {
            const modal = document.getElementById('actionModal');
            const titleEl = document.getElementById('actionModalTitle');
            const descEl = document.getElementById('actionModalDesc');
            const inputEl = document.getElementById('actionModalInput');
            const inputEl2 = document.getElementById('actionModalInput2');
            const confirmBtn = document.getElementById('actionModalConfirmBtn');
            const cancelBtn = document.getElementById('actionModalCancelBtn');

            titleEl.textContent = title;
            descEl.textContent = desc;

            if (inputType === 'none') {
                inputEl.style.display = 'none';
                inputEl2.style.display = 'none';
            } else {
                inputEl.style.display = 'block';
                inputEl.type = inputType;
                inputEl.value = defaultValue;
                
                if (showExpiry) {
                    inputEl2.style.display = 'block';
                    inputEl2.value = '';
                } else {
                    inputEl2.style.display = 'none';
                }

                const handleEnter = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (showExpiry && e.target === inputEl) {
                            inputEl2.focus(); // Jump to expiry on Enter
                        } else {
                            confirmBtn.click(); 
                        }
                    }
                };
                
                inputEl.onkeydown = handleEnter;
                inputEl2.onkeydown = handleEnter;

                if (inputType === 'text') {
                    inputEl.setAttribute('list', 'productList');
                } else {
                    inputEl.removeAttribute('list');
                }
            }

            modal.classList.remove('hidden');
            if (inputType !== 'none') inputEl.focus();

            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                cleanup();
                resolve({ confirmed: true, value: inputEl.value, expiry: showExpiry ? inputEl2.value : null });
            };

            const onCancel = () => {
                cleanup();
                resolve({ confirmed: false });
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
        });
    }

    updateProductDatalist() {
        let datalist = document.getElementById('productList');
        
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'productList';
            document.body.appendChild(datalist);
        }
        
        datalist.innerHTML = ''; 
        
        const uniqueNames = [...new Set(this.inventoryData.map(item => item.product_name))];
        
        uniqueNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            datalist.appendChild(option);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new InventoryManager());