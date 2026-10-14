(function () {
"use strict";

/* =========================================================
   Ink Book — bookings, money and stock for a tattoo studio
   ========================================================= */

var COLS = ["clients", "sessions", "payments", "stock", "expenses", "settings"];
var PLATFORMS = [["instagram", "Instagram", "IG"], ["tiktok", "TikTok", "TT"], ["whatsapp", "WhatsApp", "WA"], ["other", "Other", "•"]];
var STATUSES = [["new", "New"], ["talking", "Talking"], ["booked", "Booked"], ["done", "Done"], ["lost", "Not going ahead"]];
var METHODS = ["Cash", "eSewa", "Khalti", "Bank"];
var STOCK_CATS = [["cartridge", "Cartridges"], ["ink", "Ink"], ["supply", "Supplies"]];
var EXP_CATS = ["Cartridges", "Ink", "Supplies", "Rent", "Equipment", "Other"];
var HOURS = [1, 1.5, 2, 3, 4, 5, 6, 8];
var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var DAY = 864e5;

/* ---------------- small helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseKey(k) { var p = k.split("-"); return new Date(+p[0], p[1] - 1, +p[2], 12); }
function today() { return keyOf(new Date()); }
function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function fmtDate(k, long) { var d = parseKey(k); return WD[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) + (long ? " " + d.getFullYear() : ""); }
function fmtTime(t) { if (!t) return ""; var p = t.split(":"), h = +p[0], m = p[1]; return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM"); }
function money(n) { n = Math.round(+n || 0); return "Rs. " + n.toLocaleString("en-IN"); }
function num(v) { var n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
function daysSince(ms) { return Math.floor((Date.now() - ms) / DAY); }
function ago(ms) { var d = daysSince(ms); if (d <= 0) { var h = Math.floor((Date.now() - ms) / 36e5); return h < 1 ? "just now" : h + "h ago"; } return d === 1 ? "1 day ago" : d + " days ago"; }
function cleanHandle(platform, v) {
  v = String(v || "").trim();
  if (platform === "whatsapp") return v.replace(/[^\d+]/g, "");
  v = v.replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|ig\.me\/m)\/?/i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return v;
}
function chatLink(c, text) {
  var h = c.handle || "";
  if (c.platform === "instagram" && h) return "https://ig.me/m/" + encodeURIComponent(h);
  if (c.platform === "tiktok" && h) return "https://www.tiktok.com/@" + encodeURIComponent(h);
  var phone = c.platform === "whatsapp" ? h : (c.phone || "");
  phone = phone.replace(/[^\d]/g, "");
  if (phone) { if (phone.length === 10 && phone[0] === "9") phone = "977" + phone; return "https://wa.me/" + phone + (text ? "?text=" + encodeURIComponent(text) : ""); }
  return "";
}
function platInfo(p) { return PLATFORMS.filter(function (x) { return x[0] === p; })[0] || PLATFORMS[3]; }
function platChip(p) { var i = platInfo(p); return '<span class="plat ' + i[0] + '" title="' + i[1] + '">' + i[2] + "</span>"; }
function displayName(c) { return c ? (c.name || (c.handle ? (c.platform === "whatsapp" ? c.handle : "@" + c.handle) : "No name")) : "Deleted client"; }
function statusLabel(s) { var x = STATUSES.filter(function (y) { return y[0] === s; })[0]; return x ? x[1] : s; }
var toastT;
function toast(msg) {
  var t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2400);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ---------------- photo shrinking ---------------- */
function shrinkPhoto(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onerror = reject;
    r.onload = function () {
      var img = new Image();
      img.onerror = reject;
      img.onload = function () {
        var max = 1280, q = 0.72, out;
        for (var tries = 0; tries < 5; tries++) {
          var s = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL("image/jpeg", q);
          if (out.length < 700000) break;
          max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.06);
        }
        resolve(out);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

/* =========================================================
   Data stores: demo (this device) and Firebase (shared)
   ========================================================= */
function LocalStore() {
  var KEY = "inkbook-demo-v1", data = {}, subs = [];
  try { data = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { data = {}; }
  COLS.concat(["photos"]).forEach(function (c) { data[c] = data[c] || {}; });
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast("This device is out of space for demo photos"); }
  }
  function emit(col) { subs.forEach(function (s) { if (s.col === col) s.cb(list(col)); }); }
  function list(col) { return Object.keys(data[col]).map(function (id) { return Object.assign({ id: id }, data[col][id]); }); }
  return {
    mode: "demo",
    watch: function (col, cb) { var s = { col: col, cb: cb }; subs.push(s); setTimeout(function () { cb(list(col)); }, 0); return function () { subs.splice(subs.indexOf(s), 1); }; },
    add: function (col, obj) { var id = uid(); data[col][id] = obj; persist(); emit(col); return Promise.resolve(id); },
    set: function (col, id, obj) { data[col][id] = obj; persist(); emit(col); return Promise.resolve(); },
    update: function (col, id, patch) { if (!data[col][id]) return Promise.resolve(); Object.assign(data[col][id], patch); persist(); emit(col); return Promise.resolve(); },
    remove: function (col, id) { delete data[col][id]; persist(); emit(col); return Promise.resolve(); },
    incr: function (col, id, field, n) { var d = data[col][id]; if (d) { d[field] = (d[field] || 0) + n; persist(); emit(col); } return Promise.resolve(); },
    photosFor: function (clientId) { return Promise.resolve(list("photos").filter(function (p) { return p.clientId === clientId; })); },
    removeWhere: function (col, field, value) { Object.keys(data[col]).forEach(function (id) { if (data[col][id][field] === value) delete data[col][id]; }); persist(); emit(col); return Promise.resolve(); },
    wipe: function () { COLS.concat(["photos"]).forEach(function (c) { data[c] = {}; }); persist(); COLS.forEach(emit); }
  };
}

function FirebaseStore(db) {
  var inc = firebase.firestore.FieldValue.increment;
  return {
    mode: "firebase",
    watch: function (col, cb, onErr) {
      return db.collection(col).onSnapshot(function (snap) {
        cb(snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }));
      }, function (err) { if (onErr) onErr(err); });
    },
    add: function (col, obj) { return db.collection(col).add(obj).then(function (ref) { return ref.id; }); },
    set: function (col, id, obj) { return db.collection(col).doc(id).set(obj); },
    update: function (col, id, patch) { return db.collection(col).doc(id).update(patch); },
    remove: function (col, id) { return db.collection(col).doc(id).delete(); },
    incr: function (col, id, field, n) { var p = {}; p[field] = inc(n); return db.collection(col).doc(id).update(p); },
    photosFor: function (clientId) {
      return db.collection("photos").where("clientId", "==", clientId).get().then(function (s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
    },
    removeWhere: function (col, field, value) {
      return db.collection(col).where(field, "==", value).get().then(function (s) {
        var b = db.batch(); s.docs.forEach(function (d) { b.delete(d.ref); }); return b.commit();
      });
    }
  };
}

/* =========================================================
   App state
   ========================================================= */
var store = null, unsubs = [];
var S = { clients: [], sessions: [], payments: [], stock: [], expenses: [], settings: [] };
var loaded = {};
var view = "today", inboxFilter = "reply", inboxQuery = "", calMonth = null, calSel = today(), moneyMonth = null;
var sheet = null; // {render: fn, live: bool}

function settings() { return S.settings.filter(function (s) { return s.id === "main"; })[0] || {}; }
function clientById(id) { return S.clients.filter(function (c) { return c.id === id; })[0] || null; }
function sessionById(id) { return S.sessions.filter(function (s) { return s.id === id; })[0] || null; }
function stockById(id) { return S.stock.filter(function (s) { return s.id === id; })[0] || null; }
function paidFor(sessionId) { return S.payments.reduce(function (a, p) { return a + (p.sessionId === sessionId ? (+p.amount || 0) : 0); }, 0); }
function owedFor(s) { return s.status === "done" ? Math.max(0, (+s.price || 0) - paidFor(s.id)) : 0; }
function sessionsFor(cid) { return S.sessions.filter(function (s) { return s.clientId === cid; }).sort(bySessionTime); }
function bySessionTime(a, b) { return (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")); }
function scheduled() { return S.sessions.filter(function (s) { return s.status === "scheduled"; }).sort(bySessionTime); }
function needsReply() {
  return S.clients.filter(function (c) { return c.needsReply && c.status !== "done" && c.status !== "lost"; })
    .sort(function (a, b) { return (a.since || 0) - (b.since || 0); });
}
function owedSessions() { return S.sessions.filter(function (s) { return owedFor(s) > 0; }).sort(bySessionTime); }
function totalOwed() { return owedSessions().reduce(function (a, s) { return a + owedFor(s); }, 0); }
function lowStock() { return S.stock.filter(function (s) { return (+s.qty || 0) <= (+s.low || 0); }); }
function waitBadge(c) {
  var d = daysSince(c.since || Date.now());
  var cls = d >= 3 ? "hot" : d >= 1 ? "warn" : "ok";
  return '<span class="badge ' + cls + '">' + (d <= 0 ? "Today" : d + "d waiting") + "</span>";
}

/* =========================================================
   Boot: demo mode or Firebase
   ========================================================= */
var auth = null, fdb = null;
function boot() {
  var cfg = window.FIREBASE_CONFIG || {};
  if (cfg.apiKey && window.firebase) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    fdb = firebase.firestore();
    fdb.enablePersistence({ synchronizeTabs: true }).catch(function () {});
    auth.onAuthStateChanged(function (u) {
      stopWatching();
      if (!u) { showAuth(); return; }
      if (!u.emailVerified) { showVerify(u); return; }
      start(FirebaseStore(fdb));
    });
  } else {
    start(LocalStore());
  }
}
function stopWatching() { unsubs.forEach(function (u) { try { u(); } catch (e) {} }); unsubs = []; loaded = {}; }
function start(st) {
  store = st;
  COLS.forEach(function (c) { S[c] = []; });
  COLS.forEach(function (col) {
    unsubs.push(store.watch(col, function (rows) { S[col] = rows; loaded[col] = true; schedule(); }, function (err) {
      if (err && err.code === "permission-denied") showDenied(); else toast("Can't reach the database. Check your internet.");
    }));
  });
  renderShell();
}

/* ---------------- sign in screens ---------------- */
function authShell(inner) { closeSheet(); $("app").innerHTML = '<div class="wrap"><div class="auth">' + inner + "</div></div>"; }
function showAuth(mode) {
  mode = mode || "in";
  authShell('<h1>Ink Book</h1><p>' + (mode === "in" ? "Sign in to see your bookings." : "Create your account. You'll get an email to confirm it.") + "</p>" +
    '<form id="authForm" novalidate><div class="field"><label for="aEmail">Email</label><input class="inp" id="aEmail" type="email" autocomplete="email" required></div>' +
    '<div class="field"><label for="aPass">Password</label><input class="inp" id="aPass" type="password" autocomplete="' + (mode === "in" ? "current-password" : "new-password") + '" minlength="6" required></div>' +
    '<p class="err" id="aErr"></p><div class="btns"><button class="btn primary" type="submit" style="flex:1">' + (mode === "in" ? "Sign in" : "Create account") + "</button></div></form>" +
    '<div class="btns" style="margin-top:12px;justify-content:space-between">' +
    (mode === "in" ? '<button class="btn ghost small" id="toUp">New here? Create account</button><button class="btn ghost small" id="forgot">Forgot password</button>' : '<button class="btn ghost small" id="toIn">I already have an account</button>') + "</div>");
  $("authForm").onsubmit = function (e) {
    e.preventDefault();
    var em = $("aEmail").value.trim(), pw = $("aPass").value;
    $("aErr").textContent = "";
    var p = mode === "in" ? auth.signInWithEmailAndPassword(em, pw) : auth.createUserWithEmailAndPassword(em, pw).then(function (r) { return r.user.sendEmailVerification(); });
    p.catch(function (err) { $("aErr").textContent = authError(err); });
  };
  if ($("toUp")) $("toUp").onclick = function () { showAuth("up"); };
  if ($("toIn")) $("toIn").onclick = function () { showAuth("in"); };
  if ($("forgot")) $("forgot").onclick = function () {
    var em = $("aEmail").value.trim();
    if (!em) { $("aErr").textContent = "Type your email first, then tap Forgot password."; return; }
    auth.sendPasswordResetEmail(em).then(function () { toast("Password reset email sent"); }, function (err) { $("aErr").textContent = authError(err); });
  };
}
function authError(err) {
  var c = (err && err.code) || "";
  if (c.indexOf("invalid-email") >= 0) return "That email address doesn't look right.";
  if (c.indexOf("weak-password") >= 0) return "Use a password with at least 6 characters.";
  if (c.indexOf("email-already-in-use") >= 0) return "There's already an account with this email. Sign in instead.";
  if (c.indexOf("invalid-credential") >= 0 || c.indexOf("wrong-password") >= 0 || c.indexOf("user-not-found") >= 0) return "Email or password is wrong.";
  if (c.indexOf("network") >= 0) return "No internet connection. Try again when you're online.";
  if (c.indexOf("too-many-requests") >= 0) return "Too many tries. Wait a few minutes and try again.";
  return "Something went wrong (" + c + "). Try again.";
}
function showVerify(u) {
  authShell("<h1>Check your email</h1><p>We sent a link to <b>" + esc(u.email) + "</b>. Open it to confirm your account, then come back and tap the button below.</p>" +
    '<p class="err" id="vErr"></p><div class="btns"><button class="btn primary" id="vDone" style="flex:1">I\'ve confirmed my email</button></div>' +
    '<div class="btns" style="margin-top:12px;justify-content:space-between"><button class="btn ghost small" id="vResend">Send the email again</button><button class="btn ghost small" id="vOut">Sign out</button></div>');
  $("vDone").onclick = function () {
    u.reload().then(function () { return u.getIdToken(true); }).then(function () {
      if (auth.currentUser.emailVerified) start(FirebaseStore(fdb)); else $("vErr").textContent = "Not confirmed yet. Open the link in the email first.";
    });
  };
  $("vResend").onclick = function () { u.sendEmailVerification().then(function () { toast("Email sent again"); }, function (e) { $("vErr").textContent = authError(e); }); };
  $("vOut").onclick = function () { auth.signOut(); };
}
function showDenied() {
  stopWatching();
  var em = auth && auth.currentUser ? auth.currentUser.email : "";
  authShell("<h1>No access yet</h1><p>The account <b>" + esc(em) + "</b> isn't on this studio's list. Ask for this email to be added to the database rules, then sign in again.</p>" +
    '<div class="btns"><button class="btn primary" id="dOut" style="flex:1">Sign out</button></div>');
  $("dOut").onclick = function () { auth.signOut(); };
}

/* =========================================================
   Shell + rendering
   ========================================================= */
var ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5l6 6M17.5 6.5L8 16l-3 1 1-3 9.5-9.5M8 16l-4.5 4.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};
var TABS = [["today", "Today", ICON.today], ["inbox", "Inbox", ICON.inbox], ["cal", "Calendar", ICON.cal], ["money", "Money", ICON.money], ["stock", "Stock", ICON.stock]];

function renderShell() {
  $("app").innerHTML =
    '<div class="wrap"><header class="top"><div class="brand"><h1 id="studio">Ink Book</h1><p id="dateline"></p></div>' +
    '<button class="iconbtn" data-act="settings" aria-label="Settings">' + ICON.gear + "</button></header>" +
    '<div id="demoBar"></div><main id="view"></main></div>' +
    '<button class="fab" data-act="quickAdd">' + ICON.plus + "New message</button>" +
    '<nav class="tabs" role="tablist">' + TABS.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (view === t[0]) + '">' + t[2] + t[1] + (t[0] === "inbox" ? '<span class="dot" id="inboxDot" hidden></span>' : "") + "</button>";
    }).join("") + "</nav>";
  render();
}

var raf = 0;
function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; render(); if (sheet && sheet.live) sheet.render(); }); }

function render() {
  if (!$("view")) return;
  var st = settings();
  $("studio").textContent = st.studio || "Ink Book";
  $("dateline").textContent = fmtDate(today(), true);
  var n = needsReply().length, dot = $("inboxDot");
  dot.hidden = !n; dot.textContent = n > 99 ? "99+" : n;
  document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === view ? "true" : "false"); });
  $("demoBar").innerHTML = store.mode === "demo" ? '<div class="demo"><span>Demo mode: everything is saved on this device only, until the shared database is connected.</span>' +
    (S.clients.length ? '<button class="btn small" data-act="wipeDemo">Clear demo data</button>' : '<button class="btn small" data-act="loadDemo">Show example data</button>') + "</div>" : "";
  ({ today: viewToday, inbox: viewInbox, cal: viewCal, money: viewMoney, stock: viewStock })[view]();
}
function setView(v) { view = v; render(); window.scrollTo(0, 0); }

/* ---------------- shared row templates ---------------- */
function sessionRow(s, showDate) {
  var c = clientById(s.clientId);
  return '<button class="row tap" data-act="openSession" data-id="' + s.id + '"><span class="time">' + (showDate ? esc(fmtDate(s.date)) + "<br>" : "") + esc(fmtTime(s.time)) + '</span><span class="main"><span class="t">' +
    esc(displayName(c)) + " " + (c ? platChip(c.platform) : "") + '</span><span class="s">' + esc((c && c.idea) || "Tattoo") + " · " + (s.hours || 1) + "h" + (s.price ? " · " + money(s.price) : "") + "</span></span></button>";
}
function clientRow(c, withReply) {
  var sub = [c.idea, c.size, c.placement].filter(Boolean).join(" · ") || (c.platform === "whatsapp" ? c.handle : c.handle ? "@" + c.handle : "");
  return '<div class="row"><button class="row tap" style="padding:0;border:none;flex:1;min-width:0" data-act="openClient" data-id="' + c.id + '"><span class="main"><span class="t">' + esc(displayName(c)) + " " + platChip(c.platform) +
    (c.needsReply ? " " + waitBadge(c) : ' <span class="badge">' + esc(statusLabel(c.status)) + "</span>") + '</span><span class="s">' + esc(sub) + "</span></span></button>" +
    (withReply && c.needsReply ? '<button class="btn small" data-act="replied" data-id="' + c.id + '">Replied</button>' : "") + "</div>";
}
function owedRow(s) {
  var c = clientById(s.clientId);
  return '<div class="row"><span class="main"><span class="t">' + esc(displayName(c)) + ' <span class="badge hot">Owes ' + money(owedFor(s)) + '</span></span><span class="s">' + esc(fmtDate(s.date)) + " · paid " + money(paidFor(s.id)) + " of " + money(s.price) +
    '</span></span><button class="btn small" data-act="addPayment" data-id="' + s.id + '">Add payment</button></div>';
}

/* ---------------- Today ---------------- */
function viewToday() {
  var t = today(), nr = needsReply(), todays = scheduled().filter(function (s) { return s.date === t; }),
    soon = scheduled().filter(function (s) { return s.date > t && s.date <= addDays(t, 7); }), owed = owedSessions(), low = lowStock();
  var past = scheduled().filter(function (s) { return s.date < t; });
  var h = '<div class="stats" style="margin-bottom:16px">' +
    '<button class="stat' + (nr.length ? " hot" : "") + '" data-act="go" data-v="inbox"><b>' + nr.length + "</b><span>Need a reply</span></button>" +
    '<button class="stat good" data-act="go" data-v="cal"><b>' + todays.length + "</b><span>Sessions today</span></button>" +
    '<button class="stat" data-act="go" data-v="money"><b>' + esc(money(totalOwed()).replace("Rs. ", "")) + "</b><span>Rs. still owed</span></button></div>";
  h += '<div class="grid two"><div class="col">';
  h += '<section class="sec"><div class="sechead"><h2>Today\'s sessions</h2></div>' + (todays.length ? '<div class="list">' + todays.map(function (s) { return sessionRow(s); }).join("") + "</div>" : '<p class="empty">No sessions today.</p>') + "</section>";
  if (past.length) h += '<section class="sec" style="border-color:var(--gold)"><div class="sechead"><h2>Finish these sessions</h2><span class="count">' + past.length + '</span></div><p class="empty" style="margin-bottom:6px">These dates have passed. Open each one to mark it done and record the payment.</p><div class="list">' + past.map(function (s) { return sessionRow(s, true); }).join("") + "</div></section>";
  h += '<section class="sec"><div class="sechead"><h2>Coming up this week</h2></div>' + (soon.length ? '<div class="list">' + soon.map(function (s) { return sessionRow(s, true); }).join("") + "</div>" : '<p class="empty">Nothing booked in the next 7 days.</p>') + "</section>";
  h += '</div><div class="col">';
  h += '<section class="sec"><div class="sechead"><h2>Waiting for your reply</h2><span class="count">' + nr.length + "</span></div>" +
    (nr.length ? '<div class="list">' + nr.slice(0, 6).map(function (c) { return clientRow(c, true); }).join("") + "</div>" + (nr.length > 6 ? '<button class="btn small ghost" data-act="go" data-v="inbox" style="margin-top:8px">See all ' + nr.length + "</button>" : "") : '<p class="empty">Everyone has a reply. Nice!</p>') + "</section>";
  if (owed.length) h += '<section class="sec"><div class="sechead"><h2>Still owes money</h2></div><div class="list">' + owed.slice(0, 5).map(owedRow).join("") + "</div></section>";
  if (low.length) h += '<section class="sec"><div class="sechead"><h2>Running low</h2></div><div class="list">' + low.map(function (s) {
    return '<button class="row tap" data-act="go" data-v="stock"><span class="main"><span class="t">' + esc(s.name) + '</span><span class="s">' + esc(catLabel(s.cat)) + '</span></span><span class="amt red">' + (+s.qty || 0) + " left</span></button>";
  }).join("") + "</div></section>";
  h += "</div></div>";
  $("view").innerHTML = h;
}

/* ---------------- Inbox ---------------- */
var FILTERS = [["reply", "Needs reply"], ["talking", "Talking"], ["booked", "Booked"], ["done", "Done"], ["lost", "Not going ahead"], ["all", "Everyone"]];
function viewInbox() {
  var q = inboxQuery.toLowerCase(), rows = S.clients.slice();
  if (q) rows = rows.filter(function (c) { return [c.name, c.handle, c.phone, c.idea, c.placement].join(" ").toLowerCase().indexOf(q) >= 0; });
  else if (inboxFilter === "reply") rows = needsReply();
  else if (inboxFilter === "talking") rows = rows.filter(function (c) { return c.status === "new" || c.status === "talking"; });
  else if (inboxFilter !== "all") rows = rows.filter(function (c) { return c.status === inboxFilter; });
  if (q || inboxFilter !== "reply") rows.sort(function (a, b) { return (b.since || b.createdAt || 0) - (a.since || a.createdAt || 0); });
  var h = '<input class="search" id="inboxSearch" type="search" placeholder="Search name, @handle or idea" value="' + esc(inboxQuery) + '" aria-label="Search clients">' +
    '<div class="scroller" role="group" aria-label="Filter">' + FILTERS.map(function (f) {
      var n = f[0] === "reply" ? needsReply().length : null;
      return '<button class="chip" data-act="filter" data-v="' + f[0] + '" aria-pressed="' + (!q && inboxFilter === f[0]) + '">' + f[1] + (n ? " (" + n + ")" : "") + "</button>";
    }).join("") + "</div>";
  h += '<section class="sec">' + (rows.length ? '<div class="list">' + rows.map(function (c) { return clientRow(c, true); }).join("") + "</div>" :
    '<p class="empty">' + (q ? "No one matches “" + esc(inboxQuery) + "”." : inboxFilter === "reply" ? "No one is waiting for a reply. When someone messages you, tap New message to add them." : "No one here yet.") + "</p>") + "</section>";
  $("view").innerHTML = h;
  var s = $("inboxSearch");
  s.oninput = function () { inboxQuery = s.value; var pos = s.selectionStart; viewInbox(); var n = $("inboxSearch"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
}

/* ---------------- Calendar ---------------- */
function viewCal() {
  var t = today();
  if (!calMonth) { var d = parseKey(t); calMonth = [d.getFullYear(), d.getMonth()]; }
  var first = new Date(calMonth[0], calMonth[1], 1, 12), startW = first.getDay(), dim = new Date(calMonth[0], calMonth[1] + 1, 0).getDate();
  var byDay = {};
  S.sessions.forEach(function (s) { if (s.status !== "cancelled") (byDay[s.date] = byDay[s.date] || []).push(s); });
  var h = '<div class="grid two"><section class="sec"><div class="calhead"><button class="iconbtn" data-act="calPrev" aria-label="Previous month">‹</button><h2>' + MONTHS[calMonth[1]] + " " + calMonth[0] +
    '</h2><button class="iconbtn" data-act="calNext" aria-label="Next month">›</button></div><div class="wk">' + WD.map(function (w) { return "<span>" + w.slice(0, 2) + "</span>"; }).join("") + '</div><div class="days">';
  for (var i = 0; i < startW; i++) h += '<span class="day out"></span>';
  for (var dd = 1; dd <= dim; dd++) {
    var k = calMonth[0] + "-" + pad(calMonth[1] + 1) + "-" + pad(dd), list = byDay[k] || [];
    h += '<button class="day' + (k === t ? " today" : "") + (k === calSel ? " sel" : "") + (k < t ? " past" : "") + '" data-act="calDay" data-k="' + k + '" aria-label="' + fmtDate(k) + (list.length ? ", " + list.length + " session" + (list.length > 1 ? "s" : "") : "") + '">' + dd +
      '<span class="pips">' + list.slice(0, 3).map(function () { return "<i></i>"; }).join("") + "</span></button>";
  }
  h += "</div></section>";
  var sel = (byDay[calSel] || []).sort(bySessionTime);
  h += '<div class="col"><section class="sec"><div class="sechead"><h2>' + esc(fmtDate(calSel)) + '</h2><button class="btn small teal" data-act="bookPick" data-k="' + calSel + '">+ Book</button></div>' +
    (sel.length ? '<div class="list">' + sel.map(function (s) { return sessionRow(s); }).join("") + "</div>" : '<p class="empty">Nothing booked this day.</p>') + "</section>";
  var up = scheduled().filter(function (s) { return s.date >= t; }).slice(0, 8);
  h += '<section class="sec"><div class="sechead"><h2>Next bookings</h2></div>' + (up.length ? '<div class="list">' + up.map(function (s) { return sessionRow(s, true); }).join("") + "</div>" : '<p class="empty">No bookings yet.</p>') + "</section></div></div>";
  $("view").innerHTML = h;
}

/* ---------------- Money ---------------- */
function viewMoney() {
  if (!moneyMonth) { var d = new Date(); moneyMonth = [d.getFullYear(), d.getMonth()]; }
  var prefix = moneyMonth[0] + "-" + pad(moneyMonth[1] + 1);
  var pays = S.payments.filter(function (p) { return (p.date || "").indexOf(prefix) === 0; }).sort(function (a, b) { return (b.date + (b.at || "")).localeCompare(a.date + (a.at || "")); });
  var exps = S.expenses.filter(function (e) { return (e.date || "").indexOf(prefix) === 0; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  var got = pays.reduce(function (a, p) { return a + (+p.amount || 0); }, 0), spent = exps.reduce(function (a, e) { return a + (+e.amount || 0); }, 0);
  var done = S.sessions.filter(function (s) { return s.status === "done" && (s.date || "").indexOf(prefix) === 0; }).length;
  var h = '<section class="sec" style="margin-bottom:16px"><div class="calhead"><button class="iconbtn" data-act="monPrev" aria-label="Previous month">‹</button><h2>' + MONTHS[moneyMonth[1]] + " " + moneyMonth[0] +
    '</h2><button class="iconbtn" data-act="monNext" aria-label="Next month">›</button></div><div class="money-tiles">' +
    '<div class="stat good"><b>' + esc(money(got).slice(4)) + "</b><span>Rs. received</span></div>" +
    '<div class="stat"><b>' + esc(money(spent).slice(4)) + "</b><span>Rs. spent</span></div>" +
    '<div class="stat' + (got - spent < 0 ? " hot" : " good") + '"><b>' + (got - spent < 0 ? "−" : "") + esc(money(Math.abs(got - spent)).slice(4)) + "</b><span>Rs. profit</span></div>" +
    '<div class="stat"><b>' + done + "</b><span>Tattoos done</span></div></div></section>";
  var owed = owedSessions();
  h += '<div class="grid two"><div class="col"><section class="sec"><div class="sechead"><h2>Still owes money</h2><span class="amt red">' + money(totalOwed()) + "</span></div>" +
    (owed.length ? '<div class="list">' + owed.map(owedRow).join("") + "</div>" : '<p class="empty">Everyone has paid in full.</p>') + "</section>";
  h += '<section class="sec"><div class="sechead"><h2>Payments received</h2></div>' + (pays.length ? '<div class="list">' + pays.map(function (p) {
    var c = clientById(p.clientId);
    return '<div class="row"><span class="main"><span class="t">' + esc(displayName(c)) + '</span><span class="s">' + esc(fmtDate(p.date)) + " · " + esc(p.method || "") + '</span></span><span class="amt teal">' + money(p.amount) + '</span><button class="btn small ghost" data-act="delPayment" data-id="' + p.id + '" aria-label="Delete payment">✕</button></div>';
  }).join("") + "</div>" : '<p class="empty">No payments this month.</p>') + "</section></div>";
  h += '<div class="col"><section class="sec"><div class="sechead"><h2>Expenses</h2><button class="btn small" data-act="addExpense">+ Add expense</button></div>' + (exps.length ? '<div class="list">' + exps.map(function (e) {
    return '<div class="row"><span class="main"><span class="t">' + esc(e.cat || "Other") + '</span><span class="s">' + esc(fmtDate(e.date)) + (e.note ? " · " + esc(e.note) : "") + '</span></span><span class="amt">' + money(e.amount) + '</span><button class="btn small ghost" data-act="delExpense" data-id="' + e.id + '" aria-label="Delete expense">✕</button></div>';
  }).join("") + "</div>" : '<p class="empty">No expenses this month. Add rent, ink or cartridge purchases to see your real profit.</p>') + "</section></div></div>";
  $("view").innerHTML = h;
}

/* ---------------- Stock ---------------- */
function catLabel(c) { var x = STOCK_CATS.filter(function (y) { return y[0] === c; })[0]; return x ? x[1] : "Supplies"; }
function viewStock() {
  var h = '<div class="btns" style="margin-bottom:14px"><button class="btn teal" data-act="restock">Restock</button><button class="btn" data-act="editStock">+ Add item</button></div>';
  if (!S.stock.length) {
    h += '<section class="sec"><p class="empty" style="margin-bottom:12px">Track cartridges, ink and supplies here. When a session is marked done, the cartridges you used come off the count automatically.</p><button class="btn primary" data-act="seedStock">Add a starter list</button></section>';
  } else {
    h += '<div class="grid two">';
    STOCK_CATS.forEach(function (cat) {
      var items = S.stock.filter(function (s) { return (s.cat || "supply") === cat[0]; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name); });
      if (!items.length) return;
      h += '<section class="sec"><div class="sechead"><h2>' + cat[1] + '</h2></div><div class="list">' + items.map(function (s) {
        var low = (+s.qty || 0) <= (+s.low || 0);
        return '<div class="row stockrow"><button class="row tap" style="padding:0;border:none;flex:1;min-width:0" data-act="editStock" data-id="' + s.id + '"><span class="main"><span class="t">' + esc(s.name) + (low ? ' <span class="badge hot">Low</span>' : "") +
          '</span><span class="s">' + esc(s.unit || "pcs") + (s.low ? " · warn at " + s.low : "") + "</span></span></button>" +
          '<div class="stepper"><button data-act="stockDec" data-id="' + s.id + '" aria-label="One less ' + esc(s.name) + '">−</button><span class="qty' + (low ? " low" : "") + '">' + (+s.qty || 0) + '</span><button data-act="stockInc" data-id="' + s.id + '" aria-label="One more ' + esc(s.name) + '">+</button></div></div>';
      }).join("") + "</div></section>";
    });
    h += "</div>";
  }
  $("view").innerHTML = h;
}

/* =========================================================
   Sheets (slide-up panels)
   ========================================================= */
function openSheet(fn, live) {
  sheet = { render: function () { var y = $("sheetBody") ? $("sheetBody").scrollTop : 0; $("layer").innerHTML = '<div class="veil" data-act="closeSheet"></div><div class="sheet" id="sheetBody" role="dialog" aria-modal="true">' + fn() + "</div>"; $("sheetBody").scrollTop = y; if (sheet.after) sheet.after(); }, live: !!live };
  sheet.render();
  document.body.style.overflow = "hidden";
}
function closeSheet() { sheet = null; $("layer").innerHTML = ""; document.body.style.overflow = ""; }
function head(title, sub) { return '<div class="sheethead"><div class="ttl"><h2>' + title + "</h2>" + (sub ? "<p>" + sub + "</p>" : "") + '</div><button class="btn small" data-act="closeSheet">Close</button></div>'; }
function chipsHTML(name, opts, cur) { return '<div class="chips" role="group">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<button type="button" class="chip" data-chip="' + name + '" data-v="' + esc(v) + '" aria-pressed="' + (String(cur) === String(v)) + '">' + esc(l) + "</button>"; }).join("") + "</div>"; }
function chipVal(name) { var b = document.querySelector('[data-chip="' + name + '"][aria-pressed="true"]'); return b ? b.dataset.v : ""; }

/* ---------- quick add / edit client ---------- */
var pendingPhotos = [];
function sheetClientForm(c) {
  var isNew = !c; c = c || { platform: "instagram" };
  pendingPhotos = [];
  openSheet(function () {
    return head(isNew ? "New message" : "Edit client") +
      '<form id="cForm" novalidate><div class="field"><span class="lab">Messaged on</span>' + chipsHTML("platform", PLATFORMS.map(function (p) { return [p[0], p[1]]; }), c.platform) + "</div>" +
      '<div class="pair"><div class="field"><label for="cHandle" id="cHandleLab">' + handleLabel(c.platform) + '</label><input class="inp" id="cHandle" autocapitalize="off" autocomplete="off" value="' + esc(c.handle || "") + '"></div>' +
      '<div class="field"><label for="cName">Name</label><input class="inp" id="cName" value="' + esc(c.name || "") + '" placeholder="Optional"></div></div>' +
      '<div class="field"><label for="cIdea">Tattoo idea</label><input class="inp" id="cIdea" value="' + esc(c.idea || "") + '" placeholder="e.g. small rose with name"></div>' +
      '<div class="pair"><div class="field"><label for="cSize">Size</label><input class="inp" id="cSize" value="' + esc(c.size || "") + '" placeholder="e.g. 3 inch"></div>' +
      '<div class="field"><label for="cPlace">Placement</label><input class="inp" id="cPlace" value="' + esc(c.placement || "") + '" placeholder="e.g. forearm"></div></div>' +
      (c.platform !== "whatsapp" ? '<div class="field"><label for="cPhone">Phone (optional)</label><input class="inp" id="cPhone" type="tel" value="' + esc(c.phone || "") + '" placeholder="For WhatsApp reminders"></div>' : "") +
      '<div class="field"><label for="cNotes">Notes</label><textarea class="inp" id="cNotes" placeholder="Anything else">' + esc(c.notes || "") + "</textarea></div>" +
      (isNew ? '<div class="field"><span class="lab">Reference photos</span><div class="photos" id="pendPhotos"></div></div>' : "") +
      '<div class="btns end"><button type="submit" class="btn primary">' + (isNew ? "Save" : "Save changes") + "</button></div></form>";
  });
  function drawPending() {
    var host = $("pendPhotos"); if (!host) return;
    host.innerHTML = pendingPhotos.map(function (p, i) { return '<div class="photo"><img src="' + p + '" alt="Reference photo ' + (i + 1) + '"></div>'; }).join("") +
      '<label class="addphoto" for="cFiles">+ Add photos</label><input type="file" id="cFiles" accept="image/*" multiple hidden>';
    $("cFiles").onchange = function () {
      var files = Array.prototype.slice.call(this.files || []);
      toast("Adding photos…");
      Promise.all(files.map(shrinkPhoto)).then(function (arr) { pendingPhotos = pendingPhotos.concat(arr); drawPending(); }, function () { toast("Couldn't read that photo"); });
    };
  }
  sheet.after = function () {
    drawPending();
    document.querySelectorAll('[data-chip="platform"]').forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.v; $("cHandleLab").textContent = handleLabel(v);
        $("cHandle").setAttribute("inputmode", v === "whatsapp" ? "tel" : "text");
      });
    });
    $("cForm").onsubmit = function (e) {
      e.preventDefault();
      var platform = chipVal("platform") || "other";
      var data = {
        platform: platform, handle: cleanHandle(platform, $("cHandle").value), name: $("cName").value.trim(),
        idea: $("cIdea").value.trim(), size: $("cSize").value.trim(), placement: $("cPlace").value.trim(),
        phone: $("cPhone") ? $("cPhone").value.trim() : (c.phone || ""), notes: $("cNotes").value.trim()
      };
      if (!data.handle && !data.name) { toast("Add a name or their " + handleLabel(platform).toLowerCase()); return; }
      if (isNew) {
        var dup = S.clients.filter(function (x) { return x.handle && x.handle.toLowerCase() === (data.handle || "").toLowerCase() && x.platform === platform; })[0];
        if (dup && data.handle) { toast(displayName(dup) + " is already saved. Opening them."); closeSheet(); sheetClient(dup.id); store.update("clients", dup.id, { needsReply: true, since: Date.now() }); return; }
        data.status = "new"; data.needsReply = true; data.since = Date.now(); data.createdAt = Date.now();
        var photos = pendingPhotos.slice();
        store.add("clients", data).then(function (id) {
          return Promise.all(photos.map(function (p) { return store.add("photos", { clientId: id, data: p, kind: "ref", at: Date.now() }); }));
        }).then(function () { toast("Saved. They're in your reply list."); }, function () { toast("Couldn't save. Check your internet."); });
        closeSheet();
      } else {
        store.update("clients", c.id, data).then(function () { toast("Saved"); });
        closeSheet(); sheetClient(c.id);
      }
    };
  };
  sheet.render();
}
function handleLabel(p) { return p === "whatsapp" ? "WhatsApp number" : p === "other" ? "Contact" : (p === "tiktok" ? "TikTok" : "Instagram") + " @username"; }

/* ---------- client detail ---------- */
var clientPhotos = {}, confirmDel = false;
function loadPhotos(cid) { return store.photosFor(cid).then(function (ps) { clientPhotos[cid] = ps.sort(function (a, b) { return (a.at || 0) - (b.at || 0); }); if (sheet && sheet.cid === cid) sheet.render(); }); }
function sheetClient(cid) {
  confirmDel = false;
  openSheet(function () {
    var c = clientById(cid);
    if (!c) return head("Client deleted") + '<p class="empty">This client is no longer saved.</p>';
    var link = chatLink(c), ss = sessionsFor(cid), photos = clientPhotos[cid];
    var h = head(esc(displayName(c)), platChip(c.platform) + (c.name && c.handle ? " " + esc(c.platform === "whatsapp" ? c.handle : "@" + c.handle) : "") + (c.needsReply ? " " + waitBadge(c) : ""));
    h += '<div class="btns">' + (link ? '<a class="btn primary" href="' + esc(link) + '" target="_blank" rel="noopener">Open chat</a>' : "") +
      (c.needsReply ? '<button class="btn" data-act="replied" data-id="' + c.id + '">I replied</button>' : '<button class="btn" data-act="theyMessaged" data-id="' + c.id + '">They messaged again</button>') +
      '<button class="btn teal" data-act="book" data-id="' + c.id + '">Book a session</button></div>';
    h += '<div class="block"><h3>Status</h3>' + chipsHTML("status", STATUSES, c.status) + "</div>";
    h += '<div class="block"><div class="sechead" style="margin-bottom:8px"><h3 style="flex:1;margin:0">Tattoo</h3><button class="btn small" data-act="editClient" data-id="' + c.id + '">Edit</button></div><dl class="kv">' +
      "<dt>Idea</dt><dd>" + (esc(c.idea) || "—") + "</dd><dt>Size</dt><dd>" + (esc(c.size) || "—") + "</dd><dt>Placement</dt><dd>" + (esc(c.placement) || "—") + "</dd>" +
      (c.phone ? "<dt>Phone</dt><dd>" + esc(c.phone) + "</dd>" : "") + (c.notes ? "<dt>Notes</dt><dd>" + esc(c.notes) + "</dd>" : "") + "<dt>First message</dt><dd>" + (c.createdAt ? esc(fmtDate(keyOf(new Date(c.createdAt)), true)) : "—") + "</dd></dl></div>";
    h += '<div class="block"><h3>Photos</h3><div class="photos">' + (photos ? photos.map(function (p) {
      return '<button class="photo" data-act="viewPhoto" data-id="' + p.id + '" data-cid="' + cid + '"><img src="' + p.data + '" alt="' + (p.kind === "healed" ? "Healed photo" : "Reference photo") + '"><span class="tag">' + (p.kind === "healed" ? "Healed" : "Ref") + "</span></button>";
    }).join("") : '<p class="empty">Loading photos…</p>') +
      '<label class="addphoto" for="refFiles">+ Reference</label><input type="file" id="refFiles" accept="image/*" multiple hidden data-kind="ref">' +
      (ss.some(function (s) { return s.status === "done"; }) ? '<label class="addphoto" for="healFiles">+ Healed photo</label><input type="file" id="healFiles" accept="image/*" hidden data-kind="healed">' : "") + "</div></div>";
    h += '<div class="block"><h3>Sessions</h3>' + (ss.length ? '<div class="list">' + ss.map(function (s) {
      var tag = s.status === "done" ? (owedFor(s) > 0 ? '<span class="badge hot">Owes ' + money(owedFor(s)) + "</span>" : '<span class="badge ok">Paid</span>') : s.status === "cancelled" ? '<span class="badge">Cancelled</span>' : '<span class="badge warn">Booked</span>';
      return '<button class="row tap" data-act="openSession" data-id="' + s.id + '"><span class="main"><span class="t">' + esc(fmtDate(s.date)) + " · " + esc(fmtTime(s.time)) + " " + tag + '</span><span class="s">' + (s.hours || 1) + "h" + (s.price ? " · " + money(s.price) : "") + (s.note ? " · " + esc(s.note) : "") + "</span></span></button>";
    }).join("") + "</div>" : '<p class="empty">No sessions yet.</p>') + "</div>";
    h += '<div class="block">' + (confirmDel ? '<div class="confirm"><p>Delete ' + esc(displayName(c)) + ", their photos and sessions? Payments already received stay in your income.</p><div class=\"btns\"><button class=\"btn red\" data-act=\"delClientYes\" data-id=\"" + c.id + '">Delete</button><button class="btn" data-act="delClientNo">Keep</button></div></div>' :
      '<button class="btn danger small" data-act="delClient">Delete client</button>') + "</div>";
    return h;
  }, true);
  sheet.cid = cid;
  sheet.after = function () {
    document.querySelectorAll('[data-chip="status"]').forEach(function (b) {
      b.onclick = function () { var p = { status: b.dataset.v }; if (b.dataset.v === "done" || b.dataset.v === "lost") p.needsReply = false; store.update("clients", cid, p); };
    });
    ["refFiles", "healFiles"].forEach(function (id) {
      var inp = $(id); if (!inp) return;
      inp.onchange = function () {
        var kind = inp.dataset.kind, files = Array.prototype.slice.call(inp.files || []);
        toast("Adding photos…");
        Promise.all(files.map(shrinkPhoto)).then(function (arr) {
          return Promise.all(arr.map(function (p) { return store.add("photos", { clientId: cid, data: p, kind: kind, at: Date.now() }); }));
        }).then(function () { toast("Photo added"); loadPhotos(cid); }, function () { toast("Couldn't add that photo"); });
      };
    });
  };
  sheet.render();
  loadPhotos(cid);
}

/* ---------- book / edit session ---------- */
function sheetBook(cid, s, dateKey) {
  var isNew = !s; s = s || { date: dateKey || today(), time: "12:00", hours: 2 };
  var c = clientById(cid);
  openSheet(function () {
    return head(isNew ? "Book a session" : "Change booking", esc(displayName(c))) +
      '<form id="bForm" novalidate><div class="pair"><div class="field"><label for="bDate">Date</label><input class="inp" id="bDate" type="date" value="' + esc(s.date) + '" required></div>' +
      '<div class="field"><label for="bTime">Start time</label><input class="inp" id="bTime" type="time" value="' + esc(s.time) + '" step="900" required></div></div>' +
      '<div class="field"><span class="lab">How long</span>' + chipsHTML("hours", HOURS.map(function (x) { return [x, x + "h"]; }), s.hours) + "</div>" +
      '<div class="field"><label for="bPrice">Price (Rs.)</label><input class="inp" id="bPrice" inputmode="numeric" value="' + (s.price || "") + '" placeholder="You can set or change it after the tattoo"></div>' +
      '<div class="field"><label for="bNote">Note</label><input class="inp" id="bNote" value="' + esc(s.note || "") + '" placeholder="e.g. session 1 of 2, outline only"></div>' +
      '<p class="err" id="bErr"></p><div class="btns end"><button class="btn primary" type="submit">' + (isNew ? "Book" : "Save changes") + "</button></div></form>";
  });
  sheet.after = function () {
    $("bForm").onsubmit = function (e) {
      e.preventDefault();
      var data = { clientId: cid, date: $("bDate").value, time: $("bTime").value, hours: +chipVal("hours") || 1, price: num($("bPrice").value), note: $("bNote").value.trim() };
      if (!data.date || !data.time) { $("bErr").textContent = "Pick a date and a start time."; return; }
      var clash = S.sessions.filter(function (x) { return x.status === "scheduled" && x.id !== s.id && x.date === data.date && overlaps(x, data); })[0];
      if (clash && !$("bForm").dataset.ok) { $("bErr").textContent = "That overlaps with " + displayName(clientById(clash.clientId)) + " at " + fmtTime(clash.time) + ". Tap the button again to book anyway."; $("bForm").dataset.ok = "1"; return; }
      if (isNew) {
        data.status = "scheduled"; data.createdAt = Date.now();
        store.add("sessions", data).then(function () { toast("Booked for " + fmtDate(data.date) + " at " + fmtTime(data.time)); });
        store.update("clients", cid, { status: "booked", needsReply: false });
      } else {
        store.update("sessions", s.id, data).then(function () { toast("Booking updated"); });
      }
      calSel = data.date; var d = parseKey(data.date); calMonth = [d.getFullYear(), d.getMonth()];
      closeSheet(); sheetClient(cid);
    };
  };
  sheet.render();
}
function mins(t) { var p = (t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1]); }
function overlaps(a, b) { var a1 = mins(a.time), a2 = a1 + (a.hours || 1) * 60, b1 = mins(b.time), b2 = b1 + (b.hours || 1) * 60; return a1 < b2 && b1 < a2; }

/* ---------- session detail ---------- */
var confirmCancel = false;
function sheetSession(sid) {
  confirmCancel = false;
  openSheet(function () {
    var s = sessionById(sid); if (!s) return head("Booking removed") + '<p class="empty">This booking no longer exists.</p>';
    var c = clientById(s.clientId), link = c ? chatLink(c) : "";
    var h = head(esc(fmtDate(s.date, true)) + " · " + esc(fmtTime(s.time)), (c ? esc(displayName(c)) + " " + platChip(c.platform) : "Deleted client") + " · " + (s.hours || 1) + "h");
    h += '<dl class="kv"><dt>Tattoo</dt><dd>' + esc([c && c.idea, c && c.size, c && c.placement].filter(Boolean).join(" · ") || "—") + "</dd>" + (s.note ? "<dt>Note</dt><dd>" + esc(s.note) + "</dd>" : "") +
      "<dt>Price</dt><dd>" + (s.price ? money(s.price) : "Not set yet") + "</dd>" + (s.status === "done" ? "<dt>Paid</dt><dd>" + money(paidFor(s.id)) + (owedFor(s) ? ' <span class="badge hot">Owes ' + money(owedFor(s)) + "</span>" : ' <span class="badge ok">Paid in full</span>') + "</dd>" : "") +
      (s.used && s.used.length ? "<dt>Cartridges</dt><dd>" + esc(s.used.map(function (u) { var it = stockById(u.id); return u.qty + "× " + (it ? it.name : u.name || "item"); }).join(", ")) + "</dd>" : "") + "</dl>";
    if (s.status === "scheduled") {
      h += '<div class="btns" style="margin-top:16px"><button class="btn red" data-act="markDone" data-id="' + s.id + '">Mark done + payment</button>' +
        (c && link ? '<button class="btn" data-act="remind" data-id="' + s.id + '">Send reminder</button>' : "") +
        '<button class="btn" data-act="reschedule" data-id="' + s.id + '">Change</button></div>';
      h += '<div class="block">' + (confirmCancel ? '<div class="confirm"><p>Cancel this booking?</p><div class="btns"><button class="btn red" data-act="cancelYes" data-id="' + s.id + '">Cancel booking</button><button class="btn" data-act="cancelNo">Keep it</button></div></div>' : '<button class="btn danger small" data-act="cancelBooking">Cancel booking</button>') + "</div>";
    } else if (s.status === "done") {
      h += '<div class="btns" style="margin-top:16px">' + (owedFor(s) ? '<button class="btn red" data-act="addPayment" data-id="' + s.id + '">Add payment</button>' : "") + '<button class="btn" data-act="editPrice" data-id="' + s.id + '">Change price</button></div>';
    } else {
      h += '<p class="empty" style="margin-top:12px">This booking was cancelled.</p><div class="btns"><button class="btn" data-act="restore" data-id="' + s.id + '">Book it again</button></div>';
    }
    if (c) h += '<div class="block"><button class="btn ghost small" data-act="openClient" data-id="' + c.id + '">Open ' + esc(displayName(c)) + "'s details</button></div>";
    return h;
  }, true);
}

/* ---------- mark done: price, payment, cartridges ---------- */
function sheetDone(sid) {
  var s = sessionById(sid), c = clientById(s.clientId), used = {};
  var carts = S.stock.filter(function (x) { return x.cat === "cartridge"; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name); });
  openSheet(function () {
    return head("Tattoo done", esc(displayName(c)) + " · " + esc(fmtDate(s.date))) +
      '<form id="dForm" novalidate><div class="field"><label for="dPrice">Final price (Rs.)</label><input class="inp" id="dPrice" inputmode="numeric" value="' + (s.price || "") + '" required></div>' +
      '<div class="field"><label for="dPaid">Paid now (Rs.)</label><input class="inp" id="dPaid" inputmode="numeric" value="' + (s.price || "") + '"><p class="hint">Leave a smaller amount if they\'ll pay the rest later. It goes to your "still owes" list.</p></div>' +
      '<div class="field"><span class="lab">Paid by</span>' + chipsHTML("method", METHODS, "Cash") + "</div>" +
      '<div class="field"><span class="lab">Cartridges used</span>' + (carts.length ? '<div class="list">' + carts.map(function (it) {
        return '<div class="row"><span class="main"><span class="t">' + esc(it.name) + '</span><span class="s">' + (+it.qty || 0) + ' in stock</span></span><div class="stepper"><button type="button" data-step="' + it.id + '" data-d="-1" aria-label="One less">−</button><output id="u-' + it.id + '">0</output><button type="button" data-step="' + it.id + '" data-d="1" aria-label="One more">+</button></div></div>';
      }).join("") + "</div>" : '<p class="hint">Add cartridges on the Stock tab to count them here.</p>') + "</div>" +
      '<p class="err" id="dErr"></p><div class="btns end"><button class="btn red" type="submit">Save</button></div></form>';
  });
  sheet.after = function () {
    $("dPrice").oninput = function () { $("dPaid").value = $("dPrice").value; };
    document.querySelectorAll("[data-step]").forEach(function (b) {
      b.onclick = function () { var id = b.dataset.step; used[id] = Math.max(0, (used[id] || 0) + (+b.dataset.d)); $("u-" + id).textContent = used[id]; };
    });
    $("dForm").onsubmit = function (e) {
      e.preventDefault();
      var price = num($("dPrice").value), paid = num($("dPaid").value), method = chipVal("method") || "Cash";
      if (!price) { $("dErr").textContent = "Enter the final price."; return; }
      if (paid > price) { $("dErr").textContent = "Paid now can't be more than the price."; return; }
      var list = Object.keys(used).filter(function (k) { return used[k] > 0; }).map(function (k) { var it = stockById(k); return { id: k, name: it ? it.name : "", qty: used[k] }; });
      store.update("sessions", sid, { status: "done", price: price, used: list, doneAt: Date.now() });
      if (paid > 0) store.add("payments", { sessionId: sid, clientId: s.clientId, amount: paid, method: method, date: today(), at: Date.now() });
      list.forEach(function (u) { store.incr("stock", u.id, "qty", -u.qty); });
      var more = S.sessions.some(function (x) { return x.clientId === s.clientId && x.id !== sid && x.status === "scheduled"; });
      if (!more) store.update("clients", s.clientId, { status: "done", needsReply: false });
      toast(paid >= price ? "Done and paid in full" : "Done. " + money(price - paid) + " still owed");
      closeSheet(); sheetSession(sid);
    };
  };
  sheet.render();
}

/* ---------- payments ---------- */
function sheetPayment(sid) {
  var s = sessionById(sid), c = clientById(s.clientId), left = owedFor(s);
  openSheet(function () {
    return head("Add payment", esc(displayName(c)) + " · owes " + money(left)) +
      '<form id="pForm" novalidate><div class="pair"><div class="field"><label for="pAmt">Amount (Rs.)</label><input class="inp" id="pAmt" inputmode="numeric" value="' + left + '"></div>' +
      '<div class="field"><label for="pDate">Date</label><input class="inp" id="pDate" type="date" value="' + today() + '"></div></div>' +
      '<div class="field"><span class="lab">Paid by</span>' + chipsHTML("method", METHODS, "Cash") + '</div><p class="err" id="pErr"></p><div class="btns end"><button class="btn red" type="submit">Save payment</button></div></form>';
  });
  sheet.after = function () {
    $("pForm").onsubmit = function (e) {
      e.preventDefault();
      var a = num($("pAmt").value);
      if (!a) { $("pErr").textContent = "Enter the amount."; return; }
      store.add("payments", { sessionId: sid, clientId: s.clientId, amount: a, method: chipVal("method") || "Cash", date: $("pDate").value || today(), at: Date.now() }).then(function () { toast("Payment saved"); });
      closeSheet();
    };
  };
  sheet.render();
}
function sheetPrice(sid) {
  var s = sessionById(sid);
  openSheet(function () {
    return head("Change price") + '<form id="prForm" novalidate><div class="field"><label for="prVal">Price (Rs.)</label><input class="inp" id="prVal" inputmode="numeric" value="' + (s.price || "") + '"></div><div class="btns end"><button class="btn primary" type="submit">Save</button></div></form>';
  });
  sheet.after = function () { $("prForm").onsubmit = function (e) { e.preventDefault(); store.update("sessions", sid, { price: num($("prVal").value) }); closeSheet(); sheetSession(sid); }; };
  sheet.render();
}

/* ---------- reminder ---------- */
function reminderText(s, c) {
  var when = s.date === addDays(today(), 1) ? "tomorrow" : s.date === today() ? "today" : "on " + fmtDate(s.date);
  var studio = settings().studio;
  return "Hi " + (c.name || "there") + "! Just a reminder: your tattoo appointment" + (studio ? " at " + studio : "") + " is " + when + " at " + fmtTime(s.time) + ". Please eat well and get good sleep before. See you then!";
}
function remind(sid) {
  var s = sessionById(sid), c = clientById(s.clientId), text = reminderText(s, c), wa = c.platform === "whatsapp" || c.phone;
  var link = wa ? chatLink(c.platform === "whatsapp" ? c : { platform: "whatsapp", handle: c.phone }, text) : chatLink(c);
  openSheet(function () {
    return head("Send reminder", esc(displayName(c))) + '<div class="field"><label for="rText">Message</label><textarea class="inp" id="rText" style="min-height:120px">' + esc(text) + "</textarea>" +
      '<p class="hint">' + (wa ? "WhatsApp opens with this message ready to send." : "Copy the message, then paste it in their chat.") + "</p></div>" +
      '<div class="btns end"><button class="btn" data-act="copyReminder">Copy</button>' + (link ? '<a class="btn primary" id="rOpen" href="' + esc(link) + '" target="_blank" rel="noopener">' + (wa ? "Open WhatsApp" : "Open chat") + "</a>" : "") + "</div>";
  });
  sheet.after = function () {
    if ($("rOpen") && wa) $("rOpen").onclick = function () { this.href = chatLink(c.platform === "whatsapp" ? c : { platform: "whatsapp", handle: c.phone }, $("rText").value); };
    if ($("rOpen") && !wa) $("rOpen").onclick = function () { copyText($("rText").value); };
  };
  sheet.render();
}
function copyText(t) {
  try { navigator.clipboard.writeText(t).then(function () { toast("Copied"); }, function () { toast("Select the text and copy it"); }); }
  catch (e) { toast("Select the text and copy it"); }
}

/* ---------- client picker (book from calendar) ---------- */
function sheetPick(dateKey) {
  var q = "";
  openSheet(function () {
    var rows = S.clients.filter(function (c) { return c.status !== "lost"; });
    if (q) rows = rows.filter(function (c) { return [c.name, c.handle, c.idea].join(" ").toLowerCase().indexOf(q) >= 0; });
    rows.sort(function (a, b) { var r = { talking: 0, new: 1, booked: 2, done: 3 }; return (r[a.status] || 0) - (r[b.status] || 0) || (b.since || 0) - (a.since || 0); });
    return head("Who are you booking?", esc(fmtDate(dateKey))) + '<input class="search" id="pickQ" type="search" placeholder="Search" value="' + esc(q) + '" aria-label="Search clients">' +
      '<div class="list">' + rows.slice(0, 40).map(function (c) {
        return '<button class="row tap" data-act="pickClient" data-id="' + c.id + '" data-k="' + dateKey + '"><span class="main"><span class="t">' + esc(displayName(c)) + " " + platChip(c.platform) + ' <span class="badge">' + esc(statusLabel(c.status)) + '</span></span><span class="s">' + esc(c.idea || "") + "</span></span></button>";
      }).join("") + "</div>" + (rows.length ? "" : '<p class="empty">No one found. Add them with New message first.</p>');
  });
  sheet.after = function () { var i = $("pickQ"); i.oninput = function () { q = i.value.toLowerCase(); var pos = i.selectionStart; sheet.render(); var n = $("pickQ"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }; };
  sheet.render();
}

/* ---------- expenses ---------- */
function sheetExpense() {
  openSheet(function () {
    return head("Add expense") + '<form id="eForm" novalidate><div class="pair"><div class="field"><label for="eAmt">Amount (Rs.)</label><input class="inp" id="eAmt" inputmode="numeric"></div>' +
      '<div class="field"><label for="eDate">Date</label><input class="inp" id="eDate" type="date" value="' + today() + '"></div></div>' +
      '<div class="field"><span class="lab">What for</span>' + chipsHTML("ecat", EXP_CATS, "Supplies") + "</div>" +
      '<div class="field"><label for="eNote">Note</label><input class="inp" id="eNote" placeholder="Optional"></div><p class="err" id="eErr"></p><div class="btns end"><button class="btn primary" type="submit">Save expense</button></div></form>';
  });
  sheet.after = function () {
    $("eForm").onsubmit = function (e) {
      e.preventDefault(); var a = num($("eAmt").value);
      if (!a) { $("eErr").textContent = "Enter the amount."; return; }
      store.add("expenses", { amount: a, date: $("eDate").value || today(), cat: chipVal("ecat") || "Other", note: $("eNote").value.trim(), at: Date.now() }).then(function () { toast("Expense saved"); });
      closeSheet();
    };
  };
  sheet.render();
}

/* ---------- stock ---------- */
function sheetStock(id) {
  var it = id ? stockById(id) : { cat: "cartridge", qty: 0, low: 5, unit: "pcs" }, del = false;
  openSheet(function () {
    return head(id ? "Edit item" : "Add item") + '<form id="sForm" novalidate><div class="field"><label for="sName">Name</label><input class="inp" id="sName" value="' + esc(it.name || "") + '" placeholder="e.g. 7RL cartridge"></div>' +
      '<div class="field"><span class="lab">Type</span>' + chipsHTML("scat", STOCK_CATS, it.cat || "supply") + "</div>" +
      '<div class="trio"><div class="field"><label for="sQty">In stock</label><input class="inp" id="sQty" inputmode="numeric" value="' + (+it.qty || 0) + '"></div>' +
      '<div class="field"><label for="sLow">Warn at</label><input class="inp" id="sLow" inputmode="numeric" value="' + (+it.low || 0) + '"></div>' +
      '<div class="field"><label for="sUnit">Unit</label><input class="inp" id="sUnit" value="' + esc(it.unit || "pcs") + '"></div></div>' +
      '<div class="btns end">' + (id ? '<button type="button" class="btn danger" id="sDel">Delete</button>' : "") + '<button class="btn primary" type="submit">Save</button></div></form>' +
      (del ? '<div class="confirm"><p>Delete ' + esc(it.name) + "?</p><div class=\"btns\"><button class=\"btn red\" id=\"sDelYes\">Delete</button><button class=\"btn\" id=\"sDelNo\">Keep</button></div></div>" : "");
  });
  sheet.after = function () {
    $("sForm").onsubmit = function (e) {
      e.preventDefault(); var name = $("sName").value.trim();
      if (!name) { toast("Give the item a name"); return; }
      var data = { name: name, cat: chipVal("scat") || "supply", qty: Math.round(num($("sQty").value)), low: Math.round(num($("sLow").value)), unit: $("sUnit").value.trim() || "pcs" };
      if (id) store.update("stock", id, data); else { data.order = Date.now(); store.add("stock", data); }
      toast("Saved"); closeSheet();
    };
    if ($("sDel")) $("sDel").onclick = function () { del = true; sheet.render(); };
    if ($("sDelYes")) $("sDelYes").onclick = function () { store.remove("stock", id); toast("Deleted"); closeSheet(); };
    if ($("sDelNo")) $("sDelNo").onclick = function () { del = false; sheet.render(); };
  };
  sheet.render();
}
function sheetRestock() {
  var items = S.stock.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  if (!items.length) { sheetStock(); return; }
  openSheet(function () {
    return head("Restock") + '<form id="rsForm" novalidate><div class="field"><label for="rsItem">Item</label><select class="inp" id="rsItem">' + items.map(function (i) { return '<option value="' + i.id + '">' + esc(i.name) + " (" + (+i.qty || 0) + " now)</option>"; }).join("") + "</select></div>" +
      '<div class="pair"><div class="field"><label for="rsQty">How many</label><input class="inp" id="rsQty" inputmode="numeric"></div><div class="field"><label for="rsCost">Total cost (Rs.)</label><input class="inp" id="rsCost" inputmode="numeric" placeholder="Optional"></div></div>' +
      '<p class="hint" style="margin:-6px 0 14px">The cost is added to your expenses.</p><p class="err" id="rsErr"></p><div class="btns end"><button class="btn teal" type="submit">Add to stock</button></div></form>';
  });
  sheet.after = function () {
    $("rsForm").onsubmit = function (e) {
      e.preventDefault(); var id = $("rsItem").value, q = Math.round(num($("rsQty").value)), cost = num($("rsCost").value), it = stockById(id);
      if (!q) { $("rsErr").textContent = "Enter how many you bought."; return; }
      store.incr("stock", id, "qty", q);
      if (cost) store.add("expenses", { amount: cost, date: today(), cat: it.cat === "cartridge" ? "Cartridges" : it.cat === "ink" ? "Ink" : "Supplies", note: q + "× " + it.name, at: Date.now() });
      toast("Added " + q + " " + it.name); closeSheet();
    };
  };
  sheet.render();
}
function seedStock() {
  var carts = ["1RL", "3RL", "5RL", "7RL", "9RL", "11RL", "5M1", "7M1", "9M1", "9RM", "11RM", "13RM", "15RM"];
  var items = carts.map(function (n, i) { return { name: n + " cartridge", cat: "cartridge", qty: 0, low: 5, unit: "pcs", order: i }; })
    .concat([{ name: "Black ink", cat: "ink", qty: 0, low: 1, unit: "bottles", order: 100 }, { name: "Gloves", cat: "supply", qty: 0, low: 1, unit: "boxes", order: 200 },
      { name: "Cling film", cat: "supply", qty: 0, low: 1, unit: "rolls", order: 201 }, { name: "Stencil paper", cat: "supply", qty: 0, low: 10, unit: "sheets", order: 202 },
      { name: "Aftercare film", cat: "supply", qty: 0, low: 1, unit: "rolls", order: 203 }]);
  items.reduce(function (p, it) { return p.then(function () { return store.add("stock", it); }); }, Promise.resolve()).then(function () { toast("Starter list added. Tap + to set your counts."); });
}

/* ---------- settings ---------- */
function sheetSettings() {
  var st = settings(), u = auth && auth.currentUser;
  openSheet(function () {
    return head("Settings") + '<form id="stForm" novalidate><div class="field"><label for="stName">Studio name</label><input class="inp" id="stName" value="' + esc(st.studio || "") + '" placeholder="Shown at the top and in reminders"></div><div class="btns end"><button class="btn primary" type="submit">Save</button></div></form>' +
      '<div class="block"><h3>Export</h3><p class="hint" style="margin:0 0 10px">Download a spreadsheet file (CSV) as a backup, or to open in Excel or Google Sheets.</p><div class="btns"><button class="btn" data-act="exportClients">Clients + bookings</button><button class="btn" data-act="exportMoney">Money</button></div></div>' +
      '<div class="block"><h3>Account</h3>' + (u ? '<p class="hint" style="margin:0 0 10px">Signed in as ' + esc(u.email) + '</p><button class="btn" data-act="signOut">Sign out</button>' : '<p class="hint" style="margin:0">Demo mode. Connect Firebase to share bookings between phones.</p>') + "</div>";
  });
  sheet.after = function () {
    $("stForm").onsubmit = function (e) { e.preventDefault(); store.set("settings", "main", Object.assign({}, st, { studio: $("stName").value.trim() })).then(function () { toast("Saved"); }); closeSheet(); };
  };
  sheet.render();
}
function csv(rows) { return rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n"); }
function download(name, text) {
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function exportClients() {
  var rows = [["Name", "Platform", "Handle/number", "Phone", "Status", "Idea", "Size", "Placement", "Notes", "First message", "Session date", "Time", "Hours", "Session status", "Price", "Paid", "Owed"]];
  S.clients.forEach(function (c) {
    var base = [c.name, platInfo(c.platform)[1], c.handle, c.phone, statusLabel(c.status), c.idea, c.size, c.placement, c.notes, c.createdAt ? keyOf(new Date(c.createdAt)) : ""];
    var ss = sessionsFor(c.id);
    if (!ss.length) rows.push(base);
    ss.forEach(function (s) { rows.push(base.concat([s.date, s.time, s.hours, s.status, s.price || "", paidFor(s.id), owedFor(s)])); });
  });
  download("ink-book-clients-" + today() + ".csv", csv(rows));
}
function exportMoney() {
  var rows = [["Type", "Date", "Amount", "Client / category", "Method / note"]];
  S.payments.forEach(function (p) { rows.push(["Payment", p.date, p.amount, displayName(clientById(p.clientId)), p.method]); });
  S.expenses.forEach(function (e) { rows.push(["Expense", e.date, e.amount, e.cat, e.note]); });
  rows = [rows[0]].concat(rows.slice(1).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])); }));
  download("ink-book-money-" + today() + ".csv", csv(rows));
}

/* ---------- demo data ---------- */
function loadDemo() {
  var t = today(), now = Date.now();
  var people = [
    { name: "Aashma", platform: "instagram", handle: "aashma.k", idea: "Fine-line moon and stars", size: "2 inch", placement: "Wrist", status: "new", needsReply: true, since: now - 3 * DAY - 3e6 },
    { name: "Bibek", platform: "tiktok", handle: "bibek_ride", idea: "Mountain range with date", size: "5 inch", placement: "Forearm", status: "talking", needsReply: true, since: now - 1 * DAY - 2e6 },
    { name: "Sanjana", platform: "whatsapp", handle: "9841000001", idea: "Mandala", size: "Half sleeve", placement: "Upper arm", status: "new", needsReply: true, since: now - 2 * 36e5 },
    { name: "Rohan", platform: "instagram", handle: "rohan.ink", idea: "Lion portrait", size: "6 inch", placement: "Calf", status: "booked", needsReply: false, since: now - 6 * DAY, phone: "9800000002" },
    { name: "Priya", platform: "whatsapp", handle: "9851000003", idea: "Name in Devanagari", size: "3 inch", placement: "Collarbone", status: "booked", needsReply: false, since: now - 4 * DAY },
    { name: "Kiran", platform: "tiktok", handle: "kiran.t", idea: "Small butterfly", size: "1.5 inch", placement: "Ankle", status: "done", needsReply: false, since: now - 12 * DAY },
    { name: "Suman", platform: "instagram", handle: "suman_s", idea: "Compass", size: "4 inch", placement: "Forearm", status: "done", needsReply: false, since: now - 20 * DAY }
  ];
  var ids = [];
  people.reduce(function (p, c) { return p.then(function () { c.createdAt = c.since; return store.add("clients", c).then(function (id) { ids.push(id); }); }); }, Promise.resolve()).then(function () {
    var ses = [
      { clientId: ids[3], date: t, time: "14:00", hours: 3, price: 15000, status: "scheduled" },
      { clientId: ids[4], date: addDays(t, 2), time: "11:00", hours: 1.5, price: 5000, status: "scheduled" },
      { clientId: ids[5], date: addDays(t, -5), time: "13:00", hours: 1, price: 3000, status: "done" },
      { clientId: ids[6], date: addDays(t, -9), time: "15:00", hours: 2, price: 8000, status: "done" }
    ];
    return ses.reduce(function (p, s) { return p.then(function () { s.createdAt = now; return store.add("sessions", s).then(function (id) { s.id = id; }); }); }, Promise.resolve()).then(function () {
      store.add("payments", { sessionId: ses[2].id, clientId: ids[5], amount: 3000, method: "eSewa", date: addDays(t, -5), at: now });
      store.add("payments", { sessionId: ses[3].id, clientId: ids[6], amount: 5000, method: "Cash", date: addDays(t, -9), at: now });
      store.add("expenses", { amount: 4500, date: addDays(t, -3), cat: "Cartridges", note: "Box of 7RL", at: now });
      [["3RL cartridge", 18, 5], ["5RL cartridge", 3, 5], ["7RL cartridge", 22, 5], ["9RM cartridge", 12, 5], ["13RM cartridge", 8, 5]].forEach(function (x, i) { store.add("stock", { name: x[0], cat: "cartridge", qty: x[1], low: x[2], unit: "pcs", order: i }); });
      store.add("stock", { name: "Black ink", cat: "ink", qty: 2, low: 1, unit: "bottles", order: 100 });
      store.add("stock", { name: "Gloves", cat: "supply", qty: 1, low: 1, unit: "boxes", order: 200 });
      toast("Example data added");
    });
  });
}

// first tap turns ✕ into "Delete?", second tap within 4 seconds deletes
function armDelete(el) {
  if (el.dataset.armed) return true;
  el.dataset.armed = "1"; el.textContent = "Delete?"; el.classList.add("danger");
  setTimeout(function () { if (el.isConnected) { delete el.dataset.armed; el.textContent = "✕"; el.classList.remove("danger"); } }, 4000);
  return false;
}

/* =========================================================
   One click handler for everything
   ========================================================= */
document.addEventListener("click", function (e) {
  var tab = e.target.closest("[data-tab]");
  if (tab) { setView(tab.dataset.tab); return; }
  var chip = e.target.closest("[data-chip]");
  if (chip) { document.querySelectorAll('[data-chip="' + chip.dataset.chip + '"]').forEach(function (b) { b.setAttribute("aria-pressed", b === chip ? "true" : "false"); }); }
  var el = e.target.closest("[data-act]");
  if (!el) return;
  var a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case "go": setView(el.dataset.v); break;
    case "closeSheet": closeSheet(); break;
    case "quickAdd": sheetClientForm(); break;
    case "settings": sheetSettings(); break;
    case "openClient": closeSheet(); sheetClient(id); break;
    case "editClient": sheetClientForm(clientById(id)); break;
    case "replied": store.update("clients", id, { needsReply: false, status: (clientById(id) || {}).status === "new" ? "talking" : (clientById(id) || {}).status, repliedAt: Date.now() }); toast("Marked as replied"); break;
    case "theyMessaged": store.update("clients", id, { needsReply: true, since: Date.now() }); toast("Back in your reply list"); break;
    case "book": sheetBook(id); break;
    case "openSession": closeSheet(); sheetSession(id); break;
    case "markDone": sheetDone(id); break;
    case "remind": remind(id); break;
    case "copyReminder": copyText($("rText").value); break;
    case "reschedule": var s1 = sessionById(id); sheetBook(s1.clientId, s1); break;
    case "cancelBooking": confirmCancel = true; sheet.render(); break;
    case "cancelNo": confirmCancel = false; sheet.render(); break;
    case "cancelYes": store.update("sessions", id, { status: "cancelled" }); toast("Booking cancelled"); confirmCancel = false; break;
    case "restore": var s2 = sessionById(id); sheetBook(s2.clientId, Object.assign({}, s2)); store.update("sessions", id, { status: "scheduled" }); break;
    case "addPayment": sheetPayment(id); break;
    case "editPrice": sheetPrice(id); break;
    case "delPayment": if (armDelete(el)) { store.remove("payments", id); toast("Payment deleted"); } break;
    case "addExpense": sheetExpense(); break;
    case "delExpense": if (armDelete(el)) { store.remove("expenses", id); toast("Expense deleted"); } break;
    case "delClient": confirmDel = true; sheet.render(); break;
    case "delClientNo": confirmDel = false; sheet.render(); break;
    case "delClientYes":
      store.removeWhere("photos", "clientId", id); store.removeWhere("sessions", "clientId", id); store.remove("clients", id);
      closeSheet(); toast("Client deleted"); break;
    case "viewPhoto":
      var ph = (clientPhotos[el.dataset.cid] || []).filter(function (p) { return p.id === id; })[0]; if (!ph) break;
      var v = document.createElement("div"); v.className = "viewer"; v.innerHTML = '<img alt="Photo" src="' + ph.data + '"><div class="btns"><button class="btn" data-x="close">Close</button><button class="btn danger" data-x="del">Delete photo</button></div>';
      v.onclick = function (ev) { var x = ev.target.dataset.x; if (x === "del") { store.remove("photos", id).then(function () { loadPhotos(el.dataset.cid); }); toast("Photo deleted"); } if (x || ev.target === v) v.remove(); ev.stopPropagation(); };
      document.body.appendChild(v); break;
    case "filter": inboxFilter = el.dataset.v; inboxQuery = ""; viewInbox(); break;
    case "calPrev": calMonth = calMonth[1] === 0 ? [calMonth[0] - 1, 11] : [calMonth[0], calMonth[1] - 1]; viewCal(); break;
    case "calNext": calMonth = calMonth[1] === 11 ? [calMonth[0] + 1, 0] : [calMonth[0], calMonth[1] + 1]; viewCal(); break;
    case "calDay": calSel = el.dataset.k; viewCal(); break;
    case "bookPick": sheetPick(el.dataset.k); break;
    case "pickClient": sheetBook(id, null, el.dataset.k); break;
    case "monPrev": moneyMonth = moneyMonth[1] === 0 ? [moneyMonth[0] - 1, 11] : [moneyMonth[0], moneyMonth[1] - 1]; viewMoney(); break;
    case "monNext": moneyMonth = moneyMonth[1] === 11 ? [moneyMonth[0] + 1, 0] : [moneyMonth[0], moneyMonth[1] + 1]; viewMoney(); break;
    case "editStock": sheetStock(id); break;
    case "restock": sheetRestock(); break;
    case "seedStock": seedStock(); break;
    case "stockInc": store.incr("stock", id, "qty", 1); break;
    case "stockDec": if ((+(stockById(id) || {}).qty || 0) > 0) store.incr("stock", id, "qty", -1); break;
    case "exportClients": exportClients(); break;
    case "exportMoney": exportMoney(); break;
    case "signOut": closeSheet(); auth.signOut(); break;
    case "loadDemo": loadDemo(); break;
    case "wipeDemo": if (store.wipe) { store.wipe(); clientPhotos = {}; toast("Demo data cleared"); } break;
  }
});
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  var v = document.querySelector(".viewer"); if (v) { v.remove(); return; }
  if (sheet) closeSheet();
});
// refresh "days waiting" and today's date when the app comes back
document.addEventListener("visibilitychange", function () { if (!document.hidden && store) render(); });
setInterval(function () { if (store && !sheet) render(); }, 5 * 60 * 1000);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
boot();
})();
