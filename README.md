# ☀️ Sunshine Cleaning Dashboard - Cloudflare Edition

A real-time business dashboard that connects to your Google Sheet via Cloudflare Pages + Workers.

## 🌟 Features

- **Live Data**: Automatically reads from your Google Sheet
- **Fast & Free**: Cloudflare's edge network (100k requests/day free)
- **Smart Caching**: 5-minute cache to reduce API calls
- **Beautiful UI**: Modern, responsive design

---

## 🚀 Quick Deploy to Cloudflare Pages

### **Option 1: Deploy via GitHub (Recommended)**

1. **Create a GitHub Repository**
   - Go to [github.com/new](https://github.com/new)
   - Name it: `sunshine-cleaning-cloudflare`
   - Make it Public or Private (your choice)
   - Click "Create repository"

2. **Upload Your Code**
   
   In your terminal (in this project folder):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/sunshine-cleaning-cloudflare.git
   git push -u origin main
   ```

3. **Connect to Cloudflare Pages**
   
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Click "Pages" in the left sidebar
   - Click "Create a project"
   - Click "Connect to Git"
   - Select your `sunshine-cleaning-cloudflare` repository
   
4. **Configure Build Settings**
   
   - **Project name**: `sunshine-cleaning-dashboard` (or your choice)
   - **Production branch**: `main`
   - **Build command**: Leave EMPTY (no build needed)
   - **Build output directory**: `public`
   
5. **Click "Save and Deploy"**
   
   Your site will be live in ~1 minute at:
   ```
   https://sunshine-cleaning-dashboard.pages.dev
   ```

---

### **Option 2: Direct Upload (No GitHub)**

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Deploy Directly**
   ```bash
   cd sunshine-cloudflare
   wrangler pages deploy public --project-name=sunshine-cleaning-dashboard
   ```

---

## 📁 Project Structure

```
sunshine-cloudflare/
├── public/
│   ├── index.html         # Dashboard UI
│   └── _routes.json       # Routing config
├── functions/
│   └── api/
│       └── data.js        # API Worker
├── package.json
└── README.md
```

---

## 🔧 How It Works

1. **Frontend** (`public/index.html`):
   - Single-page React dashboard
   - Fetches data from `/api/data`
   - Displays revenue, clients, appointments

2. **API Worker** (`functions/api/data.js`):
   - Reads Google Sheet via Anthropic API + Google Drive MCP
   - Caches results for 5 minutes
   - Returns JSON data to frontend

3. **Google Sheet Connection**:
   - Uses your authenticated Google Drive from Claude.ai
   - No extra API keys needed!
   - Reads Sheet ID: `1xXs08NoyMEBeUCRO_1vvxZi6hkQ3kYVt95d47yguykw`

---

## 🎯 Updating the Dashboard

To make changes:

1. **Edit files** in your project
2. **Commit changes** to GitHub:
   ```bash
   git add .
   git commit -m "Update dashboard"
   git push
   ```
3. **Cloudflare auto-deploys** in ~30 seconds

---

## 💰 Pricing

- **Free Tier**: 100,000 requests/day
- With 5-min caching, that's ~240,000 page views/day
- More than enough for most businesses!

---

## 🐛 Troubleshooting

**Problem**: "Failed to fetch data"
- **Solution**: Check Cloudflare Pages logs at dash.cloudflare.com
- Make sure Google Sheet is accessible

**Problem**: Data not updating
- **Solution**: Click "Refresh Data" button (bypasses cache)
- Or wait 5 minutes for cache to expire

**Problem**: Deployment failed
- **Solution**: Make sure `public/` is your build output directory
- Check that all files are committed to GitHub

---

## 📞 Support

If you need help:
1. Check Cloudflare Pages logs
2. Look at browser console (F12)
3. Verify Google Sheet access

---

## 🎉 You're All Set!

Your dashboard should be live and pulling data from your Google Sheet!

Share the URL with your team: `https://sunshine-cleaning-dashboard.pages.dev`
