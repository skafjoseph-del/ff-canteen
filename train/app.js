/* Reef. Plans and logs stay in localStorage on this phone. */
(function () {
  "use strict";
  var L = window.ReefLogic;
  var KEY = "reef.v1";
  var state = load();
  var ui = {
    tab: "today",
    week: L.mondayOf(L.todayIso()),
    sheet: null,
    toast: null,
    toastTimer: 0
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return normalise(JSON.parse(raw));
    } catch (e) {
      try {
        var bad = localStorage.getItem(KEY);
        if (bad) localStorage.setItem(KEY + ".corrupt", bad);
      } catch (e2) {}
      return fresh();
    }
  }

  function fresh() {
    return { settings: L.sanitiseSettings({}), sessions: [] };
  }

  function normalise(obj) {
    var sessions = [];
    var seen = {};
    ((obj && obj.sessions) || []).forEach(function (raw) {
      var s = L.sanitiseSession(raw);
      if (!s) return;
      if (seen[s.id]) s.id = L.newId();
      seen[s.id] = true;
      sessions.push(s);
    });
    return { settings: L.sanitiseSettings((obj && obj.settings) || {}), sessions: sessions };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        app: "reef", version: 1, settings: state.settings, sessions: state.sessions
      }));
      return true;
    } catch (e) {
      toast("Couldn't save on this phone.");
      return false;
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function find(id) {
    for (var i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === id) return state.sessions[i];
    }
    return null;
  }

  function upsert(session) {
    var found = false;
    state.sessions = state.sessions.map(function (s) {
      if (s.id !== session.id) return s;
      found = true;
      return session;
    });
    if (!found) state.sessions.push(session);
  }

  function zoneTag(id) {
    return id ? String(id).replace(/^z/, "Z") : "";
  }

  function statusWord(status) {
    if (status === "done") return "Done";
    if (status === "partial") return "Partial";
    if (status === "skipped") return "Skipped";
    return "";
  }

  function themeGlyph() {
    if (state.settings.theme === "light") return "☀";
    if (state.settings.theme === "dark") return "☾";
    return "◐";
  }

  function applyTheme() {
    var theme = state.settings.theme;
    var dark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    var btn = document.getElementById("themeBtn");
    if (btn) {
      btn.textContent = themeGlyph();
      btn.setAttribute("aria-label", "Theme " + theme + ". Change theme.");
    }
    document.querySelectorAll("[data-theme-choice]").forEach(function (el) {
      el.classList.toggle("on", el.getAttribute("data-theme-choice") === theme);
      el.setAttribute("aria-pressed", el.getAttribute("data-theme-choice") === theme ? "true" : "false");
    });
  }

  function paintHeader() {
    var today = L.todayIso();
    document.getElementById("hello").textContent = L.greeting(L.sydneyHour()) + ", " + state.settings.athlete;
    document.getElementById("sub").textContent = L.formatLong(today);
    document.getElementById("goal").textContent = L.countdown(today, state.settings.raceDate) + " · " + state.settings.goal;
  }

  function paintNav() {
    document.querySelectorAll("nav button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === ui.tab;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }

  function paintNet() {
    document.getElementById("offline").hidden = navigator.onLine;
  }

  function paintToast() {
    var el = document.getElementById("toast");
    var undo = document.getElementById("toastUndo");
    if (!ui.toast) {
      el.hidden = true;
      return;
    }
    document.getElementById("toastText").textContent = ui.toast.text;
    undo.hidden = !ui.toast.undo;
    el.hidden = false;
  }

  function toast(text, undo) {
    ui.toast = { text: text, undo: undo || null };
    paintToast();
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () {
      ui.toast = null;
      paintToast();
    }, 4200);
  }

  function tabFromHash() {
    var h = location.hash.replace("#", "");
    return ["today", "week", "zones", "settings"].indexOf(h) === -1 ? "today" : h;
  }

  function render(opts) {
    opts = opts || {};
    var y = window.scrollY;
    document.getElementById("view").innerHTML = viewHtml();
    paintHeader();
    paintNav();
    applyTheme();
    if (opts.keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
  }

  function viewHtml() {
    if (ui.tab === "week") return viewWeek();
    if (ui.tab === "zones") return viewZones();
    if (ui.tab === "settings") return viewSettings();
    return viewToday();
  }

  function barPct(planned, done) {
    if (done <= 0) return 0;
    if (planned <= 0) return 100;
    return Math.min(100, Math.round(done / planned * 100));
  }

  function hoursBlock(monday, heading) {
    var h = L.weekHours(state.sessions, monday);
    if (!h.total.planned && !h.total.done) {
      return '<section class="hours"><h2>' + esc(heading) + '</h2><p class="quiet">No training hours in this week yet.</p></section>';
    }
    var rows = h.rows.filter(function (r) {
      return r.sport !== "brick" || r.planned || r.done;
    }).map(function (r) {
      var max = Math.max(r.planned, r.done, 1);
      return '<li><span class="dot ' + r.sport + '"></span><span class="nm">' + esc(L.SPORTS[r.sport].label) +
        '</span><span class="nums"><b>' + esc(L.formatMinutes(r.done)) + '</b> / ' + esc(L.formatMinutes(r.planned)) +
        '</span><span class="track" role="meter" aria-label="' + esc(L.SPORTS[r.sport].label) + ' completed" aria-valuemin="0" aria-valuemax="' +
        max + '" aria-valuenow="' + r.done + '"><i style="width:' + barPct(r.planned, r.done) + '%"></i></span></li>';
    }).join("");
    return '<section class="hours"><div class="hours-top"><h2>' + esc(heading) + '</h2><strong>' +
      esc(L.formatMinutes(h.total.done)) + ' done · ' + esc(L.formatMinutes(h.total.planned)) +
      ' planned</strong></div><ul>' + rows + '</ul></section>';
  }

  function kneeBlock(monday) {
    var notes = L.kneeNotes(state.sessions, monday);
    if (!notes.length) return "";
    var bits = notes.map(function (n) { return L.formatWeekday(n.date) + " " + n.knee; }).join(" · ");
    var high = notes.some(function (n) { return n.knee >= 4; });
    return '<p class="knee-week">Knee this week: ' + esc(bits) +
      (high ? ". Sharp pain, swelling, or the knee giving way needs a physio." : ".") + "</p>";
  }

  function rangePlain(sport, zoneId) {
    if (!zoneId || sport === "rest" || sport === "strength") return "";
    var z = L.findZone(sport, zoneId, state.settings);
    if (!z || !z.range) {
      if (sport === "run") return "Add a run threshold on Zones to see min/km.";
      if (sport === "swim") return "Add a CSS on Zones to see pace per 100 m.";
      if (sport === "brick") return "Add an FTP or a run pace to see the ranges.";
      return "Add an FTP on Zones to see watts.";
    }
    var hr = sport === "bike" ? L.bikeHrRange(zoneId, state.settings.lthr) : "";
    return z.range + (hr ? " · " + hr : "");
  }

  function rangeHtml(s) {
    var text = rangePlain(s.sport, s.zone);
    if (!text) return "";
    var z = L.findZone(s.sport, s.zone, state.settings);
    var meta = zoneTag(s.zone) + (z ? " " + z.name.toLowerCase() : "");
    if (z && z.band && s.sport !== "brick") meta += " · " + z.band;
    var missing = !z || !z.range;
    if (missing) return '<p class="range-meta">' + esc(zoneTag(s.zone)) + " · " + esc(text) + "</p>";
    return '<p class="range">' + esc(text) + '</p><p class="range-meta">' + esc(meta) + "</p>";
  }

  function cardHtml(s) {
    var meta = [];
    if (s.sport !== "rest" && s.minutes) meta.push(L.formatMinutes(s.minutes));
    if (s.metres) meta.push(L.formatDistance(s.metres, s.sport));
    var logBits = [];
    if (s.actualMinutes != null) logBits.push(L.formatMinutes(s.actualMinutes) + " actual");
    if (s.actualMetres != null) logBits.push(L.formatDistance(s.actualMetres, s.sport) + " actual");
    if (s.rpe) logBits.push("RPE " + s.rpe + " · " + L.rpeWord(s.rpe));
    if (s.knee != null) logBits.push("Knee " + s.knee + "/10");
    var actions = "";
    if (s.sport === "rest") {
      if (s.status !== "done") actions += actionBtn("done", s.id, "Rested");
      actions += actionBtn("log", s.id, s.feel || s.status ? "Edit log" : "Note");
    } else {
      if (s.status !== "done") actions += actionBtn("done", s.id, "Done");
      actions += actionBtn("log", s.id, s.status ? "Edit log" : "Log");
      if (s.status !== "skipped") actions += actionBtn("skip", s.id, "Skip");
    }
    var knee = "";
    if (L.hitsKneeDistance(s) && s.knee == null) {
      knee = '<p class="knee-hint">Front of the knee often shows up around 7 km. Log a score after.</p>';
    }
    return '<article class="card">' +
      '<div class="card-main" role="button" tabindex="0" data-act="open" data-id="' + esc(s.id) + '">' +
      '<div class="row"><span class="chip ' + s.sport + '">' + esc(L.SPORTS[s.sport].label) + '</span>' +
      (s.status ? '<span class="status ' + s.status + '">' + statusWord(s.status) + "</span>" : "") + "</div>" +
      "<h3>" + esc(s.title || L.SPORTS[s.sport].label) + "</h3>" +
      (s.extra ? '<p class="extra-tag">Unplanned</p>' : "") +
      (meta.length ? '<p class="meta">' + esc(meta.join(" · ")) + "</p>" : "") +
      rangeHtml(s) +
      (s.detail ? '<p class="detail">' + esc(s.detail) + "</p>" : "") +
      (logBits.length ? '<p class="logline">' + esc(logBits.join(" · ")) + "</p>" : "") +
      (s.feel ? '<p class="feel">' + esc(s.feel) + "</p>" : "") +
      knee +
      '</div><div class="card-actions">' + actions + "</div></article>";
  }

  function actionBtn(act, id, label) {
    return '<button type="button" class="btn ghost" data-act="' + act + '" data-id="' + esc(id) + '">' + label + "</button>";
  }

  function viewToday() {
    var today = L.todayIso();
    var sessions = L.daySessions(state.sessions, today);
    var html = "";
    if (!state.sessions.length) html += welcomeHtml();
    else {
      html += hoursBlock(L.mondayOf(today), "This week");
      html += kneeBlock(L.mondayOf(today));
    }
    html += '<div class="today-wrap"><div class="dayhead"><h2>Today</h2>' +
      (L.isSaturday(today) ? '<span class="pill rest">Sabbath</span>' : "") + "</div>";
    if (!sessions.length && L.isSaturday(today)) html += '<p class="restnote big">Rest day.</p><p class="quiet">No training unless you add one.</p>';
    else if (!sessions.length) html += '<p class="restnote">Nothing planned today.</p>';
    else html += sessions.map(cardHtml).join("");
    html += "</div>";
    html += '<div class="stack"><button type="button" class="btn primary" data-act="add" data-date="' + today + '">Add to today</button>' +
      '<button type="button" class="btn ghost" data-act="extra">Log an extra session</button></div>';
    if (state.sessions.length) {
      html += '<p class="center"><button type="button" class="linkish" data-act="jump-week">See the week</button></p>';
    }
    return html;
  }

  function welcomeHtml() {
    return '<section class="welcome"><h2>A plan for Cairns</h2>' +
      "<p>Starter build week: 3 swims, 3 rides including a long ride, 3 runs including a long run, and 2 strength sessions. Saturday stays rest.</p>" +
      '<button type="button" class="btn primary" data-act="template">Load build week</button></section>';
  }

  function viewWeek() {
    var monday = ui.week;
    var current = L.mondayOf(L.todayIso());
    var html = '<div class="pager"><button type="button" data-act="week-prev" aria-label="Previous week">‹</button><div class="mid"><strong>' +
      esc(L.formatWeekRange(monday)) + "</strong>" +
      (monday === current ? "" : '<button type="button" class="linkish" data-act="week-current">This week</button>') +
      '</div><button type="button" data-act="week-next" aria-label="Next week">›</button></div>';
    html += '<div class="tools"><button type="button" class="btn primary" data-act="template">Load build week</button>' +
      '<button type="button" class="btn ghost" data-act="copy-week">Copy to next week</button></div>';
    if (!L.sessionsInWeek(state.sessions, monday).length) {
      html += '<p class="quiet">The build week is 3 swims, 3 rides, 3 runs, and 2 strength sessions. Saturday stays rest.</p>';
    }
    html += hoursBlock(monday, "Planned vs done");
    html += kneeBlock(monday);
    for (var i = 0; i < 7; i++) html += dayBlock(L.addDays(monday, i));
    return html;
  }

  function dayBlock(iso) {
    var sessions = L.daySessions(state.sessions, iso);
    var today = iso === L.todayIso();
    var sat = L.isSaturday(iso);
    var html = '<section class="day' + (today ? " today" : "") + '"><div class="dayhead"><div><span class="when">' +
      esc(L.formatShort(iso)) + "</span>" +
      (today ? '<span class="pill">Today</span>' : "") +
      (sat ? '<span class="pill rest">Sabbath</span>' : "") +
      '</div><button type="button" class="plus" data-act="add" data-date="' + iso + '" aria-label="Add a session on ' +
      esc(L.formatLong(iso)) + '">+</button></div>';
    if (!sessions.length && sat) html += '<p class="restnote">Rest. No training unless you add one.</p>';
    else if (!sessions.length) html += '<p class="restnote">Nothing planned.</p>';
    else html += sessions.map(cardHtml).join("");
    return html + "</section>";
  }

  function anchorField(id, label, hint, value, mode) {
    return '<label class="field">' + esc(label) +
      '<input id="' + id + '" value="' + esc(value) + '" inputmode="' + mode + '" autocomplete="off" enterkeyhint="done">' +
      '</label><p class="hint">' + esc(hint) + '</p><p class="error" id="' + id + 'Err"></p>';
  }

  function viewZones() {
    var s = state.settings;
    return '<p class="lede">A session can name a zone. Reef turns that into watts or pace from the numbers here. Bike starts at 165 W. Run pace and swim CSS stay blank until you fill them in.</p>' +
      anchorField("ftp", "Cycling FTP (watts)", "Functional threshold power. Leave blank to hide watts.", s.ftp == null ? "" : String(s.ftp), "numeric") +
      '<div id="zone-bike">' + zoneSection("Bike power", "Coggan's seven levels from FTP. Watts are rounded. Z7 is a sprint, not a percentage.", L.powerZones(s.ftp)) + "</div>" +
      anchorField("runPace", "Run threshold (min/km)", "Pace you could hold for about an hour, like 4:30.", s.runPace ? L.formatPace(s.runPace) : "", "decimal") +
      '<div id="zone-run">' + zoneSection("Run pace", "Joe Friel's bands from threshold pace. A higher percent is slower.", L.runZones(s.runPace)) + "</div>" +
      anchorField("css", "Swim CSS (min/100 m)", "Critical swim speed, like 1:45.", s.css ? L.formatPace(s.css) : "", "decimal") +
      '<div id="zone-swim">' + zoneSection("Swim pace", "Seconds per 100 m from CSS. Threshold sits on CSS.", L.swimZones(s.css)) + "</div>" +
      anchorField("lthr", "Threshold heart rate", "Optional. Beats per minute.", s.lthr == null ? "" : String(s.lthr), "numeric") +
      '<div id="zone-lthr">' + zoneSection("Heart rate from threshold", "Coggan's heart-rate column, paired with the power levels. Bike sessions also show this next to the watts.", L.hrFromLthr(s.lthr)) + "</div>" +
      anchorField("maxHr", "Max heart rate", "Optional. A separate scale from threshold.", s.maxHr == null ? "" : String(s.maxHr), "numeric") +
      '<div id="zone-max">' + zoneSection("Heart rate from max", "Five bands of max heart rate. These numbers are not the power zones.", L.hrFromMax(s.maxHr)) + "</div>";
  }

  function paintZoneTables() {
    var s = state.settings;
    var map = {
      "zone-bike": zoneSection("Bike power", "Coggan's seven levels from FTP. Watts are rounded. Z7 is a sprint, not a percentage.", L.powerZones(s.ftp)),
      "zone-run": zoneSection("Run pace", "Joe Friel's bands from threshold pace. A higher percent is slower.", L.runZones(s.runPace)),
      "zone-swim": zoneSection("Swim pace", "Seconds per 100 m from CSS. Threshold sits on CSS.", L.swimZones(s.css)),
      "zone-lthr": zoneSection("Heart rate from threshold", "Coggan's heart-rate column, paired with the power levels. Bike sessions also show this next to the watts.", L.hrFromLthr(s.lthr)),
      "zone-max": zoneSection("Heart rate from max", "Five bands of max heart rate. These numbers are not the power zones.", L.hrFromMax(s.maxHr))
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = map[id];
    });
  }

  function zoneSection(title, note, rows) {
    var body = rows.length ? ('<ul class="zlist">' + rows.map(function (z) {
      return '<li><span class="zid">' + esc(zoneTag(z.id)) + "</span><span><b>" + esc(z.name) + "</b><small>" +
        esc(z.band) + "</small></span><strong>" + esc(z.range) + "</strong></li>";
    }).join("") + "</ul>") : '<p class="quiet">Nothing to show until the number above is set.</p>';
    return '<section class="block"><h2>' + esc(title) + "</h2><p class=\"note\">" + esc(note) + "</p>" + body + "</section>";
  }

  function viewSettings() {
    var s = state.settings;
    return '<section class="block"><h2>Athlete</h2>' +
      settingField("athlete", "Name", s.athlete) +
      settingField("goal", "Goal", s.goal) +
      settingField("race", "Race", s.race) +
      '<label class="field">Race date<input id="raceDate" type="date" value="' + esc(s.raceDate) + '"></label>' +
      '<p class="hint">Dates use Australia/Sydney. The week starts on Monday. Cairns 70.3 is listed as 13 June 2027.</p></section>' +
      '<section class="block"><h2>Appearance</h2><div class="seg" role="group" aria-label="Theme">' +
      themeBtn("auto", "Auto") + themeBtn("light", "Light") + themeBtn("dark", "Dark") +
      "</div><p class=\"hint\">Light is the one for bright sun. Auto follows the phone.</p></section>" +
      '<section class="block"><h2>Backup</h2><p class="quiet">The plan lives in this browser only. Export before you clear the phone or switch browsers.</p>' +
      '<div class="stack"><button type="button" class="btn primary" data-act="export">Download JSON</button>' +
      '<button type="button" class="btn ghost" data-act="copy-json">Copy JSON</button>' +
      '<label class="btn ghost file">Import JSON<input id="importFile" type="file" accept="application/json,.json"></label></div>' +
      '<label class="field">Or paste a backup<textarea id="pasteJson" class="paste" spellcheck="false" placeholder="Paste JSON here"></textarea></label>' +
      '<button type="button" class="btn ghost" data-act="import-paste">Import pasted JSON</button></section>' +
      '<section class="block"><h2>On your home screen</h2>' +
      "<p>On iPhone, open this page in Safari, tap Share, then Add to Home Screen. Reef then opens full screen, with the notch left clear, and keeps working offline after that first visit.</p></section>" +
      '<section class="block"><h2>This phone</h2><p class="quiet">Nothing is uploaded. There is no account.</p>' +
      '<button type="button" class="btn danger" data-act="clear-data">Erase plan and log</button></section>';
  }

  function settingField(id, label, value) {
    return '<label class="field">' + esc(label) +
      '<input id="' + id + '" value="' + esc(value) + '" maxlength="80" autocomplete="name"></label>';
  }

  function themeBtn(id, label) {
    var on = state.settings.theme === id;
    return '<button type="button" data-act="theme" data-theme-choice="' + id + '" aria-pressed="' + on + '"' +
      (on ? ' class="on"' : "") + ">" + label + "</button>";
  }

  function draftFromSession(s) {
    return {
      id: s.id,
      date: s.date,
      sport: s.sport,
      title: s.title || "",
      minutesText: L.durationField(s.minutes),
      distanceText: L.distanceField(s.metres, s.sport),
      zone: s.zone || "",
      detail: s.detail || "",
      status: s.status,
      actualMinutesText: s.actualMinutes == null ? "" : L.durationField(s.actualMinutes),
      actualDistanceText: s.actualMetres == null ? "" : L.distanceField(s.actualMetres, s.sport),
      rpe: s.rpe,
      feel: s.feel || "",
      knee: s.knee,
      extra: !!s.extra,
      showLog: false
    };
  }

  function blankDraft(date, extra) {
    var sport = L.isSaturday(date) ? "rest" : "run";
    var d = draftFromSession(L.makeSession({
      date: date,
      sport: sport,
      title: sport === "rest" ? "Sabbath" : "",
      status: extra ? "done" : null,
      extra: !!extra
    }));
    d.id = null;
    d.showLog = !!extra;
    return d;
  }

  function readDraft() {
    var d = Object.assign({}, ui.sheet.draft);
    function pull(id, key) {
      var el = document.getElementById(id);
      if (el) d[key] = el.value;
    }
    pull("title", "title");
    pull("date", "date");
    pull("minutes", "minutesText");
    pull("distance", "distanceText");
    pull("zone", "zone");
    pull("detail", "detail");
    pull("actualMinutes", "actualMinutesText");
    pull("actualDistance", "actualDistanceText");
    pull("feel", "feel");
    if (!d.zone) d.zone = "";
    return d;
  }

  function sheetHead(title) {
    return '<div class="grab"></div><h2 id="sheetTitle">' + esc(title) + "</h2>" +
      (ui.sheet.error ? '<p class="error" role="alert">' + esc(ui.sheet.error) + "</p>" : "");
  }

  function sportPicker(current) {
    return '<div class="sports" role="group" aria-label="Sport">' + L.SPORT_ORDER.map(function (id) {
      var on = id === current;
      return '<button type="button" class="chip ' + id + (on ? " on" : "") + '" data-act="pick-sport" data-sport="' +
        id + '" aria-pressed="' + on + '">' + esc(L.SPORTS[id].label) + "</button>";
    }).join("") + "</div>";
  }

  function zoneField(d) {
    var list = L.zoneChoices(d.sport);
    if (!list.length) return "";
    var options = '<option value="">No zone</option>' + list.map(function (z) {
      var row = L.findZone(d.sport, z.id, state.settings);
      var label = z.short + (row && row.name ? " " + row.name : "");
      return '<option value="' + z.id + '"' + (d.zone === z.id ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("");
    return '<label class="field">Zone<select id="zone">' + options + '</select></label><p class="hint" id="zonePreview">' +
      esc(rangePlain(d.sport, d.zone)) + "</p>";
  }

  function statusControl(current) {
    return '<div class="seg" role="group" aria-label="Result">' + ["done", "partial", "skipped"].map(function (s) {
      var on = current === s;
      return '<button type="button" data-act="pick-status" data-status="' + s + '" aria-pressed="' + on + '"' +
        (on ? ' class="on"' : "") + ">" + statusWord(s) + "</button>";
    }).join("") + "</div>";
  }

  function scale(act, min, max, current, cols) {
    var html = '<div class="scale" style="grid-template-columns:repeat(' + cols + ',1fr)">';
    for (var n = min; n <= max; n++) {
      var on = current === n;
      html += '<button type="button" data-act="' + act + '" data-n="' + n + '" aria-pressed="' + on + '"' +
        (on ? ' class="on"' : "") + ">" + n + "</button>";
    }
    return html + "</div>";
  }

  function logFields(d) {
    var sport = d.sport;
    var html = "<h3>Result</h3>" + statusControl(d.status);
    if (sport !== "rest") {
      html += '<label class="field">Actual duration<input id="actualMinutes" inputmode="decimal" autocomplete="off" placeholder="45 or 1:30" value="' +
        esc(d.actualMinutesText || "") + '"></label>';
    }
    if (L.SPORTS[sport].unit) {
      html += '<label class="field">Actual distance (' + (sport === "swim" ? "metres" : "km") +
        ')<input id="actualDistance" inputmode="decimal" autocomplete="off" value="' + esc(d.actualDistanceText || "") + '"></label>';
    }
    if (sport !== "rest") {
      html += '<p class="field">How hard <span class="hint">' + esc(d.rpe ? L.rpeWord(d.rpe) : "Not set. 1 is very easy, 10 is max.") + "</span></p>";
      html += scale("pick-rpe", 1, 10, d.rpe, 5);
      html += '<p class="field">Knee pain <span class="hint">' + esc(d.knee == null ? kneeHint(sport) : (d.knee + " · " + L.kneeWord(d.knee))) + "</span></p>";
      html += scale("pick-knee", 0, 10, d.knee, 6);
      if (d.knee != null && d.knee >= 4) {
        html += '<p class="knee-hint">Sharp pain, swelling, or the knee giving way needs a physio.</p>';
      }
    }
    html += '<label class="field">How it felt<textarea id="feel" maxlength="2000">' + esc(d.feel || "") + "</textarea></label>";
    return html;
  }

  function kneeHint(sport) {
    if (sport === "run") return "Often shows up around 7 km. 0 is none, 10 means stop.";
    if (sport === "brick") return "Score it if the run got to about 7 km. 0 is none.";
    return "0 is none, 10 means stop.";
  }

  function editHtml(d) {
    var title = d.showLog ? "Log an extra session" : (d.id ? "Edit session" : "New session");
    var html = sheetHead(title) + sportPicker(d.sport) +
      '<label class="field">Title<input id="title" maxlength="80" autocomplete="off" value="' + esc(d.title) + '"' +
      (d.showLog ? "" : ' data-autofocus') + "></label>" +
      '<label class="field">Date<input id="date" type="date" value="' + esc(d.date) + '"></label>';
    if (d.sport !== "rest") {
      html += '<label class="field">Duration<input id="minutes" inputmode="decimal" autocomplete="off" placeholder="45 or 1:30" value="' +
        esc(d.minutesText || "") + '"></label><p class="hint">Minutes, or hours:minutes.</p>';
    }
    if (L.SPORTS[d.sport].unit) {
      html += '<label class="field">Distance (' + (d.sport === "swim" ? "metres" : "km") +
        ')<input id="distance" inputmode="decimal" autocomplete="off" value="' + esc(d.distanceText || "") + '"></label>';
    }
    html += zoneField(d);
    html += '<label class="field">Notes and intervals<textarea id="detail" maxlength="2000">' + esc(d.detail || "") + "</textarea></label>";
    if (d.showLog) html += logFields(d);
    html += '<div class="actions"><button type="button" class="btn primary" data-act="save-edit">Save</button>' +
      '<button type="button" class="btn ghost" data-act="close-sheet">Cancel</button>';
    if (d.id) html += '<button type="button" class="btn danger" data-act="del" data-id="' + esc(d.id) + '">Delete</button>';
    return html + "</div>";
  }

  function logHtml(d) {
    var s = find(d.id);
    var html = sheetHead("Log " + (s ? s.title : "session"));
    if (s) {
      html += '<p class="meta">' + esc(L.formatLong(s.date)) + " · " + esc(L.SPORTS[s.sport].label) +
        (s.minutes ? " · " + esc(L.formatMinutes(s.minutes)) + " planned" : "") + "</p>";
    }
    html += logFields(d);
    html += '<div class="actions"><button type="button" class="btn primary" data-act="save-log">Save log</button>' +
      '<button type="button" class="btn ghost" data-act="clear-log">Clear log</button>' +
      '<button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div>';
    return html;
  }

  function detailHtml(s) {
    var html = sheetHead(s.title || L.SPORTS[s.sport].label);
    html += '<p><span class="chip ' + s.sport + '">' + esc(L.SPORTS[s.sport].label) + "</span></p>";
    html += "<p>" + esc(L.formatLong(s.date)) + (L.isSaturday(s.date) ? " · Sabbath" : "") + "</p>";
    var meta = [];
    if (s.minutes) meta.push(L.formatMinutes(s.minutes));
    if (s.metres) meta.push(L.formatDistance(s.metres, s.sport));
    if (meta.length) html += "<p>" + esc(meta.join(" · ")) + "</p>";
    html += rangeHtml(s);
    if (s.detail) html += '<p class="detail">' + esc(s.detail) + "</p>";
    if (s.status) html += '<p class="status ' + s.status + '">' + statusWord(s.status) + "</p>";
    if (s.feel) html += '<p class="feel">' + esc(s.feel) + "</p>";
    if (s.knee != null) html += "<p>Knee " + s.knee + "/10 · " + esc(L.kneeWord(s.knee)) + "</p>";
    html += '<div class="actions"><button type="button" class="btn primary" data-act="log" data-id="' + esc(s.id) + '">Log result</button>' +
      '<button type="button" class="btn ghost" data-act="edit" data-id="' + esc(s.id) + '">Edit</button>' +
      '<button type="button" class="btn ghost" data-act="dup" data-id="' + esc(s.id) + '">Duplicate</button>' +
      '<button type="button" class="btn danger" data-act="del" data-id="' + esc(s.id) + '">Delete</button>' +
      '<button type="button" class="btn ghost" data-act="close-sheet">Close</button></div>';
    return html;
  }

  function confirmHtml() {
    return sheetHead(ui.sheet.title) + "<p>" + esc(ui.sheet.body) + "</p>" +
      '<div class="actions"><button type="button" class="btn ' + (ui.sheet.danger ? "danger" : "primary") + '" data-act="confirm-yes">' +
      esc(ui.sheet.confirm) + '</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div>';
  }

  function sheetInner() {
    if (!ui.sheet) return "";
    if (ui.sheet.type === "confirm") return confirmHtml();
    if (ui.sheet.type === "detail") return detailHtml(find(ui.sheet.id) || ui.sheet.fallback);
    if (ui.sheet.type === "log") return logHtml(ui.sheet.draft);
    return editHtml(ui.sheet.draft);
  }

  function paintSheet() {
    var root = document.getElementById("sheet");
    var panel = root.querySelector(".panel");
    var scroll = panel ? panel.scrollTop : 0;
    if (!ui.sheet) {
      root.hidden = true;
      root.innerHTML = "";
      document.body.classList.remove("sheet-open");
      return;
    }
    root.hidden = false;
    document.body.classList.add("sheet-open");
    root.innerHTML = '<div class="backdrop" data-act="close-sheet"></div><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">' +
      sheetInner() + "</div>";
    var next = root.querySelector(".panel");
    if (ui.sheet.autofocus) {
      var focus = next.querySelector("[data-autofocus]") || next.querySelector("input, textarea, select, button");
      if (focus) focus.focus();
      ui.sheet.autofocus = false;
    } else if (ui.sheet.focusId) {
      var el = document.getElementById(ui.sheet.focusId);
      if (el) el.focus();
      ui.sheet.focusId = "";
      if (next) next.scrollTop = scroll;
    } else if (next) {
      next.scrollTop = scroll;
    }
  }

  function openSheet(sheet) {
    ui.sheet = sheet;
    paintSheet();
  }

  function closeSheet() {
    ui.sheet = null;
    paintSheet();
  }

  function failSheet(msg, focusId) {
    ui.sheet.error = msg;
    ui.sheet.focusId = focusId || "";
    ui.sheet.autofocus = false;
    paintSheet();
  }

  function showWeek(monday) {
    ui.week = monday;
    closeSheet();
    if (location.hash !== "#week") location.hash = "week";
    else {
      ui.tab = "week";
      render();
    }
  }

  function snapshot(s) { return JSON.parse(JSON.stringify(s)); }

  function quickStatus(id, status) {
    var s = find(id);
    if (!s) return;
    var prev = snapshot(s);
    s.status = status;
    if (status === "done") {
      if (s.actualMinutes == null && s.minutes) s.actualMinutes = s.minutes;
      if (s.actualMetres == null && s.metres) s.actualMetres = s.metres;
    }
    save();
    render({ keepScroll: true });
    toast(status === "done" ? "Marked done" : "Marked skipped", function () {
      var current = find(id);
      if (!current) return;
      Object.keys(prev).forEach(function (k) { current[k] = prev[k]; });
      save();
    });
  }

  function parseLog(d, sport) {
    if (!d.status) return { error: "Choose done, partial, or skipped." };
    var actualMinutes = null;
    var actualMetres = null;
    if (sport !== "rest" && String(d.actualMinutesText || "").trim()) {
      actualMinutes = L.parseDuration(d.actualMinutesText);
      if (actualMinutes == null) return { error: "Actual duration should look like 45 or 1:30.", focus: "actualMinutes" };
    }
    if (L.SPORTS[sport].unit && String(d.actualDistanceText || "").trim()) {
      actualMetres = L.parseDistance(d.actualDistanceText, sport);
      if (actualMetres == null) return { error: "Actual distance should be a number.", focus: "actualDistance" };
    }
    return {
      log: {
        status: d.status,
        actualMinutes: sport === "rest" ? null : actualMinutes,
        actualMetres: sport === "rest" ? null : actualMetres,
        rpe: sport === "rest" ? null : d.rpe,
        feel: String(d.feel || "").slice(0, 2000),
        knee: sport === "rest" ? null : d.knee
      }
    };
  }

  function saveEdit() {
    if (!ui.sheet) return;
    var d = readDraft();
    ui.sheet.draft = d;
    var sport = d.sport;
    var minutes = 0;
    if (sport !== "rest") {
      minutes = L.parseDuration(d.minutesText);
      if (minutes == null || minutes <= 0) {
        failSheet("Add a duration, like 45 or 1:30.", "minutes");
        return;
      }
    }
    var metres = null;
    if (L.SPORTS[sport].unit && String(d.distanceText || "").trim()) {
      metres = L.parseDistance(d.distanceText, sport);
      if (metres == null) {
        failSheet("Distance should be a number.", "distance");
        return;
      }
    }
    if (!L.isRealDate(d.date)) {
      failSheet("Pick a date.", "date");
      return;
    }
    var zone = d.zone && L.ZONE_IDS[sport].indexOf(d.zone) !== -1 ? d.zone : null;
    var title = String(d.title || "").trim();
    if (!title) {
      title = sport === "rest"
        ? (L.isSaturday(d.date) ? "Sabbath" : "Rest")
        : (L.SPORTS[sport].label + (zone ? " " + zoneTag(zone) : ""));
    }
    var prev = d.id ? find(d.id) : null;
    var carried = {
      status: prev ? prev.status : null,
      actualMinutes: prev ? prev.actualMinutes : null,
      actualMetres: prev ? prev.actualMetres : null,
      rpe: prev ? prev.rpe : null,
      feel: prev ? prev.feel : "",
      knee: prev ? prev.knee : null,
      extra: prev ? prev.extra : false
    };
    if (d.showLog) {
      var parsed = parseLog(d, sport);
      if (parsed.error) {
        failSheet(parsed.error, parsed.focus);
        return;
      }
      carried = parsed.log;
      carried.extra = true;
    }
    var session = L.makeSession({
      id: (prev && prev.id) || L.newId(),
      date: d.date,
      sport: sport,
      title: title,
      minutes: minutes,
      metres: metres,
      zone: zone,
      detail: d.detail,
      status: carried.status,
      actualMinutes: carried.actualMinutes,
      actualMetres: carried.actualMetres,
      rpe: carried.rpe,
      feel: carried.feel,
      knee: carried.knee,
      extra: carried.extra
    });
    upsert(session);
    save();
    closeSheet();
    render({ keepScroll: true });
    toast(prev ? "Saved" : (d.showLog ? "Extra session logged" : "Added"));
  }

  function saveLog() {
    if (!ui.sheet) return;
    var d = readDraft();
    ui.sheet.draft = d;
    var prev = find(d.id);
    if (!prev) { closeSheet(); return; }
    var parsed = parseLog(d, prev.sport);
    if (parsed.error) {
      failSheet(parsed.error, parsed.focus);
      return;
    }
    upsert(L.makeSession(Object.assign({}, prev, parsed.log)));
    save();
    closeSheet();
    render({ keepScroll: true });
    toast("Logged");
  }

  function clearLog() {
    var d = ui.sheet && ui.sheet.draft;
    var prev = d && find(d.id);
    if (!prev) { closeSheet(); return; }
    upsert(L.makeSession(Object.assign({}, prev, {
      status: null, actualMinutes: null, actualMetres: null, rpe: null, feel: "", knee: null
    })));
    save();
    closeSheet();
    render({ keepScroll: true });
    toast("Log cleared");
  }

  function pickSport(sport) {
    var d = readDraft();
    var old = d.sport;
    if (String(d.distanceText || "").trim() && L.SPORTS[old].unit && L.SPORTS[sport].unit) {
      var metres = L.parseDistance(d.distanceText, old);
      if (metres != null) d.distanceText = L.distanceField(metres, sport);
    } else if (!L.SPORTS[sport].unit) d.distanceText = "";
    if (String(d.actualDistanceText || "").trim() && L.SPORTS[old].unit && L.SPORTS[sport].unit) {
      var actual = L.parseDistance(d.actualDistanceText, old);
      if (actual != null) d.actualDistanceText = L.distanceField(actual, sport);
    } else if (!L.SPORTS[sport].unit) d.actualDistanceText = "";
    if (d.zone && L.ZONE_IDS[sport].indexOf(d.zone) === -1) d.zone = "";
    var restTitle = d.title === "Sabbath" || d.title === "Rest";
    d.sport = sport;
    if (sport === "rest") {
      if (!String(d.title || "").trim() || restTitle) d.title = L.isSaturday(d.date) ? "Sabbath" : "Rest";
    } else if (old === "rest" && restTitle) d.title = "";
    d.error = "";
    ui.sheet.draft = d;
    ui.sheet.error = "";
    ui.sheet.autofocus = false;
    paintSheet();
  }

  function applyTemplate() {
    var monday = ui.tab === "week" ? ui.week : L.mondayOf(L.todayIso());
    var existing = L.sessionsInWeek(state.sessions, monday);
    function go() {
      state.sessions = L.withoutWeek(state.sessions, monday).concat(L.templateWeek(monday));
      save();
      showWeek(monday);
      toast("Build week loaded");
    }
    if (!existing.length) { go(); return; }
    openSheet({
      type: "confirm",
      title: "Replace this week?",
      body: "This week already has " + existing.length + " sessions. Replacing removes them, including any logs. Export a backup first if you need them.",
      confirm: "Replace this week",
      danger: true,
      onYes: go
    });
  }

  function copyWeek() {
    var from = ui.tab === "week" ? ui.week : L.mondayOf(L.todayIso());
    var copies = L.copyWeek(state.sessions, from);
    if (!copies.length) { toast("This week has nothing to copy"); return; }
    var to = L.addDays(from, 7);
    var existing = L.sessionsInWeek(state.sessions, to);
    function go() {
      state.sessions = L.withoutWeek(state.sessions, to).concat(copies);
      save();
      showWeek(to);
      toast("Copied to " + L.formatWeekRange(to));
    }
    if (!existing.length) { go(); return; }
    openSheet({
      type: "confirm",
      title: "Replace next week?",
      body: "Next week already has " + existing.length + " sessions. Replacing removes them, including any logs.",
      confirm: "Replace next week",
      danger: true,
      onYes: go
    });
  }

  function exportPayload() {
    return {
      app: "reef",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      sessions: state.sessions
    };
  }

  function downloadBackup() {
    var text = JSON.stringify(exportPayload(), null, 2);
    var blob = new Blob([text], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reef-backup-" + L.todayIso() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast("Backup downloading");
  }

  function copyJson() {
    var text = JSON.stringify(exportPayload(), null, 2);
    var area = document.getElementById("pasteJson");
    if (area) area.value = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Backup copied");
      }, function () {
        toast("Backup is in the box below. Select it and copy.");
      });
    } else toast("Backup is in the box below. Select it and copy.");
  }

  function requestImport(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { toast("That isn't JSON."); return; }
    if (!parsed || !Array.isArray(parsed.sessions)) { toast("That file has no sessions list."); return; }
    ui.pendingImport = parsed;
    if (!state.sessions.length) { finishImport(); return; }
    openSheet({
      type: "confirm",
      title: "Replace everything on this phone?",
      body: "Importing a backup replaces the plan and the log stored here.",
      confirm: "Replace",
      danger: true,
      onYes: finishImport
    });
  }

  function finishImport() {
    var parsed = ui.pendingImport;
    if (!parsed) return;
    var next = normalise(parsed);
    state.settings = next.settings;
    state.sessions = next.sessions;
    ui.pendingImport = null;
    save();
    applyTheme();
    closeSheet();
    render();
    toast("Backup imported");
  }

  function commitAnchor(id, raw) {
    raw = String(raw == null ? "" : raw).trim();
    if (id === "ftp") {
      if (!raw) { state.settings.ftp = null; return ""; }
      var n = Number(raw);
      if (!isFinite(n) || n < 50 || n > 600) return "Use a number from 50 to 600.";
      state.settings.ftp = Math.round(n);
      return "";
    }
    if (id === "runPace" || id === "css") {
      var key = id === "runPace" ? "runPace" : "css";
      if (!raw) { state.settings[key] = null; return ""; }
      var sec = L.parsePace(raw);
      var min = id === "runPace" ? 120 : 45;
      var max = id === "runPace" ? 900 : 240;
      if (sec == null || sec < min || sec > max) {
        return id === "runPace" ? "Use min/km, like 4:30." : "Use min per 100 m, like 1:45.";
      }
      state.settings[key] = sec;
      return "";
    }
    if (id === "lthr" || id === "maxHr") {
      if (!raw) { state.settings[id] = null; return ""; }
      var hr = Number(raw);
      if (!isFinite(hr) || hr < 40 || hr > 230) return "Use a heart rate from 40 to 230.";
      state.settings[id] = Math.round(hr);
      return "";
    }
    return "";
  }

  function commitSetting(id, raw) {
    if (id === "athlete") state.settings.athlete = String(raw || "").trim().slice(0, 40) || "Joseph";
    if (id === "goal") state.settings.goal = String(raw || "").trim().slice(0, 80) || "Sub-7";
    if (id === "race") state.settings.race = String(raw || "").trim().slice(0, 80) || "IRONMAN 70.3 Cairns";
    if (id === "raceDate" && L.isRealDate(raw)) state.settings.raceDate = raw;
    save();
    paintHeader();
    var el = document.getElementById(id);
    if (el && id !== "raceDate") el.value = state.settings[id];
    if (el && id === "raceDate") el.value = state.settings.raceDate;
  }

  function onAct(act, el) {
    var id = el.getAttribute("data-id");
    if (act === "theme-cycle") {
      var order = ["auto", "light", "dark"];
      var i = order.indexOf(state.settings.theme);
      state.settings.theme = order[(i + 1) % order.length];
      save();
      applyTheme();
      return;
    }
    if (act === "theme") {
      state.settings.theme = el.getAttribute("data-theme-choice");
      save();
      applyTheme();
      return;
    }
    if (act === "week-prev") { ui.week = L.addDays(ui.week, -7); render(); return; }
    if (act === "week-next") { ui.week = L.addDays(ui.week, 7); render(); return; }
    if (act === "week-current" || act === "jump-week") { showWeek(L.mondayOf(L.todayIso())); return; }
    if (act === "add") {
      openSheet({ type: "edit", draft: blankDraft(el.getAttribute("data-date") || L.todayIso(), false), error: "", autofocus: true });
      return;
    }
    if (act === "extra") {
      openSheet({ type: "edit", draft: blankDraft(L.todayIso(), true), error: "", autofocus: true });
      return;
    }
    if (act === "open") {
      var opened = find(id);
      if (opened) openSheet({ type: "detail", id: id, fallback: opened });
      return;
    }
    if (act === "done") { quickStatus(id, "done"); return; }
    if (act === "skip") { quickStatus(id, "skipped"); return; }
    if (act === "log") {
      var logged = find(id);
      if (!logged) return;
      var draft = draftFromSession(logged);
      draft.showLog = true;
      if (!draft.actualMinutesText && logged.minutes) draft.actualMinutesText = L.durationField(logged.minutes);
      if (!draft.actualDistanceText && logged.metres) draft.actualDistanceText = L.distanceField(logged.metres, logged.sport);
      openSheet({ type: "log", draft: draft, error: "", autofocus: true });
      return;
    }
    if (act === "edit") {
      var editing = find(id);
      if (editing) openSheet({ type: "edit", draft: draftFromSession(editing), error: "", autofocus: true });
      return;
    }
    if (act === "dup") {
      var src = find(id);
      if (!src) return;
      var copy = draftFromSession(src);
      copy.id = null;
      copy.status = null;
      copy.actualMinutesText = "";
      copy.actualDistanceText = "";
      copy.rpe = null;
      copy.feel = "";
      copy.knee = null;
      copy.extra = false;
      copy.showLog = false;
      openSheet({ type: "edit", draft: copy, error: "", autofocus: true });
      return;
    }
    if (act === "del") {
      var victim = find(id);
      if (!victim) return;
      openSheet({
        type: "confirm",
        title: "Delete this session?",
        body: victim.title + " on " + L.formatLong(victim.date) + " will be removed, including its log.",
        confirm: "Delete",
        danger: true,
        onYes: function () {
          state.sessions = state.sessions.filter(function (s) { return s.id !== id; });
          save();
          closeSheet();
          render({ keepScroll: true });
          toast("Deleted");
        }
      });
      return;
    }
    if (act === "template") { applyTemplate(); return; }
    if (act === "copy-week") { copyWeek(); return; }
    if (act === "close-sheet") { closeSheet(); return; }
    if (act === "save-edit") { saveEdit(); return; }
    if (act === "save-log") { saveLog(); return; }
    if (act === "clear-log") { clearLog(); return; }
    if (act === "confirm-yes") {
      var fn = ui.sheet && ui.sheet.onYes;
      if (fn) fn();
      return;
    }
    if (act === "pick-sport") { pickSport(el.getAttribute("data-sport")); return; }
    if (act === "pick-status") {
      var d = readDraft();
      d.status = el.getAttribute("data-status");
      ui.sheet.draft = d;
      ui.sheet.error = "";
      paintSheet();
      return;
    }
    if (act === "pick-rpe" || act === "pick-knee") {
      var draft = readDraft();
      var n = Number(el.getAttribute("data-n"));
      var key = act === "pick-rpe" ? "rpe" : "knee";
      draft[key] = draft[key] === n ? null : n;
      ui.sheet.draft = draft;
      ui.sheet.error = "";
      paintSheet();
      return;
    }
    if (act === "export") { downloadBackup(); return; }
    if (act === "copy-json") { copyJson(); return; }
    if (act === "import-paste") {
      var area = document.getElementById("pasteJson");
      requestImport(area ? area.value : "");
      return;
    }
    if (act === "clear-data") {
      openSheet({
        type: "confirm",
        title: "Erase the plan and the log?",
        body: "This removes every session and puts the settings back to the defaults. Export a backup first if you want to keep them.",
        confirm: "Erase",
        danger: true,
        onYes: function () {
          state = fresh();
          save();
          closeSheet();
          applyTheme();
          if (location.hash !== "#today") location.hash = "today";
          else render();
          toast("Erased");
        }
      });
      return;
    }
    if (act === "undo" && ui.toast && ui.toast.undo) {
      ui.toast.undo();
      ui.toast = null;
      clearTimeout(ui.toastTimer);
      paintToast();
      render({ keepScroll: true });
    }
  }

  document.addEventListener("click", function (e) {
    var actEl = e.target.closest("[data-act]");
    if (actEl) {
      onAct(actEl.getAttribute("data-act"), actEl);
      return;
    }
    var tabEl = e.target.closest("[data-tab]");
    if (tabEl) {
      var tab = tabEl.getAttribute("data-tab");
      closeSheet();
      if (location.hash !== "#" + tab) location.hash = tab;
      else if (ui.tab !== tab) { ui.tab = tab; render(); }
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ui.sheet) { closeSheet(); return; }
    var card = e.target.closest && e.target.closest(".card-main");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onAct("open", card);
      return;
    }
    if (e.key === "Enter" && ui.sheet && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "BUTTON") {
      if (ui.sheet.type === "edit") { e.preventDefault(); saveEdit(); }
      if (ui.sheet.type === "log") { e.preventDefault(); saveLog(); }
    }
  });

  document.addEventListener("change", function (e) {
    var id = e.target.id;
    if (["ftp", "runPace", "css", "lthr", "maxHr"].indexOf(id) !== -1) {
      var msg = commitAnchor(id, e.target.value);
      var err = document.getElementById(id + "Err");
      if (err) err.textContent = msg;
      if (!msg) {
        save();
        paintZoneTables();
      }
      return;
    }
    if (["athlete", "goal", "race", "raceDate"].indexOf(id) !== -1) {
      commitSetting(id, e.target.value);
      return;
    }
    if (id === "zone" && ui.sheet) {
      ui.sheet.draft = readDraft();
      var preview = document.getElementById("zonePreview");
      if (preview) preview.textContent = rangePlain(ui.sheet.draft.sport, ui.sheet.draft.zone);
      return;
    }
    if (id === "importFile" && e.target.files && e.target.files[0]) {
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function () { requestImport(String(reader.result || "")); };
      reader.readAsText(file);
      e.target.value = "";
    }
  });

  window.addEventListener("hashchange", function () {
    ui.tab = tabFromHash();
    render();
  });

  window.addEventListener("online", paintNet);
  window.addEventListener("offline", paintNet);
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY || ui.sheet) return;
    state = load();
    render({ keepScroll: true });
  });

  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  if (darkQuery.addEventListener) {
    darkQuery.addEventListener("change", function () {
      if (state.settings.theme === "auto") applyTheme();
    });
  }

  var swipe = null;
  document.getElementById("view").addEventListener("touchstart", function (e) {
    if (ui.tab !== "week" || ui.sheet) return;
    var t = e.changedTouches[0];
    swipe = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.getElementById("view").addEventListener("touchend", function (e) {
    if (!swipe || ui.tab !== "week") return;
    var t = e.changedTouches[0];
    var dx = t.clientX - swipe.x;
    var dy = t.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    ui.week = L.addDays(ui.week, dx < 0 ? 7 : -7);
    render();
  }, { passive: true });

  ui.tab = tabFromHash();
  if (!location.hash) history.replaceState(null, "", "#today");
  applyTheme();
  render();
  paintNet();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).catch(function () {});
  }
})();
