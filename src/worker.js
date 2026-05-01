export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/status") {
      return json({
        ok: true,
        log_configured: Boolean(env.LOGS_KV),
        log_backend: env.LOGS_KV ? "cloudflare_kv" : "not_configured",
        log_url: `${url.origin}/api/logs`,
        csv_url: `${url.origin}/api/logs.csv`,
        client_info_url: `${url.origin}/api/client-info`,
        stored_rows: env.LOGS_KV ? (await readRows(env)).length : 0
      });
    }

    if (url.pathname === "/api/client-info") {
      return clientInfo(request);
    }

    if (url.pathname === "/api/log" && request.method === "POST") {
      return appendLog(request, env);
    }

    if (url.pathname === "/api/clear" && request.method === "POST") {
      return clearLogs(env);
    }

    if (url.pathname === "/api/logs") {
      return logsJson(env);
    }

    if (url.pathname === "/api/logs.csv") {
      return logsCsv(env);
    }

    return env.STATIC_ASSETS.fetch(request);
  }
};

function clientInfo(request) {
  const headers = request.headers;
  const cf = request.cf || {};
  return json({
    ok: true,
    observed_at: new Date().toISOString(),
    ip: headers.get("cf-connecting-ip") || "",
    country: headers.get("cf-ipcountry") || "",
    colo: cf.colo || "",
    asn: cf.asn || null,
    as_organization: cf.asOrganization || "",
    city: cf.city || "",
    region: cf.region || "",
    timezone: cf.timezone || "",
    tls_version: cf.tlsVersion || "",
    tls_cipher: cf.tlsCipher || "",
    http_protocol: cf.httpProtocol || "",
    user_agent: headers.get("user-agent") || "",
    accept_language: headers.get("accept-language") || "",
    sec_ch_ua: headers.get("sec-ch-ua") || "",
    sec_ch_ua_platform: headers.get("sec-ch-ua-platform") || "",
    sec_ch_ua_mobile: headers.get("sec-ch-ua-mobile") || ""
  });
}

async function appendLog(request, env) {
  if (!env.LOGS_KV) {
    return json({
      ok: false,
      log_configured: false,
      error: "LOGS_KV is not configured"
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const entry = payload.entry || {};
  const envInfo = payload.environment || {};
  const rows = await readRows(env);
  rows.push({
    received_at: new Date().toISOString(),
    timestamp: entry.timestamp || "",
    session_id: payload.session_id || "",
    section: entry.section || "",
    test_name: entry.test_name || "",
    uri: entry.uri || "",
    user_action: entry.user_action || "",
    manual_result: entry.manual_result || "",
    notes: entry.notes || "",
    user_agent: envInfo.user_agent || "",
    current_url: envInfo.current_url || "",
    payload_json: JSON.stringify(payload)
  });

  await env.LOGS_KV.put("logs", JSON.stringify(rows.slice(-1000)));
  return json({ ok: true, log_configured: true, stored_rows: rows.length });
}

async function clearLogs(env) {
  if (!env.LOGS_KV) {
    return json({ ok: false, log_configured: false, error: "LOGS_KV is not configured" });
  }
  await env.LOGS_KV.put("logs", JSON.stringify([]));
  return json({ ok: true, log_configured: true, cleared: true });
}

async function logsJson(env) {
  const rows = await readRows(env);
  return json({
    ok: true,
    log_configured: Boolean(env.LOGS_KV),
    count: rows.length,
    logs: rows
  });
}

async function logsCsv(env) {
  const headers = [
    "timestamp",
    "session_id",
    "section",
    "test_name",
    "uri",
    "user_action",
    "manual_result",
    "notes",
    "user_agent",
    "current_url",
    "payload_json",
    "received_at"
  ];
  const rows = await readRows(env);
  const csvRows = [headers].concat(rows.map(row => headers.map(header => row[header] || "")));
  const csv = csvRows.map(row => row.map(csvEscape).join(",")).join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function readRows(env) {
  if (!env.LOGS_KV) return [];
  const raw = await env.LOGS_KV.get("logs");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function csvEscape(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
