const fs = require('node:fs');

const COLUMNS = [
  { key: 'date', header: 'date' },
  { key: 'from', header: 'from' },
  { key: 'subject', header: 'subject' },
  { key: 'original_labels', header: 'original_labels' },
  { key: 'classification', header: 'classification' },
  { key: 'reason', header: 'reason' },
  { key: 'suggested_action', header: 'suggested_action' },
  { key: 'message_id', header: 'message_id' },
];

const ACTION_BY_CLASS = {
  keep: '保留在 INBOX',
  review_needed: '人工確認',
  likely_archive: '可封存',
  likely_trash: '可移到垃圾桶',
};

function escapeField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowFromMessage(m) {
  return {
    date: m.date || '',
    from: m.from || '',
    subject: m.subject || '',
    original_labels: (m.labelIds || []).join('|'),
    classification: m.classification || '',
    reason: m.reason || '',
    suggested_action: ACTION_BY_CLASS[m.classification] || '',
    message_id: m.id || '',
  };
}

function writeCsv(filePath, messages) {
  const rows = messages.map(rowFromMessage);
  const lines = [COLUMNS.map((c) => escapeField(c.header)).join(',')];
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => escapeField(r[c.key])).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

module.exports = { writeCsv };
