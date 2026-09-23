# Food Farmacy — Canteen Tick

Phone-friendly prep + handout checklist for school canteen day.

The app is blank until the next canteen day is loaded.

**Live app:** https://skafjoseph-del.github.io/ff-canteen/

## Tabs
- Recess Prep / Lunch Prep — unit totals by item
- 11am recess / 1pm lunch — handout by family
- Observation report

Ticks and notes save in the browser on each device (not synced live between phones).

Docket photos added on the 11am recess and 1pm lunch cards stay on that phone in IndexedDB. They are not uploaded and do not sync across phones. The database name includes `STORAGE_KEY`, so a canteen-day wipe (a new storage key) starts with an empty photo library and leaves the previous day's pictures in the old database.
