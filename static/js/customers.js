const API_BASE_URL = '/api/customers';
const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

let allCustomers = [];
// Variable to keep track of the currently open dropdown
let activeDropdownId = null;

// --- DYNAMIC AGE CALCULATION LOGIC (FIXED) ---
function calculateCustomerAge(createdAtStr) {
    if (!createdAtStr) return { text: "Legacy", status: "legacy" };
    
    const createdDate = new Date(createdAtStr.replace(' ', 'T'));
    const now = new Date();
    const diffTime = Math.abs(now - createdDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return { text: "Added Today", status: "new" };
    if (diffDays <= 15) return { text: `${diffDays} days`, status: "new" };
    
    // FIX: Show exact days for 16-29 days
    if (diffDays < 30) return { text: `${diffDays} days`, status: "regular" }; 
    
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return { text: `${diffMonths} mon`, status: "regular" };
    
    const diffYears = Math.floor(diffMonths / 12);
    const leftoverMonths = diffMonths % 12;
    return { text: leftoverMonths > 0 ? `${diffYears}y ${leftoverMonths}m` : `${diffYears} years`, status: "regular" };
}

async function loadCustomers() {
    try {
        const res = await fetch(`${API_BASE_URL}/`);
        allCustomers = await res.json();
        applyFiltersAndRender(); 
    } catch (error) {
        console.error("Failed to load customers", error);
    }
}

// --- MASTER RENDER FUNCTION (REVERTED EDIT BUTTON THEME) ---
function renderCustomerTable(data) {
    const tbody = document.getElementById('customerTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-500 font-medium">No customers found matching your criteria.</td></tr>`;
        return;
    }

    data.forEach((cust, index) => {
        const ageData = calculateCustomerAge(cust.created_at);
        
        // Glowing dot ONLY for brand new customers
        const newBadge = ageData.status === "new" 
            ? `<span class="inline-flex w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_8px_#10b981] ml-2" title="New Customer!"></span>` 
            : '';

        // Pill badge styling
        let tenureBadgeClass = '';
        if (ageData.status === "new") {
            tenureBadgeClass = 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400';
        } else if (ageData.status === "regular") {
            tenureBadgeClass = 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400'; // Light Pale Blue
        } else {
            tenureBadgeClass = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
        }

        const dropdownId = `dropdown-${index}`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group border-b border-slate-100 dark:border-slate-800/50";
        tr.innerHTML = `
            <td class="px-6 py-4 font-extrabold text-slate-800 dark:text-white flex items-center">${cust.name} ${newBadge}</td>
            <td class="px-6 py-4 text-slate-600 dark:text-slate-300 font-semibold">${cust.phone}</td>
            <td class="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">${cust.area || '-'}</td>
            <td class="px-6 py-4 text-center">
                <span class="px-3 py-1 rounded-full text-xs font-bold ${tenureBadgeClass}">${ageData.text}</span>
            </td>
            <td class="px-6 py-4 text-right font-extrabold text-blue-600 dark:text-blue-400 text-lg">${currencyFormatter.format(cust.total_purchased || 0)}</td>
            <td class="px-6 py-4 text-center relative">
                <button class="menu-trigger-btn p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-dropdown="${dropdownId}">
                    <svg class="w-5 h-5 pointer-events-none" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                </button>
                
                <div id="${dropdownId}" class="dropdown-menu hidden absolute right-8 top-10 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50 transform origin-top-right transition-all">
                    <button class="view-history-btn w-full text-left px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2"><span>🧾</span> View Bills</button>
                    <button class="edit-cust-btn w-full text-left px-4 py-2 text-sm font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex items-center gap-2"><span>✏️</span> Edit</button>
                    <div class="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>
                    <button class="delete-cust-btn w-full text-left px-4 py-2 text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2"><span>🗑️</span> Delete</button>
                </div>
            </td>
        `;

        // Event Listeners for the dropdown actions
        tr.querySelector('.view-history-btn').addEventListener('click', (e) => { e.stopPropagation(); closeAllDropdowns(); viewHistory(cust); });
        tr.querySelector('.edit-cust-btn').addEventListener('click', (e) => { e.stopPropagation(); closeAllDropdowns(); openEditCustomerModal(cust); });
        tr.querySelector('.delete-cust-btn').addEventListener('click', (e) => { e.stopPropagation(); closeAllDropdowns(); deleteCustomer(cust.phone, cust.name); });
        
        // Toggle this specific dropdown
        tr.querySelector('.menu-trigger-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById(dropdownId);
            const isHidden = dropdown.classList.contains('hidden');
            closeAllDropdowns();
            if (isHidden) {
                dropdown.classList.remove('hidden');
                activeDropdownId = dropdownId;
            }
        });

        tbody.appendChild(tr);
    });
}

// Helper to close dropdowns when clicking outside
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.add('hidden');
    });
    activeDropdownId = null;
}
document.addEventListener('click', closeAllDropdowns);


function applyFiltersAndRender() {
    const searchTerm = document.getElementById('crmSearchInput').value.toLowerCase().trim();
    const sortVal = document.getElementById('crmSortSelect').value;
    const filterVal = document.getElementById('crmFilterSelect').value;

    let processed = allCustomers.filter(c => 
        c.name.toLowerCase().includes(searchTerm) || 
        c.phone.includes(searchTerm) || 
        (c.area && c.area.toLowerCase().includes(searchTerm))
    );

    // Apply Filter Dropdown logic
    if (filterVal === 'new') {
        processed = processed.filter(c => calculateCustomerAge(c.created_at).status === "new");
    } else if (filterVal === 'regular') {
        processed = processed.filter(c => calculateCustomerAge(c.created_at).status === "regular");
    }

    processed.sort((a, b) => {
        if (sortVal === 'value-desc') {
            return (b.total_purchased || 0) - (a.total_purchased || 0);
        } else if (sortVal === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else {
            const dateA = a.created_at ? new Date(a.created_at.replace(' ', 'T')).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at.replace(' ', 'T')).getTime() : 0;
            return sortVal === 'newest' ? dateB - dateA : dateA - dateB;
        }
    });

    if (filterVal === 'top5') {
        processed = processed.slice(0, 5);
    }

    renderCustomerTable(processed);
}

document.getElementById('crmSearchInput').addEventListener('input', applyFiltersAndRender);
document.getElementById('crmSortSelect').addEventListener('change', applyFiltersAndRender);
document.getElementById('crmFilterSelect').addEventListener('change', applyFiltersAndRender);

// --- ADD NEW CUSTOMER MODAL LOGIC ---
function openCrmAddModal() {
    const modal = document.getElementById('newCustomerModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
    
    document.getElementById('ncName').value = '';
    document.getElementById('ncPhone').value = '';
    document.getElementById('ncArea').value = '';
    setTimeout(() => document.getElementById('ncName').focus(), 50);
}

function closeCrmAddModal() {
    const modal = document.getElementById('newCustomerModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

document.getElementById('ncCancelBtn').addEventListener('click', closeCrmAddModal);
document.getElementById('ncCancelX').addEventListener('click', closeCrmAddModal);

const ncInputs = ['ncName', 'ncPhone', 'ncArea'];
ncInputs.forEach((id, index) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (index < ncInputs.length - 1) {
                document.getElementById(ncInputs[index + 1]).focus();
            } else {
                document.getElementById('ncSaveBtn').click(); 
            }
        }
    });
});

document.getElementById('ncCountryCode').addEventListener('change', (e) => {
    const maxDigits = e.target.options[e.target.selectedIndex].getAttribute('data-max');
    const phoneInput = document.getElementById('ncPhone');
    phoneInput.setAttribute('maxlength', maxDigits);
    phoneInput.value = phoneInput.value.slice(0, maxDigits); 
});

document.getElementById('ncSaveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('ncSaveBtn');
    btn.disabled = true;
    btn.textContent = "Saving...";

    const rawPhone = `${document.getElementById('ncCountryCode').value} ${document.getElementById('ncPhone').value.trim()}`;
    const payload = {
        phone: rawPhone,
        name: document.getElementById('ncName').value.trim(),
        area: document.getElementById('ncArea').value.trim()
    };

    try {
        const res = await fetch('/api/customers/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            closeCrmAddModal();
            // Updated toast message
            showToast("Customer saved");
            await loadCustomers(); 
            
            // NOTE: The frontend WhatsApp redirect logic has been completely removed.
            // Messages are now handled silently by the Python backend!
            
        } else {
            showToast(data.error, true);
        }
    } catch (error) {
        showToast("Failed to save customer.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Customer";
    }
});

// --- EDIT CUSTOMER LOGIC ---
function openEditCustomerModal(cust) {
    const modal = document.getElementById('editCustomerModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.firstElementChild.classList.replace('scale-95', 'scale-100'), 10);
    
    // Split the existing phone number into code and number
    let phoneCode = '+91';
    let phoneNum = cust.phone;
    if(cust.phone.includes(' ')) {
        const parts = cust.phone.split(' ');
        phoneCode = parts[0];
        phoneNum = parts[1];
    }
    
    document.getElementById('editCustPhoneOriginal').value = cust.phone;
    document.getElementById('editCustName').value = cust.name;
    document.getElementById('editCustCountryCode').value = phoneCode;
    document.getElementById('editCustPhone').value = phoneNum;
    document.getElementById('editCustArea').value = cust.area || '';
}

function closeEditCustomerModal() {
    const modal = document.getElementById('editCustomerModal');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

document.getElementById('editCustCancelBtn').addEventListener('click', closeEditCustomerModal);

document.getElementById('editCustSaveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('editCustSaveBtn');
    btn.disabled = true;
    btn.textContent = "Saving...";

    const originalPhone = document.getElementById('editCustPhoneOriginal').value;
    const newPhone = `${document.getElementById('editCustCountryCode').value} ${document.getElementById('editCustPhone').value.trim()}`;
    const payload = {
        original_phone: originalPhone,
        new_phone: newPhone,
        name: document.getElementById('editCustName').value.trim(),
        area: document.getElementById('editCustArea').value.trim()
    };

    try {
        const res = await fetch('/api/customers/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeEditCustomerModal();
            showToast("Customer updated successfully!");
            await loadCustomers(); 
        } else {
            const data = await res.json();
            showToast(data.error || "Failed to update.", true);
        }
    } catch (error) {
        showToast("Server error.", true);
    } finally {
        btn.disabled = false;
        btn.textContent = "Save Changes";
    }
});

// --- DELETE CUSTOMER LOGIC ---
async function deleteCustomer(phone, name) {
    if(!confirm(`Are you sure you want to permanently delete "${name}"? This action cannot be undone.`)) return;

    try {
        const res = await fetch('/api/customers/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone })
        });
        
        if (res.ok) {
            showToast("Customer deleted successfully.");
            await loadCustomers(); 
        } else {
            const data = await res.json();
            showToast(data.error || "Failed to delete.", true);
        }
    } catch (error) {
        showToast("Server error.", true);
    }
}


// --- HISTORY VIEW MODAL (Tailwind Styled) ---
function viewHistory(cust) {
    document.getElementById('historyModalTitle').textContent = `${cust.name} - Purchases`;
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    if (!cust.history || cust.history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-8 text-slate-500">No purchases found.</td></tr>`;
    } else {
        [...cust.history].reverse().forEach(record => {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td class="py-4 px-4 text-slate-500 dark:text-slate-400 font-medium">${record.date}</td>
                    <td class="py-4 px-4 text-center font-bold text-slate-800 dark:text-white">${record.invoice_no}</td>
                    <td class="py-4 px-4 text-right text-brand-600 dark:text-brand-400 font-extrabold">${currencyFormatter.format(record.amount)}</td>
                </tr>
            `;
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

document.getElementById('closeHistoryBtn').addEventListener('click', closeHistoryModal);

// Sleek Toast Notifications
function showToast(message, isError = false) {
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

// Initialize
document.addEventListener('DOMContentLoaded', loadCustomers);