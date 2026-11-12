const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./logic.js");

test("Sydney calendar date, including the AEDT offset", function () {
  assert.equal(L.todayIso(new Date("2026-11-11T14:00:00Z")), "2026-11-12");
  assert.equal(L.todayIso(new Date("2026-11-11T12:00:00Z")), "2026-11-11");
  assert.equal(L.sydneyHour(new Date("2026-11-11T14:00:00Z")), 1);
});

test("weeks start Monday and Saturday is rest", function () {
  assert.equal(L.mondayOf("2026-11-12"), "2026-11-09");
  assert.equal(L.mondayOf("2026-11-15"), "2026-11-09");
  assert.equal(L.mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(L.isSaturday("2026-11-14"), true);
  assert.equal(L.isSaturday("2026-11-15"), false);
  assert.equal(L.addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(L.daysBetween("2026-11-12", "2027-06-13"), 213);
});

test("Coggan power zones at the default 165 W FTP", function () {
  var z = L.powerZones(165);
  var by = Object.fromEntries(z.map(function (r) { return [r.id, r]; }));
  assert.equal(by.z1.band, "<55%");
  assert.equal(by.z1.range, "under 91 W");
  assert.equal(by.z2.band, "56–75%");
  assert.equal(by.z2.range, "92–124 W");
  assert.equal(by.z3.range, "125–149 W");
  assert.equal(by.z4.range, "150–173 W");
  assert.equal(by.z5.range, "175–198 W");
  assert.equal(by.z6.range, "above 200 W");
  assert.match(by.z7.range, /Not a percent/);
  assert.equal(L.powerZones(null).length, 0);
});

test("Friel run pace zones from a 4:30 threshold", function () {
  assert.equal(L.parsePace("4:30"), 270);
  assert.equal(L.parsePace("4.30"), 270);
  assert.equal(L.parsePace("4:60"), null);
  var z = L.runZones(270);
  var by = Object.fromEntries(z.map(function (r) { return [r.id, r]; }));
  assert.equal(by.z2.band, "114–129%");
  assert.equal(by.z2.range, "5:08–5:48 /km");
  assert.equal(by.z1.range, "slower than 5:48 /km");
  assert.equal(by.z4.range, "4:27–4:44 /km");
  assert.match(by.z5c.range, /^faster than /);
  assert.equal(L.runZones(null).length, 0);
});

test("swim CSS zones from 1:45 per 100 m", function () {
  assert.equal(L.parsePace("1:45"), 105);
  var z = L.swimZones(105);
  var by = Object.fromEntries(z.map(function (r) { return [r.id, r]; }));
  assert.equal(by.z2.range, "1:51–1:57 /100 m");
  assert.equal(by.z4.range, "1:43–1:47 /100 m");
  assert.equal(by.z1.range, "slower than 1:57 /100 m");
  assert.equal(by.z6.range, "faster than 1:39 /100 m");
});

test("heart-rate zones from threshold and from max", function () {
  var lthr = L.hrFromLthr(160);
  assert.equal(lthr[1].band, "69–83%");
  assert.equal(lthr[1].range, "110–133 bpm");
  var max = L.hrFromMax(180);
  assert.equal(max[3].range, "144–162 bpm");
  assert.equal(L.bikeHrRange("z2", 160), "110–133 bpm");
  assert.equal(L.bikeHrRange("z7", 160), "");
});

test("starter week keeps Saturday as Sabbath and hits the session counts", function () {
  var monday = "2026-11-09";
  var week = L.templateWeek(monday);
  var counts = L.templateCounts(week);
  assert.deepEqual(counts, { swim: 3, bike: 3, run: 3, strength: 2, brick: 0, rest: 1 });
  var saturday = week.filter(function (s) { return s.date === "2026-11-14"; });
  assert.equal(saturday.length, 1);
  assert.equal(saturday[0].sport, "rest");
  assert.equal(saturday[0].title, "Sabbath");
  var rides = week.filter(function (s) { return s.sport === "bike"; });
  var longest = rides.slice().sort(function (a, b) { return b.minutes - a.minutes; })[0];
  assert.equal(longest.title, "Long ride");
  assert.ok(longest.minutes >= 120);
  assert.equal(longest.date, "2026-11-15");
  var runs = week.filter(function (s) { return s.sport === "run"; });
  var longRun = runs.slice().sort(function (a, b) { return b.minutes - a.minutes; })[0];
  assert.equal(longRun.title, "Long run");
  assert.equal(longRun.date, "2026-11-15");
  assert.ok(L.hitsKneeDistance(longRun));
  var easy = runs.filter(function (s) { return s.title === "Easy run"; })[0];
  assert.equal(L.hitsKneeDistance(easy), false);
  week.forEach(function (s) {
    if (s.sport !== "rest" && s.sport !== "strength") assert.ok(s.zone, s.title + " has a zone");
  });
});

test("copy week shifts seven days and drops the log", function () {
  var src = L.makeSession({
    date: "2026-11-09", sport: "run", title: "Easy run", minutes: 40, metres: 6000, zone: "z2",
    status: "done", actualMinutes: 42, actualMetres: 6100, rpe: 4, feel: "fine", knee: 2, extra: true
  });
  var copy = L.copyWeek([src], "2026-11-09")[0];
  assert.equal(copy.date, "2026-11-16");
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.status, null);
  assert.equal(copy.actualMinutes, null);
  assert.equal(copy.knee, null);
  assert.equal(copy.feel, "");
  assert.equal(copy.extra, false);
  assert.equal(copy.minutes, 40);
  assert.equal(L.withoutWeek([src, copy], "2026-11-09").length, 1);
});

test("planned hours ignore unplanned work; completed hours follow the log", function () {
  var monday = "2026-11-09";
  var sessions = [
    L.makeSession({ date: "2026-11-09", sport: "swim", minutes: 45, status: "done", actualMinutes: 40 }),
    L.makeSession({ date: "2026-11-10", sport: "bike", minutes: 75, status: "skipped" }),
    L.makeSession({ date: "2026-11-10", sport: "run", minutes: 40, status: "partial", actualMinutes: 20 }),
    L.makeSession({ date: "2026-11-11", sport: "run", minutes: 30, status: "done" }),
    L.makeSession({ date: "2026-11-12", sport: "bike", minutes: 50, extra: true, status: "done", actualMinutes: 50 }),
    L.makeSession({ date: "2026-11-14", sport: "rest", minutes: 0, status: "done" })
  ];
  var hours = L.weekHours(sessions, monday);
  var swim = hours.rows.filter(function (r) { return r.sport === "swim"; })[0];
  var bike = hours.rows.filter(function (r) { return r.sport === "bike"; })[0];
  var run = hours.rows.filter(function (r) { return r.sport === "run"; })[0];
  assert.equal(swim.planned, 45);
  assert.equal(swim.done, 40);
  assert.equal(bike.planned, 75);
  assert.equal(bike.done, 50);
  assert.equal(run.planned, 70);
  assert.equal(run.done, 50);
  assert.equal(hours.total.planned, 190);
  assert.equal(hours.total.done, 140);
  assert.equal(L.completedMinutes(sessions[1]), 0);
});

test("distance, duration, and backup shape", function () {
  assert.equal(L.parseDuration("1:30"), 90);
  assert.equal(L.parseDuration("1h 15"), 75);
  assert.equal(L.parseDuration("45"), 45);
  assert.equal(L.parseDuration(""), null);
  assert.equal(L.formatMinutes(90), "1h 30m");
  assert.equal(L.formatDistance(2000, "swim"), "2,000 m");
  assert.equal(L.formatDistance(6500, "run"), "6.5 km");
  assert.equal(L.parseDistance("2.2 km", "swim"), 2200);
  assert.equal(L.parseDistance("2000", "swim"), 2000);
  assert.equal(L.parseDistance("35", "bike"), 35000);
  var bad = L.sanitiseSession({ date: "nope", sport: "run" });
  assert.equal(bad, null);
  assert.equal(L.sanitiseSession({ date: "2026-11-31", sport: "run" }), null);
  var ok = L.sanitiseSession({ date: "2026-11-12", sport: "run", zone: "nope", title: "x", knee: 12, rpe: 0 });
  assert.equal(ok.zone, null);
  assert.equal(ok.knee, 10);
  assert.equal(ok.rpe, 1);
  var settings = L.sanitiseSettings({ ftp: 165, runPace: "", theme: "neon", raceDate: "2027-06-13" });
  assert.equal(settings.ftp, 165);
  assert.equal(settings.runPace, null);
  assert.equal(settings.theme, "auto");
  assert.equal(L.sanitiseSettings({}).ftp, 165);
  assert.equal(L.sanitiseSettings({ ftp: null }).ftp, null);
});
