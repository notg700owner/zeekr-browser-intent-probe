const SHEET_ID = '1WIbHycHdbo59ZDMxTi8jssTu-Gjtze94-bB22FKHnqA';
const SHEET_NAME = 'Sheet1';
const SHARED_SECRET = '';

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

  if (SHARED_SECRET && body.shared_secret !== SHARED_SECRET) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  ensureHeader_(sheet);

  if (body.action === 'clear') {
    clearRows_(sheet);
    return json_({ ok: true, action: 'clear' });
  }

  if (body.action !== 'append') {
    return json_({ ok: false, error: 'unknown action' });
  }

  const payload = body.payload || {};
  const entry = payload.entry || {};
  const env = payload.environment || {};

  sheet.appendRow([
    entry.timestamp || '',
    payload.session_id || '',
    entry.section || '',
    entry.test_name || '',
    entry.uri || '',
    entry.user_action || '',
    entry.manual_result || '',
    entry.notes || '',
    env.user_agent || '',
    env.current_url || '',
    JSON.stringify(payload),
    body.received_at || new Date().toISOString()
  ]);

  return json_({ ok: true, action: 'append' });
}

function ensureHeader_(sheet) {
  const headers = [
    'timestamp',
    'session_id',
    'section',
    'test_name',
    'uri',
    'user_action',
    'manual_result',
    'notes',
    'user_agent',
    'current_url',
    'payload_json',
    'received_at'
  ];
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (current.join('') !== headers.join('')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function clearRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
