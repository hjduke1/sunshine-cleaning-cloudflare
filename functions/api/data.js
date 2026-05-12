// Cloudflare Worker - Uses Google Sheets API directly
// Simple in-memory cache
let cachedData = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// IMPORTANT: Replace this with your actual API key from Google Cloud Console
const GOOGLE_SHEETS_API_KEY = 'AIzaSyCMGcVvYLdE_eozD3_EOWiQOsNqLwH0--w';
const SHEET_ID = '1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw';

export async function onRequest(context) {
  try {
    // Return cached data if still valid
    if (cachedData && cacheTime && (Date.now() - cacheTime < CACHE_DURATION)) {
      return new Response(JSON.stringify({
        ...cachedData,
        cached: true,
        cacheAge: Math.floor((Date.now() - cacheTime) / 1000) + ' seconds ago'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Fetch data from Google Sheets API
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1?key=${GOOGLE_SHEETS_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rows = data.values || [];
    
    if (rows.length < 2) {
      throw new Error('No data found in sheet');
    }

    // Parse the data
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalCleanings = 0;
    const clientRevenue = {};
    const appointments = [];
    const monthlyRevenue = {};

    // Skip header row (index 0), process data rows starting from index 1
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Columns: Date | Client | Unit | Fees | Expenses | Reason | Net Total | Notes
      const date = row[0] || '';
      const client = row[1] || '';
      const unit = row[2] || '';
      const feesStr = row[3] || '';
      const expensesStr = row[4] || '';
      
      // Parse fees and expenses (remove $ and commas)
      const fees = parseFloat(feesStr.replace(/[$,]/g, '')) || 0;
      const expenses = parseFloat(expensesStr.replace(/[$,]/g, '')) || 0;
      
      // Only count rows with actual fee data
      if (fees > 0 && client) {
        totalRevenue += fees;
        totalExpenses += expenses;
        totalCleanings++;
        
        // Track client revenue
        if (!clientRevenue[client]) {
          clientRevenue[client] = 0;
        }
        clientRevenue[client] += fees;
        
        // Track monthly revenue
        const month = date.split('-')[1]; // Extract month (e.g., "Jan" from "1-Jan")
        if (month) {
          if (!monthlyRevenue[month]) {
            monthlyRevenue[month] = 0;
          }
          monthlyRevenue[month] += fees;
        }
        
        // Store recent appointments (last 10)
        if (appointments.length < 10) {
          appointments.push({
            date: date,
            client: client,
            fee: fees
          });
        }
      }
    }
    
    // Get top 5 clients by revenue
    const topClients = Object.entries(clientRevenue)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    // Calculate current and previous month revenue
    const currentMonthRevenue = monthlyRevenue['May'] || 0;
    const previousMonthRevenue = monthlyRevenue['Apr'] || 0;
    
    const result = {
      totalRevenue,
      totalCleanings,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      topClients,
      recentAppointments: appointments,
      currentMonthRevenue,
      previousMonthRevenue,
      fetchedAt: new Date().toISOString()
    };
    
    // Update cache
    cachedData = result;
    cacheTime = Date.now();
    
    return new Response(JSON.stringify({
      ...result,
      cached: false
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
    
  } catch (error) {
    console.error('Error fetching data:', error);
    
    // If we have cached data, return it as fallback
    if (cachedData) {
      return new Response(JSON.stringify({
        ...cachedData,
        cached: true,
        warning: 'Using stale cache due to error: ' + error.message
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch data', 
      details: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
