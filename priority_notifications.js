require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://4.224.186.213/evaluation-service/notifications';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error("Error: ACCESS_TOKEN not found in environment variables.");
  process.exit(1);
}

// Weight definitions: Placement > Result > Event
const WEIGHTS = {
  "Placement": 3,
  "Result": 2,
  "Event": 1
};

// Simple scoring function combining weight and recency (Unix epoch timestamp in seconds)
function getScore(notification) {
  const weight = WEIGHTS[notification.Type] || 0;
  const timeSec = Math.floor(new Date(notification.Timestamp).getTime() / 1000);
  // Weight acts as a major boost (e.g., adding 10 days of seconds for each weight tier)
  const DAY_IN_SECONDS = 86400;
  return timeSec + (weight * DAY_IN_SECONDS * 10);
}

async function run() {
  try {
    console.log("Fetching notifications from API...");
    const response = await axios.get(API_URL, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`
      }
    });

    const notifications = response.data.notifications;
    console.log(`Fetched ${notifications.length} notifications.`);

    // Sort by combined score descending
    const sorted = [...notifications].sort((a, b) => getScore(b) - getScore(a));

    const top10 = sorted.slice(0, 10);

    console.log("\n=================== TOP 10 PRIORITY INBOX ===================");
    top10.forEach((n, i) => {
      console.log(`${i + 1}. [${n.Type}] - ${n.Timestamp}`);
      console.log(`   Message: ${n.Message}`);
      console.log(`   ID: ${n.ID}`);
      console.log("-------------------------------------------------------------");
    });

    // Generate beautiful HTML page for visual screenshot
    generateHTML(top10);
  } catch (error) {
    console.error("Error running priority search:", error.response ? error.response.data : error.message);
  }
}

function generateHTML(items) {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Priority Inbox Dashboard</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #0f172a;
      color: #f8fafc;
      padding: 30px;
      margin: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 20px;
      color: #38bdf8;
      border-bottom: 2px solid #1e293b;
      padding-bottom: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge-placement { background-color: #ef4444; color: #fff; }
    .badge-result { background-color: #f59e0b; color: #fff; }
    .badge-event { background-color: #10b981; color: #fff; }
    .card {
      background-color: #1e293b;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 12px;
      border-left: 5px solid #64748b;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .card-Placement { border-left-color: #ef4444; }
    .card-Result { border-left-color: #f59e0b; }
    .card-Event { border-left-color: #10b981; }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .msg {
      font-size: 15px;
      color: #e2e8f0;
      margin-bottom: 6px;
    }
    .time {
      font-size: 12px;
      color: #94a3b8;
    }
    .id {
      font-size: 11px;
      color: #64748b;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔔 Priority Inbox - Top 10 Notifications</h1>
    ${items.map((n, i) => `
      <div class="card card-${n.Type}">
        <div class="header-row">
          <span class="badge badge-${n.Type.toLowerCase()}">${n.Type}</span>
          <span class="time">${n.Timestamp}</span>
        </div>
        <div class="msg">${n.Message}</div>
        <div class="id">ID: ${n.ID}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;

  const outputPath = path.join(__dirname, 'priority_inbox.html');
  fs.writeFileSync(outputPath, htmlContent);
  console.log(`Dashboard generated at: ${outputPath}`);
}

run();
