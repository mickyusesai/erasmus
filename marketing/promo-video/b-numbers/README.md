# Version B: "Numbers"

Dark, bold kinetic typography cut to a 124 BPM grid (beat 0.484s, bar 1.935s).

| Bar | Starts | On screen |
| --- | --- | --- |
| 1 | 0.00 | **42** participants: avatars pop in while the number counts |
| 2 | 1.94 | **317** tickets: tickets fall onto a pile |
| 3 | 3.87 | **6** currencies: one tile lights per half beat, the number counts 1–6 |
| 4 | 5.81 | **1** deadline: countdown ring, a spreadsheet creeps in, two black frames |
| 5 | 7.74 | The drop: **0** spreadsheets. The sheet is blown apart |
| 6 | 9.68 | The zero closes into the logo; "From weeks to minutes." |
| 7 | 11.61 | 01 Invite: "Magic link in. No accounts." |
| 8 | 13.55 | 02 Extract: "AI reads every ticket." |
| 9 | 15.48 | 03 Convert: "Official EU exchange rates." |
| 10 | 17.42 | 04 Review: "AI review flags what needs you." |
| 11 | 19.35 | "Approve. Pay. Done." with the list turning to Paid |
| 12 | 21.29 | **90%** less time spent |
| 13–14 | 23.23 | End card (bar 14 is a hold) |

- `scene.js`: the timeline, one block per bar. `BARS` at the top sets the length:
  14 gives 27.1s; 13 ends right after the end card has landed (25.2s).
- `parts.js`: beat grid and effects (slam, outline echo, colour split, shake, counters).
- `style.css`: all layout and colours.
- `make-cues.mjs` writes `cues.json`, the list of moments for the soundtrack, from the same grid.

All names, organisations and tickets are made up.
