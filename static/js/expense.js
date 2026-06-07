const API_BASE_URL = '/api/expense';
const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

let revChartInstance = null;
let profitChartInstance = null;
let currentChartData = null;

async function loadStats(range = 'past_month', start = '', end = '') {
    try {
        let url = `${API_BASE_URL}/stats?range=${range}`;
        if (range === 'custom') url += `&start=${start}&end=${end}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load stats');
        
        const data = await res.json();
        populateMetrics(data.metrics);
        populateTables(data.lists);
        
        currentChartData = data.charts;
        renderCharts();

    } catch (error) {
        console.error("Error loading stats:", error);
    }
}

function populateMetrics(m) {
    // 1. P&L Header
    document.getElementById('netProfitStat').textContent = currencyFormatter.format(m.net_profit);
    document.getElementById('grossProfitStat').textContent = currencyFormatter.format(m.gross_profit);
    document.getElementById('expiryLossStat').textContent = currencyFormatter.format(m.expiry_loss);
    
    const npElem = document.getElementById('netProfitStat');
    if(m.net_profit < 0) {
        npElem.classList.replace('text-slate-800', 'text-rose-500');
        npElem.classList.replace('dark:text-white', 'dark:text-rose-400');
    } else {
        npElem.classList.replace('text-rose-500', 'text-slate-800');
        npElem.classList.replace('dark:text-rose-400', 'dark:text-white');
    }

    // 2. Main Metric Cards
    document.getElementById('salesRevenueStat').textContent = currencyFormatter.format(m.sales_revenue);
    document.getElementById('purchasesStat').textContent = currencyFormatter.format(m.total_purchase_cost);
    document.getElementById('invValueStat').textContent = currencyFormatter.format(m.remaining_inventory_value);

    // 3. Counter & Ledger Cards
    document.getElementById('salesCountStat').textContent = m.sales_count;
    document.getElementById('invoicesCountStat').textContent = m.invoices_uploaded;
    document.getElementById('totalCustomersStat').textContent = m.total_customers;
    document.getElementById('newCustomersStat').textContent = m.new_customers;
    
    document.getElementById('supplierDuesStat').textContent = currencyFormatter.format(m.agency_dues_value);
    document.getElementById('customerDuesStat').textContent = currencyFormatter.format(m.customer_dues_value);
    document.getElementById('custDuesCount').textContent = `From ${m.customers_with_dues} people`;
}

function populateTables(lists) {
    const topBody = document.getElementById('top10Body');
    const leastBody = document.getElementById('least10Body');
    
    topBody.innerHTML = '';
    leastBody.innerHTML = '';

    if (lists.top_10.length === 0) {
        topBody.innerHTML = `<tr><td colspan="2" class="py-4 text-slate-500 text-xs text-center">No sales in this period.</td></tr>`;
    } else {
        lists.top_10.forEach(p => {
            topBody.innerHTML += `<tr><td class="py-2 text-slate-700 dark:text-slate-300 truncate max-w-[200px]">${p.name}</td><td class="py-2 text-right text-emerald-600 font-bold">${p.qty}</td></tr>`;
        });
    }

    if (lists.least_10.length === 0) {
        leastBody.innerHTML = `<tr><td colspan="2" class="py-4 text-slate-500 text-xs text-center">No inventory found.</td></tr>`;
    } else {
        lists.least_10.forEach(p => {
            leastBody.innerHTML += `<tr><td class="py-2 text-slate-700 dark:text-slate-300 truncate max-w-[200px]">${p.name}</td><td class="py-2 text-right text-rose-500 font-bold">${p.qty}</td></tr>`;
        });
    }
}

function renderCharts() {
    if (!currentChartData) return;
    
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b'; 
    const gridColor = isDark ? '#334155' : '#e2e8f0'; 
    
    const d = currentChartData;

    const commonOptions = {
        chart: { fontFamily: 'Inter, sans-serif', toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: { categories: d.dates, labels: { style: { colors: textColor }, datetimeFormatter: { year: 'yyyy', month: 'MMM \'yy', day: 'dd MMM', hour: 'HH:mm' } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { colors: textColor }, formatter: (value) => { return '₹' + value.toLocaleString('en-IN', {maximumFractionDigits: 0}); } } },
        grid: { borderColor: gridColor, strokeDashArray: 4, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
        tooltip: { theme: isDark ? 'dark' : 'light', y: { formatter: function (val) { return currencyFormatter.format(val); } } },
        legend: { position: 'top', horizontalAlign: 'right', labels: { colors: textColor } }
    };

    // 1. REVENUE VS STOCK UPLOADED CHART (Green vs Pale Blue)
    const revOptions = {
        ...commonOptions,
        series: [
            { name: 'Revenue', data: d.revenue },
            { name: 'Stock Uploaded', data: d.cost }
        ],
        chart: { ...commonOptions.chart, type: 'area', height: 320 },
        colors: ['#10b981', '#0ea5e9'], // Emerald Green & Sky Blue
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } }
    };

    if (revChartInstance) revChartInstance.destroy();
    revChartInstance = new ApexCharts(document.querySelector("#revenueChart"), revOptions);
    revChartInstance.render();

    // 2. NET PROFIT CHART
    const profitOptions = {
        ...commonOptions,
        series: [{ name: 'Net Profit', data: d.profit }],
        chart: { ...commonOptions.chart, type: 'bar', height: 320 },
        colors: ['#10b981'],
        plotOptions: {
            bar: { colors: { ranges: [{ from: -999999999, to: -0.01, color: '#f43f5e' }, { from: 0, to: 999999999, color: '#10b981' }] }, borderRadius: 4, columnWidth: '60%' }
        },
        stroke: { show: false }
    };

    if (profitChartInstance) profitChartInstance.destroy();
    profitChartInstance = new ApexCharts(document.querySelector("#profitChart"), profitOptions);
    profitChartInstance.render();
}

// --- FILTER LOGIC ---
const rangeSelect = document.getElementById('timeRangeFilter');
const customGroup = document.getElementById('customDateGroup');
const btnApply = document.getElementById('applyCustomDateBtn');
const dStart = document.getElementById('dateStart');
const dEnd = document.getElementById('dateEnd');

rangeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
        customGroup.classList.remove('hidden');
        customGroup.classList.add('flex');
    } else {
        customGroup.classList.add('hidden');
        customGroup.classList.remove('flex');
        loadStats(e.target.value);
    }
});

btnApply.addEventListener('click', () => {
    if(dStart.value && dEnd.value) {
        loadStats('custom', dStart.value, dEnd.value);
    } else {
        alert("Please select both start and end dates.");
    }
});

document.addEventListener('DOMContentLoaded', () => loadStats());