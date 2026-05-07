const { google } = require('googleapis');

function api(auth) {
  return google.gmail({ version: 'v1', auth });
}

async function listInboxMessageIds(auth, { max = 500, query } = {}) {
  const gmail = api(auth);
  const ids = [];
  let pageToken;
  while (ids.length < max) {
    const remaining = max - ids.length;
    const res = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
      q: query,
      maxResults: Math.min(500, remaining),
      pageToken,
    });
    const batch = res.data.messages || [];
    for (const m of batch) ids.push(m.id);
    if (!res.data.nextPageToken || batch.length === 0) break;
    pageToken = res.data.nextPageToken;
  }
  return ids.slice(0, max);
}

function pickHeader(headers, name) {
  const lower = name.toLowerCase();
  const h = headers.find((x) => x.name && x.name.toLowerCase() === lower);
  return h ? h.value : '';
}

async function getMessageMetadata(auth, id) {
  const gmail = api(auth);
  const res = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  });
  const m = res.data;
  const headers = (m.payload && m.payload.headers) || [];
  return {
    id: m.id,
    threadId: m.threadId,
    from: pickHeader(headers, 'From'),
    subject: pickHeader(headers, 'Subject'),
    date: pickHeader(headers, 'Date'),
    labelIds: m.labelIds || [],
    snippet: m.snippet || '',
    sizeEstimate: m.sizeEstimate || 0,
    internalDate: m.internalDate ? Number(m.internalDate) : null,
  };
}

async function batchFetchMetadata(auth, ids, { concurrency = 10, onProgress } = {}) {
  const results = new Array(ids.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < ids.length) {
      const i = cursor++;
      try {
        results[i] = await getMessageMetadata(auth, ids[i]);
      } catch (err) {
        results[i] = { id: ids[i], error: err.message || String(err) };
      }
      done++;
      if (onProgress) onProgress(done, ids.length);
    }
  }

  const workerCount = Math.min(concurrency, ids.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

module.exports = { listInboxMessageIds, getMessageMetadata, batchFetchMetadata };
