(function () {
  "use strict";

  var STORAGE_KEY = "zbip.report.v2";
  var APP_VERSION = "1.2.0";
  var BUILD_DATE = "2026-04-29T15:45:00Z";
  var canUseLocalStorage = false;
  var logSyncQueue = Promise.resolve();
  var serverLogs = [];

  var state = {
    session_id: getSessionId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    environment: {},
    logs: [],
    notes: ""
  };

  var chromeSurfaces = [
    ["Chrome version", "chrome://version"],
    ["Chrome GPU", "chrome://gpu"],
    ["Chrome sandbox", "chrome://sandbox"],
    ["Chrome policy", "chrome://policy"],
    ["Chrome flags", "chrome://flags"],
    ["Chrome downloads", "chrome://downloads"],
    ["Chrome crashes", "chrome://crashes"],
    ["File root", "file:///"],
    ["About blank", "about:blank"]
  ];

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    canUseLocalStorage = storageAvailable("localStorage");
    loadState();
    renderBuildMeta();
    refreshEnvironment();
    bindTabs();
    bindActions();
    renderChromeLinks();
    renderAll();
    checkServerLog();
    refreshServerLog();
    setInterval(refreshServerLog, 5000);
    logEvent("session", "page loaded", location.href, "load", "", "");
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
      if (action === "run-full-probe") return runFullProbe();
      if (action === "refresh-env") return handleAction("session", "Refresh environment", "", "tap", refreshEnvironment);
      if (action === "copy-env") return handleAction("session", "Copy environment", "", "tap", function () { return copyText(JSON.stringify(state.environment, null, 2)); });
      if (action === "save-notes") return saveNotes();
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

  async function runFullProbe() {
    setProbeStatus("Running browser probe...");
    refreshEnvironment();
    logStructured("probe", "Environment snapshot", location.href, "run", "captured", state.environment);

    var tests = [
      ["Chromium version hints", collectVersionHints],
      ["Security context and isolation", collectSecurityContext],
      ["Storage and cookie capability", testStorageCapabilities],
      ["Download capability", testDownloadCapabilities],
      ["Permissions API snapshot", collectPermissions],
      ["High-risk web APIs", collectHighRiskApis],
      ["WebGL fingerprint", collectWebGl],
      ["WebRTC support", collectWebRtc],
      ["Service worker and cache", collectWorkerAndCache],
      ["Internal scheme navigation", testInternalSchemes]
    ];

    for (var i = 0; i < tests.length; i++) {
      var name = tests[i][0];
      try {
        setProbeStatus("Running: " + name);
        var result = await tests[i][1]();
        logStructured("browser_probe", name, "", "run", "captured", result);
      } catch (err) {
        logStructured("browser_probe", name, "", "run", "error", { message: err.message || String(err) });
      }
    }

    setProbeStatus("Probe complete. Results are in the shared server log.");
    refreshServerLog();
  }

  function collectVersionHints() {
    var uaData = navigator.userAgentData ? {
      brands: navigator.userAgentData.brands || [],
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform
    } : null;
    return Promise.resolve({
      user_agent: navigator.userAgent,
      app_version: navigator.appVersion,
      vendor: navigator.vendor,
      platform: navigator.platform,
      product: navigator.product,
      user_agent_data: uaData,
      webdriver: navigator.webdriver === true,
      chrome_object: typeof window.chrome,
      chrome_keys: window.chrome ? Object.keys(window.chrome).slice(0, 30) : []
    });
  }

  function collectSecurityContext() {
    return Promise.resolve({
      is_secure_context: window.isSecureContext,
      cross_origin_isolated: window.crossOriginIsolated,
      origin: location.origin,
      protocol: location.protocol,
      referrer: document.referrer,
      cookie_enabled: navigator.cookieEnabled,
      shared_array_buffer: typeof SharedArrayBuffer !== "undefined",
      credentialless_iframe: "credentialless" in document.createElement("iframe"),
      fenced_frame: "HTMLFencedFrameElement" in window,
      csp_nonce_present: Boolean(document.querySelector("script[nonce], style[nonce]"))
    });
  }

  function testStorageCapabilities() {
    var out = {};
    try { localStorage.setItem("zbip.local", "ok"); out.localStorage = localStorage.getItem("zbip.local"); } catch (err) { out.localStorage_error = err.message; }
    try { sessionStorage.setItem("zbip.session", "ok"); out.sessionStorage = sessionStorage.getItem("zbip.session"); } catch (err) { out.sessionStorage_error = err.message; }
    try { document.cookie = "zbip_cookie=ok; path=/; SameSite=Lax"; out.cookie_visible = document.cookie.indexOf("zbip_cookie=ok") >= 0; } catch (err) { out.cookie_error = err.message; }
    out.indexedDB = "indexedDB" in window;
    out.storage_estimate_supported = Boolean(navigator.storage && navigator.storage.estimate);
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (estimate) { out.storage_estimate = estimate; return out; });
    }
    return Promise.resolve(out);
  }

  function testDownloadCapabilities() {
    var anchor = document.createElement("a");
    var blobSupported = false;
    var dataSupported = false;
    try {
      var blob = new Blob(["zbip download probe"], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = "zbip-download-probe.txt";
      blobSupported = Boolean(anchor.download);
      URL.revokeObjectURL(url);
    } catch (err) {}
    try {
      anchor.href = "data:text/plain,zbip";
      anchor.download = "zbip-data-probe.txt";
      dataSupported = Boolean(anchor.download);
    } catch (err2) {}
    return Promise.resolve({
      anchor_download_attribute: "download" in anchor,
      blob_url_constructable: blobSupported,
      data_url_download_constructable: dataSupported,
      note: "This does not force a download; it checks browser support only. Prior manual result showed browser download UI blocks downloads."
    });
  }

  async function collectPermissions() {
    var names = ["geolocation", "camera", "microphone", "notifications", "clipboard-read", "clipboard-write", "persistent-storage", "midi"];
    var out = {};
    if (!navigator.permissions || !navigator.permissions.query) return { supported: false };
    for (var i = 0; i < names.length; i++) {
      try {
        var status = await navigator.permissions.query({ name: names[i] });
        out[names[i]] = status.state;
      } catch (err) {
        out[names[i]] = "unsupported: " + err.message;
      }
    }
    return out;
  }

  function collectHighRiskApis() {
    return Promise.resolve({
      webusb: "usb" in navigator,
      webhid: "hid" in navigator,
      webserial: "serial" in navigator,
      webbluetooth: "bluetooth" in navigator,
      webnfc: "NDEFReader" in window,
      webgpu: "gpu" in navigator,
      webgl: Boolean(document.createElement("canvas").getContext("webgl")),
      webgl2: Boolean(document.createElement("canvas").getContext("webgl2")),
      wasm: typeof WebAssembly !== "undefined",
      webassembly_compile_streaming: Boolean(WebAssembly && WebAssembly.compileStreaming),
      payment_request: "PaymentRequest" in window,
      presentation_api: "PresentationRequest" in window,
      contacts_api: "contacts" in navigator,
      share_api: "share" in navigator,
      wake_lock: "wakeLock" in navigator,
      device_memory: navigator.deviceMemory || null,
      hardware_concurrency: navigator.hardwareConcurrency || null
    });
  }

  function collectWebGl() {
    var canvas = document.createElement("canvas");
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return Promise.resolve({ supported: false });
    var debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return Promise.resolve({
      supported: true,
      version: gl.getParameter(gl.VERSION),
      shading_language_version: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmasked_vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
      unmasked_renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      extensions: gl.getSupportedExtensions() || []
    });
  }

  function collectWebRtc() {
    var supported = "RTCPeerConnection" in window;
    var out = { supported: supported };
    if (!supported) return Promise.resolve(out);
    return new Promise(function (resolve) {
      var ips = [];
      var pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("zbip");
      pc.onicecandidate = function (event) {
        if (!event.candidate) return;
        var cand = event.candidate.candidate;
        ips.push(cand);
      };
      pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).catch(function (err) { out.error = err.message; });
      setTimeout(function () {
        try { pc.close(); } catch (err2) {}
        out.ice_candidates = ips;
        out.note = "Modern Chromium may hide local IPs with mDNS hostnames.";
        resolve(out);
      }, 1200);
    });
  }

  function collectWorkerAndCache() {
    return Promise.resolve({
      service_worker: "serviceWorker" in navigator,
      caches: "caches" in window,
      worker: "Worker" in window,
      shared_worker: "SharedWorker" in window,
      broadcast_channel: "BroadcastChannel" in window,
      beacon: Boolean(navigator.sendBeacon)
    });
  }

  async function testInternalSchemes() {
    var schemes = ["chrome://version", "chrome://gpu", "chrome://sandbox", "chrome://policy", "file:///", "about:blank"];
    var out = {};
    for (var i = 0; i < schemes.length; i++) {
      var a = document.createElement("a");
      a.href = schemes[i];
      out[schemes[i]] = { parsed_href: a.href, protocol: a.protocol, note: "Manual open links are shown separately; this test does not navigate." };
    }
    return out;
  }

  function renderChromeLinks() {
    var holder = document.getElementById("chromeLinks");
    holder.innerHTML = "";
    chromeSurfaces.forEach(function (item) {
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
      copy.addEventListener("click", function () { handleAction("chrome_surface", title, uri, "copy", function () { return copyText(uri); }); });
      var open = document.createElement("button");
      open.type = "button";
      open.textContent = "Open";
      open.addEventListener("click", function () { logEvent("chrome_surface", title, uri, "open", "opened link attempt", ""); location.href = uri; });
      row.appendChild(copy);
      row.appendChild(open);
      card.appendChild(h3);
      card.appendChild(raw);
      card.appendChild(row);
      holder.appendChild(card);
    });
  }

  function handleAction(section, name, uri, userAction, fn) {
    logEvent(section, name, uri, userAction, "started", "");
    Promise.resolve().then(fn).then(function (result) {
      if (result) logEvent(section, name, uri, userAction, String(result), "");
      renderAll();
    }).catch(function (err) {
      logEvent(section, name, uri, userAction, "error", err && err.message ? err.message : String(err));
      renderAll();
    });
  }

  function logStructured(section, testName, uri, userAction, manualResult, data) {
    logEvent(section, testName, uri, userAction, manualResult, JSON.stringify(data));
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
      languages: navigator.languages || [],
      screen_size: screen.width + "x" + screen.height,
      available_screen_size: screen.availWidth + "x" + screen.availHeight,
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

  function renderAll() {
    renderEnv();
    renderLogs();
    renderReport();
    setStorageStatus(canUseLocalStorage ? "Storage: localStorage active" : "Storage: memory only");
  }

  function renderEnv() {
    var envInfo = document.getElementById("envInfo");
    envInfo.innerHTML = "";
    Object.entries(state.environment).forEach(function (entry) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt");
      var dd = document.createElement("dd");
      dt.textContent = labelize(entry[0]);
      dd.textContent = typeof entry[1] === "object" ? JSON.stringify(entry[1]) : String(entry[1]);
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      envInfo.appendChild(wrap);
    });
    document.getElementById("notes").value = state.notes || "";
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
      var searchOk = !search || JSON.stringify(entry).toLowerCase().indexOf(search) >= 0;
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
      notes: state.notes,
      local_logs: state.logs,
      server_logs: serverLogs
    };
  }

  function saveNotes() {
    state.notes = document.getElementById("notes").value;
    saveState();
    logEvent("notes", "Save observations", "", "tap", "saved", "");
  }

  function clearLog() {
    if (!confirm("Clear the shared server log and local log entries?")) return;
    state.logs = [];
    saveState();
    renderAll();
    clearServerLog();
  }

  function postLogEntry(entry) {
    logSyncQueue = logSyncQueue.then(function () {
      return fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.session_id, environment: state.environment, entry: entry }),
        keepalive: true
      }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      }).then(function (body) {
        setServerLogStatus(body.log_configured ? "synced (" + body.stored_rows + " rows)" : "server log not configured");
        refreshServerLog();
      }).catch(function (err) {
        setServerLogStatus("not synced: " + err.message);
      });
    });
  }

  function clearServerLog() {
    fetch("/api/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: state.session_id }) })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        serverLogs = [];
        setServerLogStatus(body.log_configured ? "server log cleared" : "server log not configured");
        renderReport();
      }).catch(function (err) { setServerLogStatus("clear failed: " + err.message); });
  }

  function checkServerLog() {
    fetch("/api/status", { cache: "no-store" }).then(function (response) { return response.json(); }).then(function (body) {
      setServerLogStatus(body.log_configured ? "ready (" + body.stored_rows + " rows)" : "server log not configured");
    }).catch(function () { setServerLogStatus("unavailable"); });
  }

  function refreshServerLog() {
    return fetch("/api/logs", { cache: "no-store" }).then(function (response) { return response.json(); }).then(function (body) {
      serverLogs = Array.isArray(body.logs) ? body.logs.slice().reverse() : [];
      setServerLogStatus(body.log_configured ? "streaming (" + body.count + " rows)" : "server log not configured");
      renderReport();
    }).catch(function (err) { setServerLogStatus("refresh failed: " + err.message); });
  }

  function setServerLogStatus(text) {
    var el = document.getElementById("serverLogStatus");
    if (el) el.textContent = text;
  }

  function setProbeStatus(text) {
    var el = document.getElementById("probeStatus");
    if (el) el.textContent = text;
  }

  function renderBuildMeta() {
    document.getElementById("appVersion").textContent = APP_VERSION;
    document.getElementById("buildDate").textContent = BUILD_DATE;
  }

  function loadState() {
    if (!canUseLocalStorage) return;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      state.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    } catch (err) {}
  }

  function saveState() {
    state.updated_at = new Date().toISOString();
    if (!canUseLocalStorage) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { setStorageStatus("Storage: unavailable or full"); }
  }

  function storageAvailable(type) {
    try {
      var storage = window[type];
      var key = "__zbip_test__";
      storage.setItem(key, key);
      storage.removeItem(key);
      return true;
    } catch (err) { return false; }
  }

  function getSessionId() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (err) {}
    return "zbip-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function setStorageStatus(text) {
    document.getElementById("storageStatus").textContent = text;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return "copied"; });
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

  function labelize(value) {
    return value.replace(/_/g, " ").replace(/\b\w/g, function (char) { return char.toUpperCase(); });
  }
})();
