"use strict";
(function () {
  var script = document.currentScript;
  if (!script) return;
  var apiBase = (script.getAttribute("data-api-base") || new URL(script.src).origin).replace(/\/$/, "");
  var lang = (script.getAttribute("data-lang") || document.documentElement.lang || "en").slice(0, 2);
  lang = lang === "ar" ? "ar" : "en";
  var siteHost = (script.getAttribute("data-site-host") || "www.rehamdiva.com").replace(/^https?:\/\//, "");
  var SESSION_KEY = "reham-public-assistant-session";
  var THREAD_KEY = "reham-public-assistant-thread";
  var isAr = lang === "ar";
  var brand = "#8b3a4a";

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getSessionId() {
    try {
      var existing = localStorage.getItem(SESSION_KEY);
      if (existing && existing.length >= 16) return existing;
      var created = uuid();
      localStorage.setItem(SESSION_KEY, created);
      return created;
    } catch (e) {
      return uuid();
    }
  }

  function getThreadId() {
    try { return sessionStorage.getItem(THREAD_KEY); } catch (e) { return null; }
  }
  function setThreadId(id) {
    try { if (id) sessionStorage.setItem(THREAD_KEY, id); else sessionStorage.removeItem(THREAD_KEY); } catch (e) {}
  }

  function jsonHeaders() { return { "Content-Type": "application/json" }; }

  async function api(path, options) {
    var res = await fetch(apiBase + path, options);
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else if (key === "text") node.textContent = attrs[key];
      else if (key === "html") node.innerHTML = attrs[key];
      else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function courseUrl(slug) { return "https://" + siteHost + "/" + lang + "/courses/" + encodeURIComponent(slug); }
  function packagesUrl() { return "https://" + siteHost + "/" + lang + "/packages"; }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function formatPrice(amount, currency) {
    var major = Number(amount || 0) / 100;
    var code = String(currency || "USD").toUpperCase();
    try {
      return new Intl.NumberFormat(isAr ? "ar" : "en", {
        style: "currency",
        currency: code,
        maximumFractionDigits: major % 1 === 0 ? 0 : 2
      }).format(major);
    } catch (e) {
      return (major % 1 === 0 ? String(major) : major.toFixed(2)) + " " + code;
    }
  }

  var css = [
    ":host, #rd-asst { all: initial; }",
    "#rd-asst { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2b1a1f; }",
    "#rd-asst *, #rd-asst *::before, #rd-asst *::after { box-sizing: border-box; font-family: inherit; }",
    "#rd-asst button, #rd-asst a, #rd-asst textarea, #rd-asst input { appearance: none; -webkit-appearance: none; outline: none; box-shadow: none; }",
    "#rd-asst a { color: inherit; text-decoration: none; }",
    "#rd-asst-btn { width: 56px; height: 56px; border: 0; border-radius: 999px; background: " + brand + "; color: #fff; cursor: pointer; box-shadow: 0 10px 30px rgba(139,58,74,.35); display: flex; align-items: center; justify-content: center; }",
    "#rd-asst-btn:hover { background: #732f3d; }",
    "#rd-asst-btn svg { display: block; width: 26px; height: 26px; }",
    "#rd-asst-panel { position: absolute; bottom: 72px; inset-inline-end: 0; width: min(380px, calc(100vw - 24px)); height: min(640px, calc(100vh - 110px)); background: #fff; border: 1px solid #eadfe2; border-radius: 18px; box-shadow: 0 18px 50px rgba(40,16,24,.18); display: none; flex-direction: column; overflow: hidden; }",
    "#rd-asst-panel.open { display: flex; }",
    "#rd-asst-head { padding: 12px 12px 12px 16px; background: " + brand + "; color: #fff; display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
    "#rd-asst-head h2 { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.2; }",
    "#rd-asst-head .rd-head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }",
    "#rd-asst-head button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }",
    "#rd-asst-head button:hover { background: rgba(255,255,255,.16); }",
    "#rd-asst-msgs { flex: 1; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; background: #faf6f7; }",
    ".rd-turn { display: flex; flex-direction: column; gap: 8px; max-width: 100%; }",
    ".rd-turn.user { align-items: flex-end; }",
    ".rd-turn.asst { align-items: flex-start; }",
    ".rd-rtl .rd-turn.user { align-items: flex-start; }",
    ".rd-rtl .rd-turn.asst { align-items: flex-end; }",
    ".rd-msg { max-width: 92%; padding: 10px 12px; border-radius: 16px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }",
    ".rd-msg.user { background: " + brand + "; color: #fff; }",
    ".rd-msg.asst { background: #fff; border: 1px solid #eadfe2; color: #2b1a1f; }",
    ".rd-cards, .rd-actions { width: min(100%, 320px); max-width: 92%; display: flex; flex-direction: column; gap: 8px; }",
    ".rd-card { border: 1px solid #eadfe2; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 1px 2px rgba(40,16,24,.06); }",
    ".rd-card img { width: 100%; height: 120px; object-fit: cover; display: block; background: #f3e9ec; }",
    ".rd-card .body { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }",
    ".rd-card h3 { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.3; color: #2b1a1f; }",
    ".rd-card .rd-price { margin: 0; font-size: 18px; font-weight: 650; color: #2b1a1f; }",
    ".rd-card p { margin: 0; font-size: 12px; line-height: 1.45; color: #6b5560; }",
    ".rd-cta { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 40px; margin: 0; padding: 8px 14px; border: 0 !important; border-radius: 999px; background: " + brand + " !important; color: #fff !important; text-align: center; text-decoration: none !important; font-size: 13px; font-weight: 650; line-height: 1.3; cursor: pointer; box-shadow: none !important; outline: none !important; }",
    ".rd-cta:hover { background: #732f3d !important; color: #fff !important; }",
    ".rd-cta:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px " + brand + " !important; }",
    ".rd-starters { display: flex; flex-wrap: wrap; gap: 8px; max-width: 92%; }",
    ".rd-chip { border: 1px solid #eadfe2; background: #fff; border-radius: 999px; padding: 8px 12px; font-size: 12px; cursor: pointer; color: #2b1a1f; line-height: 1.35; }",
    ".rd-chip:hover { background: #f7eef1; }",
    "#rd-asst-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eadfe2; background: #fff; align-items: flex-end; }",
    "#rd-asst-form textarea { flex: 1; border: 1px solid #eadfe2; border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 14px; resize: none; min-height: 42px; max-height: 90px; color: #2b1a1f; background: #fff; }",
    "#rd-asst-form textarea:focus { border-color: " + brand + "; }",
    "#rd-asst-form button[type=submit] { border: 0; border-radius: 12px; background: " + brand + "; color: #fff; padding: 0 14px; min-height: 42px; cursor: pointer; font-weight: 650; font-size: 14px; }",
    "#rd-asst-form button[type=submit]:hover { background: #732f3d; }",
    ".rd-think { font-size: 12px; color: #6b5560; }",
    ".rd-err { color: #9f1239; font-size: 12px; padding: 0 12px 8px; }"
  ].join("");

  var sessionId = getSessionId();
  var threadId = getThreadId();
  var config = null;
  var pollTimer = null;
  var sending = false;

  var root = el("div", { id: "rd-asst", dir: isAr ? "rtl" : "ltr" });
  root.style.position = "relative";
  var style = el("style", { text: css });
  var iconPlus = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  var iconClose = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var iconBot = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
  var iconFabClose = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var button = el("button", { id: "rd-asst-btn", type: "button", "aria-label": isAr ? "المساعد" : "Assistant", html: iconBot });
  var panel = el("div", { id: "rd-asst-panel" });
  var title = isAr ? "مساعدة رحام ديفا" : "Reham Diva help";
  var head = el("div", { id: "rd-asst-head" }, [
    el("h2", { text: title }),
    el("div", { class: "rd-head-actions" }, [
      el("button", { type: "button", title: isAr ? "محادثة جديدة" : "New chat", "aria-label": isAr ? "محادثة جديدة" : "New chat", html: iconPlus, onClick: function () { startNewChat(); } }),
      el("button", { type: "button", title: isAr ? "إغلاق" : "Close", "aria-label": isAr ? "إغلاق" : "Close", html: iconClose, onClick: function () { closePanel(); } })
    ])
  ]);
  var msgs = el("div", { id: "rd-asst-msgs", class: isAr ? "rd-rtl" : "" });
  var err = el("div", { class: "rd-err" });
  var form = el("form", { id: "rd-asst-form" });
  var input = el("textarea", {
    rows: "1",
    placeholder: isAr ? "اكتبي رسالتك…" : "Type a message…",
    "data-gramm": "false",
    "data-gramm_editor": "false",
    "data-enable-grammarly": "false"
  });
  var sendBtn = el("button", { type: "submit", text: isAr ? "إرسال" : "Send" });
  form.appendChild(input);
  form.appendChild(sendBtn);
  panel.appendChild(head);
  panel.appendChild(msgs);
  panel.appendChild(err);
  panel.appendChild(form);
  root.appendChild(style);
  root.appendChild(panel);
  root.appendChild(button);

  var host = el("div", { id: "rd-asst-host" });
  host.style.cssText = "all:initial;position:fixed;z-index:2147483000;bottom:20px;inset-inline-end:20px;";
  document.body.appendChild(host);
  var mount = host;
  if (host.attachShadow) {
    mount = host.attachShadow({ mode: "open" });
  }
  mount.appendChild(root);

  function setError(message) { err.textContent = message || ""; }

  function setFabOpen(open) {
    button.innerHTML = open ? iconFabClose : iconBot;
    button.setAttribute("aria-label", open ? (isAr ? "إغلاق" : "Close") : (isAr ? "المساعد" : "Assistant"));
  }

  function openPanel() { panel.classList.add("open"); setFabOpen(true); refresh(); }
  function closePanel() { panel.classList.remove("open"); setFabOpen(false); stopPoll(); }
  button.addEventListener("click", function () {
    if (panel.classList.contains("open")) closePanel(); else openPanel();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    send(text);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  async function ensureThread() {
    if (threadId) return threadId;
    var created = await api("/landing/public-assistant/thread", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ sessionId: sessionId, language: lang })
    });
    threadId = created.threadId;
    setThreadId(threadId);
    return threadId;
  }

  function ctaLink(href, label) {
    return el("a", {
      class: "rd-cta",
      href: href,
      target: "_blank",
      rel: "noopener noreferrer",
      text: label
    });
  }

  function renderWelcome() {
    msgs.innerHTML = "";
    if (!config) return;
    var welcome = isAr ? config.greeting.welcomeMessageAr : config.greeting.welcomeMessageEn;
    var turn = el("div", { class: "rd-turn asst" });
    turn.appendChild(el("div", { class: "rd-msg asst", text: welcome }));
    msgs.appendChild(turn);
    var starters = config.greeting.starterSuggestions || [];
    if (starters.length) {
      var wrap = el("div", { class: "rd-starters" });
      starters.forEach(function (item) {
        wrap.appendChild(el("button", {
          class: "rd-chip",
          type: "button",
          text: isAr ? item.textAr : item.textEn,
          onClick: function () { send(isAr ? item.textAr : item.textEn); }
        }));
      });
      msgs.appendChild(wrap);
    }
  }

  function cardHtml(course) {
    var img = course.imageUrl ? '<img src="' + escapeHtml(course.imageUrl) + '" alt="">' : "";
    var desc = escapeHtml((course.description || "").slice(0, 180));
    return '<div class="rd-card">' + img + '<div class="body"><h3>' + escapeHtml(course.title) + "</h3>" +
      (desc ? "<p>" + desc + "</p>" : "") +
      '<a class="rd-cta" target="_blank" rel="noopener noreferrer" href="' +
      escapeHtml(courseUrl(course.slug)) + '">' + (isAr ? "عرض الدورة" : "View course") + "</a></div></div>";
  }

  function planHtml(plan) {
    var name = isAr ? (plan.nameAr || plan.nameEn) : (plan.nameEn || plan.nameAr);
    var interval = plan.billingInterval === "year"
      ? (isAr ? "سنوي" : "Billed yearly")
      : (isAr ? "شهري" : "Billed monthly");
    return '<div class="rd-card"><div class="body"><h3>' + escapeHtml(name) + '</h3><p class="rd-price">' +
      escapeHtml(formatPrice(plan.priceAmount, plan.priceCurrency)) + "</p><p>" + escapeHtml(interval) + "</p></div></div>";
  }

  function renderMessages(payload) {
    msgs.innerHTML = "";
    var list = payload.messages || [];
    if (list.length === 0) {
      renderWelcome();
    }
    list.forEach(function (message) {
      var isUser = message.role === "user";
      var turn = el("div", { class: "rd-turn " + (isUser ? "user" : "asst") });
      if (message.text) {
        turn.appendChild(el("div", { class: "rd-msg " + (isUser ? "user" : "asst"), text: message.text }));
      }
      var courses = message.courses || [];
      var plans = message.plans || [];
      if (courses.length || plans.length) {
        var cards = el("div", { class: "rd-cards" });
        courses.forEach(function (course) {
          cards.insertAdjacentHTML("beforeend", cardHtml(course));
        });
        plans.forEach(function (plan) {
          cards.insertAdjacentHTML("beforeend", planHtml(plan));
        });
        turn.appendChild(cards);
      }
      var actions = el("div", { class: "rd-actions" });
      (message.callToActions || []).forEach(function (cta) {
        actions.appendChild(ctaLink(cta.url, cta.text));
      });
      if (plans.length && !(message.callToActions || []).length) {
        actions.appendChild(ctaLink(packagesUrl(), isAr ? "عرض الباقات" : "View plans"));
      }
      if (message.coursesCatalog) {
        var catalog = message.coursesCatalog;
        if (catalog.messageEn || catalog.messageAr) {
          turn.appendChild(el("div", {
            class: "rd-msg asst",
            text: isAr ? catalog.messageAr : catalog.messageEn
          }));
        }
        actions.appendChild(ctaLink(
          isAr ? catalog.urlAr : catalog.urlEn,
          isAr ? catalog.buttonTextAr : catalog.buttonTextEn
        ));
      }
      if (message.whatsAppSupport) {
        var wa = message.whatsAppSupport;
        if (wa.messageEn || wa.messageAr) {
          turn.appendChild(el("div", {
            class: "rd-msg asst",
            text: isAr ? wa.messageAr : wa.messageEn
          }));
        }
        actions.appendChild(ctaLink(wa.url, isAr ? wa.buttonTextAr : wa.buttonTextEn));
      }
      if (actions.childNodes.length) turn.appendChild(actions);
      if (turn.childNodes.length) msgs.appendChild(turn);
    });
    if (payload.pending) msgs.appendChild(el("div", { class: "rd-think", text: isAr ? "جاري التفكير…" : "Thinking…" }));
    msgs.scrollTop = msgs.scrollHeight;
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function refresh() {
    if (!threadId) {
      renderWelcome();
      return;
    }
    try {
      var payload = await api("/landing/public-assistant/messages?sessionId=" + encodeURIComponent(sessionId) + "&threadId=" + encodeURIComponent(threadId));
      renderMessages(payload);
      if (payload.pending) {
        if (!pollTimer) pollTimer = setInterval(refresh, 900);
      } else {
        stopPoll();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function send(text) {
    if (sending) return;
    sending = true;
    setError("");
    input.value = "";
    try {
      await ensureThread();
      await api("/landing/public-assistant/message", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ sessionId: sessionId, threadId: threadId, prompt: text, language: lang })
      });
      if (!pollTimer) pollTimer = setInterval(refresh, 900);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      sending = false;
    }
  }

  function startNewChat() {
    threadId = null;
    setThreadId(null);
    stopPoll();
    renderWelcome();
  }

  api("/landing/public-assistant/config").then(function (data) {
    config = data;
    if (!data.enabled) {
      host.remove();
    }
  }).catch(function () {
    host.remove();
  });
})();
