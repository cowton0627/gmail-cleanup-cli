const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { URL } = require('node:url');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

const CONFIG_DIR = path.join(os.homedir(), '.config', 'gmail-cleanup');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
const CREDENTIALS_LOOKUPS = [
  path.join(process.cwd(), 'credentials.json'),
  path.join(CONFIG_DIR, 'credentials.json'),
];

function loadCredentials() {
  for (const p of CREDENTIALS_LOOKUPS) {
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const key = raw.installed || raw.web;
    if (!key || !key.client_id || !key.client_secret) {
      throw new Error(`Invalid credentials at ${p} (expected "installed" or "web" with client_id/secret)`);
    }
    return key;
  }
  throw new Error(
    `credentials.json not found. Looked in:\n  ${CREDENTIALS_LOOKUPS.join('\n  ')}\n\n` +
      `Download it from GCP Console → APIs & Services → Credentials → OAuth client (Desktop), and save as ./credentials.json`,
  );
}

function makeOAuthClient(creds, redirectUri) {
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
}

function loadSavedToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

function saveToken(token) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

function waitForCode(server, redirectUri) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for OAuth callback (5 min)')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const reqUrl = new URL(req.url, redirectUri);
      if (reqUrl.pathname !== '/oauth2callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const error = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');
      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' }).end(`<h1>OAuth error</h1><pre>${error}</pre>`);
        clearTimeout(timer);
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400).end('Missing code');
        return;
      }
      res
        .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<h1>Authorized</h1><p>You can close this tab and return to the terminal.</p>');
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function runAuthFlow() {
  const creds = loadCredentials();

  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

  const client = makeOAuthClient(creds, redirectUri);
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\nOpen this URL in your browser to authorize gmail-cleanup:\n');
  console.log(authUrl);
  console.log(`\nListening for OAuth callback on ${redirectUri} ...`);

  let code;
  try {
    code = await waitForCode(server, redirectUri);
  } finally {
    server.close();
  }

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    console.warn('\nWarning: no refresh_token returned. You may need to re-authenticate periodically.');
  }
  client.setCredentials(tokens);
  saveToken(tokens);
  console.log(`\nToken saved to ${TOKEN_PATH}`);
  return client;
}

function loadAuthClient() {
  const creds = loadCredentials();
  const token = loadSavedToken();
  if (!token) {
    throw new Error('Not authenticated. Run: gmail-cleanup auth');
  }
  const client = makeOAuthClient(creds, 'http://127.0.0.1');
  client.setCredentials(token);
  client.on('tokens', (refreshed) => {
    saveToken({ ...token, ...refreshed });
  });
  return client;
}

module.exports = { SCOPES, runAuthFlow, loadAuthClient, TOKEN_PATH };
