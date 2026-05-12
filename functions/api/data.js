// Cloudflare Worker - Sunshine Cleaning Dashboard
const GOOGLE_SHEETS_API_KEY = 'AIzaSyCMGcVvYLdE_eozD3_EOWiQOsNqLwH0--w'; // ← Replace this!
const SHEET_ID = '1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];

let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function onRequest(context) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
      return new Response(JSON.stringify({ ...cache, cached: true }), { headers: corsHeaders });
    }

    const result = await fetchDashboardData();
    cache = result;
    cacheTime = Date.now();

    return new Response(JSON.stringify({ ...result, cached: false }), { headers: corsHeaders });

  } catch (err) {
    if (cache) {
      return new Response(JSON.stringify({ ...cache, cached: true, warning: err.message }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

async function fetchDashboardData() {
  // Fetch all data rows for each month (A:E = Date, Client, Unit, Fees, Expenses)
  const ranges = MONTHS.map(m => `${m}!A:E`);

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

  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalCleanings = 0;
  const clientRevenue = {};
  const monthlyRevenue = {};
  const allAppointments = [];

  MONTHS.forEach((month, i) => {
    const rows = valueRanges[i]?.values || [];
    let monthRevenue = 0;

    rows.forEach(row => {
      if (!row || row.length < 4) return;

      const date = (row[0] || '').trim();
      const client = (row[1] || '').trim();
      const unit = (row[2] || '').trim();
      const fees = parseMoney(row[3]);
      const expenses = parseMoney(row[4]);

      // Skip headers, empty rows, and summary rows (no date or non-data rows)
      if (!date || !client || fees === 0) return;
      if (date.toLowerCase() === 'date') return;
      // Skip rows where "date" column looks like a label (e.g. "Total Cleanings")
      if (isNaN(date[0]) && !date.includes('-')) return;

      totalRevenue += fees;
      totalExpenses += expenses;
      totalCleanings++;
      monthRevenue += fees;

      if (!clientRevenue[client]) clientRevenue[client] = 0;
      clientRevenue[client] += fees;

      allAppointments.push({ date, client, unit, fee: fees, month });
    });

    monthlyRevenue[month] = monthRevenue;
  });

  const topClients = Object.entries(clientRevenue)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Most recent appointments: last entries from May, then Apr
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