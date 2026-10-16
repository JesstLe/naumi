# Explicit immediate HK authorization / 2026-10-16

User's newest explicit instruction `现在就上线香港` supersedes the18:30 start and
47-first ordering **only for the Hong Kong103 transaction**.47 keeps the original
evening window and all ordinary authorization behavior remains the default.

The external maintenance tooling supports this separately named, one-date mode:

```json
{
  "mode": "immediate-HK-only",
  "target": "103.30.76.93",
  "date": "2026-10-16",
  "userAcknowledgement": "本次接受短维护迁移，保留任务和数据",
  "userImmediateAcknowledgement": "现在就上线香港",
  "notBefore": "2026-10-16T08:41:00Z",
  "restoreDatabase": false,
  "replayAcceptedTasks": false
}
```

`notBefore` must equal the actual authorization timestamp, not an earlier
operator-selected time. Current time must be timezone-aware, at/after that instant
and still Oct16 Beijing time. Wrong host/date/ack, earlier time, next day or any
restore/replay request is rejected. The session skips `predecessor47` only with
this explicit103 mode. `one-time-maintenance` remains18:30/47-first; adding an
immediate acknowledgement without changing mode does not alter it.

This is a real new user authorization, not a gate bypass. Memory preflight,
canonical CAS/original operation UUID, unresolved UNKNOWN, task preservation,
backup, whole gateway closure, old Web internal timer checks, paused Worker and
real browser/feature evidence remain unchanged. Current image0614/application
source is not edited/rebuilt by this change; only standalone ops tooling changes.
No server connection or production mutation is performed by this subtask.

Verification covers exact UTC/Beijing boundary acceptance, one-second-before
rejection, next-day rejection, wrong host/ack/date/notBefore, default mode unchanged,
and an immediate103 session without47 predecessor still stopping on a failed legacy
safety gate. Windows/Linux concentrated maintenance/session/host/controls/worker
tests pass; private task evidence records exact commands and outputs.
