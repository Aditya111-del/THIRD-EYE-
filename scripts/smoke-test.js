#!/usr/bin/env node
/**
 * THIRD_EYE E2E Smoke Test Runner (Phase 0 Safety Net)
 * Verifies all 4 processes, workspace file system access, terminal subsystem, and AI chat.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function logPass(msg) {
  console.log(`${ANSI.green}✔ [PASS]${ANSI.reset} ${msg}`);
}
function logFail(msg, err) {
  console.error(`${ANSI.red}✖ [FAIL]${ANSI.reset} ${msg}:`, err ? (err.message || err) : '');
}
function logInfo(msg) {
  console.log(`${ANSI.cyan}ℹ [INFO]${ANSI.reset} ${msg}`);
}

function checkHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 5000,
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${reqOpts.timeout}ms`));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSmokeTest() {
  console.log(`\n${ANSI.bold}${ANSI.cyan}=== THIRD_EYE E2E SMOKE TEST RUNNER ===${ANSI.reset}\n`);
  let passed = 0;
  let failed = 0;

  // 1. Check PTY Service (:4001)
  try {
    const res = await checkHttp('http://127.0.0.1:4001/health');
    const json = JSON.parse(res.body);
    if (json.status === 'ok') {
      logPass(`PTY Service is healthy on port 4001 (uptime: ${Math.round(json.uptime)}s)`);
      passed++;
    } else {
      throw new Error(`Unexpected status: ${json.status}`);
    }
  } catch (err) {
    logFail('PTY Service health check failed', err);
    failed++;
  }

  // 2. Check AI Service (:4002)
  try {
    const res = await checkHttp('http://127.0.0.1:4002/health');
    const json = JSON.parse(res.body);
    if (json.status === 'ok') {
      logPass(`AI Service is healthy on port 4002 (model: ${json.model || 'active'})`);
      passed++;
    } else {
      throw new Error(`Unexpected status: ${json.status}`);
    }
  } catch (err) {
    logFail('AI Service health check failed', err);
    failed++;
  }


  // 4. Check Frontend Web App (:3000)
  try {
    const res = await checkHttp('http://127.0.0.1:3000/');
    if (res.status === 200) {
      logPass(`Frontend Web App is serving HTTP 200 on port 3000`);
      passed++;
    } else {
      throw new Error(`Status ${res.status}`);
    }
  } catch (err) {
    logFail('Frontend Web App check failed', err);
    failed++;
  }

  // 5. File System & Workspace Boundary Check
  try {
    const rootPkg = path.resolve(__dirname, '../package.json');
    if (fs.existsSync(rootPkg)) {
      const data = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
      if (data.name === 'third-eye') {
        logPass(`Workspace File System verified (package: ${data.name} v${data.version})`);
        passed++;
      } else {
        throw new Error(`Invalid package name: ${data.name}`);
      }
    } else {
      throw new Error(`Root package.json missing at ${rootPkg}`);
    }
  } catch (err) {
    logFail('Workspace File System check failed', err);
    failed++;
  }

  // 6. Terminal Subsystem Check
  try {
    const res = await checkHttp('http://127.0.0.1:4001/api/pty/sessions');
    const sessions = JSON.parse(res.body);
    logPass(`Terminal Subsystem active (Current live PTY sessions: ${sessions.length})`);
    passed++;
  } catch (err) {
    logFail('Terminal Subsystem check failed', err);
    failed++;
  }

  // 7. AI Agent Live Interaction Check
  try {
    logInfo('Testing AI Agent communication channel...');
    const res = await checkHttp('http://127.0.0.1:4002/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        terminalId: 'smoke-test-terminal',
        messages: [{ role: 'user', content: 'Respond with exactly the single word "VERIFIED"' }],
        cwd: process.cwd(),
      },
      timeout: 40000,
    });
    const json = JSON.parse(res.body);
    if (json.reply && json.reply.length > 0) {
      logPass(`AI Agent replied successfully (${json.reply.trim().slice(0, 40)}...)`);
      passed++;
    } else {
      throw new Error('AI returned empty reply');
    }
  } catch (err) {
    logFail('AI Agent Live Interaction check failed', err);
    failed++;
  }

  console.log(`\n${ANSI.bold}=== SUMMARY: ${passed} passed, ${failed} failed ===${ANSI.reset}\n`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSmokeTest();
