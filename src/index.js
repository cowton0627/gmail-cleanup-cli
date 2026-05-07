#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv(path.join(process.cwd(), '.env'));

const { runAuthFlow, loadAuthClient, TOKEN_PATH } = require('./auth');
const { listInboxMessageIds, batchFetchMetadata } = require('./gmail');
const { classifyAll, DEFAULT_MODEL } = require('./classify');
const { writeCsv } = require('./csv');

function printUsage() {
  console.log(`gmail-cleanup — AI-assisted Gmail INBOX triage

Usage: gmail-cleanup <command> [options]

Commands:
  auth                       Run the Google OAuth flow and save a token.
  scan [options]             Scan INBOX, classify with Claude, write a CSV report.
  help                       Show this help message.

Scan options:
  --max <n>                  Max messages to process (default: 500)
  --output <path>, -o        Output CSV path (default: ./inbox_review.csv)
  --query <q>, -q            Optional Gmail search query (e.g. "older_than:90d")
  --concurrency <n>          Parallel metadata fetches (default: 10)
  --batch-size <n>           Messages per Claude classification batch (default: 25)

Environment:
  ANTHROPIC_API_KEY          Required for scan. Loaded from .env or shell.
  CLAUDE_MODEL               Optional. Default: ${DEFAULT_MODEL}

Files:
  ./credentials.json         OAuth client credentials downloaded from GCP.
  ${TOKEN_PATH}
                             Saved OAuth token (created by 'auth').
`);
}

function parseScanArgs(args) {
  const opts = {
    max: 500,
    output: path.join(process.cwd(), 'inbox_review.csv'),
    query: undefined,
    concurrency: 10,
    batchSize: 25,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const consumeValue = () => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i++;
      return v;
    };
    switch (arg) {
      case '--max':
        opts.max = parseInt(consumeValue(), 10);
        break;
      case '--output':
      case '-o':
        opts.output = consumeValue();
        break;
      case '--query':
      case '-q':
        opts.query = consumeValue();
        break;
      case '--concurrency':
        opts.concurrency = parseInt(consumeValue(), 10);
        break;
      case '--batch-size':
        opts.batchSize = parseInt(consumeValue(), 10);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(opts.max) || opts.max <= 0) throw new Error('--max must be a positive integer');
  if (!Number.isFinite(opts.concurrency) || opts.concurrency <= 0) throw new Error('--concurrency must be a positive integer');
  if (!Number.isFinite(opts.batchSize) || opts.batchSize <= 0) throw new Error('--batch-size must be a positive integer');
  return opts;
}

function progressReporter(label) {
  let lastPct = -1;
  return (done, total) => {
    const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    process.stderr.write(`\r  ${label}: ${done}/${total} (${pct}%)   `);
  };
}

async function cmdAuth() {
  await runAuthFlow();
}

async function cmdScan(args) {
  const opts = parseScanArgs(args);
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env or your shell.');
  }

  console.log('Loading auth …');
  const auth = loadAuthClient();

  const queryDesc = opts.query ? `, q="${opts.query}"` : '';
  console.log(`Listing INBOX (max ${opts.max}${queryDesc}) …`);
  const ids = await listInboxMessageIds(auth, { max: opts.max, query: opts.query });
  console.log(`Found ${ids.length} message(s).`);
  if (ids.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  console.log('Fetching metadata …');
  const messages = await batchFetchMetadata(auth, ids, {
    concurrency: opts.concurrency,
    onProgress: progressReporter('metadata'),
  });
  process.stderr.write('\n');

  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  console.log(`Classifying with ${model} (batch size ${opts.batchSize}) …`);
  const classified = await classifyAll(messages, {
    batchSize: opts.batchSize,
    onProgress: progressReporter('classify'),
  });
  process.stderr.write('\n');

  writeCsv(opts.output, classified);

  const counts = classified.reduce((acc, m) => {
    acc[m.classification] = (acc[m.classification] || 0) + 1;
    return acc;
  }, {});
  console.log(`\nWrote ${classified.length} row(s) to ${opts.output}`);
  console.log('Summary:');
  for (const cls of ['keep', 'review_needed', 'likely_archive', 'likely_trash']) {
    if (counts[cls]) console.log(`  ${cls.padEnd(15)} ${counts[cls]}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    printUsage();
    return;
  }
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'auth':
      await cmdAuth();
      return;
    case 'scan':
      await cmdScan(rest);
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printUsage();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message || err}`);
  process.exitCode = 1;
});
