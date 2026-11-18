/* Reef training math. No DOM. Dates are calendar days in Australia/Sydney. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReefLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var TZ = "Australia/Sydney";
  var KNEE_METRES = 7000;
  var RACE_DATE = "2027-06-13";
  var SPORT_ORDER = ["swim", "bike", "brick", "run", "strength", "rest"];
  var SPORTS = {
    swim: { label: "Swim", unit: "m" },
    bike: { label: "Bike", unit: "km" },
    run: { label: "Run", unit: "km" },
    strength: { label: "Strength", unit: null },
    brick: { label: "Brick", unit: "km" },
    rest: { label: "Rest", unit: null }
  };
  var ZONE_IDS = {
    bike: ["z1", "z2", "z3", "z4", "z5", "z6", "z7"],
    run: ["z1", "z2", "z3", "z4", "z5a", "z5b", "z5c"],
    swim: ["z1", "z2", "z3", "z4", "z5", "z6"],
    brick: ["z1", "z2", "z3", "z4"],
    strength: [],
    rest: []
  };
  var RPE_WORDS = ["", "Very easy", "Easy", "Comfortable", "Steady", "Moderate", "Hard", "Very hard", "Very, very hard", "Near max", "Max"];

  function pad(n) { return String(n).padStart(2, "0"); }

  function isRealDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return false;
    var p = iso.split("-").map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return dt.getUTCFullYear() === p[0] && dt.getUTCMonth() === p[1] - 1 && dt.getUTCDate() === p[2];
  }

  function dateFromIso(iso) {
    var p = String(iso).split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0));
  }

  function isoFromUtc(dt) {
    return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
  }

  function addDays(iso, n) {
    var dt = dateFromIso(iso);
    dt.setUTCDate(dt.getUTCDate() + n);
    return isoFromUtc(dt);
  }

  function todayIso(now) {
    var fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    });
    return fmt.format(now || new Date());
  }

  function sydneyHour(now) {
    var fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ, hour: "numeric", hourCycle: "h23"
    });
    return Number(fmt.format(now || new Date()));
  }

  function weekdaySun0(iso) {
    return dateFromIso(iso).getUTCDay();
  }

  function isSaturday(iso) { return weekdaySun0(iso) === 6; }
  function isSunday(iso) { return weekdaySun0(iso) === 0; }

  function mondayOf(iso) {
    var day = weekdaySun0(iso);
    var delta = day === 0 ? -6 : 1 - day;
    return addDays(iso, delta);
  }

  function daysBetween(a, b) {
    return Math.round((dateFromIso(b) - dateFromIso(a)) / 86400000);
  }

  function formatDay(iso, opts) {
    return new Intl.DateTimeFormat("en-AU", Object.assign({
      timeZone: "UTC", weekday: "short", day: "numeric", month: "short"
    }, opts || {})).format(dateFromIso(iso));
  }

  function formatLong(iso) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", weekday: "long", day: "numeric", month: "long"
    }).format(dateFromIso(iso));
  }

  function formatShort(iso) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", weekday: "short", day: "numeric"
    }).format(dateFromIso(iso));
  }

  function formatWeekday(iso) {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", weekday: "short"
    }).format(dateFromIso(iso));
  }

  function formatWeekRange(monday) {
    var end = addDays(monday, 6);
    var a = dateFromIso(monday);
    var b = dateFromIso(end);
    var sameMonth = a.getUTCMonth() === b.getUTCMonth();
    var left = new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", day: "numeric", month: sameMonth ? undefined : "short"
    }).format(a);
    var right = new Intl.DateTimeFormat("en-AU", {
      timeZone: "UTC", day: "numeric", month: "short"
    }).format(b);
    var year = b.getUTCFullYear();
    var thisYear = dateFromIso(todayIso()).getUTCFullYear();
    return left + " – " + right + (year !== thisYear ? " " + year : "");
  }

  function formatMinutes(min) {
    min = Math.round(Number(min) || 0);
    if (min <= 0) return "0m";
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (!h) return m + "m";
    if (!m) return h + "h";
    return h + "h " + m + "m";
  }

  function durationField(min) {
    if (min == null || min === "" || Number(min) <= 0) return "";
    min = Math.round(Number(min));
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h && m) return h + ":" + pad(m);
    if (h) return h + ":00";
    return String(m);
  }

  function parseDuration(raw) {
    if (raw == null) return null;
    var t = String(raw).trim().toLowerCase();
    if (!t) return null;
    var hm = t.match(/^(\d+)\s*h(?:\s*(\d+)\s*m?)?$/);
    if (hm) return Number(hm[1]) * 60 + Number(hm[2] || 0);
    var clock = t.match(/^(\d+):(\d{1,2})$/);
    if (clock) {
      if (Number(clock[2]) > 59) return null;
      return Number(clock[1]) * 60 + Number(clock[2]);
    }
    var mins = t.match(/^(\d+)\s*m$/);
    if (mins) return Number(mins[1]);
    if (/^\d+$/.test(t)) return Number(t);
    return null;
  }

  function formatPace(seconds) {
    if (seconds == null || !isFinite(seconds)) return "";
    var s = Math.round(seconds);
    var neg = s < 0;
    s = Math.abs(s);
    return (neg ? "−" : "") + Math.floor(s / 60) + ":" + pad(s % 60);
  }

  function parsePace(raw) {
    if (raw == null) return null;
    var t = String(raw).trim();
    if (!t) return null;
    var m = t.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) {
      if (Number(m[2]) > 59) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    }
    var dot = t.match(/^(\d+)\.(\d{2})$/);
    if (dot) return Number(dot[1]) * 60 + Number(dot[2]);
    return null;
  }

  function formatDistance(metres, sport) {
    if (metres == null || metres === "") return "";
    metres = Number(metres);
    if (!isFinite(metres)) return "";
    if (sport === "swim") return Math.round(metres).toLocaleString("en-AU") + " m";
    var km = metres / 1000;
    var text = km >= 10 ? String(Math.round(km)) : String(Math.round(km * 10) / 10);
    return text + " km";
  }

  function distanceField(metres, sport) {
    if (metres == null || metres === "") return "";
    if (sport === "swim") return String(Math.round(Number(metres)));
    var km = Number(metres) / 1000;
    return String(Math.round(km * 10) / 10);
  }

  function parseDistance(raw, sport) {
    if (raw == null) return null;
    var t = String(raw).trim().toLowerCase().replace(/,/g, "");
    if (!t) return null;
    var km = t.indexOf("km") !== -1;
    var metresWord = !km && /\d\s*m$/.test(t);
    t = t.replace(/km|m/g, "").trim();
    var n = Number(t);
    if (!isFinite(n) || n < 0) return null;
    if (sport === "swim") return Math.round(km ? n * 1000 : n);
    if (metresWord) return Math.round(n);
    return Math.round(n * 1000);
  }

  function roundPct(base, pct) {
    return Math.round(base * pct / 100);
  }

  function paceBand(threshold, lowPct, highPct) {
    if (!threshold) return null;
    var fast = lowPct == null ? null : roundPct(threshold, lowPct);
    var slow = highPct == null ? null : roundPct(threshold, highPct);
    return { fast: fast, slow: slow };
  }

  function formatPaceBand(band, per) {
    if (!band) return "";
    var suffix = per ? " /" + per : "";
    if (band.fast == null && band.slow != null) return "slower than " + formatPace(band.slow) + suffix;
    if (band.slow == null && band.fast != null) return "faster than " + formatPace(band.fast) + suffix;
    if (band.fast == null) return "";
    return formatPace(band.fast) + "–" + formatPace(band.slow) + suffix;
  }

  function powerZones(ftp) {
    ftp = Number(ftp);
    if (!ftp) return [];
    function w(pct) { return roundPct(ftp, pct); }
    return [
      { id: "z1", name: "Active recovery", band: "<55%", range: "under " + w(55) + " W" },
      { id: "z2", name: "Endurance", band: "56–75%", range: w(56) + "–" + w(75) + " W" },
      { id: "z3", name: "Tempo", band: "76–90%", range: w(76) + "–" + w(90) + " W" },
      { id: "z4", name: "Threshold", band: "91–105%", range: w(91) + "–" + w(105) + " W" },
      { id: "z5", name: "VO2", band: "106–120%", range: w(106) + "–" + w(120) + " W" },
      { id: "z6", name: "Anaerobic", band: ">121%", range: "above " + w(121) + " W" },
      { id: "z7", name: "Sprints", band: "maximal", range: "Not a percent of FTP" }
    ];
  }

  function hrFromLthr(lthr) {
    lthr = Number(lthr);
    if (!lthr) return [];
    function b(pct) { return roundPct(lthr, pct); }
    return [
      { id: "z1", name: "Active recovery", band: "<68%", range: "under " + b(68) + " bpm" },
      { id: "z2", name: "Endurance", band: "69–83%", range: b(69) + "–" + b(83) + " bpm" },
      { id: "z3", name: "Tempo", band: "84–94%", range: b(84) + "–" + b(94) + " bpm" },
      { id: "z4", name: "Threshold", band: "95–105%", range: b(95) + "–" + b(105) + " bpm" },
      { id: "z5", name: "VO2", band: ">106%", range: "above " + b(106) + " bpm" }
    ];
  }

  function hrFromMax(maxHr) {
    maxHr = Number(maxHr);
    if (!maxHr) return [];
    function b(pct) { return roundPct(maxHr, pct); }
    return [
      { id: "z1", name: "Very easy", band: "50–60%", range: b(50) + "–" + b(60) + " bpm" },
      { id: "z2", name: "Easy", band: "60–70%", range: b(60) + "–" + b(70) + " bpm" },
      { id: "z3", name: "Steady", band: "70–80%", range: b(70) + "–" + b(80) + " bpm" },
      { id: "z4", name: "Hard", band: "80–90%", range: b(80) + "–" + b(90) + " bpm" },
      { id: "z5", name: "Very hard", band: "90–100%", range: b(90) + "–" + b(100) + " bpm" }
    ];
  }

  function runZones(threshold) {
    threshold = Number(threshold);
    if (!threshold) return [];
    var rows = [
      ["z1", "Recovery", "slower than 129%", null, 129],
      ["z2", "Endurance", "114–129%", 114, 129],
      ["z3", "Tempo", "106–113%", 106, 113],
      ["z4", "Sub-threshold", "99–105%", 99, 105],
      ["z5a", "Above threshold", "97–99%", 97, 99],
      ["z5b", "VO2", "90–96%", 90, 96],
      ["z5c", "Speed", "faster than 90%", 90, null]
    ];
    return rows.map(function (r) {
      var band = paceBand(threshold, r[3], r[4]);
      var range;
      if (r[0] === "z1") range = "slower than " + formatPace(band.slow) + " /km";
      else if (r[0] === "z5c") range = "faster than " + formatPace(band.fast) + " /km";
      else range = formatPace(band.fast) + "–" + formatPace(band.slow) + " /km";
      return { id: r[0], name: r[1], band: r[2], range: range };
    });
  }

  function swimZones(css) {
    css = Number(css);
    if (!css) return [];
    function p(delta) { return css + delta; }
    function span(fastDelta, slowDelta) {
      return formatPace(p(fastDelta)) + "–" + formatPace(p(slowDelta)) + " /100 m";
    }
    return [
      { id: "z1", name: "Recovery", band: "slower than CSS+12", range: "slower than " + formatPace(p(12)) + " /100 m" },
      { id: "z2", name: "Endurance", band: "CSS+6 to +12", range: span(6, 12) },
      { id: "z3", name: "Tempo", band: "CSS+3 to +5", range: span(3, 5) },
      { id: "z4", name: "Threshold", band: "CSS−2 to +2", range: span(-2, 2) },
      { id: "z5", name: "VO2", band: "CSS−6 to −3", range: span(-6, -3) },
      { id: "z6", name: "Speed", band: "faster than CSS−6", range: "faster than " + formatPace(p(-6)) + " /100 m" }
    ];
  }

  function zonesFor(sport, settings) {
    settings = settings || {};
    if (sport === "bike") return powerZones(settings.ftp);
    if (sport === "run") return runZones(settings.runPace);
    if (sport === "swim") return swimZones(settings.css);
    if (sport === "brick") {
      var bike = powerZones(settings.ftp);
      var run = runZones(settings.runPace);
      return ZONE_IDS.brick.map(function (id) {
        var b = bike.filter(function (z) { return z.id === id; })[0];
        var r = run.filter(function (z) { return z.id === id; })[0];
        var bits = [];
        if (b) bits.push(b.range);
        if (r) bits.push(r.range);
        return {
          id: id,
          name: (b && b.name) || (r && r.name) || id,
          band: (b && b.band) || "",
          range: bits.join(" · ")
        };
      });
    }
    return [];
  }

  function findZone(sport, id, settings) {
    if (!id) return null;
    return zonesFor(sport, settings).filter(function (z) { return z.id === id; })[0] || null;
  }

  function zoneChoices(sport) {
    return (ZONE_IDS[sport] || []).map(function (id) {
      var known = {
        z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5",
        z5a: "Z5a", z5b: "Z5b", z5c: "Z5c", z6: "Z6", z7: "Z7"
      };
      return { id: id, short: known[id] || id };
    });
  }

  function bikeHrRange(zoneId, lthr) {
    if (!lthr || !zoneId) return "";
    var row = hrFromLthr(lthr).filter(function (z) { return z.id === zoneId; })[0];
    return row ? row.range : "";
  }

  function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function boundInt(value, min, max) {
    if (value == null || value === "") return null;
    var n = Math.round(Number(value));
    if (!isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  function optPositive(value, max) {
    if (value == null || value === "") return null;
    var n = Math.round(Number(value));
    if (!isFinite(n) || n <= 0) return null;
    return Math.min(max, n);
  }

  function makeSession(fields) {
    fields = fields || {};
    return {
      id: fields.id || newId(),
      date: fields.date,
      sport: SPORTS[fields.sport] ? fields.sport : "run",
      title: fields.title || "",
      minutes: boundInt(fields.minutes, 0, 24 * 60) || 0,
      metres: optPositive(fields.metres, 500000),
      zone: fields.zone || null,
      detail: fields.detail || "",
      status: fields.status === "done" || fields.status === "partial" || fields.status === "skipped" ? fields.status : null,
      actualMinutes: boundInt(fields.actualMinutes, 0, 24 * 60),
      actualMetres: optPositive(fields.actualMetres, 500000),
      rpe: boundInt(fields.rpe, 1, 10),
      feel: fields.feel || "",
      knee: boundInt(fields.knee, 0, 10),
      extra: !!fields.extra
    };
  }

  function defaultSettings() {
    return {
      athlete: "Joseph",
      goal: "Sub-7",
      race: "IRONMAN 70.3 Cairns",
      raceDate: RACE_DATE,
      ftp: 165,
      runPace: null,
      css: null,
      lthr: null,
      maxHr: null,
      theme: "auto"
    };
  }

  function posOrNull(n, min, max) {
    if (n == null || n === "") return null;
    n = Number(n);
    if (!isFinite(n) || n < min || n > max) return null;
    return Math.round(n);
  }

  function sanitiseSettings(s) {
    s = s || {};
    var d = defaultSettings();
    return {
      athlete: String(s.athlete == null ? d.athlete : s.athlete).trim().slice(0, 40) || d.athlete,
      goal: String(s.goal == null ? d.goal : s.goal).trim().slice(0, 80) || d.goal,
      race: String(s.race == null ? d.race : s.race).trim().slice(0, 80) || d.race,
      raceDate: /^\d{4}-\d{2}-\d{2}$/.test(s.raceDate || "") ? s.raceDate : d.raceDate,
      ftp: s.ftp === undefined ? d.ftp : posOrNull(s.ftp, 50, 600),
      runPace: s.runPace === undefined ? null : posOrNull(s.runPace, 120, 900),
      css: s.css === undefined ? null : posOrNull(s.css, 45, 240),
      lthr: s.lthr === undefined ? null : posOrNull(s.lthr, 40, 230),
      maxHr: s.maxHr === undefined ? null : posOrNull(s.maxHr, 40, 230),
      theme: s.theme === "light" || s.theme === "dark" || s.theme === "auto" ? s.theme : "auto"
    };
  }

  function sanitiseSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!isRealDate(raw.date)) return null;
    if (!SPORTS[raw.sport]) return null;
    var zone = raw.zone || null;
    if (zone && ZONE_IDS[raw.sport].indexOf(zone) === -1) zone = null;
    return makeSession({
      id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
      date: raw.date,
      sport: raw.sport,
      title: String(raw.title || "").slice(0, 80),
      minutes: raw.minutes,
      metres: raw.metres,
      zone: zone,
      detail: String(raw.detail || "").slice(0, 2000),
      status: raw.status,
      actualMinutes: raw.actualMinutes,
      actualMetres: raw.actualMetres,
      rpe: raw.rpe,
      feel: String(raw.feel || "").slice(0, 2000),
      knee: raw.knee,
      extra: raw.extra
    });
  }

  function completedMinutes(s) {
    if (!s || (s.status !== "done" && s.status !== "partial")) return 0;
    if (s.actualMinutes != null) return s.actualMinutes;
    if (s.status === "done") return s.minutes || 0;
    return 0;
  }

  function sessionsInWeek(sessions, monday) {
    var end = addDays(monday, 6);
    return (sessions || []).filter(function (s) { return s.date >= monday && s.date <= end; });
  }

  function daySessions(sessions, iso) {
    return (sessions || [])
      .map(function (s, i) { return { s: s, i: i }; })
      .filter(function (x) { return x.s.date === iso; })
      .sort(function (a, b) {
        var dr = SPORT_ORDER.indexOf(a.s.sport) - SPORT_ORDER.indexOf(b.s.sport);
        return dr || (a.i - b.i);
      })
      .map(function (x) { return x.s; });
  }

  function weekHours(sessions, monday) {
    var list = sessionsInWeek(sessions, monday).filter(function (s) { return s.sport !== "rest"; });
    var sports = ["swim", "bike", "run", "strength", "brick"];
    var rows = sports.map(function (sport) {
      var mine = list.filter(function (s) { return s.sport === sport; });
      return {
        sport: sport,
        planned: mine.filter(function (s) { return !s.extra; }).reduce(function (a, s) { return a + (s.minutes || 0); }, 0),
        done: mine.reduce(function (a, s) { return a + completedMinutes(s); }, 0)
      };
    });
    var total = rows.reduce(function (a, r) {
      return { planned: a.planned + r.planned, done: a.done + r.done };
    }, { planned: 0, done: 0 });
    return { rows: rows, total: total };
  }

  function kneeNotes(sessions, monday) {
    return sessionsInWeek(sessions, monday)
      .filter(function (s) { return s.knee != null; })
      .map(function (s) { return { date: s.date, knee: s.knee, title: s.title, sport: s.sport }; });
  }

  function hitsKneeDistance(s) {
    if (!s || s.sport !== "run") return false;
    return (s.metres || 0) >= KNEE_METRES || (s.actualMetres || 0) >= KNEE_METRES;
  }

  function shiftSession(s, days) {
    return makeSession(Object.assign({}, s, {
      id: newId(),
      date: addDays(s.date, days),
      status: null,
      actualMinutes: null,
      actualMetres: null,
      rpe: null,
      feel: "",
      knee: null,
      extra: false
    }));
  }

  function copyWeek(sessions, monday) {
    return sessionsInWeek(sessions, monday).map(function (s) { return shiftSession(s, 7); });
  }

  function withoutWeek(sessions, monday) {
    var end = addDays(monday, 6);
    return (sessions || []).filter(function (s) { return s.date < monday || s.date > end; });
  }

  function templateWeek(monday) {
    function d(offset) { return addDays(monday, offset); }
    return [
      makeSession({ date: d(0), sport: "swim", title: "Smooth aerobic", minutes: 45, metres: 2000, zone: "z2",
        detail: "Easy catch, long exhale. Inside the swim: 8×50 m smooth, the rest steady. Leave the wall relaxed." }),
      makeSession({ date: d(0), sport: "strength", title: "Hips and knees", minutes: 35,
        detail: "Step-downs, clamshells, single-leg sit-to-stand. Shallow range. Stop if the kneecap pinches. Two or three sets." }),
      makeSession({ date: d(1), sport: "bike", title: "Endurance spin", minutes: 75, metres: 30000, zone: "z2",
        detail: "Flat to rolling. Stay in endurance and keep the cadence easy. You should be able to talk in full sentences." }),
      makeSession({ date: d(1), sport: "run", title: "Easy run", minutes: 40, metres: 6000, zone: "z2",
        detail: "Keep this one under 7 km while the knee is quiet. Walk a minute if the front of the knee starts to speak." }),
      makeSession({ date: d(2), sport: "swim", title: "CSS hundreds", minutes: 50, metres: 2200, zone: "z4",
        detail: "Warm up 400 m. Main set: 8×100 m at threshold with 20 seconds rest. Easy 200 m to finish." }),
      makeSession({ date: d(2), sport: "bike", title: "Sweet spot", minutes: 70, metres: 28000, zone: "z4",
        detail: "15 min easy, then 2×12 min at the bottom of threshold (about 88–94% of FTP) with 5 min easy between. Spin home." }),
      makeSession({ date: d(3), sport: "run", title: "Steady run", minutes: 45, metres: 7500, zone: "z3",
        detail: "15 min easy, 15 min steady, 15 min easy. This reaches the distance where the front of the knee usually shows up. Score it after." }),
      makeSession({ date: d(3), sport: "strength", title: "Posterior chain", minutes: 30,
        detail: "Glute bridge, hip hinge, calf raise, side-lying leg raise. Skip deep squats if the knee is grumpy." }),
      makeSession({ date: d(4), sport: "swim", title: "Easy swim", minutes: 40, metres: 1800, zone: "z1",
        detail: "Pull buoy if you want it. Nothing hard. Tomorrow is rest." }),
      makeSession({ date: d(5), sport: "rest", title: "Sabbath", minutes: 0,
        detail: "Rest day. A walk is fine. No training." }),
      makeSession({ date: d(6), sport: "bike", title: "Long ride", minutes: 150, metres: 60000, zone: "z2",
        detail: "Aerobic the whole way. Eat and drink on a schedule. The last 20 minutes can include a few 1-minute openers if the legs feel good." }),
      makeSession({ date: d(6), sport: "run", title: "Long run", minutes: 70, metres: 11000, zone: "z2",
        detail: "Off the bike if you can, easy. The knee often appears around 7 km. Shorten the run if the pain climbs past 3." })
    ];
  }

  function templateCounts(sessions) {
    var c = { swim: 0, bike: 0, run: 0, strength: 0, brick: 0, rest: 0 };
    sessions.forEach(function (s) { c[s.sport] += 1; });
    return c;
  }

  function greeting(hour) {
    if (hour < 12) return "Morning";
    if (hour < 17) return "Afternoon";
    return "Evening";
  }

  function rpeWord(n) {
    n = Number(n);
    return RPE_WORDS[n] || "";
  }

  function kneeWord(n) {
    n = Number(n);
    if (n === 0) return "None";
    if (n <= 2) return "Mild";
    if (n <= 4) return "Noticeable";
    if (n <= 6) return "Limiting";
    return "Stop";
  }

  function countdown(today, raceDate) {
    var n = daysBetween(today, raceDate);
    if (n > 1) return n + " days to Cairns";
    if (n === 1) return "Tomorrow is race day";
    if (n === 0) return "Race day";
    return "Race day has passed";
  }

  return {
    TZ: TZ,
    KNEE_METRES: KNEE_METRES,
    RACE_DATE: RACE_DATE,
    SPORTS: SPORTS,
    SPORT_ORDER: SPORT_ORDER,
    ZONE_IDS: ZONE_IDS,
    isRealDate: isRealDate,
    todayIso: todayIso,
    sydneyHour: sydneyHour,
    addDays: addDays,
    mondayOf: mondayOf,
    isSaturday: isSaturday,
    isSunday: isSunday,
    daysBetween: daysBetween,
    formatDay: formatDay,
    formatLong: formatLong,
    formatShort: formatShort,
    formatWeekday: formatWeekday,
    formatWeekRange: formatWeekRange,
    formatMinutes: formatMinutes,
    durationField: durationField,
    parseDuration: parseDuration,
    formatPace: formatPace,
    parsePace: parsePace,
    formatDistance: formatDistance,
    distanceField: distanceField,
    parseDistance: parseDistance,
    powerZones: powerZones,
    runZones: runZones,
    swimZones: swimZones,
    hrFromLthr: hrFromLthr,
    hrFromMax: hrFromMax,
    zonesFor: zonesFor,
    findZone: findZone,
    zoneChoices: zoneChoices,
    bikeHrRange: bikeHrRange,
    newId: newId,
    makeSession: makeSession,
    defaultSettings: defaultSettings,
    sanitiseSettings: sanitiseSettings,
    sanitiseSession: sanitiseSession,
    completedMinutes: completedMinutes,
    sessionsInWeek: sessionsInWeek,
    daySessions: daySessions,
    weekHours: weekHours,
    kneeNotes: kneeNotes,
    hitsKneeDistance: hitsKneeDistance,
    copyWeek: copyWeek,
    withoutWeek: withoutWeek,
    templateWeek: templateWeek,
    templateCounts: templateCounts,
    greeting: greeting,
    rpeWord: rpeWord,
    kneeWord: kneeWord,
    countdown: countdown
  };
});
