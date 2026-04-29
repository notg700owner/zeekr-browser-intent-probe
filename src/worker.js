export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/status") {
      return json({
        ok: true,
        sheet_configured: Boolean(env.LOGS_KV),
        log_backend: env.LOGS_KV ? "cloudflare_kv_csv" : "not_configured",
        csv_url: `${url.origin}/api/logs.csv`,
        sheet_url: "https://docs.google.com/spreadsheets/d/1WIbHycHdbo59ZDMxTi8jssTu-Gjtze94-bB22FKHnqA/edit"
      });
    }

    if (url.pathname === "/api/check-url") {
      return checkUrl(url.searchParams.get("url"));
    }

    if (url.pathname === "/api/log" && request.method === "POST") {
      return appendLog(request, env);
    }

    if (url.pathname === "/api/clear" && request.method === "POST") {
      return clearLogs(env);
    }

    if (url.pathname === "/api/logs.csv") {
      return logsCsv(env);
    }

    return env.STATIC_ASSETS.fetch(request);
  }
};

async function checkUrl(target) {
  if (!target) return json({ ok: false, error: "missing url" }, 400);

  let parsed;
  try {
    parsed = new URL(target);
  } catch (err) {
    return json({ ok: false, error: "invalid url" }, 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return json({ ok: false, error: "only http/https URLs can be checked" }, 400);
  }

  try {
    const response = await fetch(parsed.href, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Zeekr-Browser-Intent-Probe/1.0" }
    });
    return json({
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      content_type: response.headers.get("content-type") || "",
      content_length: response.headers.get("content-length") || ""
    }, response.ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

async function appendLog(request, env) {
  if (!env.LOGS_KV) {
    return json({
      ok: false,
      sheet_configured: false,
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
  return json({ ok: true, sheet_configured: true, stored_rows: rows.length });
}

async function clearLogs(env) {
  if (!env.LOGS_KV) {
    return json({ ok: false, sheet_configured: false, error: "LOGS_KV is not configured" });
  }
  await env.LOGS_KV.put("logs", JSON.stringify([]));
  return json({ ok: true, sheet_configured: true, cleared: true });
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
