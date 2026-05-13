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
  const ranges = [
    ...MONTHS.map(m => `${m}!A:E`),          // 0-4: monthly cleaning data
    `List of Clients!A:F`,                     // 5: client list tab
    `Monthly Balance Sheet!A:N`,               // 6: balance sheet tab
  ];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${
    ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  }&key=${GOOGLE_SHEETS_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) { const t = await res.text(); throw new Error(`API ${res.status}: ${t}`); }
  const json = await res.json();
  const vr = json.valueRanges || [];

  // --- Monthly cleaning data (ranges 0-4) ---
  let totalRevenue = 0, totalExpenses = 0, totalCleanings = 0;
  const clientRevenue = {}, monthlyRevenue = {};
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

  // --- List of Clients tab (range 5) ---
  const clientListRows = vr[5]?.values || [];
  // Structure: Property header rows, then client rows with: blank, Client, Unit, Price, Notes, Status
  // We'll group by property
  const clientDirectory = [];
  let currentProperty = '';
  clientListRows.forEach(row => {
    if (!row || row.length === 0) return;
    const col0 = (row[0] || '').trim();
    const col1 = (row[1] || '').trim();
    const col2 = (row[2] || '').trim();
    const col3 = (row[3] || '').trim();
    const col5 = (row[5] || '').trim();

    // Property header: col0 has text, col1 is empty
    if (col0 && !col1 && col0 !== 'Property') {
      currentProperty = col0;
      return;
    }
    // Skip header row
    if (col0 === 'Property') return;

    // Client row: col1 has client name or col2 has unit
    if ((col1 || col2) && col0 !== 'Property') {
      clientDirectory.push({
        property: currentProperty,
        client: col1,
        unit: col2,
        price: col3,
        status: col5 || 'Active'
      });
    }
  });

  // --- Monthly Balance Sheet tab (range 6) ---
  const balanceRows = vr[6]?.values || [];
  // Row 0: header — "Clients", "Jan", "Feb", ... "Dec", "Annual Total"
  // Then data rows per client
  const balanceHeader = balanceRows[0] || [];
  const balanceData = [];
  for (let i = 1; i < balanceRows.length; i++) {
    const row = balanceRows[i];
    if (!row || !row[0] || row[0].trim() === '') continue;
    const name = row[0].trim();
    if (name === 'TOTAL BALANCE') continue; // skip total row — we'll recalc
    const entry = { name };
    balanceHeader.forEach((col, ci) => {
      if (ci === 0) return;
      entry[col.trim()] = parseMoney(row[ci]);
    });
    balanceData.push(entry);
  }

  return {
    totalRevenue, totalCleanings, totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    topClients, recentAppointments,
    currentMonthRevenue: monthlyRevenue['May'] || 0,
    previousMonthRevenue: monthlyRevenue['Apr'] || 0,
    monthlyRevenue,
    clientDirectory,   // from "List of Clients" tab
    balanceData,       // from "Monthly Balance Sheet" tab
    balanceHeader: balanceHeader.slice(1), // month column names
    fetchedAt: new Date().toISOString()
  };
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[$,\s]/g, '')) || 0;
}
