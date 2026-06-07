const API_BASE = '/api/credits';
const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

let currentTab = 'supplier';
let currentFolderTab = 'invoices'; 
let allGroupedCredits = [];
let pendingRequests = [];
let currentOpenFolderData = null;

// --- CUSTOM CONFIRM MODAL (Replaces native confirm/alert) ---
function showConfirmModal(title, message, confirmText = "Yes, Delete") {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const descEl = document.getElementById('confirmModalDesc');
        const confirmBtn = document.getElementById('confirmActionBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        titleEl.innerText = title;
        descEl.innerText = message;
        confirmBtn.innerText = confirmText;

        modal.classList.remove('hidden');
        setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);

        const cleanup = () => {
            modal.firstElementChild.classList.replace('scale-100', 'scale-95');
            setTimeout(() => modal.classList.add('hidden'), 200);
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// --- Fast Navigation ---
function setupEnterNavigation(inputIds, submitBtnId) {
    inputIds.forEach((inputId, index) => {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (index < inputIds.length - 1) document.getElementById(inputIds[index + 1]).focus(); 
                else document.getElementById(submitBtnId).click();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEnterNavigation(['appInvId', 'appAgency', 'appTotal', 'appPaid', 'appDueDate'], 'appSaveBtn');
    setupEnterNavigation(['manInvId', 'manAgency', 'manDate', 'manDueDate', 'manTotal', 'manPaid'], 'manSaveBtn');
    setupEnterNavigation(['eaNewName'], 'eaSaveBtn');
    setupEnterNavigation(['payDate', 'payTime', 'payAmount'], 'paySaveBtn');
    setupEnterNavigation(['ebTotal', 'ebAgency', 'ebDate', 'ebDueDate'], 'ebSaveBtn');
    setupEnterNavigation(['cpDate', 'cpTime', 'cpAmount'], 'cpSaveBtn');
});

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 right-6 px-6 py-3 rounded-xl font-bold text-white shadow-xl transition-all duration-300 z-[9999] transform translate-y-10 opacity-0 ${isError ? 'bg-rose-500 shadow-rose-500/30' : 'bg-brand-500 shadow-brand-500/30'}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
    setTimeout(() => { toast.classList.add('translate-y-10', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// --- Main Tabs ---
function switchTab(tabName) {
    currentTab = tabName;
    const tabSupplier = document.getElementById('tabSupplier');
    const tabCustomer = document.getElementById('tabCustomer');
    const supplierActions = document.getElementById('supplierActions');
    
    const activeClass = "bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-500 shadow-sm border border-transparent";
    const inactiveClass = "bg-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 border-transparent";
    
    if (tabName === 'supplier') {
        tabSupplier.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeClass}`;
        tabCustomer.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${inactiveClass}`;
        if(supplierActions) supplierActions.style.display = 'flex';
    } else {
        tabCustomer.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeClass}`;
        tabSupplier.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${inactiveClass}`;
        if(supplierActions) supplierActions.style.display = 'none'; 
    }
    
    document.getElementById('mainSearch').value = ''; 
    loadData();
}

async function loadData() {
    if (currentTab === 'supplier') {
        await fetchPendingRequests();
    }
    await fetchGroupedCredits();
}

function toggleDropdown(event, id) {
    event.stopPropagation(); closeAllDropdowns();
    const dropdown = document.getElementById(`dropdown-${id}`);
    if (dropdown) { dropdown.classList.remove('hidden'); dropdown.classList.add('dropdown-animate'); }
}

// --- 1. Pending Requests ---
async function fetchPendingRequests() {
    try {
        const res = await fetch(`${API_BASE}/pending`);
        pendingRequests = await res.json();
        const badge = document.getElementById('pendingBadge');
        if (badge) badge.innerText = pendingRequests.length;
    } catch (e) { showToast("Failed to load requests", true); }
}

function openPendingRequests() {
    const tbody = document.getElementById('pendingTableBody');
    tbody.innerHTML = '';
    if (pendingRequests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500 font-medium">No pending requests.</td></tr>`;
    } else {
        pendingRequests.forEach((req, index) => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <td class="py-4 px-4 text-center text-slate-400 font-bold">${index + 1}</td>
                    <td class="py-4 px-4 text-slate-500 dark:text-slate-400 font-medium">${req.date}</td>
                    <td class="py-4 px-4 font-bold text-slate-800 dark:text-white">${req.agency}</td>
                    <td class="py-4 px-4 text-right font-extrabold text-brand-600 dark:text-brand-400">${currencyFormatter.format(req.total)}</td>
                    <td class="py-4 px-4 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="rejectRequest('${req._id}')" class="btn-action border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white"><span>✕</span></button>
                            <button onclick="openApproveModal('${req._id}')" class="btn-action border-brand-200 text-brand-600 bg-brand-50 hover:bg-brand-500 hover:text-white"><span>✓</span></button>
                        </div>
                    </td>
                </tr>`;
        });
    }
    const modal = document.getElementById('pendingModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
}

function closePendingRequests() {
    const modal = document.getElementById('pendingModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function rejectRequest(id) {
    const isConfirmed = await showConfirmModal("Delete Request", "Are you sure you want to delete this credit request?");
    if(!isConfirmed) return;
    try {
        await fetch(`${API_BASE}/pending/${id}`, { method: 'DELETE' });
        pendingRequests = pendingRequests.filter(r => r._id !== id);
        openPendingRequests();
        const badge = document.getElementById('pendingBadge');
        if(badge) badge.innerText = pendingRequests.length;
        showToast("Request removed.");
    } catch(e) { showToast("Failed to delete request", true); }
}

// --- 2. Approval Logic ---
function openApproveModal(id) {
    closePendingRequests();
    const req = pendingRequests.find(r => r._id === id);
    if(!req) return;
    document.getElementById('appPendingId').value = req._id;
    document.getElementById('appInvId').value = "INV-" + Date.now().toString().slice(-6);
    document.getElementById('appAgency').value = req.agency;
    document.getElementById('appTotal').value = req.total;
    document.getElementById('appPaid').value = 0;
    updateDueMath();
    
    const modal = document.getElementById('approveModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('appInvId').focus(); }, 10);
}

function closeApproveModal() {
    const modal = document.getElementById('approveModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function updateDueMath() {
    const total = parseFloat(document.getElementById('appTotal').value) || 0;
    const paid = parseFloat(document.getElementById('appPaid').value) || 0;
    const dueEl = document.getElementById('appDue');
    if(dueEl) dueEl.value = Math.max(0, total - paid);
}
document.getElementById('appTotal')?.addEventListener('input', updateDueMath);
document.getElementById('appPaid')?.addEventListener('input', updateDueMath);

async function submitApproval() {
    const payload = {
        pending_id: document.getElementById('appPendingId').value,
        invoice_no: document.getElementById('appInvId').value,
        agency: document.getElementById('appAgency').value,
        total_amount: parseFloat(document.getElementById('appTotal').value),
        amount_paid: parseFloat(document.getElementById('appPaid').value),
        balance_due: parseFloat(document.getElementById('appDue').value),
        due_date: document.getElementById('appDueDate').value
    };
    if(payload.balance_due > 0 && !payload.due_date) { showToast("Please select a Due Date for the balance.", true); return; }
    try {
        const res = await fetch(`${API_BASE}/approve`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if (res.ok) { showToast("Credit Added to Ledger!"); closeApproveModal(); loadData(); } 
        else { showToast("Failed to save.", true); }
    } catch (e) { showToast("Server error.", true); }
}

// --- 3. Manual Entry ---
function openManualCreditModal() {
    document.getElementById('manInvId').value = "INV-" + Date.now().toString().slice(-6);
    document.getElementById('manAgency').value = '';
    document.getElementById('manDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('manDueDate').value = '';
    document.getElementById('manTotal').value = '';
    document.getElementById('manPaid').value = 0;

    const modal = document.getElementById('manualModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('manInvId').focus(); }, 10);
}

function closeManualModal() {
    const modal = document.getElementById('manualModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function submitManualCredit() {
    const total = parseFloat(document.getElementById('manTotal').value) || 0;
    const paid = parseFloat(document.getElementById('manPaid').value) || 0;
    const payload = {
        invoice_no: document.getElementById('manInvId').value,
        agency: document.getElementById('manAgency').value,
        date: document.getElementById('manDate').value,
        due_date: document.getElementById('manDueDate').value,
        total_amount: total,
        amount_paid: paid,
        balance_due: Math.max(0, total - paid)
    };
    if(payload.balance_due > 0 && !payload.due_date) { showToast("Due Date is required for balances.", true); return; }
    try {
        const res = await fetch(`${API_BASE}/manual`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(res.ok) { showToast("Manual Entry Saved!"); closeManualModal(); loadData(); }
        else { showToast("Error saving entry.", true); }
    } catch(e) { showToast("Server error.", true); }
}

// --- 4. Main Folder Grid & Searches ---
async function fetchGroupedCredits() {
    try {
        const searchTerm = document.getElementById('mainSearch').value.trim();
        let url = `${API_BASE}/?type=${currentTab}`; 
        if (searchTerm) {
            url += `&search=${encodeURIComponent(searchTerm)}`;
        }
        
        const res = await fetch(url);
        allGroupedCredits = await res.json();
        
        if(currentTab === 'supplier') populateDatalist();
        applyMainFiltersAndRender();
    } catch (e) { showToast("Failed to load ledger.", true); }
}

function populateDatalist() {
    const list = document.getElementById('agencyList');
    if(!list) return;
    list.innerHTML = '';
    allGroupedCredits.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.agency;
        list.appendChild(opt);
    });
}

function applyMainFiltersAndRender() {
    const term = document.getElementById('mainSearch').value.toLowerCase().trim();
    const sortVal = document.getElementById('mainSort').value;
    
    let filtered = allGroupedCredits.filter(c => c.agency.toLowerCase().includes(term));
    
    filtered.sort((a, b) => {
        if (sortVal === 'due-desc') return b.total_outstanding - a.total_outstanding;
        if (sortVal === 'name-asc') return a.agency.localeCompare(b.agency);
        return 0;
    });
    renderGrid(filtered);
}

let searchTimeout;
document.getElementById('mainSearch').addEventListener('input', () => {
    clearTimeout(searchTimeout); searchTimeout = setTimeout(fetchGroupedCredits, 300);
});
document.getElementById('mainSort').addEventListener('change', applyMainFiltersAndRender);

function renderGrid(data) {
    const grid = document.getElementById('creditGrid');
    grid.innerHTML = '';
    if(data.length === 0) { grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-10">No folders found.</div>`; return; }

    const icon = currentTab === 'supplier' ? '🏢' : '👥';

    data.forEach(folder => {
        const isClear = folder.total_outstanding <= 0;
        const statusColor = isClear ? 'text-brand-500' : 'text-rose-500';
        const bgHover = isClear ? 'hover:border-brand-400/50' : 'hover:border-rose-400/50';
        const safeId = folder.agency.replace(/[^a-zA-Z0-9]/g, '-');

        let pendingBillsCount = 0;
        if (currentTab === 'supplier') {
            pendingBillsCount = folder.invoices.filter(i => i.due > 0).length;
        } else {
            pendingBillsCount = folder.invoices.filter(i => i.total > 0 && i.due > 0).length;
        }

        const card = document.createElement('div');
        card.className = `bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer group relative ${bgHover}`;
        card.innerHTML = `
            <div class="absolute top-4 right-4 text-left z-10">
                <button class="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900/50 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center font-bold" onclick="toggleDropdown(event, '${safeId}')">⋮</button>
                <div id="dropdown-${safeId}" class="hidden agency-dropdown absolute right-0 mt-2 w-32 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                    ${currentTab === 'supplier' ? `<button class="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 transition-colors flex items-center gap-2" onclick="openEditAgencyModal(event, '${folder.agency}')">✏️ Rename</button>` : ''}
                    <button class="w-full text-left px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex items-center gap-2" onclick="deleteAgencyFolder(event, '${folder.agency}')">🗑️ Delete</button>
                </div>
            </div>
            
            <div class="flex justify-between items-start mb-4">
                <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">${icon}</div>
            </div>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1 truncate pr-8">${folder.agency}</h3>
            <p class="text-sm font-semibold text-slate-500 mb-3">Balance: <span class="${statusColor} font-extrabold text-lg ml-1">${currencyFormatter.format(folder.total_outstanding)}</span></p>
            <span class="text-[10px] font-extrabold uppercase tracking-widest bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-full text-slate-500">${pendingBillsCount} Pending Bills</span>
        `;
        
        card.addEventListener('click', () => openFolder(folder));
        grid.appendChild(card);
    });
}

// --- Folder Actions ---
function openEditAgencyModal(event, oldName) {
    event.stopPropagation();
    closeAllDropdowns();
    document.getElementById('eaOldName').value = oldName;
    document.getElementById('eaNewName').value = oldName;
    const modal = document.getElementById('editAgencyModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('eaNewName').focus(); }, 10);
}

function closeEditAgencyModal() {
    const modal = document.getElementById('editAgencyModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function submitEditAgency() {
    const oldName = document.getElementById('eaOldName').value;
    const newName = document.getElementById('eaNewName').value.trim();
    if(!newName || oldName === newName) { closeEditAgencyModal(); return; }
    
    try {
        const res = await fetch(`${API_BASE}/agency/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ new_name: newName })
        });
        if(res.ok) { showToast("Folder Renamed."); closeEditAgencyModal(); loadData(); }
        else { showToast("Error renaming.", true); }
    } catch(e) { showToast("Server error.", true); }
}

async function deleteAgencyFolder(event, agencyName) {
    event.stopPropagation(); closeAllDropdowns();
    const isConfirmed = await showConfirmModal("Delete Folder", `Permanently delete the folder for ${agencyName} and ALL its records?`);
    if(!isConfirmed) return;

    try {
        const res = await fetch(`${API_BASE}/agency/${encodeURIComponent(agencyName)}?type=${currentTab}`, { method: 'DELETE' });
        if(res.ok) { showToast(`Folder deleted.`); loadData(); } 
        else { showToast("Failed to delete.", true); }
    } catch (e) { showToast("Server error.", true); }
}

// --- 5. Inner Folder View ---
function openFolder(folder) {
    currentOpenFolderData = folder; 
    document.getElementById('folderTitleText').innerText = folder.agency;
    document.getElementById('folderIcon').innerHTML =
  currentTab === 'supplier'
    ? '<img src="static/icons/office-building.png" width="24" height="24">'
    : '<img src="static/icons/customer.png" width="24" height="24">';
    document.getElementById('folderSearch').value = '';
    
    const isZero = folder.total_outstanding <= 0;
    const dueDisplay = document.getElementById('folderTotalDue');
    dueDisplay.innerText = currencyFormatter.format(folder.total_outstanding);
    dueDisplay.className = isZero ? "text-brand-500 text-xl ml-1 font-extrabold" : "text-rose-500 text-xl ml-1 font-extrabold";
    
    const noDuesBadge = document.getElementById('folderNoDuesBadge');
    if (isZero && currentTab === 'supplier') {
        noDuesBadge.classList.remove('hidden');
    } else {
        noDuesBadge.classList.add('hidden');
    }

    const customerActionDiv = document.getElementById('customerActionDiv');
    const customerFolderTabs = document.getElementById('customerFolderTabs');
    const sortDropdown = document.getElementById('folderSort');

    if(currentTab === 'customer') {
        if(customerActionDiv) {
            customerActionDiv.classList.remove('hidden');
            if (isZero) {
                customerActionDiv.innerHTML = `<span class="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 font-extrabold rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-2">✅ No Credits</span>`;
            } else {
                customerActionDiv.innerHTML = `<button onclick="openCustomerPayModal()" class="px-6 py-3 bg-brand-500 text-white font-bold rounded-xl shadow-md hover:bg-brand-600 active:scale-95 transition-all flex items-center gap-2"><span>💳</span> Receive Payment</button>`;
            }
        }
        if(customerFolderTabs) {
            customerFolderTabs.classList.remove('hidden');
            customerFolderTabs.classList.add('flex');
        }
        if(sortDropdown) sortDropdown.classList.add('hidden'); 
        switchFolderTab('invoices'); 
    } else {
        if(customerActionDiv) customerActionDiv.classList.add('hidden');
        if(customerFolderTabs) {
            customerFolderTabs.classList.add('hidden');
            customerFolderTabs.classList.remove('flex');
        }
        if(sortDropdown) {
            sortDropdown.classList.remove('hidden');
            sortDropdown.value = 'date-desc';
        }
        applyFolderFiltersAndRender();
    }

    const modal = document.getElementById('folderModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
}

function closeFolderModal() {
    currentOpenFolderData = null;
    const modal = document.getElementById('folderModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function switchFolderTab(tab) {
    currentFolderTab = tab;
    const act = "bg-white dark:bg-slate-800 text-brand-600 shadow-sm border border-transparent";
    const inact = "bg-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 border-transparent";
    
    const tInv = document.getElementById('fTabInvoices');
    const tPay = document.getElementById('fTabPayments');
    
    if(tInv) tInv.className = `px-6 py-2 rounded-lg text-xs font-bold transition-all ${tab==='invoices'?act:inact}`;
    if(tPay) tPay.className = `px-6 py-2 rounded-lg text-xs font-bold transition-all ${tab==='payments'?act:inact}`;
    
    applyFolderFiltersAndRender();
}

function applyFolderFiltersAndRender() {
    if(!currentOpenFolderData) return;

    if(currentTab === 'customer' && currentFolderTab === 'payments') {
        renderCustomerPayments();
        return;
    }

    const term = document.getElementById('folderSearch').value.toLowerCase().trim();
    const sortVal = document.getElementById('folderSort') ? document.getElementById('folderSort').value : 'date-desc';
    
    let filtered = currentOpenFolderData.invoices.filter(inv => inv.id.toLowerCase().includes(term));
    
    filtered.sort((a, b) => {
        if(sortVal === 'due-desc') return b.due - a.due;
        if(sortVal === 'date-desc') {
            const dA = new Date(a.date).getTime() || 0; 
            const dB = new Date(b.date).getTime() || 0;
            return dB - dA;
        }
        return 0;
    });
    renderFolderTable(filtered);
}

document.getElementById('folderSearch').addEventListener('input', applyFolderFiltersAndRender);
if(document.getElementById('folderSort')) {
    document.getElementById('folderSort').addEventListener('change', applyFolderFiltersAndRender);
}

function renderFolderTable(invoices) {
    const thead = document.getElementById('folderTableHead');
    const tbody = document.getElementById('folderTableBody');
    tbody.innerHTML = '';
    
    if(currentTab === 'supplier') {
        thead.innerHTML = `
            <tr class="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                <th class="px-6 py-4 w-12 text-center">#</th>
                <th class="px-6 py-4">Invoice #</th><th class="px-6 py-4 text-center">Date</th>
                <th class="px-6 py-4 text-right">Total Bill</th><th class="px-6 py-4 text-right">Paid</th>
                <th class="px-6 py-4 text-right text-rose-500">Balance</th><th class="px-6 py-4 text-center">Due Date</th>
                <th class="px-6 py-4 text-center">Actions</th>
            </tr>`;
    } else {
        thead.innerHTML = `
            <tr class="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                <th class="px-6 py-4 w-12 text-center">#</th>
                <th class="px-6 py-4">Invoice #</th><th class="px-6 py-4 text-center">Date</th>
                <th class="px-6 py-4 text-right">Added to Balance</th><th class="px-6 py-4 text-center">Due Date</th>
                <th class="px-6 py-4 text-center">Actions</th>
            </tr>`;
    }

    if(invoices.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-500 py-10">No records match your search.</td></tr>`; 
        return; 
    }

    let displayIndex = 1;
    invoices.forEach((inv) => {
        const safeInvStr = JSON.stringify(inv).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        if (currentTab === 'supplier') {
            const isClear = inv.due <= 0;
            const dueColor = isClear ? 'text-slate-400' : 'text-rose-500 font-extrabold';
            
            const payBtnHtml = isClear 
                ? `<span class="text-[10px] font-extrabold text-brand-600 bg-brand-100 dark:bg-brand-900/30 border border-brand-200 dark:border-brand-800 px-3 py-1.5 rounded-lg flex items-center justify-center">NO DUES</span>`
                : `<button class="btn-action border-brand-200 text-brand-600 bg-brand-50 hover:bg-brand-500 hover:text-white" onclick="openPayModal('${inv._id}', '${inv.id}')" title="Pay"><span>💳</span> Pay</button>`;
            
            const actionBtn = `
                <div class="flex justify-center items-center gap-2">
                    ${payBtnHtml}
                    <button class="btn-action border-slate-200 text-slate-600 bg-slate-50 hover:bg-slate-200" onclick="openEditBillModal(${safeInvStr})" title="Edit"><span>✏️</span></button>
                    <button class="btn-action border-sky-200 text-sky-600 bg-sky-50 hover:bg-sky-500 hover:text-white" onclick="openHistoryModal(${safeInvStr})" title="History"><span>🕒</span></button>
                </div>
            `;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                    <td class="px-6 py-5 text-center text-slate-400 font-bold">${displayIndex++}</td>
                    <td class="px-6 py-5 font-bold text-slate-800 dark:text-white">${inv.id}</td>
                    <td class="px-6 py-5 text-center text-slate-500 font-medium">${inv.date}</td>
                    <td class="px-6 py-5 text-right font-bold text-slate-600 dark:text-slate-400">${currencyFormatter.format(inv.total)}</td>
                    <td class="px-6 py-5 text-right font-bold text-brand-600 dark:text-brand-400">${currencyFormatter.format(inv.paid)}</td>
                    <td class="px-6 py-5 text-right ${dueColor}">${currencyFormatter.format(inv.due)}</td>
                    <td class="px-6 py-5 text-center text-slate-500 font-medium">${inv.due_date}</td>
                    <td class="px-6 py-5 text-center">${actionBtn}</td>
                </tr>
            `;
        } else {
            if(inv.total > 0) {
                const actionBtn = `
                    <div class="flex justify-center gap-2">
                        <button class="btn-action border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white" onclick="deleteLedgerInvoice('${inv._id}')" title="Delete Invoice Record"><span>🗑️</span></button>
                    </div>`;

                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                        <td class="px-6 py-5 text-center text-slate-400 font-bold">${displayIndex++}</td>
                        <td class="px-6 py-5 font-bold text-slate-800 dark:text-white">${inv.id}</td>
                        <td class="px-6 py-5 text-center text-slate-500 font-medium">${inv.date}</td>
                        <td class="px-6 py-5 text-right font-bold text-rose-500">${currencyFormatter.format(inv.total)}</td>
                        <td class="px-6 py-5 text-center text-slate-500 font-medium">${inv.due_date}</td>
                        <td class="px-6 py-5 text-center">${actionBtn}</td>
                    </tr>`;
            }
        }
    });
}

function renderCustomerPayments() {
    const thead = document.getElementById('folderTableHead');
    const tbody = document.getElementById('folderTableBody');
    tbody.innerHTML = '';
    
    thead.innerHTML = `
        <tr class="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            <th class="px-6 py-4 w-12 text-center">#</th>
            <th class="px-6 py-4">Date</th>
            <th class="px-6 py-4 text-center">Time</th>
            <th class="px-6 py-4 text-right">Amount Received</th>
            <th class="px-6 py-4 text-center">Actions</th>
        </tr>`;

    let allPayments = [];
    currentOpenFolderData.invoices.forEach(inv => {
        if(inv.payment_history) {
            inv.payment_history.forEach(p => {
                allPayments.push({...p, parent_id: inv._id});
            });
        }
    });

    if(allPayments.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-slate-500 py-10">No payment history found.</td></tr>`; 
        return; 
    }

    allPayments.sort((a,b) => {
        const dA = new Date(a.date + " " + (a.time||"00:00")).getTime();
        const dB = new Date(b.date + " " + (b.time||"00:00")).getTime();
        return dB - dA; // Newest first
    });

    let displayIndex = 1;
    allPayments.forEach(p => {
        const actionBtn = `
            <div class="flex justify-center gap-2">
                <button class="btn-action border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white" onclick="deleteCustomerPayment('${p.parent_id}', '${p.amount}', '${p.date}', '${p.time||''}')" title="Delete Payment Record"><span>🗑️</span></button>
            </div>`;
            
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                <td class="px-6 py-5 text-center text-slate-400 font-bold">${displayIndex++}</td>
                <td class="px-6 py-5 font-bold text-slate-800 dark:text-white">${p.date}</td>
                <td class="px-6 py-5 text-center text-slate-500 font-medium">${p.time || '-'}</td>
                <td class="px-6 py-5 text-right font-extrabold text-brand-600">${currencyFormatter.format(p.amount)}</td>
                <td class="px-6 py-5 text-center">${actionBtn}</td>
            </tr>`;
    });
}

function openCustomerPayModal() {
    document.getElementById('cpCustomerLabel').innerText = currentOpenFolderData.agency;
    
    const now = new Date();
    document.getElementById('cpDate').value = now.toISOString().split('T')[0];
    document.getElementById('cpTime').value = now.toTimeString().slice(0,5);
    document.getElementById('cpAmount').value = '';

    const modal = document.getElementById('customerPayModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('cpAmount').focus(); }, 10);
}

function closeCustomerPayModal() {
    const modal = document.getElementById('customerPayModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function submitCustomerPayment() {
    const amount = parseFloat(document.getElementById('cpAmount').value) || 0;
    if(amount <= 0) { showToast("Enter valid amount.", true); return; }
    
    const payload = {
        amount: amount,
        date: document.getElementById('cpDate').value,
        time: document.getElementById('cpTime').value,
        customer_name: currentOpenFolderData.agency
    };

    try {
        const res = await fetch(`${API_BASE}/customer/pay`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(res.ok) { 
            showToast("Payment recorded!"); 
            closeCustomerPayModal(); 
            await fetchGroupedCredits();
            openFolder(allGroupedCredits.find(c=>c.agency===payload.customer_name));
        } else { 
            showToast("Error recording payment.", true); 
        }
    } catch(e) { showToast("Server error.", true); }
}

async function deleteCustomerPayment(invoiceId, amount, date, time) {
    const isConfirmed = await showConfirmModal("Delete Payment", "Are you sure you want to delete this payment record? The balance will be adjusted.");
    if(!isConfirmed) return;

    try {
        const res = await fetch(`${API_BASE}/ledger/payment`, { 
            method: 'DELETE', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ invoice_id: invoiceId, amount: parseFloat(amount), date: date, time: time }) 
        });
        if(res.ok) { 
            showToast("Payment deleted."); 
            await fetchGroupedCredits();
            openFolder(allGroupedCredits.find(c=>c.agency===currentOpenFolderData.agency));
        } else { showToast("Failed to delete.", true); }
    } catch(e) { showToast("Server error.", true); }
}

async function deleteLedgerInvoice(id) {
    const isConfirmed = await showConfirmModal("Delete Invoice", "Are you sure you want to delete this invoice record? The total balance will be adjusted.");
    if(!isConfirmed) return;

    try {
        const res = await fetch(`${API_BASE}/ledger/${id}`, { method: 'DELETE' });
        if(res.ok) {
            showToast("Invoice deleted.");
            await fetchGroupedCredits();
            const refreshedFolder = allGroupedCredits.find(c => c.agency === currentOpenFolderData.agency);
            if(refreshedFolder) openFolder(refreshedFolder); else closeFolderModal();
        } else { showToast("Failed to delete.", true); }
    } catch (e) { showToast("Server error.", true); }
}

// --- 6. Pay / Edit / History Modals (SUPPLIER ONLY) ---
function openPayModal(dbId, invoiceNo) {
    document.getElementById('payInvId').value = dbId;
    document.getElementById('payInvLabel').innerText = invoiceNo;
    
    const now = new Date();
    document.getElementById('payDate').value = now.toISOString().split('T')[0];
    document.getElementById('payTime').value = now.toTimeString().slice(0,5);
    document.getElementById('payAmount').value = '';

    const modal = document.getElementById('payBillModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('payAmount').focus(); }, 10);
}

function closePayModal() {
    const modal = document.getElementById('payBillModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function submitPayment() {
    const id = document.getElementById('payInvId').value;
    const payload = {
        amount: parseFloat(document.getElementById('payAmount').value) || 0,
        date: document.getElementById('payDate').value,
        time: document.getElementById('payTime').value
    };
    if(payload.amount <= 0) { showToast("Enter a valid amount.", true); return; }

    try {
        const res = await fetch(`${API_BASE}/ledger/${id}/pay`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(res.ok) { 
            showToast("Payment recorded!"); 
            closePayModal(); 
            await fetchGroupedCredits();
            openFolder(allGroupedCredits.find(c=>c.agency===currentOpenFolderData.agency));
        } else { showToast("Error recording payment.", true); }
    } catch(e) { showToast("Server error.", true); }
}

function openEditBillModal(inv) {
    document.getElementById('ebInvId').value = inv._id;
    document.getElementById('ebTotal').value = inv.total;
    document.getElementById('ebAgency').value = currentOpenFolderData.agency;
    document.getElementById('ebDate').value = inv.date;
    document.getElementById('ebDueDate').value = inv.due_date !== '-' ? inv.due_date : '';

    const modal = document.getElementById('editBillModal');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.firstElementChild.classList.replace('scale-95', 'scale-100'); document.getElementById('ebTotal').focus(); }, 10);
}

function closeEditBillModal() {
    const modal = document.getElementById('editBillModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

async function submitEditBill() {
    const id = document.getElementById('ebInvId').value;
    const payload = {
        total: parseFloat(document.getElementById('ebTotal').value) || 0,
        agency: document.getElementById('ebAgency').value,
        date: document.getElementById('ebDate').value,
        due_date: document.getElementById('ebDueDate').value
    };
    try {
        const res = await fetch(`${API_BASE}/ledger/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(res.ok) { 
            showToast("Invoice Updated!"); 
            closeEditBillModal(); 
            await fetchGroupedCredits();
            openFolder(allGroupedCredits.find(c=>c.agency===payload.agency));
        } else { showToast("Error updating invoice.", true); }
    } catch(e) { showToast("Server error.", true); }
}

function openHistoryModal(inv) {
    const tbody = document.getElementById('bhTableBody');
    tbody.innerHTML = '';
    
    if(!inv.payment_history || inv.payment_history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="text-center py-6 text-slate-500">No payment history found.</td></tr>`;
    } else {
        [...inv.payment_history].reverse().forEach(p => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td class="py-3 px-4 text-slate-500 font-medium">${p.date} at ${p.time}</td>
                    <td class="py-3 px-4 text-right font-extrabold text-brand-600">${currencyFormatter.format(p.amount)}</td>
                </tr>`;
        });
    }

    const modal = document.getElementById('historyModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}