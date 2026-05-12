// Cloudflare Worker - API endpoint for dashboard data
// Simple in-memory cache
let cachedData = null;
let cacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

    // Call Claude API with Google Drive MCP to read the sheet
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `Read the Google Sheet with file ID "1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw".

Analyze the cleaning business data and return ONLY a JSON object (no markdown, no preamble, no backticks) with this exact structure:

{
  "totalRevenue": <sum of all Fees column>,
  "totalCleanings": <count of all data rows>,
  "totalExpenses": <sum of all Expenses column>,
  "netProfit": <totalRevenue minus totalExpenses>,
  "topClients": [
    {"name": "Client Name", "revenue": <total fees for this client>},
    <top 5 clients by revenue>
  ],
  "recentAppointments": [
    {"date": "1-Jan", "client": "Client Name", "fee": 60},
    <last 10 appointments>
  ],
  "currentMonthRevenue": <total revenue for May 2026>,
  "previousMonthRevenue": <total revenue for April 2026>
}`
          }
        ],
        mcp_servers: [
          {
            "type": "url",
            "url": "https://drivemcp.googleapis.com/mcp/v1",
            "name": "google-drive"
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Extract text from Claude's response
    const textContent = result.content
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n");

    // Clean and parse JSON (remove any markdown formatting)
    const cleanJson = textContent
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    
    const parsedData = JSON.parse(cleanJson);
    
    // Update cache
    cachedData = parsedData;
    cacheTime = Date.now();
    
    return new Response(JSON.stringify({
      ...parsedData,
      cached: false,
      fetchedAt: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300' // 5 minute browser cache
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
