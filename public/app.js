(function () {
  "use strict";

  var STORAGE_KEY = "zbip.report.v1";
  var APP_VERSION = "1.1.0";
  var BUILD_DATE = "2026-04-29T14:15:00Z";
  var DEFAULT_APK_URL = "https://github.com/notg700owner/zeekr-rear-recon/releases/download/v1.1/rearscreenv1.1.apk";
      var canUseLocalStorage = false;
  var logSyncQueue = Promise.resolve();
  var serverLogConfigured = null;
  var serverLogs = [];

  var state = {
    session_id: getSessionId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    environment: {},
    logs: [],
    manual_results: {},
    notes: "",
    callbacks: []
  };

  var settingsIntents = [
    ["Main Settings", "intent:#Intent;action=android.settings.SETTINGS;end"],
    ["Developer Options / Application Development Settings", "intent:#Intent;action=android.settings.APPLICATION_DEVELOPMENT_SETTINGS;end"],
    ["About Device", "intent:#Intent;action=android.settings.DEVICE_INFO_SETTINGS;end"],
    ["WiFi Settings", "intent:#Intent;action=android.settings.WIFI_SETTINGS;end"],
    ["Bluetooth Settings", "intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end"],
    ["Display Settings", "intent:#Intent;action=android.settings.DISPLAY_SETTINGS;end"],
    ["Security Settings", "intent:#Intent;action=android.settings.SECURITY_SETTINGS;end"],
    ["Date Settings", "intent:#Intent;action=android.settings.DATE_SETTINGS;end"],
    ["App Settings", "intent:#Intent;action=android.settings.APPLICATION_SETTINGS;end"],
    ["Manage All Applications", "intent:#Intent;action=android.settings.MANAGE_ALL_APPLICATIONS_SETTINGS;end"],
    ["Manage Unknown App Sources", "intent:#Intent;action=android.settings.MANAGE_UNKNOWN_APP_SOURCES;end"]
  ];

  var basicTests = [
    ["Open normal HTTPS URL", "Open Cloudflare over HTTPS", function () { openUri("https://www.cloudflare.com/"); return "opened link attempt"; }],
    ["Open same-origin test page anchor", "Navigate to a harmless local hash", function () { openUri(location.origin + location.pathname + "#same-origin-test-" + Date.now()); return "opened link attempt"; }],
    ["Open blob download test", "Create a local blob and open it", openBlobDownload],
    ["Open text file download test", "Create a text file download", openTextDownload],
    ["Open APK URL", "Open the configured Zeekr Rear Recon APK URL", function () { openUri(getApkUrl()); return "opened link attempt"; }],
    ["window.open test", "Call window.open only from this tap", function () { var w = window.open(location.href + "#window-open-" + Date.now(), "_blank"); return w ? "window.open returned a window object" : "window.open returned null or was blocked"; }],
    ["localStorage write/read test", "Write and read a local key", testLocalStorage],
    ["sessionStorage write/read test", "Write and read a session key", testSessionStorage],
    ["cookie write/read test", "Write and read a cookie", testCookie],
    ["clipboard write test", "Write text to clipboard if supported", testClipboardWrite],
    ["clipboard read test", "Read clipboard only after this tap and browser prompt", testClipboardRead]
  ];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    canUseLocalStorage = storageAvailable("localStorage");
    loadState();
    renderBuildMeta();
    refreshEnvironment();
    detectCallback();
    bindTabs();
    bindActions();
    renderBasicTests();
    renderCustomLinks();
    renderSettingsLinks();
    renderAll();
    checkServerLog();
    refreshServerLog();
    setInterval(refreshServerLog, 5000);
    logEvent("session", "page loaded", location.href, "load", "", "");
  }

  function getSessionId() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (err) {}
    return "zbip-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function storageAvailable(type) {
    try {
      var storage = window[type];
      var key = "__zbip_test__";
      storage.setItem(key, key);
      storage.removeItem(key);
      return true;
    } catch (err) {
      return false;
    }
  }

  function loadState() {
    if (!canUseLocalStorage) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      state.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
      state.callbacks = Array.isArray(parsed.callbacks) ? parsed.callbacks : [];
      state.manual_results = parsed.manual_results || {};
    } catch (err) {
      console.warn("Could not load saved report", err);
    }
  }

  function saveState() {
    state.updated_at = new Date().toISOString();
    if (!canUseLocalStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      setStorageStatus("Storage: unavailable or full");
    }
  }

  function refreshEnvironment() {
    state.environment = collectEnvironment();
    saveState();
    renderEnv();
  }

  function collectEnvironment() {
    return {
      timestamp: new Date().toISOString(),
      current_url: location.href,
      user_agent: navigator.userAgent,
      platform: navigator.platform || "",
      language: navigator.language || "",
      screen_size: screen.width + "x" + screen.height,
      viewport_size: window.innerWidth + "x" + window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      touch_support: ("ontouchstart" in window) || (navigator.maxTouchPoints > 0),
      max_touch_points: navigator.maxTouchPoints || 0,
      online: navigator.onLine,
      cookie_enabled: navigator.cookieEnabled,
      localStorage_available: storageAvailable("localStorage"),
      sessionStorage_available: storageAvailable("sessionStorage"),
      referrer: document.referrer || "",
      protocol: location.protocol,
      host: location.host,
      path: location.pathname + location.search + location.hash
    };
  }

  function renderBuildMeta() {
    document.getElementById("appVersion").textContent = APP_VERSION;
    document.getElementById("buildDate").textContent = BUILD_DATE;
  }

  function detectCallback() {
    var params = new URLSearchParams(location.search);
    if (!params.has("callback")) return;
    var callback = {
      timestamp: new Date().toISOString(),
      url: location.href,
      params: paramsToObject(params)
    };
    state.callbacks.push(callback);
    saveState();
    document.getElementById("callbackBanner").classList.remove("hidden");
    document.getElementById("callbackData").textContent = JSON.stringify(callback, null, 2);
    logEvent("callback", "callback received", location.href, "page_load", "received", "");
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (tab) { tab.classList.remove("is-active"); });
        document.querySelectorAll(".tab-panel").forEach(function (panel) { panel.classList.remove("is-active"); });
        button.classList.add("is-active");
        document.getElementById("tab-" + button.dataset.tab).classList.add("is-active");
        renderReport();
      });
    });
  }

  function bindActions() {
    document.body.addEventListener("click", function (event) {
      var target = event.target.closest("[data-action]");
      if (!target) return;
      var action = target.dataset.action;
      if (action === "refresh-env") return handleAction("session", "Refresh environment info", "", "tap", refreshEnvironment);
      if (action === "copy-env") return handleAction("session", "Copy environment info", "", "tap", function () { return copyText(JSON.stringify(state.environment, null, 2)); });
      if (action === "download-report") return handleAction("report", "Download full report JSON", "", "tap", function () { downloadJson("zeekr-browser-intent-probe-report.json", buildReport()); });
      if (action === "clear-session") return clearSession();
      if (action === "open-apk-url") return openApkUrl();
      if (action === "copy-apk-url") return handleAction("apk", "Copy APK URL", getApkUrl(), "tap", function () { return copyText(getApkUrl()); });
      if (action === "test-apk-url") return testApkUrl();
      if (action === "refresh-custom-links") return handleAction("custom_scheme", "Regenerate custom links", "", "tap", renderCustomLinks);
      if (action === "save-notes") return saveNotes();
      if (action === "generate-builder") return generateBuilderLinks();
      if (action === "copy-visible-log") return handleAction("report", "Copy visible log", "", "tap", function () { return copyText(JSON.stringify(getFilteredLogs(), null, 2)); });
      if (action === "download-log") return handleAction("report", "Download server log JSON", "", "tap", function () { downloadJson("zeekr-browser-intent-probe-server-log.json", serverLogs); });
      if (action === "refresh-server-log") return refreshServerLog();
      if (action === "clear-log") return clearLog();
    });

    window.addEventListener("online", function () { refreshEnvironment(); logEvent("session", "browser online", location.href, "event", "online", ""); });
    window.addEventListener("offline", function () { refreshEnvironment(); logEvent("session", "browser offline", location.href, "event", "offline", ""); });
    document.getElementById("sectionFilter").addEventListener("change", renderReport);
    document.getElementById("logSearch").addEventListener("input", renderReport);
  }

  function handleAction(section, name, uri, userAction, fn) {
    logEvent(section, name, uri, userAction, "started", "");
    Promise.resolve()
      .then(fn)
      .then(function (result) {
        if (result) logEvent(section, name, uri, userAction, String(result), "");
        renderAll();
      })
      .catch(function (err) {
        logEvent(section, name, uri, userAction, "error", err && err.message ? err.message : String(err));
        renderAll();
      });
  }

  function logEvent(section, testName, uri, userAction, manualResult, notes) {
    var entry = {
      timestamp: new Date().toISOString(),
      section: section,
      test_name: testName,
      uri: uri || "",
      user_action: userAction || "",
      manual_result: manualResult || "",
      notes: notes || ""
    };
    state.logs.unshift(entry);
    saveState();
    renderAll();
    postLogEntry(entry);
  }

  function markManual(section, testName, uri, result) {
    var key = section + "::" + testName + "::" + uri;
    state.manual_results[key] = {
      timestamp: new Date().toISOString(),
      section: section,
      test_name: testName,
      uri: uri,
      result: result
    };
    logEvent(section, testName, uri, "manual_result", result, "");
  }

  function renderAll() {
    renderEnv();
    renderLogs();
    renderReport();
    setStorageStatus(canUseLocalStorage ? "Storage: localStorage active" : "Storage: memory only");
  }

  function setStorageStatus(text) {
    document.getElementById("storageStatus").textContent = text;
  }

  function renderEnv() {
    var envInfo = document.getElementById("envInfo");
    envInfo.innerHTML = "";
    Object.entries(state.environment).forEach(function (entry) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = labelize(entry[0]);
      dd.textContent = String(entry[1]);
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      envInfo.appendChild(wrap);
    });
    document.getElementById("notes").value = state.notes || "";
  }

  function renderBasicTests() {
    var holder = document.getElementById("basicTests");
    holder.innerHTML = "";
    basicTests.forEach(function (test) {
      var card = document.createElement("article");
      card.className = "test-card";
      card.innerHTML = "<h3></h3><p class=\"hint\"></p>";
      card.querySelector("h3").textContent = test[0];
      card.querySelector("p").textContent = test[1];
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Run manual test";
      button.addEventListener("click", function () {
        handleAction("basic", test[0], "", "tap", test[2]);
      });
      card.appendChild(button);
      holder.appendChild(card);
    });
  }

  function renderCustomLinks() {
    var scheme = cleanPart(document.getElementById("schemeInput").value || "zrr");
    var packageName = cleanPart(document.getElementById("packageInput").value || "com.zeekr.rearrecon");
    var hostPath = cleanHostPath(document.getElementById("hostPathInput").value || "ping");
    var ts = Date.now();
    var current = location.href.split("#")[0];
    var callbackBase = location.host ? "https://" + location.host + location.pathname : location.href.split("?")[0].split("#")[0];
    var callbackUrl = callbackBase + "?session=" + encodeURIComponent(state.session_id) + "&callback=1";
    var links = [
      ["Custom scheme direct", scheme + "://" + hostPath + "?source=cloudflare_probe&ts=" + ts],
      ["Android intent syntax to custom scheme", "intent://" + hostPath + "?source=cloudflare_probe&ts=" + ts + "#Intent;scheme=" + scheme + ";package=" + packageName + ";S.source=cloudflare_probe;S.callback_url=" + encodeURIComponent(callbackUrl) + ";end"],
      ["Android app URI", "android-app://" + packageName + "/" + scheme + "/" + hostPath],
      ["Fallback intent", "intent://" + hostPath + "#Intent;scheme=" + scheme + ";S.browser_fallback_url=" + encodeURIComponent(current) + ";S.callback_url=" + encodeURIComponent(callbackUrl) + ";end"]
    ];
    renderLinkCards("customLinks", "custom_scheme", links, ["opened", "blocked", "nothing happened", "crash", "other"]);
  }

  function renderSettingsLinks() {
    renderLinkCards("settingsLinks", "android_settings", settingsIntents, ["opened", "blocked", "no handler", "nothing happened", "browser error", "system error", "unknown"]);
  }

  function renderLinkCards(containerId, section, links, results) {
    var holder = document.getElementById(containerId);
    holder.innerHTML = "";
    links.forEach(function (item) {
      var title = item[0];
      var uri = item[1];
      var card = document.createElement("article");
      card.className = "link-card";
      var h3 = document.createElement("h3");
      h3.textContent = title;
      var raw = document.createElement("div");
      raw.className = "raw-uri";
      raw.textContent = uri;
      var row = document.createElement("div");
      row.className = "button-row";
      var copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", function () { handleAction(section, title, uri, "copy", function () { return copyText(uri); }); });
      var open = document.createElement("button");
      open.type = "button";
      open.textContent = "Open / Test";
      open.addEventListener("click", function () { handleAction(section, title, uri, "open", function () { openUri(uri); return "opened link attempt"; }); });
      row.appendChild(copy);
      row.appendChild(open);
      var manual = document.createElement("div");
      manual.className = "manual-results";
      results.forEach(function (result) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = "Mark: " + result;
        button.addEventListener("click", function () { markManual(section, title, uri, result); });
        manual.appendChild(button);
      });
      card.appendChild(h3);
      card.appendChild(raw);
      card.appendChild(row);
      card.appendChild(manual);
      holder.appendChild(card);
    });
  }

  function generateBuilderLinks() {
    var action = val("builderAction");
    var scheme = val("builderScheme");
    var packageName = val("builderPackage");
    var componentPackage = val("builderComponentPackage");
    var componentClass = val("builderComponentClass");
    var category = val("builderCategory");
    var extraKey = val("builderExtraKey");
    var extraValue = val("builderExtraValue");
    var fallback = val("builderFallback");
    var intentParts = ["#Intent"];
    if (action) intentParts.push("action=" + action);
    if (scheme) intentParts.push("scheme=" + scheme);
    if (packageName) intentParts.push("package=" + packageName);
    if (componentPackage && componentClass) intentParts.push("component=" + componentPackage + "/" + componentClass);
    if (category) intentParts.push("category=" + category);
    if (extraKey) intentParts.push("S." + extraKey + "=" + encodeURIComponent(extraValue));
    if (fallback) intentParts.push("S.browser_fallback_url=" + encodeURIComponent(fallback));
    intentParts.push("end");
    var links = [["Generated intent:// URI", "intent://generated" + intentParts.join(";")]];
    if (scheme) links.push(["Generated custom scheme URI", scheme + "://generated?source=builder"]);
    if (packageName) links.push(["Generated android-app:// URI", "android-app://" + packageName + (scheme ? "/" + scheme + "/generated" : "")]);
    renderLinkCards("builderLinks", "intent_builder", links, ["opened", "blocked", "no handler", "nothing happened", "browser error", "system error", "unknown"]);
    return "generated " + links.length + " URI(s)";
  }

  function getApkUrl() {
    return resolveUrl(document.getElementById("apkUrl").value || DEFAULT_APK_URL);
  }

  function openApkUrl() {
    var uri = getApkUrl();
    logEvent("apk", "Open APK URL", uri, "open", "opened link attempt", "");
    openUri(uri);
  }

  function testApkUrl() {
    var uri = getApkUrl();
    var resultEl = document.getElementById("apkResult");
    resultEl.textContent = "Testing link after manual tap...";
    fetch("/api/check-url?url=" + encodeURIComponent(uri), { cache: "no-store" })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, status: response.status, body: body };
        });
      })
      .then(function (result) {
        var body = result.body || {};
        var message = body.ok
          ? "Reachable: HTTP " + body.status + (body.content_type ? " (" + body.content_type + ")" : "")
          : "Possibly missing or blocked: " + (body.error || ("HTTP " + body.status));
        resultEl.textContent = message;
        logEvent("apk", "Test APK download link", uri, "tap", message, "");
      })
      .catch(function (err) {
        var message = "Could not verify. File may be missing, blocked, offline, or HEAD may be unsupported: " + err.message;
        resultEl.textContent = message;
        logEvent("apk", "Test APK download link", uri, "tap", "error", message);
      });
  }

  function openUri(uri) {
    location.href = uri;
  }

  function openBlobDownload() {
    var blob = new Blob(["Zeekr Browser Intent Probe blob test\n" + new Date().toISOString()], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "zbip-blob-test.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return "blob download click sent";
  }

  function openTextDownload() {
    var data = "data:text/plain;charset=utf-8," + encodeURIComponent("Zeekr Browser Intent Probe text download\n" + new Date().toISOString());
    var anchor = document.createElement("a");
    anchor.href = data;
    anchor.download = "zbip-text-test.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return "text download click sent";
  }

  function testLocalStorage() {
    localStorage.setItem("zbip.local.test", "ok-" + Date.now());
    return "read " + localStorage.getItem("zbip.local.test");
  }

  function testSessionStorage() {
    sessionStorage.setItem("zbip.session.test", "ok-" + Date.now());
    return "read " + sessionStorage.getItem("zbip.session.test");
  }

  function testCookie() {
    document.cookie = "zbip_cookie_test=ok-" + Date.now() + "; path=/; SameSite=Lax";
    return document.cookie.indexOf("zbip_cookie_test=") >= 0 ? "cookie visible" : "cookie not visible";
  }

  function testClipboardWrite() {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return "clipboard.writeText unsupported";
    return navigator.clipboard.writeText("Zeekr Browser Intent Probe clipboard write " + new Date().toISOString()).then(function () {
      return "clipboard write resolved";
    });
  }

  function testClipboardRead() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return "clipboard.readText unsupported";
    return navigator.clipboard.readText().then(function (text) {
      return "clipboard read length " + text.length;
    });
  }

  function saveNotes() {
    state.notes = document.getElementById("notes").value;
    saveState();
    logEvent("notes", "Save observations", "", "tap", "saved", "");
  }

  function renderLogs() {
    renderLogList(document.getElementById("recentLog"), state.logs.slice(0, 20));
  }

  function renderReport() {
    updateSectionFilter(serverLogs);
    renderLogList(document.getElementById("fullLog"), getFilteredLogs());
  }

  function getFilteredLogs() {
    var logs = serverLogs.length ? serverLogs : state.logs;
    var section = document.getElementById("sectionFilter").value;
    var search = document.getElementById("logSearch").value.trim().toLowerCase();
    return logs.filter(function (entry) {
      var sectionOk = !section || entry.section === section;
      var text = JSON.stringify(entry).toLowerCase();
      var searchOk = !search || text.indexOf(search) >= 0;
      return sectionOk && searchOk;
    });
  }

  function renderLogList(container, logs) {
    container.innerHTML = "";
    if (!logs.length) {
      var empty = document.createElement("div");
      empty.className = "log-entry";
      empty.textContent = "No log entries yet.";
      container.appendChild(empty);
      return;
    }
    logs.forEach(function (entry) {
      var item = document.createElement("div");
      item.className = "log-entry";
      var meta = document.createElement("div");
      meta.className = "log-meta";
      meta.textContent = entry.timestamp + " | " + entry.section + " | " + entry.user_action;
      var title = document.createElement("div");
      title.className = "log-title";
      title.textContent = entry.test_name + (entry.manual_result ? " -> " + entry.manual_result : "");
      item.appendChild(meta);
      item.appendChild(title);
      if (entry.uri) {
        var uri = document.createElement("div");
        uri.className = "log-uri";
        uri.textContent = entry.uri;
        item.appendChild(uri);
      }
      if (entry.notes) {
        var notes = document.createElement("div");
        notes.className = "log-meta";
        notes.textContent = entry.notes;
        item.appendChild(notes);
      }
      container.appendChild(item);
    });
  }

  function updateSectionFilter(logs) {
    var select = document.getElementById("sectionFilter");
    var current = select.value;
    var sections = Array.from(new Set(logs.map(function (entry) { return entry.section; }).filter(Boolean))).sort();
    select.innerHTML = "<option value=\"\">All sections</option>";
    sections.forEach(function (section) {
      var option = document.createElement("option");
      option.value = section;
      option.textContent = section;
      select.appendChild(option);
    });
    select.value = sections.indexOf(current) >= 0 ? current : "";
  }

  function buildReport() {
    return {
      tool: "Zeekr Browser Intent Probe",
      version: APP_VERSION,
      build_date: BUILD_DATE,
      session_id: state.session_id,
      created_at: state.created_at,
      updated_at: new Date().toISOString(),
      environment: state.environment,
      callbacks: state.callbacks,
      manual_results: state.manual_results,
      notes: state.notes,
      local_logs: state.logs,
      server_logs: serverLogs
    };
  }

  function clearLog() {
    if (!confirm("Clear the shared server log and local log entries?")) return;
    state.logs = [];
    saveState();
    renderAll();
    clearServerLog();
  }

  function clearSession() {
    if (!confirm("Clear the full local session in this browser?")) return;
    if (canUseLocalStorage) localStorage.removeItem(STORAGE_KEY);
    state = {
      session_id: getSessionId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      environment: {},
      logs: [],
      manual_results: {},
      notes: "",
      callbacks: []
    };
    refreshEnvironment();
    renderAll();
    clearServerLog();
  }

  function postLogEntry(entry) {
    logSyncQueue = logSyncQueue.then(function () {
      return fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: state.session_id,
          environment: state.environment,
          entry: entry
        }),
        keepalive: true
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (body) {
          serverLogConfigured = Boolean(body.log_configured);
          setServerLogStatus(body.log_configured ? "synced (" + body.stored_rows + " rows)" : "server log not configured");
          refreshServerLog();
        })
        .catch(function (err) {
          setServerLogStatus("not synced: " + err.message);
        });
    });
  }

  function clearServerLog() {
    fetch("/api/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: state.session_id })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (body) {
        serverLogConfigured = Boolean(body.log_configured);
        serverLogs = [];
        setServerLogStatus(body.log_configured ? "server log cleared" : "server log not configured");
        renderReport();
      })
      .catch(function (err) {
        setServerLogStatus("clear failed: " + err.message);
      });
  }

  function checkServerLog() {
    fetch("/api/status", { cache: "no-store" })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        serverLogConfigured = Boolean(body.log_configured);
        setServerLogStatus(body.log_configured ? "ready (" + body.stored_rows + " rows)" : "server log not configured");
      })
      .catch(function () {
        setServerLogStatus("unavailable");
      });
  }

  function refreshServerLog() {
    return fetch("/api/logs", { cache: "no-store" })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        serverLogConfigured = Boolean(body.log_configured);
        serverLogs = Array.isArray(body.logs) ? body.logs.slice().reverse() : [];
        setServerLogStatus(body.log_configured ? "streaming (" + body.count + " rows)" : "server log not configured");
        renderReport();
      })
      .catch(function (err) {
        setServerLogStatus("refresh failed: " + err.message);
      });
  }

  function setServerLogStatus(text) {
    var el = document.getElementById("serverLogStatus");
    if (el) el.textContent = text;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return "copied"; });
    }
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    var ok = document.execCommand("copy");
    area.remove();
    return ok ? "copied" : "copy unsupported";
  }

  function downloadJson(filename, value) {
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return "download started";
  }

  function resolveUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch (err) {
      return value;
    }
  }

  function labelize(value) {
    return value.replace(/_/g, " ").replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }

  function val(id) {
    return document.getElementById(id).value.trim();
  }

  function cleanPart(value) {
    return value.trim().replace(/[^a-zA-Z0-9._-]/g, "");
  }

  function cleanHostPath(value) {
    return value.trim().replace(/^\/+/, "").replace(/[^a-zA-Z0-9._~/?=&%-]/g, "");
  }

  function paramsToObject(params) {
    var output = {};
    params.forEach(function (value, key) {
      output[key] = value;
    });
    return output;
  }
})();
