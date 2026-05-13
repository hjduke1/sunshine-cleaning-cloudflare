// Cloudflare Worker - Sunshine Cleaning Dashboard
const GOOGLE_SHEETS_API_KEY = 'YOUR_API_KEY_HERE'; // ← Replace this!
const SHEET_ID = '1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];

let cache = null, cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function onRequest(context) {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  try {
    if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL)
      return new Response(JSON.stringify({ ...cache, cached: true }), { headers: h });
    const result = await fetchAll();
    cache = result; cacheTime = Date.now();
    return new Response(JSON.stringify({ ...result, cached: false }), { headers: h });
  } catch (err) {
    if (cache) return new Response(JSON.stringify({ ...cache, cached: true, warning: err.message }), { headers: h });
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: h });
  }
}

async function fetchAll() {
  const ranges = [
    ...MONTHS.map(m => `${m}!A:E`),                // 0-4: monthly cleaning rows
    `List of Clients!A:F`,                          // 5: client list tab
    `Monthly Balance Sheet!A4:N35`,                 // 6: balance sheet — headers row4, data rows 6-28, total row 32
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${
    ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  }&key=${GOOGLE_SHEETS_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t}`); }
  const json = await res.json();
  const vr = json.valueRanges || [];

  // ── Monthly cleaning data (ranges 0-4) for Overview stats ──
  let totalRevenue = 0, totalExpenses = 0, totalCleanings = 0;
  const monthlyRevenue = {};
  const clientRevenueTotals = {};
  const allAppointments = [];

  MONTHS.forEach((month, i) => {
    const rows = vr[i]?.values || [];
    let mRev = 0;
    rows.forEach(row => {
      if (!row || row.length < 4) return;
      const date = (row[0] || '').trim(), client = (row[1] || '').trim();
      const unit = (row[2] || '').trim(), fees = parseMoney(row[3]), expenses = parseMoney(row[4]);
      if (!date || !client || fees === 0) return;
      if (date.toLowerCase() === 'date') return;
      if (isNaN(date[0]) && !date.includes('-')) return;
      totalRevenue += fees; totalExpenses += expenses; totalCleanings++; mRev += fees;
      clientRevenueTotals[client] = (clientRevenueTotals[client] || 0) + fees;
      allAppointments.push({ date, client, unit, fee: fees, month });
    });
    monthlyRevenue[month] = mRev;
  });

  const topClients = Object.entries(clientRevenueTotals)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const recentAppointments = allAppointments
    .filter(a => a.month === 'May' || a.month === 'Apr')
    .slice(-20).reverse().slice(0, 10);

  // ── Monthly Balance Sheet (range 6) ──
  // Row 0 (sheet row 4): header — "Clients", "Jan", "Feb", "Mar", "Apr", "May", "June"...
  // Row 1 (sheet row 5): blank
  // Row 2+ (sheet rows 6+): data rows
  const balRaw = vr[6]?.values || [];
  const balHeader = balRaw[0] || []; // ["Clients","Jan","Feb","Mar","Apr","May",...]
  const allCols = balHeader.slice(1).filter(h => h && h.trim());
  // Exclude "Annual Total" column from month columns to avoid double-counting
  const annualTotalIdx = allCols.findIndex(c => c.toLowerCase().includes('annual'));
  const realMonthCols = allCols.filter(c => !c.toLowerCase().includes('annual') && !c.toLowerCase().includes('total'));

  const balanceData = [];
  for (let i = 1; i < balRaw.length; i++) {
    const row = balRaw[i];
    if (!row || !row[0] || !row[0].trim()) continue;
    const name = row[0].trim();
    if (name.toUpperCase().includes('TOTAL') || name.toUpperCase().includes('BALANCE')) continue;

    const monthly = {};
    realMonthCols.forEach((col, ci) => {
      monthly[col] = parseMoney(row[ci + 1]);
    });

    // Use Annual Total directly from sheet — avoids double-counting
    const total = annualTotalIdx >= 0
      ? parseMoney(row[annualTotalIdx + 1])
      : Object.values(monthly).reduce((s, v) => s + v, 0);

    balanceData.push({ name, monthly, total });
  }

  // ── List of Clients (range 5) ──
  const clientListRows = vr[5]?.values || [];
  const clientDirectory = [];
  let currentProperty = '';

  clientListRows.forEach(row => {
    if (!row || row.length === 0) return;
    const c0 = (row[0] || '').trim();
    const c1 = (row[1] || '').trim();
    const c2 = (row[2] || '').trim();
    const c3 = (row[3] || '').trim();
    const c5 = (row[5] || '').trim();
    if (c1.toLowerCase() === 'client') return; // skip header
    if (c0 && !c1 && !c2) { currentProperty = c0; return; } // property header
    if (c1 || c2) {
      clientDirectory.push({ property: currentProperty, client: c1, unit: c2, price: c3, status: c5 || 'Active' });
    }
  });

  return {
    totalRevenue, totalCleanings, totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    topClients, recentAppointments,
    currentMonthRevenue: monthlyRevenue['May'] || 0,
    previousMonthRevenue: monthlyRevenue['Apr'] || 0,
    monthlyRevenue,
    balanceData,
    balanceMonths: realMonthCols,  // actual column names from the sheet header
    clientDirectory,
    fetchedAt: new Date().toISOString()
  };
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[$,\s]/g, '')) || 0;
}