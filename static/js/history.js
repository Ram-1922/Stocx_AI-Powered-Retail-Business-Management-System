const API_BASE = '/api/history';
let currentTab = 'agency';
let currentData = [];
const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

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

// Load data based on active tab
async function loadData() {
    try {
        const res = await fetch(`${API_BASE}/${currentTab}`);
        currentData = await res.json();
        applyFiltersAndRender();
    } catch (error) {
        showToast("Failed to load history.", true);
    }
}

// Tab Switcher (Updates Tailwind Classes dynamically)
function switchTab(tabName) {
    currentTab = tabName;
    const tabAgency = document.getElementById('tabAgency');
    const tabPos = document.getElementById('tabPos');
    
    const activeClass = "bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm";
    const inactiveClass = "bg-transparent text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 border-transparent";
    
    if (tabName === 'agency') {
        tabAgency.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all border border-transparent ${activeClass}`;
        tabPos.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all border border-transparent ${inactiveClass}`;
    } else {
        tabPos.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all border border-transparent ${activeClass}`;
        tabAgency.className = `px-6 py-2.5 rounded-xl text-sm font-bold transition-all border border-transparent ${inactiveClass}`;
    }
    
    document.getElementById('historySearch').value = ''; // Reset search
    loadData();
}

// Render Logic
function applyFiltersAndRender() {
    const searchTerm = document.getElementById('historySearch').value.toLowerCase().trim();
    const sortVal = document.getElementById('historySort').value;

    // Filter
    let processed = currentData.filter(item => {
        if (currentTab === 'agency') {
            return item.agency_name.toLowerCase().includes(searchTerm) || item.date.includes(searchTerm);
        } else {
            return item.customer_name.toLowerCase().includes(searchTerm) || item.invoice_no.toLowerCase().includes(searchTerm) || item.date.includes(searchTerm);
        }
    });

    // Sort
    processed.sort((a, b) => {
        const dateA = new Date(a.date.replace(' ', 'T')).getTime();
        const dateB = new Date(b.date.replace(' ', 'T')).getTime();
        return sortVal === 'newest' ? dateB - dateA : dateA - dateB;
    });

    renderTable(processed);
}

// Dynamic Table Generation using Tailwind
function renderTable(data) {
    const thead = document.getElementById('historyTableHead');
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    const theadClass = "text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900";

    if (currentTab === 'agency') {
        thead.innerHTML = `
            <tr class="${theadClass}">
                <th class="px-6 py-5 rounded-tl-xl">Date Uploaded</th>
                <th class="px-6 py-5">Agency / Supplier</th>
                <th class="px-6 py-5 text-center">Invoice Photo</th>
                <th class="px-6 py-5 text-right rounded-tr-xl">Action</th>
            </tr>`;
        
        data.forEach(item => {
            const photoHtml = item.photo_url 
                ? `<img src="${item.photo_url}" class="w-12 h-12 object-cover rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700 hover:scale-110 transition-transform mx-auto shadow-sm" onclick="viewPhoto('${item.photo_url}')" title="Click to view">` 
                : `<span class="text-slate-400 dark:text-slate-600 text-xs font-bold bg-slate-100 dark:bg-slate-800/50 px-3 py-1 rounded-full">No Photo</span>`;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group border-b border-slate-100 dark:border-slate-800/50">
                    <td class="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">${item.date}</td>
                    <td class="px-6 py-4 font-extrabold text-slate-800 dark:text-white">${item.agency_name}</td>
                    <td class="px-6 py-4 text-center">${photoHtml}</td>
                    <td class="px-6 py-4 text-right">
                        <button class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400 transition-all text-xs font-bold shadow-sm active:scale-95" onclick="deleteRecord('${item._id}')">🗑️ Delete</button>
                    </td>
                </tr>`;
        });
    } else { // This is the POS tab logic
        thead.innerHTML = `
            <tr class="${theadClass}">
                <th class="px-6 py-5 rounded-tl-xl">Date of Sale</th>
                <th class="px-6 py-5">Invoice No</th>
                <th class="px-6 py-5">Customer Name</th>
                <th class="px-6 py-5 text-center">Receipt Photo</th> <th class="px-6 py-5 text-right">Total Amount</th>
                <th class="px-6 py-5 text-right rounded-tr-xl">Action</th>
            </tr>`;
        
        data.forEach(item => {
            // Use the exact same photo logic as the Agency tab
            const photoHtml = item.photo_url 
                ? `<img src="${item.photo_url}" class="w-12 h-12 object-cover rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700 hover:scale-110 transition-transform mx-auto shadow-sm" onclick="viewPhoto('${item.photo_url}')" title="Click to view">` 
                : `<span class="text-slate-400 dark:text-slate-600 text-xs font-bold bg-slate-100 dark:bg-slate-800/50 px-3 py-1 rounded-full">No Photo</span>`;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group border-b border-slate-100 dark:border-slate-800/50">
                    <td class="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">${item.date}</td>
                    <td class="px-6 py-4 font-bold text-brand-600 dark:text-brand-400 tracking-wide">${item.invoice_no}</td>
                    <td class="px-6 py-4 font-extrabold text-slate-800 dark:text-white">${item.customer_name}</td>
                    <td class="px-6 py-4 text-center">${photoHtml}</td> <td class="px-6 py-4 text-right font-extrabold text-blue-600 dark:text-blue-400 text-lg">${currencyFormatter.format(item.total_amount)}</td>
                    <td class="px-6 py-4 text-right">
                        <button class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400 transition-all text-xs font-bold shadow-sm active:scale-95" onclick="deleteRecord('${item._id}')">🗑️ Delete</button>
                    </td>
                </tr>`;
        });
    }

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500 font-medium">No records found matching your criteria.</td></tr>`;
    }
}

// Delete Logic
async function deleteRecord(id) {
    if(!confirm("Are you sure you want to delete this record? This cannot be undone.")) return;
    
    try {
        const res = await fetch(`${API_BASE}/${currentTab}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Record deleted successfully.");
            loadData();
        } else {
            showToast("Error deleting record.", true);
        }
    } catch (e) {
        showToast("Server error.", true);
    }
}

// Image Viewer Modal Logic
function viewPhoto(url) {
    const modal = document.getElementById('imageViewerModal');
    const content = document.getElementById('viewerContent');
    document.getElementById('viewerImage').src = url;
    
    modal.classList.remove('hidden');
    // Tiny delay to allow CSS block transition to kick in
    setTimeout(() => {
        modal.classList.replace('opacity-0', 'opacity-100');
        content.classList.replace('scale-95', 'scale-100');
    }, 10);
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    const content = document.getElementById('viewerContent');
    
    modal.classList.replace('opacity-100', 'opacity-0');
    content.classList.replace('scale-100', 'scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('viewerImage').src = ''; // clear image memory
    }, 300);
}

// Event Listeners
document.getElementById('historySearch').addEventListener('input', applyFiltersAndRender);
document.getElementById('historySort').addEventListener('change', applyFiltersAndRender);

// Init
document.addEventListener('DOMContentLoaded', loadData);