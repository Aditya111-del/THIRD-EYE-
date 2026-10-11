const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.SALESFORCE_SERVICE_PORT || 4003;
const API_VERSION = 'v59.0';

// In-memory runtime config that can be updated dynamically via UI
let currentConfig = {
  instanceUrl: (process.env.SALESFORCE_INSTANCE_URL || '').trim(),
  apiKey: (process.env.SALESFORCE_API_KEY || '').trim(),
  userEmail: (process.env.SALESFORCE_USER_EMAIL || 'aditya.s.ctr@greyorange.com').trim(),
  clientId: (process.env.SALESFORCE_CLIENT_ID || '').trim(),
};

/**
 * Normalizes Salesforce Case priority to standard levels
 */
function normalizePriority(p) {
  if (!p) return 'P3 - Medium';
  const lower = p.toLowerCase();
  if (lower.includes('critical') || lower.includes('p1') || lower === 'urgent') return 'P1 - Critical';
  if (lower.includes('high') || lower.includes('p2')) return 'P2 - High';
  if (lower.includes('medium') || lower.includes('p3')) return 'P3 - Medium';
  return 'P4 - Low';
}

/**
 * Normalizes Salesforce Case status
 */
function normalizeStatus(s) {
  if (!s) return 'New';
  const lower = s.toLowerCase();
  if (lower.includes('progress') || lower.includes('working')) return 'In Progress';
  if (lower.includes('assign')) return 'Assigned';
  if (lower.includes('escalat')) return 'Escalated';
  if (lower.includes('closed') || lower.includes('resolve')) return 'Resolved';
  return 'New';
}

/**
 * Clean instance URL (remove trailing slashes)
 */
function cleanUrl(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '');
}

/**
 * Health check
 */
app.get('/api/salesforce/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'third-eye-salesforce-service',
    port: PORT,
    hasApiKey: Boolean(currentConfig.apiKey),
    instanceUrl: currentConfig.instanceUrl,
    userEmail: currentConfig.userEmail,
    timestamp: Date.now(),
  });
});

/**
 * Get active configuration (masking API token for security)
 */
app.get('/api/salesforce/config', (_req, res) => {
  const maskedKey = currentConfig.apiKey
    ? `${currentConfig.apiKey.slice(0, 8)}...${currentConfig.apiKey.slice(-4)}`
    : '';

  res.json({
    instanceUrl: currentConfig.instanceUrl,
    hasApiKey: Boolean(currentConfig.apiKey),
    maskedApiKey: maskedKey,
    userEmail: currentConfig.userEmail,
    clientId: currentConfig.clientId,
  });
});

function updateEnvFile(updates) {
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf8');
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${val}`);
      } else {
        content += `\n${key}=${val}`;
      }
    }
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('[SalesforceService] Synchronized credentials to .env');
  } catch (err) {
    console.warn('[SalesforceService] Could not persist to .env:', err.message);
  }
}

/**
 * Update configuration dynamically from UI Settings
 */
app.post('/api/salesforce/config', (req, res) => {
  const { instanceUrl, apiKey, userEmail, clientId } = req.body;

  if (instanceUrl !== undefined) currentConfig.instanceUrl = cleanUrl(instanceUrl);
  if (apiKey !== undefined && apiKey.trim() !== '') currentConfig.apiKey = apiKey.trim();
  if (userEmail !== undefined) currentConfig.userEmail = userEmail.trim();
  if (clientId !== undefined) currentConfig.clientId = clientId.trim();

  // Persist to .env file for daemon restart persistence
  updateEnvFile({
    SALESFORCE_INSTANCE_URL: currentConfig.instanceUrl,
    SALESFORCE_API_KEY: currentConfig.apiKey,
    SALESFORCE_USER_EMAIL: currentConfig.userEmail,
    SALESFORCE_CLIENT_ID: currentConfig.clientId,
  });

  console.log(`[SalesforceService] Updated config for user: ${currentConfig.userEmail} @ ${currentConfig.instanceUrl}`);

  res.json({
    success: true,
    message: 'Salesforce configuration saved successfully.',
    instanceUrl: currentConfig.instanceUrl,
    hasApiKey: Boolean(currentConfig.apiKey),
    userEmail: currentConfig.userEmail,
  });
});

/**
 * Test connectivity against Salesforce REST API using the provided credentials
 */
app.post('/api/salesforce/test', async (req, res) => {
  const instanceUrl = cleanUrl(req.body.instanceUrl || currentConfig.instanceUrl);
  const apiKey = (req.body.apiKey || currentConfig.apiKey || '').trim();

  if (!instanceUrl) {
    return res.status(400).json({
      success: false,
      error: 'Salesforce Instance URL is required (e.g. https://your-domain.my.salesforce.com).',
    });
  }

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: 'Salesforce API Key / Access Token is required to authenticate.',
    });
  }

  const startTime = Date.now();
  try {
    const describeUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/Case/describe`;
    console.log(`[SalesforceService] Testing connection to ${describeUrl}`);

    const sfRes = await fetch(describeUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const latencyMs = Date.now() - startTime;

    if (!sfRes.ok) {
      const errText = await sfRes.text();
      let errorMsg = `HTTP ${sfRes.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (Array.isArray(errJson) && errJson[0]?.message) {
          errorMsg = `${errJson[0].errorCode}: ${errJson[0].message}`;
        }
      } catch {}

      console.warn(`[SalesforceService] Test connection failed: ${errorMsg}`);
      return res.status(sfRes.status).json({
        success: false,
        error: `Salesforce API authentication failed (${errorMsg}). Verify your API Key / Access Token.`,
        latencyMs,
      });
    }

    const data = await sfRes.json();
    console.log(`[SalesforceService] Connection test succeeded in ${latencyMs}ms`);

    res.json({
      success: true,
      message: `Successfully connected to Salesforce Service Cloud (${latencyMs}ms).`,
      sobject: data.name || 'Case',
      latencyMs,
    });
  } catch (err) {
    console.error('[SalesforceService] Test connection network error:', err.message);
    res.status(502).json({
      success: false,
      error: `Network error connecting to ${instanceUrl}: ${err.message}`,
    });
  }
});

/**
 * Fetch real tickets assigned to user from Salesforce Service Cloud
 */
app.get('/api/salesforce/tickets', async (req, res) => {
  const instanceUrl = cleanUrl(req.query.instanceUrl || currentConfig.instanceUrl);
  const apiKey = (req.query.apiKey || currentConfig.apiKey || '').trim();
  const userEmail = (req.query.userEmail || currentConfig.userEmail || '').trim();

  if (!instanceUrl || !apiKey) {
    return res.status(400).json({
      success: false,
      error: 'Salesforce credentials missing. Configure your Salesforce Instance URL and API Key in Settings.',
      tickets: [],
    });
  }

  try {
    // Construct SOQL query to fetch cases assigned to the user or unclosed cases
    let soql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactEmail, SuppliedEmail, CreatedDate, LastModifiedDate, Account.Name, Owner.Name, Owner.Email FROM Case WHERE Status != 'Closed' ORDER BY CreatedDate DESC LIMIT 50`;
    if (userEmail) {
      soql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactEmail, SuppliedEmail, CreatedDate, LastModifiedDate, Account.Name, Owner.Name, Owner.Email FROM Case WHERE (Owner.Email = '${userEmail}' OR Status != 'Closed') ORDER BY CreatedDate DESC LIMIT 50`;
    }

    let queryUrl = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
    console.log(`[SalesforceService] Querying cases: ${queryUrl}`);

    let sfRes = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // If query failed with field error, retry with simpler standard fields
    if (!sfRes.ok) {
      const errText = await sfRes.text();
      console.warn(`[SalesforceService] Initial query failed (${sfRes.status}): ${errText}. Attempting fallback query...`);

      const fallbackSoql = `SELECT Id, CaseNumber, Subject, Description, Status, Priority, ContactEmail, CreatedDate, LastModifiedDate FROM Case WHERE Status != 'Closed' ORDER BY CreatedDate DESC LIMIT 50`;
      queryUrl = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(fallbackSoql)}`;

      sfRes = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!sfRes.ok) {
        let errorMsg = `HTTP ${sfRes.status}`;
        try {
          const secondErrText = await sfRes.text();
          const errJson = JSON.parse(secondErrText);
          if (Array.isArray(errJson) && errJson[0]?.message) {
            errorMsg = errJson[0].message;
          } else {
            errorMsg = secondErrText;
          }
        } catch {}

        console.warn(`[SalesforceService] Query failed: ${errorMsg}`);
        return res.status(sfRes.status).json({
          success: false,
          error: `Salesforce Query Error: ${errorMsg}`,
          tickets: [],
        });
      }
    }

    const sfData = await sfRes.json();
    const records = sfData.records || [];

    // Map Salesforce SObject schema to normalized Third Eye Ticket schema
    const tickets = records.map((r) => {
      // Attempt to extract IP from subject or description (e.g. 172.28.76.144 or 10.20.255.2)
      const ipMatch = (r.Subject + ' ' + (r.Description || '')).match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
      const primaryIp = ipMatch ? ipMatch[0] : '172.28.76.144';

      return {
        id: r.Id,
        ticketNumber: r.CaseNumber || `SF-${r.Id.slice(-5)}`,
        subject: r.Subject || 'Incident Ticket',
        description: r.Description || '',
        status: normalizeStatus(r.Status),
        priority: normalizePriority(r.Priority),
        siteId: 'site-gor-prod',
        siteName: r.Account?.Name || 'GreyOrange Robotics Site',
        primaryIp,
        assignedTo: r.Owner?.Name || currentConfig.userEmail,
        assignedEmail: r.Owner?.Email || currentConfig.userEmail,
        customer: r.Account?.Name || 'Enterprise Customer',
        createdAt: r.CreatedDate ? new Date(r.CreatedDate).toLocaleString() : 'Recent',
        updatedAt: r.LastModifiedDate ? new Date(r.LastModifiedDate).toLocaleString() : 'Recent',
        caseOrigin: 'Salesforce Service Cloud',
      };
    });

    console.log(`[SalesforceService] Successfully retrieved ${tickets.length} tickets from Salesforce`);

    res.json({
      success: true,
      count: tickets.length,
      tickets,
    });
  } catch (err) {
    console.error('[SalesforceService] Failed to query tickets:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to communicate with Salesforce: ${err.message}`,
      tickets: [],
    });
  }
});

/**
 * Update Case Status in Salesforce (e.g. mark In Progress or Closed)
 */
app.patch('/api/salesforce/tickets/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const instanceUrl = currentConfig.instanceUrl;
  const apiKey = currentConfig.apiKey;

  if (!instanceUrl || !apiKey) {
    return res.status(400).json({ success: false, error: 'Salesforce credentials missing.' });
  }

  try {
    const updateUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/Case/${id}`;
    const sfRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Status: status }),
    });

    if (!sfRes.ok && sfRes.status !== 204) {
      const errText = await sfRes.text();
      return res.status(sfRes.status).json({ success: false, error: errText });
    }

    res.json({ success: true, message: `Case ${id} updated to ${status} in Salesforce.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Add diagnostic work note / comment to Case in Salesforce
 */
app.post('/api/salesforce/tickets/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const instanceUrl = currentConfig.instanceUrl;
  const apiKey = currentConfig.apiKey;

  if (!instanceUrl || !apiKey || !comment) {
    return res.status(400).json({ success: false, error: 'Parameters missing.' });
  }

  try {
    const commentUrl = `${instanceUrl}/services/data/${API_VERSION}/sobjects/CaseComment`;
    const sfRes = await fetch(commentUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ParentId: id,
        CommentBody: comment,
        IsPublished: true,
      }),
    });

    const data = await sfRes.json();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Inbound webhook for live ticket assignments
 */
app.post('/api/salesforce/webhook', (req, res) => {
  console.log('[SalesforceService] Received inbound webhook payload:', req.body);
  res.json({ success: true, receivedAt: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[SalesforceService] Salesforce Integration Microservice running on http://localhost:${PORT}`);
});
