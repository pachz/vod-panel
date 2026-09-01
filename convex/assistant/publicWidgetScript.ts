export const PUBLIC_ASSISTANT_WIDGET_JS = String.raw`"use strict";
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

  var css = [
    "#rd-asst{all:initial;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;position:fixed;z-index:2147483000;bottom:20px;inset-inline-end:20px;}",
    "#rd-asst *{box-sizing:border-box;}",
    "#rd-asst-btn{width:56px;height:56px;border:0;border-radius:999px;background:#8b3a4a;color:#fff;cursor:pointer;box-shadow:0 10px 30px rgba(139,58,74,.35);display:flex;align-items:center;justify-content:center;}",
    "#rd-asst-btn:hover{background:#732f3d;}",
    "#rd-asst-panel{position:absolute;bottom:72px;inset-inline-end:0;width:min(380px,calc(100vw - 24px));height:min(640px,calc(100vh - 110px));background:#fff;border:1px solid #eadfe2;border-radius:18px;box-shadow:0 18px 50px rgba(40,16,24,.18);display:none;flex-direction:column;overflow:hidden;color:#2b1a1f;}",
    "#rd-asst-panel.open{display:flex;}",
    "#rd-asst-head{padding:14px 16px;background:#8b3a4a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    "#rd-asst-head h2{margin:0;font-size:15px;font-weight:650;}",
    "#rd-asst-head button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:18px;}",
    "#rd-asst-msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#faf6f7;}",
    ".rd-msg{max-width:92%;padding:10px 12px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;}",
    ".rd-msg.user{align-self:flex-end;background:#8b3a4a;color:#fff;}",
    ".rd-msg.asst{align-self:flex-start;background:#fff;border:1px solid #eadfe2;}",
    ".rd-rtl .rd-msg.user{align-self:flex-start;}",
    ".rd-rtl .rd-msg.asst{align-self:flex-end;}",
    ".rd-card{margin-top:8px;border:1px solid #eadfe2;border-radius:12px;overflow:hidden;background:#fff;}",
    ".rd-card img{width:100%;height:120px;object-fit:cover;display:block;}",
    ".rd-card .body{padding:10px;}",
    ".rd-card h3{margin:0 0 6px;font-size:14px;}",
    ".rd-card p{margin:0 0 8px;font-size:12px;color:#6b5560;}",
    ".rd-cta{display:block;margin-top:8px;text-align:center;background:#8b3a4a;color:#fff;text-decoration:none;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600;}",
    ".rd-starters{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}",
    ".rd-chip{border:1px solid #eadfe2;background:#fff;border-radius:999px;padding:6px 10px;font-size:12px;cursor:pointer;color:#2b1a1f;}",
    "#rd-asst-form{display:flex;gap:8px;padding:10px;border-top:1px solid #eadfe2;background:#fff;}",
    "#rd-asst-form textarea{flex:1;border:1px solid #eadfe2;border-radius:12px;padding:8px 10px;font:inherit;resize:none;min-height:42px;max-height:90px;}",
    "#rd-asst-form button{border:0;border-radius:12px;background:#8b3a4a;color:#fff;padding:0 14px;cursor:pointer;font-weight:650;}",
    ".rd-think{font-size:12px;color:#6b5560;align-self:flex-start;}",
    ".rd-err{color:#9f1239;font-size:12px;padding:0 12px 8px;}"
  ].join("");

  var sessionId = getSessionId();
  var threadId = getThreadId();
  var config = null;
  var pollTimer = null;
  var sending = false;

  var root = el("div", { id: "rd-asst", dir: isAr ? "rtl" : "ltr" });
  var style = el("style", { text: css });
  var button = el("button", { id: "rd-asst-btn", type: "button", "aria-label": isAr ? "المساعد" : "Assistant" }, [
    el("span", { html: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3c-1.7 0-3 1.4-3 3v.3C6.7 7 5 9 5 11.4V16c0 1.1.9 2 2 2h1v1.2c0 .7.8 1.1 1.4.7L12 18h5c1.1 0 2-.9 2-2v-4.6C19 9 17.3 7 14.9 6.3V6c0-1.6-1.3-3-2.9-3Z" fill="currentColor"/></svg>' })
  ]);
  var panel = el("div", { id: "rd-asst-panel" });
  var title = isAr ? "مساعدة رحام ديفا" : "Reham Diva help";
  var head = el("div", { id: "rd-asst-head" }, [
    el("h2", { text: title }),
    el("div", null, [
      el("button", { type: "button", title: isAr ? "محادثة جديدة" : "New chat", onClick: function () { startNewChat(); } }, [el("span", { text: "+" })]),
      el("button", { type: "button", title: isAr ? "إغلاق" : "Close", onClick: function () { closePanel(); } }, [el("span", { text: "×" })])
    ])
  ]);
  var msgs = el("div", { id: "rd-asst-msgs", class: isAr ? "rd-rtl" : "" });
  var err = el("div", { class: "rd-err" });
  var form = el("form", { id: "rd-asst-form" });
  var input = el("textarea", { rows: "1", placeholder: isAr ? "اكتبي رسالتك…" : "Type a message…" });
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
  document.body.appendChild(root);

  function setError(message) { err.textContent = message || ""; }

  function openPanel() { panel.classList.add("open"); refresh(); }
  function closePanel() { panel.classList.remove("open"); stopPoll(); }
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

  function renderWelcome() {
    msgs.innerHTML = "";
    if (!config) return;
    var welcome = isAr ? config.greeting.welcomeMessageAr : config.greeting.welcomeMessageEn;
    var bubble = el("div", { class: "rd-msg asst", text: welcome });
    msgs.appendChild(bubble);
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
    return '<div class="rd-card">' + img + '<div class="body"><h3>' + escapeHtml(course.title) + "</h3><p>" +
      escapeHtml((course.description || "").slice(0, 180)) + '</p><a class="rd-cta" target="_blank" rel="noopener" href="' +
      escapeHtml(courseUrl(course.slug)) + '">' + (isAr ? "عرض الدورة" : "View course") + "</a></div></div>";
  }

  function planHtml(plan) {
    var name = isAr ? (plan.nameAr || plan.nameEn) : (plan.nameEn || plan.nameAr);
    var price = (plan.priceAmount / 100).toFixed(plan.priceAmount % 100 === 0 ? 0 : 2);
    return '<div class="rd-card"><div class="body"><h3>' + escapeHtml(name) + "</h3><p>" +
      escapeHtml(price + " " + plan.priceCurrency) + '</p><a class="rd-cta" target="_blank" rel="noopener" href="' +
      escapeHtml(packagesUrl()) + '">' + (isAr ? "عرض الباقات" : "View plans") + "</a></div></div>";
  }

  function renderMessages(payload) {
    msgs.innerHTML = "";
    var list = payload.messages || [];
    if (list.length === 0) {
      renderWelcome();
    }
    list.forEach(function (message) {
      var bubble = el("div", { class: "rd-msg " + (message.role === "user" ? "user" : "asst") });
      if (message.text) bubble.textContent = message.text;
      (message.courses || []).forEach(function (course) {
        bubble.insertAdjacentHTML("beforeend", cardHtml(course));
      });
      (message.plans || []).forEach(function (plan) {
        bubble.insertAdjacentHTML("beforeend", planHtml(plan));
      });
      (message.callToActions || []).forEach(function (cta) {
        bubble.appendChild(el("a", { class: "rd-cta", href: cta.url, target: "_blank", rel: "noopener", text: cta.text }));
      });
      if (message.coursesCatalog) {
        var catalog = message.coursesCatalog;
        bubble.appendChild(el("p", { text: isAr ? catalog.messageAr : catalog.messageEn }));
        bubble.appendChild(el("a", {
          class: "rd-cta",
          href: isAr ? catalog.urlAr : catalog.urlEn,
          target: "_blank",
          rel: "noopener",
          text: isAr ? catalog.buttonTextAr : catalog.buttonTextEn
        }));
      }
      if (message.whatsAppSupport) {
        var wa = message.whatsAppSupport;
        bubble.appendChild(el("p", { text: isAr ? wa.messageAr : wa.messageEn }));
        bubble.appendChild(el("a", {
          class: "rd-cta",
          href: wa.url,
          target: "_blank",
          rel: "noopener",
          text: isAr ? wa.buttonTextAr : wa.buttonTextEn
        }));
      }
      msgs.appendChild(bubble);
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
      root.remove();
    }
  }).catch(function () {
    root.remove();
  });
})();
`;
