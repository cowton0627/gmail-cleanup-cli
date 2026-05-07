const { Anthropic } = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are an email triage assistant. You classify messages from a user's Gmail INBOX into one of four categories:

- keep: clearly important personal or work mail that should remain in the inbox.
- review_needed: anything potentially important — receipts, invoices, orders, payments, login alerts, security codes / 2FA, banking, government, school, medical, insurance, legal, contracts — OR anything you're not sure about. Always prefer this when uncertain.
- likely_archive: not urgent but worth keeping (read newsletters, shipping confirmations from past purchases, social notifications you may revisit).
- likely_trash: clearly low-value (promotional / marketing emails, generic ads, expired offers, mass-sent content with no personal relevance).

CRITICAL RULES
1. When in doubt, choose review_needed. Do not discard anything that could matter.
2. Receipts, invoices, orders, payments, login alerts, security/2FA, banking, government, school, medical, insurance, legal → ALWAYS review_needed.
3. Personal emails from real people → keep.
4. Pure marketing / promotion with no transaction → likely_trash.
5. Old newsletters or routine notifications → likely_archive.

OUTPUT
Use the classify_messages tool. Provide a classification for EVERY input message — do not skip any. The "reason" must be a brief 繁體中文 phrase (e.g. "促銷信"、"登入驗證碼，需保留"、"個人來信"、"電子報").`;

const CLASSIFY_TOOL = {
  name: 'classify_messages',
  description: 'Return a classification for every input email message.',
  input_schema: {
    type: 'object',
    properties: {
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Gmail message id, echoed from input' },
            classification: {
              type: 'string',
              enum: ['keep', 'review_needed', 'likely_archive', 'likely_trash'],
            },
            reason: { type: 'string', description: '簡短中文理由' },
          },
          required: ['id', 'classification', 'reason'],
        },
      },
    },
    required: ['classifications'],
  },
};

function compact(m) {
  return {
    id: m.id,
    from: m.from,
    subject: m.subject,
    date: m.date,
    snippet: (m.snippet || '').slice(0, 240),
  };
}

async function classifyBatch(client, model, batch) {
  const res = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_messages' },
    messages: [
      {
        role: 'user',
        content: `Classify these ${batch.length} emails:\n\n${JSON.stringify(batch.map(compact), null, 2)}`,
      },
    ],
  });

  const toolUse = res.content.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return a tool_use block');
  return toolUse.input.classifications || [];
}

async function classifyAll(messages, { batchSize = 25, onProgress } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env or your shell.');
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  const valid = messages.filter((m) => !m.error);
  const byId = new Map();
  let done = 0;

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(i, i + batchSize);
    try {
      const out = await classifyBatch(client, model, batch);
      for (const c of out) byId.set(c.id, c);
    } catch (err) {
      console.error(`\nBatch ${Math.floor(i / batchSize) + 1} failed: ${err.message}`);
    }
    done += batch.length;
    if (onProgress) onProgress(done, valid.length);
  }

  return messages.map((m) => {
    if (m.error) {
      return { ...m, classification: 'review_needed', reason: `metadata fetch failed: ${m.error}` };
    }
    const c = byId.get(m.id);
    if (!c) return { ...m, classification: 'review_needed', reason: '分類失敗，預設保留審閱' };
    return { ...m, classification: c.classification, reason: c.reason };
  });
}

module.exports = { classifyAll, DEFAULT_MODEL };
