class BillingManager {
    constructor() {
        this.inventoryData = [];
        this.crmData = []; 
        this.currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
        
        this.tabs = [];
        this.activeTabId = null;
        this.tabCounter = 0;
        
        this.cacheDOM();
        this.bindEvents();
        
        this.createNewTab();
        this.fetchInventory();
        this.fetchAllCustomers(); 
        
        this.fetchShopProfile();
    }

    cacheDOM() {
        this.tabsList = document.getElementById('tabsList');
        this.addTabBtn = document.getElementById('addTabBtn');
        
        this.searchInput = document.getElementById('billingSearchInput');
        this.addQtyInput = document.getElementById('billingAddQty');
        this.inventoryBody = document.getElementById('billingInventoryBody');
        
        this.cartBody = document.getElementById('cartBody');
        this.grandTotalDisplay = document.getElementById('grandTotalDisplay');
        this.checkoutBtn = document.getElementById('checkoutBtn');
        
        this.posCustomerSearch = document.getElementById('posCustomerSearch');
        this.customerDropdown = document.getElementById('customerDropdown'); 
        
        // Print Output Elements
        this.customerPrint = document.getElementById('customerNamePrint');
        this.invoiceNoDisplay = document.getElementById('invoiceNoDisplay');
        this.invoiceNoDisplayPrint = document.getElementById('invoiceNoDisplayPrint');
        this.printDateOnly = document.getElementById('printDateOnly');
        this.printTimeOnly = document.getElementById('printTimeOnly');
        this.printLogo = document.getElementById('printLogo');
        this.printShopName = document.getElementById('printShopName');
        this.printAddress = document.getElementById('printAddress');
        this.printPhone = document.getElementById('printPhone');
        this.printEmail = document.getElementById('printEmail');
        this.printFooterMessage = document.getElementById('printFooterMessage');
        
        this.printCartBody = document.getElementById('printCartBody');
        this.printSubTotal = document.getElementById('printSubTotal');
        this.printRoundOff = document.getElementById('printRoundOff');
        this.printGrandTotal = document.getElementById('printGrandTotal');
        this.printBarcodeText = document.getElementById('printBarcodeText');
        
        this.newCustomerModal = document.getElementById('newCustomerModal');
        this.ncPhone = document.getElementById('ncPhone');
        this.ncCountryCode = document.getElementById('ncCountryCode');
        this.ncName = document.getElementById('ncName');
        this.ncArea = document.getElementById('ncArea');
        this.ncSaveBtn = document.getElementById('ncSaveBtn');
        this.ncCancelBtn = document.getElementById('ncCancelBtn');
    }

    get activeTab() { return this.tabs.find(t => t.id === this.activeTabId); }

    bindEvents() {
        this.addTabBtn.addEventListener('click', () => this.createNewTab());
        this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));

        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.addQtyInput.focus(); }
        });

        this.addQtyInput.addEventListener('focus', (e) => e.target.value = '');
        this.addQtyInput.addEventListener('blur', (e) => {
            if (e.target.value.trim() === '') e.target.value = '1';
        });

        this.addQtyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.addTopResultToCart(); }
        });

        if (this.posCustomerSearch && this.customerDropdown) {
            this.posCustomerSearch.addEventListener('input', (e) => {
                const val = e.target.value.toLowerCase().trim();
                this.customerDropdown.innerHTML = '';
                
                if (!val) { this.customerDropdown.classList.add('hidden'); return; }

                const matches = this.crmData.filter(c => c.name.toLowerCase().includes(val) || c.phone.includes(val));

                if (matches.length > 0) {
                    matches.forEach(c => {
                        const div = document.createElement('div');
                        div.className = "px-4 py-3 cursor-pointer border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex justify-between items-center";
                        div.innerHTML = `<strong class="text-slate-800 dark:text-white">${c.name}</strong> <span class="text-slate-500 text-xs font-bold bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">${c.phone}</span>`;
                        div.addEventListener('click', () => this.assignCustomerAndFocusCheckout(c));
                        this.customerDropdown.appendChild(div);
                    });
                    this.customerDropdown.classList.remove('hidden');
                } else {
                    this.customerDropdown.classList.add('hidden');
                }
            });

            if (this.ncCountryCode && this.ncPhone) {
                this.ncCountryCode.addEventListener('change', (e) => {
                    const maxDigits = e.target.options[e.target.selectedIndex].getAttribute('data-max');
                    this.ncPhone.setAttribute('maxlength', maxDigits);
                    this.ncPhone.value = this.ncPhone.value.slice(0, maxDigits); 
                });
            }

            document.addEventListener('click', (e) => {
                if (e.target !== this.posCustomerSearch && e.target !== this.customerDropdown) {
                    this.customerDropdown.classList.add('hidden');
                }
            });

            this.posCustomerSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.customerDropdown.classList.add('hidden'); 
                    const val = e.target.value.trim().toLowerCase();
                    if (!val) { this.checkoutBtn.focus(); return; }
                    const matches = this.crmData.filter(c => c.name.toLowerCase().includes(val) || c.phone.includes(val));
                    if (matches.length > 0) this.assignCustomerAndFocusCheckout(matches[0]);
                    else this.openNewCustomerModal(val); 
                }
            });
        }

        const ncInputs = [this.ncName, this.ncPhone, this.ncArea];
        ncInputs.forEach((input, index) => {
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (index < ncInputs.length - 1) ncInputs[index + 1].focus();
                        else this.ncSaveBtn.click(); 
                    }
                });
            }
        });

        if (this.ncCancelBtn) {
            this.ncCancelBtn.addEventListener('click', () => {
                this.newCustomerModal.classList.add('hidden');
                this.newCustomerModal.firstElementChild.classList.replace('scale-100', 'scale-95');
                this.posCustomerSearch.focus();
            });
        }

        if (this.ncSaveBtn) this.ncSaveBtn.addEventListener('click', () => this.saveNewCustomer());

        const now = new Date();
        document.getElementById('invoiceDateDisplay').textContent = now.toLocaleDateString('en-IN');
        if (this.printDateOnly) this.printDateOnly.textContent = now.toLocaleDateString('en-IN');
        if (this.printTimeOnly) this.printTimeOnly.textContent = now.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
        
        this.checkoutBtn.addEventListener('click', this.handleCheckout.bind(this));
    }

    showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-6 right-6 px-6 py-3 rounded-xl font-bold text-white shadow-xl transition-all duration-300 z-[9999] transform translate-y-10 opacity-0 ${isError ? 'bg-rose-500 shadow-rose-500/30' : 'bg-brand-500 shadow-brand-500/30'}`;
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    async fetchShopProfile() {
        try {
            const res = await fetch('/api/profile/');
            if (res.ok) {
                const profile = await res.json();
                if (profile.logo_url) { this.printLogo.src = profile.logo_url; this.printLogo.style.display = 'block'; }
                if (profile.shop_name) this.printShopName.textContent = profile.shop_name;
                if (profile.address) { this.printAddress.textContent = profile.address; this.printAddress.style.display = 'block'; }
                if (profile.phone) { this.printPhone.textContent = `Ph: ${profile.phone}`; this.printPhone.style.display = 'block'; }
                if (profile.email) { this.printEmail.textContent = `Email: ${profile.email}`; this.printEmail.style.display = 'block'; }
                if (profile.bio) { this.printFooterMessage.textContent = profile.bio; }
            }
        } catch (error) { console.error("Failed to load shop profile for receipts", error); }
    }

    assignCustomerAndFocusCheckout(customer) {
        this.posCustomerSearch.value = customer.name;
        this.activeTab.customerName = customer.name;
        this.activeTab.customerPhone = customer.phone;
        this.customerPrint.textContent = customer.name;
        this.customerDropdown.classList.add('hidden');
        this.checkoutBtn.focus();
    }

    createNewTab() {
        this.tabCounter++;
        const newTab = { id: Date.now(), title: `Bill ${this.tabCounter}`, cart: [], customerName: "", customerPhone: "", invoiceNo: '#' + Math.floor(Math.random() * 100000) };
        this.tabs.push(newTab);
        this.switchTab(newTab.id);
    }

    switchTab(tabId) {
        this.activeTabId = tabId;
        this.renderTabsUI();
        
        if (this.posCustomerSearch) this.posCustomerSearch.value = this.activeTab.customerName;
        if (this.customerPrint) this.customerPrint.textContent = this.activeTab.customerName || "CASH CUSTOMER";
        if (this.invoiceNoDisplay) this.invoiceNoDisplay.textContent = this.activeTab.invoiceNo;
        if (this.invoiceNoDisplayPrint) this.invoiceNoDisplayPrint.textContent = this.activeTab.invoiceNo;
        if (this.printBarcodeText) this.printBarcodeText.textContent = this.activeTab.invoiceNo.replace('#', '');
        
        this.renderCart();
        this.handleSearch(this.searchInput.value); 
        this.searchInput.focus();
    }

    closeTab(tabId, e) {
        if (e) e.stopPropagation();
        if (this.tabs.length === 1) {
            this.tabs[0].cart = []; this.tabs[0].customerName = ""; this.tabs[0].customerPhone = ""; this.tabs[0].invoiceNo = '#' + Math.floor(Math.random() * 100000);
            this.switchTab(this.tabs[0].id); return;
        }
        const tabIndex = this.tabs.findIndex(t => t.id === tabId);
        this.tabs.splice(tabIndex, 1);
        if (this.activeTabId === tabId) {
            const nextTab = this.tabs[Math.max(0, tabIndex - 1)];
            this.switchTab(nextTab.id);
        } else {
            this.renderTabsUI();
            this.handleSearch(this.searchInput.value); 
        }
    }

    renderTabsUI() {
        this.tabsList.innerHTML = '';
        this.tabs.forEach(tab => {
            const isActive = tab.id === this.activeTabId;
            const btnClass = isActive ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200 dark:border-brand-500/30' : 'bg-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 border border-transparent';
            const tabEl = document.createElement('button');
            tabEl.className = `px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${btnClass}`;
            tabEl.innerHTML = `${tab.title} <span class="tab-close flex items-center justify-center w-5 h-5 rounded-full hover:bg-rose-100 hover:text-rose-600 transition-colors text-lg leading-none">×</span>`;
            tabEl.addEventListener('click', () => this.switchTab(tab.id));
            tabEl.querySelector('.tab-close').addEventListener('click', (e) => this.closeTab(tab.id, e));
            this.tabsList.appendChild(tabEl);
        });
    }

    async fetchInventory() {
        try {
            const res = await fetch('/api/inventory/');
            this.inventoryData = await res.json();
            this.handleSearch(this.searchInput.value);
        } catch (error) { console.error("Failed to load inventory", error); }
    }

    async fetchAllCustomers() {
        try {
            const res = await fetch('/api/customers/');
            if (res.ok) this.crmData = await res.json();
        } catch (error) { console.error("Failed to load CRM data", error); }
    }

    openNewCustomerModal(query) {
        this.newCustomerModal.classList.remove('hidden');
        setTimeout(() => this.newCustomerModal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
        if (/^\d+$/.test(query)) { this.ncPhone.value = query; this.ncName.value = ""; setTimeout(() => this.ncName.focus(), 50); } 
        else { this.ncName.value = query; this.ncPhone.value = ""; setTimeout(() => this.ncPhone.focus(), 50); }
        this.ncArea.value = "";
    }

    async saveNewCustomer() {
        this.ncSaveBtn.disabled = true; 
        this.ncSaveBtn.textContent = "Saving...";
        
        const rawPhone = `${this.ncCountryCode.value} ${this.ncPhone.value.trim()}`;
        const payload = { 
            phone: rawPhone, 
            name: this.ncName.value.trim(), 
            area: this.ncArea.value.trim() 
        };
        
        try {
            const res = await fetch('/api/customers/add', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const data = await res.json();
            
            if (res.ok) {
                this.newCustomerModal.classList.add('hidden');
                this.crmData.push(data.customer);
                this.assignCustomerAndFocusCheckout(data.customer);
                this.showToast("Customer saved");

            } else {
                this.showToast(data.error, true);
            }
        } catch (error) { 
            this.showToast("Failed to save new customer.", true); 
        } finally { 
            this.ncSaveBtn.disabled = false; 
            this.ncSaveBtn.textContent = "Save & Checkout"; 
        }
    }

    // --- SMART SEARCH & SCORING ---
    isFuzzyMatch(term, target) {
        if (!target || !term) return false; 
        term = term.toString().toLowerCase().replace(/\s+/g, ''); target = target.toString().toLowerCase().replace(/\s+/g, '');
        let termIdx = 0, targetIdx = 0;
        while (termIdx < term.length && targetIdx < target.length) { if (term[termIdx] === target[targetIdx]) termIdx++; targetIdx++; }
        return termIdx === term.length;
    }

    calculateMatchScore(term, item) {
        const name = (item.product_name || "").toLowerCase();
        const agency = (item.agency || "").toLowerCase();
        const t = term.toLowerCase().trim();
        
        if (name === t) return 1; 
        if (name.startsWith(t)) return 2; 
        if (name.includes(` ${t}`)) return 3; 
        if (name.includes(t)) return 4; 
        if (agency.startsWith(t)) return 5; 
        if (agency.includes(t)) return 6; 
        
        return 7; 
    }

    getSortedSearchResults(term) {
        if (!term) return this.inventoryData;
        
        const lowerTerm = term.toLowerCase().trim();
        let filtered = this.inventoryData.filter(item => 
            this.isFuzzyMatch(lowerTerm, item.product_name) || this.isFuzzyMatch(lowerTerm, item.agency)
        );
        
        filtered.sort((a, b) => {
            const scoreA = this.calculateMatchScore(lowerTerm, a);
            const scoreB = this.calculateMatchScore(lowerTerm, b);
            
            if (scoreA !== scoreB) {
                return scoreA - scoreB; 
            }
            return (a.product_name || "").localeCompare(b.product_name || "");
        });
        
        return filtered;
    }

    handleSearch(term) {
        const results = this.getSortedSearchResults(term);
        this.renderInventoryTable(results);
    }

    getAvailableStock(productName, totalStock) {
        let totalInAllCarts = 0;
        this.tabs.forEach(tab => { const itemInTab = tab.cart.find(c => c.product_name === productName); if (itemInTab) totalInAllCarts += itemInTab.quantity; });
        return totalStock - totalInAllCarts;
    }

    getMaxAllowedForActiveTab(productName, totalStock) {
        let stockInOtherTabs = 0;
        this.tabs.forEach(tab => { if (tab.id !== this.activeTabId) { const item = tab.cart.find(c => c.product_name === productName); if (item) stockInOtherTabs += item.quantity; }});
        return totalStock - stockInOtherTabs;
    }

    // --- Expiry Parsing Logic for POS ---
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

    isExpired(expiryStr) {
        const expDate = this.parseExpiryDate(expiryStr);
        if (!expDate) return false;
        const now = new Date();
        now.setHours(0,0,0,0);
        return expDate < now;
    }

    renderInventoryTable(data) {
        this.inventoryBody.innerHTML = '';
        const fragment = document.createDocumentFragment();

        data.forEach(item => {
            const availableStock = this.getAvailableStock(item.product_name, item.quantity);
            const isExp = this.isExpired(item.expiry_date);
            const isUnavailable = availableStock <= 0 || isExp;
            const opacity = isUnavailable ? 'opacity-50' : 'opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer';
            
            let badgeClass = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
            let actionHtml = '';
            let displayStock = availableStock;
            
            if (item.is_returned && availableStock <= 0 && item.quantity <= 0) {
                badgeClass = 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
                displayStock = 'Returned';
                actionHtml = `<span class="text-amber-500 font-bold text-xs">Returned</span>`;
            } else if (isExp) {
                badgeClass = 'bg-rose-100 text-rose-600 dark:bg-rose-900/30';
                actionHtml = `<span class="text-rose-500 font-bold text-xs">Expired</span>`;
            } else if (!isUnavailable) {
                actionHtml = `<button class="add-to-cart-btn px-3 py-1.5 bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400 font-bold rounded-lg hover:bg-brand-500 hover:text-white transition-colors text-xs">ADD</button>`;
            } else if (item.quantity <= 0) {
                badgeClass = 'bg-rose-100 text-rose-600 dark:bg-rose-900/30';
                actionHtml = `<span class="text-rose-500 font-bold text-xs">Out of Stock</span>`;
            } else {
                badgeClass = 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
                actionHtml = `<span class="text-amber-500 font-bold text-xs">In Use</span>`;
            }

            const tr = document.createElement('tr');
            tr.className = `border-b border-slate-100 dark:border-slate-800/50 transition-colors ${opacity}`;
            tr.innerHTML = `
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-800 dark:text-white truncate max-w-[200px]">${item.product_name}</div>
                    <div class="text-[10px] text-slate-400 uppercase tracking-wide truncate max-w-[200px]">${item.agency}</div>
                </td>
                <td class="px-2 py-3 text-center"><span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full font-bold text-xs ${badgeClass}">${displayStock}</span></td>
                <td class="px-2 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 text-sm">${this.currencyFormatter.format(item.mrp)}</td>
                <td class="px-4 py-3 text-center">${actionHtml}</td>
            `;

            if (!isUnavailable) {
                tr.addEventListener('click', (e) => { if(!e.target.classList.contains('add-to-cart-btn')) tr.querySelector('.add-to-cart-btn').click(); });
                tr.querySelector('.add-to-cart-btn').addEventListener('click', (e) => { e.stopPropagation(); this.processAddToCart(item, parseInt(this.addQtyInput.value) || 1); });
            }
            fragment.appendChild(tr);
        });
        this.inventoryBody.appendChild(fragment);
    }

    addTopResultToCart() {
        const term = this.searchInput.value;
        if (!term) return;
        
        // 1. Get ALL sorted results regardless of availability
        const sortedResults = this.getSortedSearchResults(term);
        
        if (sortedResults.length === 0) {
            this.showToast("No products found matching that search.", true);
            return;
        }

        // 2. Identify the absolute TOP match
        const topMatch = sortedResults[0];

        // 3. Perform explicit checks on the TOP match
        const availableStock = this.getAvailableStock(topMatch.product_name, topMatch.quantity);
        
        if (this.isExpired(topMatch.expiry_date)) {
            this.showToast(`${topMatch.product_name} is Expired!`, true);
            return;
        }
        if (availableStock <= 0) {
            this.showToast(`${topMatch.product_name} is Out of Stock!`, true);
            return;
        }

        // 4. If all checks pass, add it!
        this.processAddToCart(topMatch, parseInt(this.addQtyInput.value) || 1);
        this.searchInput.value = ''; 
        this.addQtyInput.value = '1'; 
        this.handleSearch(''); 
        this.searchInput.focus(); 
    }

    processAddToCart(product, qtyToAdd) {
        const activeCart = this.activeTab.cart;
        const existingItem = activeCart.find(c => c.product_name === product.product_name);
        const currentCartQty = existingItem ? existingItem.quantity : 0;
        const maxAllowed = this.getMaxAllowedForActiveTab(product.product_name, product.quantity);

        if (currentCartQty + qtyToAdd > maxAllowed) { this.showToast(`Cannot add ${qtyToAdd}. Only ${maxAllowed - currentCartQty} more available!`, true); return; }

        if (existingItem) existingItem.quantity += qtyToAdd;
        else activeCart.push({ product_name: product.product_name, mrp: parseFloat(product.mrp) || 0, quantity: qtyToAdd, discount: 0, max_stock: product.quantity });
        this.renderCart();
    }

    renderCart() {
        this.cartBody.innerHTML = '';
        this.printCartBody.innerHTML = ''; 
        const activeCart = this.activeTab.cart;
        
        activeCart.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors";
            tr.innerHTML = `
                <td class="px-4 py-4 text-center text-slate-400 font-bold">${index + 1}</td>
                <td class="px-4 py-4 font-bold text-slate-800 dark:text-white">${item.product_name}</td>
                <td class="px-4 py-4 text-center">
                    <span class="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-brand-600 dark:text-brand-400 font-extrabold shadow-inner text-lg">${item.quantity}</span>
                </td>
                <td class="px-4 py-4 text-right text-slate-500 font-semibold">${this.currencyFormatter.format(item.mrp)}</td>
                <td class="px-4 py-4 text-center">
                    <input type="number" class="cart-disc w-16 px-2 py-1.5 text-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500/40 outline-none font-bold" data-index="${index}" value="${item.discount}" min="0" max="100">
                </td>
                <td class="px-4 py-4 text-right font-extrabold text-blue-600 dark:text-blue-400 text-lg net-amt-display">₹0.00</td>
                <td class="px-4 py-4 text-center">
                    <button class="delete-cart-btn w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-500 transition-all flex items-center justify-center mx-auto active:scale-90 shadow-sm" title="Remove Item">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            `;

            const printTr = document.createElement('tr');
            printTr.innerHTML = `
                <td>${item.product_name}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: right;">${item.mrp.toFixed(2)}</td>
                <td style="text-align: right; font-weight: bold;" class="print-net-display">0.00</td>
            `;

            tr.querySelector('.cart-disc').addEventListener('input', (e) => {
                let newDisc = parseFloat(e.target.value) || 0;
                if (newDisc > 100) { newDisc = 100; e.target.value = 100; }
                activeCart[index].discount = newDisc;
                this.updateCartMath();
            });

            tr.querySelector('.delete-cart-btn').addEventListener('click', () => { activeCart.splice(index, 1); this.renderCart(); });

            this.cartBody.appendChild(tr);
            this.printCartBody.appendChild(printTr);
        });

        // Add a blank row if cart is empty so it doesn't look weird
        if (activeCart.length === 0) {
            this.cartBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400 font-medium">Cart is empty</td></tr>`;
        } else {
            // Scroll to the bottom of the cart automatically when a new item is added
            const cartContainer = this.cartBody.parentElement.parentElement;
            cartContainer.scrollTop = cartContainer.scrollHeight;
        }

        this.updateCartMath();
        this.handleSearch(this.searchInput.value); 
    }

    updateCartMath() {
        let grandTotal = 0;
        const activeCart = this.activeTab.cart;
        
        activeCart.forEach((item, index) => {
            const totalMrp = item.mrp * item.quantity;
            const discountAmount = totalMrp * (item.discount / 100);
            item.net_amount = Math.max(0, totalMrp - discountAmount);
            grandTotal += item.net_amount;

            const row = this.cartBody.children[index];
            if (row) row.querySelector('.net-amt-display').textContent = this.currencyFormatter.format(item.net_amount);
            
            const printRow = this.printCartBody.children[index];
            if (printRow) printRow.querySelector('.print-net-display').textContent = item.net_amount.toFixed(2);
        });
        
        this.grandTotalDisplay.textContent = this.currencyFormatter.format(grandTotal);
        
        let roundedTotal = Math.round(grandTotal);
        let roundOff = (roundedTotal - grandTotal).toFixed(2);
        
        this.printSubTotal.textContent = grandTotal.toFixed(2);
        this.printRoundOff.textContent = roundOff;
        this.printGrandTotal.textContent = roundedTotal.toFixed(2);
    }

    async handleCheckout() {
        const activeCart = this.activeTab.cart;
        if (activeCart.length === 0) { this.showToast("Cart is empty!", true); return; }

        // --- NEW: Require Customer Input ---
        const customerSearchInput = document.getElementById('posCustomerSearch');
        if (!this.activeTab.customerPhone && !customerSearchInput.value.trim()) {
            this.showToast("Customer linking is required! Please select or add a customer.", true);
            customerSearchInput.focus();
            
            // Add a temporary red glow to highlight the error
            customerSearchInput.classList.add('ring-2', 'ring-rose-500', 'border-rose-500');
            setTimeout(() => {
                customerSearchInput.classList.remove('ring-2', 'ring-rose-500', 'border-rose-500');
            }, 2500);
            return;
        }
        // -----------------------------------

        this.checkoutBtn.disabled = true; 
        this.checkoutBtn.innerHTML = "Generating Receipt Image...";

        try {
            const printContainer = document.getElementById('printReceiptContainer');
            printContainer.classList.remove('hidden');
            printContainer.style.display = 'block'; printContainer.style.position = 'absolute';
            printContainer.style.top = '-9999px'; printContainer.style.left = '0';
            printContainer.style.width = '320px'; printContainer.style.padding = '20px';
            printContainer.style.background = 'white'; printContainer.style.color = 'black';

            const canvas = await html2canvas(printContainer, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const receiptImageBase64 = canvas.toDataURL('image/jpeg', 0.9);

            printContainer.style.display = ''; printContainer.style.position = '';
            printContainer.style.top = ''; printContainer.style.left = '';
            printContainer.style.width = ''; printContainer.style.padding = '';
            printContainer.style.background = ''; printContainer.style.color = '';
            printContainer.classList.add('hidden');

            this.checkoutBtn.innerHTML = "Processing Payment...";

            const isCredit = document.getElementById('posCreditCheck').checked;
            let dueDate = "";
            if (isCredit) {
                const selectVal = document.getElementById('posDueSelect').value;
                if (selectVal === 'custom') {
                    dueDate = document.getElementById('posDueDate').value;
                } else {
                    const d = new Date();
                    d.setDate(d.getDate() + parseInt(selectVal));
                    dueDate = d.toISOString().split('T')[0];
                }
            }

            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    cart: activeCart, 
                    customer_phone: this.activeTab.customerPhone, 
                    // Use whatever they typed if they didn't explicitly link from dropdown
                    customer_name: this.activeTab.customerName || customerSearchInput.value.trim(),
                    receipt_image: receiptImageBase64,
                    add_to_credit: isCredit,
                    due_date: dueDate
                })
            });

            if (res.ok) {
                window.print(); 
                this.closeTab(this.activeTabId); 
                await this.fetchInventory(); 
                document.getElementById('posCreditCheck').checked = false;
                document.getElementById('dueSettings').classList.add('hidden');
            } else {
                const data = await res.json();
                this.showToast("Error: " + data.error, true);
            }
        } catch (error) { 
            this.showToast("Checkout failed. Server might be down.", true); 
        } finally { 
            this.checkoutBtn.disabled = false; 
            this.checkoutBtn.innerHTML = `
              <span><img class="w-10 h-10" src="static/icons/receipt.png"/></span>
              <span>Complete Checkout</span>
              <span class="text-2xl font-normal leading-none mb-1">→</span>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new BillingManager());