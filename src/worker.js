export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/status") {
      return json({
        ok: true,
        sheet_configured: Boolean(env.LOG_WEBHOOK_URL),
        sheet_url: "https://docs.google.com/spreadsheets/d/1WIbHycHdbo59ZDMxTi8jssTu-Gjtze94-bB22FKHnqA/edit"
      });
    }

    if (url.pathname === "/api/check-url") {
      return checkUrl(url.searchParams.get("url"));
    }

    if (url.pathname === "/api/log" && request.method === "POST") {
      return forwardToSheet(request, env, "append");
    }

    if (url.pathname === "/api/clear" && request.method === "POST") {
      return forwardToSheet(request, env, "clear");
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

async function forwardToSheet(request, env, action) {
  if (!env.LOG_WEBHOOK_URL) {
    return json({
      ok: false,
      sheet_configured: false,
      error: "LOG_WEBHOOK_URL is not configured"
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const outbound = {
    action,
    shared_secret: env.LOG_SHARED_SECRET || "",
    received_at: new Date().toISOString(),
    payload
  };

  const response = await fetch(env.LOG_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(outbound)
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    body = { raw: text };
  }

  return json({
    ok: response.ok,
    sheet_configured: true,
    sheet_response: body
  }, response.ok ? 200 : 502);
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
