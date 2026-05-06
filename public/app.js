(function () {
  "use strict";

  var STORAGE_KEY = "zbip.report.v6";
  var APP_VERSION = "1.6.0";
  var BUILD_DATE = "2026-05-06T11:15:17Z";
  var DEFAULT_TEST_TIMEOUT_MS = 10000;
  var canUseLocalStorage = false;
  var logSyncQueue = Promise.resolve();
  var serverLogs = [];

  var state = {
    session_id: getSessionId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    environment: {},
    logs: [],
    notes: "",
    chain_evidence: ""
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
      if (action === "save-chain-evidence") return saveChainEvidence();
      if (action === "manual-clipboard-read") return handleAction("manual_prompt", "Clipboard read prompt", "", "tap", manualClipboardRead);
      if (action === "manual-persistent-storage") return handleAction("manual_prompt", "Persistent storage prompt", "", "tap", manualPersistentStorage);
      if (action === "manual-bluetooth-prompt") return handleAction("manual_prompt", "Web Bluetooth prompt", "", "tap", manualBluetoothPrompt);
      if (action === "manual-usb-prompt") return handleAction("manual_prompt", "WebUSB prompt", "", "tap", manualUsbPrompt);
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
      ["High entropy client hints", collectHighEntropyClientHints],
      ["Server observed client info", collectServerClientInfo],
      ["Request header echo", collectRequestHeaderEcho],
      ["Chrome legacy timing APIs", collectChromeLegacyTiming],
      ["Chain viability assessment", collectChainViabilityAssessment],
      ["Security context and isolation", collectSecurityContext],
      ["Storage and cookie capability", testStorageCapabilities],
      ["Cache persistence check", testCachePersistence],
      ["Service worker registration persistence", collectServiceWorkerRegistrationPersistence],
      ["Download capability", testDownloadCapabilities],
      ["Permissions API snapshot", collectPermissions],
      ["High-risk web APIs", collectHighRiskApis],
      ["Non-prompt device surface snapshot", collectDeviceSurfaces],
      ["Visuals compositor smoke", collectVisualsCompositorSmoke],
      ["Canvas and image surface", collectCanvasAndImageSurface],
      ["WebGL fingerprint", collectWebGl],
      ["WebGL limits and precision", collectWebGlLimitsAndPrecision],
      ["WebGPU adapter snapshot", collectWebGpu],
      ["V8 and WebAssembly smoke", collectV8AndWasmSmoke],
      ["WebAudio smoke", collectWebAudioSmoke],
      ["Codecs and media surface", collectCodecsAndMediaSurface],
      ["Sensors and hardware surface", collectSensorsAndHardwareSurface],
      ["Network and fetch policy surface", collectNetworkAndFetchPolicySurface],
      ["WebRTC support", collectWebRtc],
      ["Service worker and cache", collectWorkerAndCache],
      ["Frame and policy surface", collectFrameAndPolicySurface],
      ["Patch candidate matrix", collectPatchCandidateMatrix],
      ["Internal scheme navigation", testInternalSchemes]
    ];

    for (var i = 0; i < tests.length; i++) {
      var name = tests[i][0];
      try {
        setProbeStatus("Running: " + name);
        var result = await withTimeout(tests[i][1](), DEFAULT_TEST_TIMEOUT_MS, name);
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

  async function collectHighEntropyClientHints() {
    var out = {
      supported: Boolean(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
    };
    if (!out.supported) return out;
    var names = [
      "architecture",
      "bitness",
      "brands",
      "fullVersionList",
      "mobile",
      "model",
      "platform",
      "platformVersion",
      "uaFullVersion",
      "wow64"
    ];
    try {
      out.values = await navigator.userAgentData.getHighEntropyValues(names);
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  async function collectServerClientInfo() {
    try {
      var response = await fetch("/api/client-info", { cache: "no-store" });
      var body = await response.json();
      body.note = "Observed by the Cloudflare Worker from this browser request.";
      return body;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  async function collectRequestHeaderEcho() {
    try {
      var response = await fetch("/api/request-echo?ts=" + Date.now(), { cache: "no-store" });
      var body = await response.json();
      body.note = "Server-side echo of request headers visible to Cloudflare Worker. Useful when chrome:// pages are blocked.";
      return body;
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function collectChromeLegacyTiming() {
    var out = {
      chrome_object: typeof window.chrome,
      chrome_keys: window.chrome ? Object.keys(window.chrome).slice(0, 50) : []
    };
    try {
      out.csi = window.chrome && typeof window.chrome.csi === "function" ? window.chrome.csi() : null;
    } catch (err) {
      out.csi_error = err.message || String(err);
    }
    try {
      out.load_times = window.chrome && typeof window.chrome.loadTimes === "function" ? window.chrome.loadTimes() : null;
    } catch (err2) {
      out.load_times_error = err2.message || String(err2);
    }
    try {
      var nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
      out.navigation_timing = nav ? {
        type: nav.type,
        nextHopProtocol: nav.nextHopProtocol,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize,
        domInteractive: Math.round(nav.domInteractive),
        domComplete: Math.round(nav.domComplete)
      } : null;
    } catch (err3) {
      out.navigation_timing_error = err3.message || String(err3);
    }
    return Promise.resolve(out);
  }

  async function collectChainViabilityAssessment() {
    var versionInfo = await collectBestVersionInfo();
    var thresholds = [
      "124.0.6367.60",
      "124.0.6367.201",
      "124.0.6367.207"
    ];
    var comparisons = {};
    thresholds.forEach(function (threshold) {
      comparisons[threshold] = compareVersionForReport(versionInfo.best_version, threshold);
    });

    return {
      objective: "Assess whether a renderer compromise could plausibly progress toward shell/ADB/debug capability. This test does not attempt compromise.",
      automatic_findings: {
        best_visible_chromium_version: versionInfo.best_version,
        version_sources: versionInfo.sources,
        threshold_comparisons: comparisons,
        user_agent: navigator.userAgent,
        platform: navigator.platform || "",
        webgl_available: Boolean(document.createElement("canvas").getContext("webgl") || document.createElement("canvas").getContext("webgl2")),
        webgpu_exposed: "gpu" in navigator,
        webrtc_exposed: "RTCPeerConnection" in window,
        service_worker_exposed: "serviceWorker" in navigator,
        webusb_exposed: "usb" in navigator,
        webbluetooth_exposed: "bluetooth" in navigator,
        shared_array_buffer_exposed: typeof SharedArrayBuffer !== "undefined",
        cross_origin_isolated: window.crossOriginIsolated
      },
      chain_questions: [
        chainQuestion(1, "Identify exact Chromium version", versionInfo.best_version ? "partial_auto" : "unknown", "Use high-entropy UA hints and chrome://version. UA may be frozen or vendor-masked."),
        chainQuestion(2, "Before or after 124.0.6367.60", comparisons["124.0.6367.60"].status, comparisons["124.0.6367.60"].detail),
        chainQuestion(3, "Before or after 124.0.6367.201", comparisons["124.0.6367.201"].status, comparisons["124.0.6367.201"].detail),
        chainQuestion(4, "Before or after 124.0.6367.207", comparisons["124.0.6367.207"].status, comparisons["124.0.6367.207"].detail),
        chainQuestion(5, "Determine whether OEM backported patches without changing visible version", "requires_oem_or_binary_evidence", "Needs OEM patch notes, SBOM, Chromium commit metadata, binary strings, package build date, or vendor confirmation."),
        chainQuestion(6, "Determine whether browser uses normal Chromium sandboxing", "requires_manual_evidence", "Use chrome://sandbox and chrome://version command line. Web JS cannot prove sandbox status."),
        chainQuestion(7, "Determine whether Viz/GPU/browser processes are isolated", "requires_manual_evidence", "Use chrome://gpu, chrome://process-internals if available, chrome://version command line, or shell ps/procfs evidence."),
        chainQuestion(8, "Determine Android UID and SELinux domain", "requires_shell_or_authorised_apk", "Requires shell/ADB/recon APK. Browser JS cannot read Android UID, SELinux context, or /proc labels."),
        chainQuestion(9, "Determine privileged vendor permissions", "requires_shell_or_authorised_apk", "Requires package manager dumps, manifest/privapp permissions, appops, or recon APK evidence."),
        chainQuestion(10, "Determine whether renderer compromise exposes privileged IPC surfaces", "requires_architecture_review", "Requires process model, exposed Mojo/IPC services, SELinux policy, binder/socket access, and sandbox boundary review.")
      ],
      manual_evidence_currently_saved: state.chain_evidence || "",
      no_exploit_payloads_run: true
    };
  }

  async function collectBestVersionInfo() {
    var sources = {};
    var uaVersion = parseChromiumVersion(navigator.userAgent || "");
    if (uaVersion) sources.user_agent = uaVersion;

    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        var hints = await navigator.userAgentData.getHighEntropyValues(["uaFullVersion", "fullVersionList", "brands"]);
        sources.ua_full_version = hints.uaFullVersion || "";
        if (Array.isArray(hints.fullVersionList)) {
          sources.full_version_list = hints.fullVersionList;
        }
      } catch (err) {
        sources.high_entropy_error = err.message || String(err);
      }
    }

    var candidates = [];
    if (sources.ua_full_version) candidates.push(sources.ua_full_version);
    if (Array.isArray(sources.full_version_list)) {
      sources.full_version_list.forEach(function (item) {
        if (item && /Chrom(e|ium)/i.test(item.brand || "") && item.version) candidates.push(item.version);
      });
    }
    if (sources.user_agent) candidates.push(sources.user_agent);

    var best = candidates.find(function (value) {
      var parts = parseVersionParts(value);
      return parts && parts.length >= 4 && parts[1] !== 0;
    }) || candidates[0] || "";
    return { best_version: best, sources: sources };
  }

  function compareVersionForReport(candidate, threshold) {
    if (!candidate) {
      return { status: "unknown", detail: "No visible Chromium version was available." };
    }
    var cmp = compareVersions(candidate, threshold);
    if (cmp == null) {
      return { status: "unknown", detail: "Could not parse visible version " + candidate + " against " + threshold + "." };
    }
    if (cmp < 0) return { status: "before", detail: candidate + " is before " + threshold + " based on visible version only." };
    if (cmp > 0) return { status: "after", detail: candidate + " is after " + threshold + " based on visible version only." };
    return { status: "equal", detail: candidate + " equals " + threshold + " based on visible version only." };
  }

  function chainQuestion(id, question, status, evidenceNeeded) {
    return {
      id: id,
      question: question,
      status: status,
      evidence_needed: evidenceNeeded
    };
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

  async function testCachePersistence() {
    var out = { caches_supported: "caches" in window };
    if (!out.caches_supported) return out;
    var cacheName = "zbip-probe-cache-v1";
    var key = "/__zbip_cache_probe__?ts=" + Date.now();
    try {
      var cache = await caches.open(cacheName);
      await cache.put(key, new Response("zbip-cache-ok", {
        headers: { "Content-Type": "text/plain", "X-ZBIP-Probe": "1" }
      }));
      var match = await cache.match(key);
      out.write_read = Boolean(match);
      out.value = match ? await match.text() : "";
      await cache.delete(key);
      out.deleted_entry = true;
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  async function collectServiceWorkerRegistrationPersistence() {
    var out = {
      supported: "serviceWorker" in navigator,
      controller_present: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)
    };
    if (!out.supported) return out;
    try {
      var before = await navigator.serviceWorker.getRegistrations();
      out.registrations_before = before.length;
      var registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      out.registered = Boolean(registration);
      out.scope = registration.scope;
      await navigator.serviceWorker.ready;
      var after = await navigator.serviceWorker.getRegistrations();
      out.registrations_after = after.length;
      out.active_state = registration.active ? registration.active.state : "";
      out.installing_state = registration.installing ? registration.installing.state : "";
      out.waiting_state = registration.waiting ? registration.waiting.state : "";
      out.note = "Registration is intentionally left in place so a later run can check persistence after reload/restart.";
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
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
      webassembly_compile_streaming: typeof WebAssembly !== "undefined" && Boolean(WebAssembly.compileStreaming),
      payment_request: "PaymentRequest" in window,
      presentation_api: "PresentationRequest" in window,
      contacts_api: "contacts" in navigator,
      share_api: "share" in navigator,
      media_devices: Boolean(navigator.mediaDevices),
      enumerate_devices: Boolean(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
      get_user_media: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      get_display_media: Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
      credential_management: "credentials" in navigator,
      idle_detection: "IdleDetector" in window,
      file_system_access: "showOpenFilePicker" in window || "showSaveFilePicker" in window,
      origin_private_file_system: Boolean(navigator.storage && navigator.storage.getDirectory),
      launch_queue: "launchQueue" in window,
      serial: "serial" in navigator,
      webauthn: "PublicKeyCredential" in window,
      webcodecs: "VideoEncoder" in window || "ImageDecoder" in window,
      compression_streams: "CompressionStream" in window && "DecompressionStream" in window,
      wake_lock: "wakeLock" in navigator,
      device_memory: navigator.deviceMemory || null,
      hardware_concurrency: navigator.hardwareConcurrency || null
    });
  }

  async function collectDeviceSurfaces() {
    var out = {
      note: "No permission prompts are intentionally triggered here. Calls are limited to availability or already-granted device lists."
    };
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        var devices = await navigator.mediaDevices.enumerateDevices();
        out.media_devices = devices.map(function (device) {
          return {
            kind: device.kind,
            label_present: Boolean(device.label),
            device_id_present: Boolean(device.deviceId),
            group_id_present: Boolean(device.groupId)
          };
        });
      } catch (err) {
        out.media_devices_error = err.message || String(err);
      }
    } else {
      out.media_devices = "unsupported";
    }

    if (navigator.usb && navigator.usb.getDevices) {
      try {
        var usbDevices = await navigator.usb.getDevices();
        out.usb_previously_authorized_count = usbDevices.length;
      } catch (err2) {
        out.usb_error = err2.message || String(err2);
      }
    } else {
      out.usb = "unsupported";
    }

    if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
      try {
        out.bluetooth_available = await navigator.bluetooth.getAvailability();
      } catch (err3) {
        out.bluetooth_error = err3.message || String(err3);
      }
    } else {
      out.bluetooth = "unsupported";
    }

    return out;
  }

  async function collectVisualsCompositorSmoke() {
    var out = {
      note: "Non-exploit rendering/compositor smoke test. It exercises common Visuals paths without memory-corruption payloads."
    };
    var box = document.createElement("div");
    box.style.cssText = [
      "position:fixed",
      "left:-9999px",
      "top:-9999px",
      "width:128px",
      "height:128px",
      "background:linear-gradient(45deg,#45d6b5,#7cc8ff)",
      "transform:translateZ(0) rotate(7deg) scale(1.05)",
      "filter:blur(0.2px) contrast(1.1)",
      "clip-path:polygon(0 0,100% 8%,92% 100%,8% 92%)",
      "contain:layout paint style",
      "will-change:transform,filter,opacity",
      "opacity:0.92"
    ].join(";");
    var child = document.createElement("div");
    child.style.cssText = "width:64px;height:64px;margin:24px;background:rgba(255,255,255,.35);mix-blend-mode:screen;border-radius:8px;";
    box.appendChild(child);
    document.body.appendChild(box);
    try {
      var first = box.getBoundingClientRect();
      box.animate([
        { transform: "translateZ(0) rotate(7deg) scale(1.05)", opacity: 0.92 },
        { transform: "translate3d(2px,1px,0) rotate(13deg) scale(0.98)", opacity: 0.75 }
      ], { duration: 120, iterations: 1, fill: "both" });
      await nextAnimationFrame();
      await nextAnimationFrame();
      var second = box.getBoundingClientRect();
      out.css_supports = {
        transform_3d: window.CSS && CSS.supports ? CSS.supports("transform", "translateZ(0)") : null,
        filter: window.CSS && CSS.supports ? CSS.supports("filter", "blur(1px)") : null,
        clip_path: window.CSS && CSS.supports ? CSS.supports("clip-path", "circle(40%)") : null,
        contain_paint: window.CSS && CSS.supports ? CSS.supports("contain", "paint") : null
      };
      out.web_animations = "animate" in Element.prototype;
      out.initial_rect = rectToObject(first);
      out.after_animation_rect = rectToObject(second);
      out.completed = true;
    } catch (err) {
      out.error = err.message || String(err);
    } finally {
      box.remove();
    }
    return out;
  }

  async function collectCanvasAndImageSurface() {
    var out = {};
    try {
      var canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      var ctx = canvas.getContext("2d");
      out.canvas2d = Boolean(ctx);
      if (ctx) {
        var gradient = ctx.createLinearGradient(0, 0, 96, 96);
        gradient.addColorStop(0, "#45d6b5");
        gradient.addColorStop(1, "#7cc8ff");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 96, 96);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(255, 209, 102, 0.7)";
        ctx.arc(48, 48, 28, 0, Math.PI * 2);
        ctx.fill();
        var data = ctx.getImageData(0, 0, 96, 96);
        out.canvas_hash_sha256 = await digestBytes(data.data);
      }
      out.to_blob = "toBlob" in canvas;
      out.create_image_bitmap = "createImageBitmap" in window;
      out.offscreencanvas = "OffscreenCanvas" in window;
      if ("OffscreenCanvas" in window) {
        var offscreen = new OffscreenCanvas(32, 32);
        var offctx = offscreen.getContext("2d");
        out.offscreencanvas_2d = Boolean(offctx);
        out.offscreencanvas_webgl = Boolean(offscreen.getContext("webgl"));
      }
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
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

  function collectWebGlLimitsAndPrecision() {
    var canvas = document.createElement("canvas");
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return Promise.resolve({ supported: false });
    var params = [
      "MAX_TEXTURE_SIZE",
      "MAX_CUBE_MAP_TEXTURE_SIZE",
      "MAX_RENDERBUFFER_SIZE",
      "MAX_VERTEX_ATTRIBS",
      "MAX_VERTEX_UNIFORM_VECTORS",
      "MAX_VARYING_VECTORS",
      "MAX_FRAGMENT_UNIFORM_VECTORS",
      "MAX_TEXTURE_IMAGE_UNITS",
      "MAX_VERTEX_TEXTURE_IMAGE_UNITS",
      "MAX_COMBINED_TEXTURE_IMAGE_UNITS",
      "ALIASED_LINE_WIDTH_RANGE",
      "ALIASED_POINT_SIZE_RANGE"
    ];
    var out = { supported: true, parameters: {}, precision: {}, extensions_count: 0 };
    params.forEach(function (name) {
      try { out.parameters[name] = gl.getParameter(gl[name]); } catch (err) { out.parameters[name] = "error: " + (err.message || String(err)); }
    });
    try {
      ["LOW_FLOAT", "MEDIUM_FLOAT", "HIGH_FLOAT"].forEach(function (name) {
        var p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl[name]);
        out.precision["FRAGMENT_" + name] = p ? { rangeMin: p.rangeMin, rangeMax: p.rangeMax, precision: p.precision } : null;
      });
      ["LOW_INT", "MEDIUM_INT", "HIGH_INT"].forEach(function (name) {
        var p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl[name]);
        out.precision["FRAGMENT_" + name] = p ? { rangeMin: p.rangeMin, rangeMax: p.rangeMax, precision: p.precision } : null;
      });
    } catch (err2) {
      out.precision_error = err2.message || String(err2);
    }
    try { out.extensions_count = (gl.getSupportedExtensions() || []).length; } catch (err3) {}
    return Promise.resolve(out);
  }

  async function collectWebGpu() {
    var out = { supported: "gpu" in navigator };
    if (!out.supported || !navigator.gpu || !navigator.gpu.requestAdapter) return out;
    try {
      var adapter = await navigator.gpu.requestAdapter();
      out.adapter_available = Boolean(adapter);
      if (!adapter) return out;
      out.features = adapter.features ? Array.from(adapter.features).sort() : [];
      out.limits = adapter.limits ? {
        maxTextureDimension1D: adapter.limits.maxTextureDimension1D,
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxTextureDimension3D: adapter.limits.maxTextureDimension3D,
        maxBindGroups: adapter.limits.maxBindGroups,
        maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
        maxComputeWorkgroupSizeY: adapter.limits.maxComputeWorkgroupSizeY,
        maxComputeWorkgroupSizeZ: adapter.limits.maxComputeWorkgroupSizeZ
      } : null;
      if (adapter.info) out.info = adapter.info;
      if (adapter.requestAdapterInfo) {
        try { out.adapter_info = await adapter.requestAdapterInfo(); } catch (errInfo) { out.adapter_info_error = errInfo.message || String(errInfo); }
      }
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  async function collectV8AndWasmSmoke() {
    var out = {
      note: "Non-exploit JS/WASM smoke test. It validates that V8/WASM paths are reachable, not that a CVE is present."
    };
    try {
      out.bigint = typeof BigInt !== "undefined";
      out.structured_clone = "structuredClone" in window;
      out.finalization_registry = "FinalizationRegistry" in window;
      out.weak_ref = "WeakRef" in window;
      out.atomics = "Atomics" in window;
      out.shared_array_buffer = typeof SharedArrayBuffer !== "undefined";
      out.wasm_supported = typeof WebAssembly !== "undefined";
      if (typeof WebAssembly !== "undefined") {
        var bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
        out.wasm_validate_empty_module = WebAssembly.validate(bytes);
        var mod = await WebAssembly.compile(bytes);
        var instance = await WebAssembly.instantiate(mod);
        out.wasm_compile_instantiate = Boolean(instance);
      }
      var arr = Array.from({ length: 2048 }, function (_, i) { return (i * 2654435761) >>> 0; });
      arr.sort(function (a, b) { return (a & 255) - (b & 255); });
      out.array_sort_smoke = arr.length === 2048;
      out.regex_unicode_sets = safeRegexFeature("[\\p{ASCII}&&\\p{Letter}]", "v");
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  async function collectWebAudioSmoke() {
    var out = {
      supported: "AudioContext" in window || "webkitAudioContext" in window,
      offline_supported: "OfflineAudioContext" in window || "webkitOfflineAudioContext" in window,
      note: "Uses OfflineAudioContext only; it should not play sound."
    };
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return out;
    try {
      var ctx = new Offline(1, 1024, 44100);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(1024 / 44100);
      var rendered = await ctx.startRendering();
      var channel = rendered.getChannelData(0);
      var sum = 0;
      for (var i = 0; i < channel.length; i += 32) sum += Math.abs(channel[i]);
      out.rendered = true;
      out.length = rendered.length;
      out.sample_rate = rendered.sampleRate;
      out.sample_sum = Number(sum.toFixed(6));
      out.audio_worklet = Boolean(window.AudioContext && AudioContext.prototype && "audioWorklet" in AudioContext.prototype);
    } catch (err) {
      out.error = err.message || String(err);
    }
    return out;
  }

  function collectCodecsAndMediaSurface() {
    return Promise.resolve({
      media_source: "MediaSource" in window,
      managed_media_source: "ManagedMediaSource" in window,
      media_recorder: "MediaRecorder" in window,
      video_encoder: "VideoEncoder" in window,
      video_decoder: "VideoDecoder" in window,
      audio_encoder: "AudioEncoder" in window,
      audio_decoder: "AudioDecoder" in window,
      image_decoder: "ImageDecoder" in window,
      video_frame: "VideoFrame" in window,
      encoded_video_chunk: "EncodedVideoChunk" in window,
      picture_in_picture: "pictureInPictureEnabled" in document,
      remote_playback: "RemotePlayback" in window,
      eme_request_media_key_system_access: "requestMediaKeySystemAccess" in navigator,
      mime_support: {
        webm_vp8: window.MediaSource && MediaSource.isTypeSupported ? MediaSource.isTypeSupported('video/webm; codecs="vp8"') : null,
        webm_vp9: window.MediaSource && MediaSource.isTypeSupported ? MediaSource.isTypeSupported('video/webm; codecs="vp9"') : null,
        mp4_h264: window.MediaSource && MediaSource.isTypeSupported ? MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"') : null
      }
    });
  }

  function collectSensorsAndHardwareSurface() {
    return Promise.resolve({
      device_orientation_event: "DeviceOrientationEvent" in window,
      device_motion_event: "DeviceMotionEvent" in window,
      ambient_light_sensor: "AmbientLightSensor" in window,
      accelerometer: "Accelerometer" in window,
      linear_acceleration_sensor: "LinearAccelerationSensor" in window,
      gyroscope: "Gyroscope" in window,
      magnetometer: "Magnetometer" in window,
      absolute_orientation_sensor: "AbsoluteOrientationSensor" in window,
      relative_orientation_sensor: "RelativeOrientationSensor" in window,
      geolocation: "geolocation" in navigator,
      vibration: "vibrate" in navigator,
      battery_api: "getBattery" in navigator,
      gamepad_api: "getGamepads" in navigator,
      max_touch_points: navigator.maxTouchPoints || 0,
      device_memory: navigator.deviceMemory || null,
      hardware_concurrency: navigator.hardwareConcurrency || null
    });
  }

  async function collectNetworkAndFetchPolicySurface() {
    var out = {
      fetch: "fetch" in window,
      beacon: Boolean(navigator.sendBeacon),
      websocket: "WebSocket" in window,
      event_source: "EventSource" in window,
      webtransport: "WebTransport" in window,
      web_socket_stream: "WebSocketStream" in window,
      compression_stream: "CompressionStream" in window,
      decompression_stream: "DecompressionStream" in window,
      trusted_types: "trustedTypes" in window,
      cross_origin_isolated: window.crossOriginIsolated,
      referrer_policy: document.referrerPolicy || "",
      do_not_track: navigator.doNotTrack || ""
    };
    try {
      var response = await fetch("/api/status?network_probe=" + Date.now(), { cache: "no-store", credentials: "same-origin" });
      out.same_origin_fetch = {
        ok: response.ok,
        status: response.status,
        content_type: response.headers.get("content-type") || "",
        accept_ch: response.headers.get("accept-ch") || "",
        permissions_policy: response.headers.get("permissions-policy") || ""
      };
    } catch (err) {
      out.same_origin_fetch_error = err.message || String(err);
    }
    return out;
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

  function collectFrameAndPolicySurface() {
    var iframe = document.createElement("iframe");
    var sandboxTokens = [
      "allow-downloads",
      "allow-forms",
      "allow-modals",
      "allow-orientation-lock",
      "allow-pointer-lock",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-presentation",
      "allow-same-origin",
      "allow-scripts",
      "allow-storage-access-by-user-activation",
      "allow-top-navigation",
      "allow-top-navigation-by-user-activation"
    ];
    var sandboxSupport = {};
    sandboxTokens.forEach(function (token) {
      try {
        iframe.sandbox.add(token);
        sandboxSupport[token] = iframe.sandbox.contains(token);
      } catch (err) {
        sandboxSupport[token] = false;
      }
    });
    return Promise.resolve({
      iframe_srcdoc: "srcdoc" in iframe,
      iframe_credentialless: "credentialless" in iframe,
      iframe_csp: "csp" in iframe,
      sandbox_tokens: sandboxSupport,
      document_policy: document.policy ? {
        allowed_features: document.policy.allowedFeatures ? document.policy.allowedFeatures() : null
      } : null,
      permissions_policy: document.permissionsPolicy ? {
        allowed_features: document.permissionsPolicy.allowedFeatures ? document.permissionsPolicy.allowedFeatures() : null
      } : null,
      user_activation: navigator.userActivation ? {
        is_active: navigator.userActivation.isActive,
        has_been_active: navigator.userActivation.hasBeenActive
      } : null
    });
  }

  function collectPatchCandidateMatrix() {
    var ua = navigator.userAgent || "";
    var major = parseChromiumMajor(ua);
    var highRisk = {
      angle_webgl: Boolean(document.createElement("canvas").getContext("webgl") || document.createElement("canvas").getContext("webgl2")),
      dawn_webgpu: "gpu" in navigator,
      webaudio: "AudioContext" in window || "webkitAudioContext" in window,
      visuals_rendering: true,
      v8_wasm: typeof WebAssembly !== "undefined",
      webaudio_worklet: Boolean(window.AudioContext && AudioContext.prototype && "audioWorklet" in AudioContext.prototype),
      webrtc: "RTCPeerConnection" in window
    };
    var candidates = [
      {
        area: "ANGLE / graphics",
        relevant_exposure: highRisk.angle_webgl,
        examples: ["CVE-2024-4058"],
        why: "WebGL/WebGL2 and ANGLE-backed GPU rendering are exposed."
      },
      {
        area: "Dawn / WebGPU",
        relevant_exposure: highRisk.dawn_webgpu,
        examples: ["CVE-2024-4060"],
        why: "WebGPU is exposed, so Dawn patch level matters."
      },
      {
        area: "Visuals",
        relevant_exposure: true,
        examples: ["CVE-2024-4671"],
        why: "The browser renders arbitrary web content; exact patched build is needed because this was exploited in the wild."
      },
      {
        area: "WebAudio",
        relevant_exposure: highRisk.webaudio,
        examples: [],
        why: "WebAudio API is present and should be included in broader Chromium patch review."
      },
      {
        area: "V8 / WebAssembly",
        relevant_exposure: highRisk.v8_wasm,
        examples: ["CVE-2024-4059"],
        why: "JavaScript and WebAssembly are core exposed attack surface; Chrome 124 fixed a V8 API issue."
      },
      {
        area: "WebRTC",
        relevant_exposure: highRisk.webrtc,
        examples: [],
        why: "WebRTC is exposed and produced ICE candidates in prior testing; include it in network/privacy and patch review."
      }
    ];
    return Promise.resolve({
      detected_chromium_major: major,
      user_agent: ua,
      exact_build_required: true,
      assessment: major && major <= 124 ? "Chromium 124 or older: prioritize exact build discovery and vendor patch confirmation." : "Major version alone does not prove vulnerable; exact build and vendor patches are still required.",
      no_exploit_payloads_run: true,
      candidates: candidates
    });
  }

  function parseChromiumMajor(ua) {
    var match = ua.match(/(?:Chrome|Chromium)\/(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function parseChromiumVersion(text) {
    var match = String(text || "").match(/(?:Chrome|Chromium)\/(\d+(?:\.\d+){0,3})/i);
    return match ? match[1] : "";
  }

  function parseVersionParts(version) {
    var clean = String(version || "").trim();
    if (!/^\d+(?:\.\d+){0,3}$/.test(clean)) return null;
    var parts = clean.split(".").map(function (part) { return Number(part); });
    while (parts.length < 4) parts.push(0);
    return parts.slice(0, 4);
  }

  function compareVersions(a, b) {
    var pa = parseVersionParts(a);
    var pb = parseVersionParts(b);
    if (!pa || !pb) return null;
    for (var i = 0; i < 4; i++) {
      if (pa[i] < pb[i]) return -1;
      if (pa[i] > pb[i]) return 1;
    }
    return 0;
  }

  function nextAnimationFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
  }

  function rectToObject(rect) {
    return {
      x: Number(rect.x.toFixed(3)),
      y: Number(rect.y.toFixed(3)),
      width: Number(rect.width.toFixed(3)),
      height: Number(rect.height.toFixed(3))
    };
  }

  async function digestBytes(bytes) {
    if (!crypto || !crypto.subtle || !crypto.subtle.digest) return "webcrypto unavailable";
    var digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(function (value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  function safeRegexFeature(pattern, flags) {
    try {
      return Boolean(new RegExp(pattern, flags));
    } catch (err) {
      return false;
    }
  }

  function withTimeout(promise, timeoutMs, label) {
    var timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(new Error((label || "operation") + " timed out after " + timeoutMs + "ms"));
        }, timeoutMs);
      })
    ]).then(function (value) {
      clearTimeout(timer);
      return value;
    }, function (err) {
      clearTimeout(timer);
      throw err;
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
    var chainEvidence = document.getElementById("chainEvidence");
    if (chainEvidence) chainEvidence.value = state.chain_evidence || "";
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

  function saveChainEvidence() {
    var field = document.getElementById("chainEvidence");
    state.chain_evidence = field ? field.value : "";
    saveState();
    logEvent("chain", "Save manual chain evidence", "", "tap", "saved", state.chain_evidence);
  }

  async function manualClipboardRead() {
    if (!navigator.clipboard || !navigator.clipboard.readText) return "clipboard read unsupported";
    var text = await withTimeout(navigator.clipboard.readText(), DEFAULT_TEST_TIMEOUT_MS, "clipboard read");
    return JSON.stringify({ read_length: text.length, preview: text.slice(0, 80) });
  }

  async function manualPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return "persistent storage unsupported";
    var granted = await withTimeout(navigator.storage.persist(), DEFAULT_TEST_TIMEOUT_MS, "persistent storage");
    return JSON.stringify({ granted: granted });
  }

  async function manualBluetoothPrompt() {
    if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) return "Web Bluetooth requestDevice unsupported";
    var device = await withTimeout(navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["battery_service", "device_information"]
    }), DEFAULT_TEST_TIMEOUT_MS, "Web Bluetooth prompt");
    return JSON.stringify({
      selected: Boolean(device),
      name_present: Boolean(device && device.name),
      id_present: Boolean(device && device.id),
      gatt_present: Boolean(device && device.gatt)
    });
  }

  async function manualUsbPrompt() {
    if (!navigator.usb || !navigator.usb.requestDevice) return "WebUSB requestDevice unsupported";
    var device = await withTimeout(navigator.usb.requestDevice({ filters: [{}] }), DEFAULT_TEST_TIMEOUT_MS, "WebUSB prompt");
    return JSON.stringify({
      selected: Boolean(device),
      vendor_id: device ? device.vendorId : null,
      product_id: device ? device.productId : null,
      product_name_present: Boolean(device && device.productName),
      manufacturer_name_present: Boolean(device && device.manufacturerName)
    });
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
