// Cloudflare Worker - Sunshine Cleaning Dashboard
// Reads from Google Sheets using the API with correct sheet structure

const GOOGLE_SHEETS_API_KEY = 'AIzaSyCMGcVvYLdE_eozD3_EOWiQOsNqLwH0--w'; // ← Replace this!
const SHEET_ID = '1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw';

// Sheet structure per month:
// Row 1: Month name header
// Row 2: blank
// Row 3: "Total Cleanings", "Cleanings Fees", ..., "Expenses", ..., "Net Total"
// Row 4: 341, "$43,900.00", ..., "$75.00", ..., "$43,975.00"  ← the summary values
// Row 5: blank
// Row 6: "Date", "Client", "Unit", "Fees", ... ← data header
// Row 7+: actual cleaning records

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];

// Simple in-memory cache
let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function onRequest(context) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    // Return cached data if fresh
    if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
      return new Response(JSON.stringify({ ...cache, cached: true }), { headers: corsHeaders });
    }

    const result = await fetchDashboardData();
    cache = result;
    cacheTime = Date.now();

    return new Response(JSON.stringify({ ...result, cached: false }), { headers: corsHeaders });

  } catch (err) {
    // Serve stale cache on error
    if (cache) {
      return new Response(JSON.stringify({ ...cache, cached: true, warning: err.message }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

async function fetchDashboardData() {
  // Batch request: rows 3-5 of each sheet (summary) + data rows
  const ranges = [
    ...MONTHS.map(m => `${m}!A3:H5`), // Monthly summary totals
    ...MONTHS.map(m => `${m}!A6:D500`), // Data rows (Date, Client, Unit, Fees)
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${
    ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&')
  }&key=${GOOGLE_SHEETS_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Sheets API ${res.status}: ${txt}`);
  }

  const json = await res.json();
  const valueRanges = json.valueRanges || [];

  // Parse monthly summaries (first 5 ranges)
  let totalRevenue = 0;
  let totalCleanings = 0;
  let totalExpenses = 0;
  const monthlyRevenue = {};

  MONTHS.forEach((month, i) => {
    const rows = valueRanges[i]?.values || [];
    // rows[0] = label row: ["Total Cleanings", "Cleanings Fees", "", "", "Expenses", "", "Net Total"]
    // rows[1] = value row: ["341", "$43,900.00 ", "", "", "$75.00", "", "$43,975.00 "]
    if (rows.length >= 2) {
      const vals = rows[1];
      const cleanings = parseInt(vals[0]) || 0;
      const revenue = parseMoney(vals[1]);   // Column B = Cleaning Fees
      const expenses = parseMoney(vals[4]);  // Column E = Expenses

      totalCleanings += cleanings;
      totalRevenue += revenue;
      totalExpenses += expenses;
      monthlyRevenue[month] = revenue;
    }
  });

  // Parse data rows (next 5 ranges) for client breakdown
  const clientRevenue = {};
  const allAppointments = [];

  MONTHS.forEach((month, i) => {
    const dataIndex = MONTHS.length + i;
    const rows = valueRanges[dataIndex]?.values || [];

    rows.forEach(row => {
      if (!row || row.length < 2) return;
      const date = (row[0] || '').trim();
      const client = (row[1] || '').trim();
      const unit = (row[2] || '').trim();
      const fees = parseMoney(row[3]);

      // Skip header row and empty/zero rows
      if (!client || fees === 0) return;
      if (date.toLowerCase() === 'date') return;

      if (!clientRevenue[client]) clientRevenue[client] = 0;
      clientRevenue[client] += fees;

      allAppointments.push({ date, client, unit, fee: fees, month });
    });
  });

  // Top 5 clients by total revenue
  const topClients = Object.entries(clientRevenue)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Most recent 10 appointments (from May + late Apr)
  const recentAppointments = allAppointments
    .filter(a => a.month === 'May' || a.month === 'Apr')
    .slice(-20)
    .reverse()
    .slice(0, 10);

  return {
    totalRevenue,
    totalCleanings,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    topClients,
    recentAppointments,
    currentMonthRevenue: monthlyRevenue['May'] || 0,
    previousMonthRevenue: monthlyRevenue['Apr'] || 0,
    monthlyRevenue,
    fetchedAt: new Date().toISOString()
  };
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/[$,\s]/g, '')) || 0;
}