// Cloudflare Worker - Sunshine Cleaning Dashboard
const GOOGLE_SHEETS_API_KEY = 'AIzaSyCNFL9xcZ8kcAHzXT7iPAYRaDncodg4DSo'; // ← Replace this!
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
  // Fetch cleaning data for each month + try both possible tab name variants
  const ranges = [
    ...MONTHS.map(m => `${m}!A:E`),
    `List of Clients!A:F`,
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${
    ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  }&key=${GOOGLE_SHEETS_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t}`); }
  const json = await res.json();
  const vr = json.valueRanges || [];

  // --- Build everything from monthly cleaning data (ranges 0-4) ---
  let totalRevenue = 0, totalExpenses = 0, totalCleanings = 0;
  const clientRevenue = {};
  const clientMonthly = {}; // { clientName: { Jan: X, Feb: Y, ... } }
  const monthlyRevenue = {};
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
      clientRevenue[client] = (clientRevenue[client] || 0) + fees;

      if (!clientMonthly[client]) {
        clientMonthly[client] = {};
        MONTHS.forEach(m => clientMonthly[client][m] = 0);
      }
      clientMonthly[client][month] += fees;
      allAppointments.push({ date, client, unit, fee: fees, month });
    });
    monthlyRevenue[month] = mRev;
  });

  const topClients = Object.entries(clientRevenue)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const recentAppointments = allAppointments
    .filter(a => a.month === 'May' || a.month === 'Apr')
    .slice(-20).reverse().slice(0, 10);

  // Monthly Balance Sheet — built from actual cleaning data
  const balanceData = Object.entries(clientRevenue)
    .map(([name, total]) => ({ name, total, monthly: clientMonthly[name] || {} }))
    .sort((a, b) => b.total - a.total);

  // --- List of Clients tab (range 5) ---
  const clientListRows = vr[5]?.values || [];
  const clientDirectory = [];
  let currentProperty = '';

  clientListRows.forEach(row => {
    if (!row || row.length === 0) return;
    const c0 = (row[0] || '').trim();
    const c1 = (row[1] || '').trim();
    const c2 = (row[2] || '').trim();
    const c3 = (row[3] || '').trim();
    const c4 = (row[4] || '').trim();
    const c5 = (row[5] || '').trim();

    // Skip obvious header rows
    if (c0.toLowerCase() === 'property' || c1.toLowerCase() === 'client') return;

    // Property header: a non-empty col0, with col1 empty (or it's a building name)
    if (c0 && !c1 && !c2) {
      currentProperty = c0;
      return;
    }

    // Client row: has a client name or unit
    if (c1 || c2) {
      clientDirectory.push({
        property: currentProperty,
        client: c1,
        unit: c2,
        price: c3 || c4,
        status: c5 || 'Active'
      });
    }
  });

  return {
    totalRevenue, totalCleanings, totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    topClients, recentAppointments,
    currentMonthRevenue: monthlyRevenue['May'] || 0,
    previousMonthRevenue: monthlyRevenue['Apr'] || 0,
    monthlyRevenue,
    balanceData,     // calculated from cleaning data
    clientDirectory, // from List of Clients tab
    months: MONTHS,
    fetchedAt: new Date().toISOString()
  };
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[$,\s]/g, '')) || 0;
}
