# Sample project information

Four synthetic initiative packets in the portfolio-record format, for testing
the skill. Every company, person, reference and figure is invented. `DEMO-`
references are deliberately not a real portfolio prefix.

Each folder is a corpus: point the skill at it and ask for a value story.

| folder | what it is | what a correct answer looks like |
|---|---|---|
| `01-pipeline-no-outcome` | approved, nothing built yet | **No outcome to report.** Every figure in the packet is a rubric score or an assumption. Most of the five questions unanswered. |
| `02-delivered-measured` | in service, with a real system export | Measured claims with a before and after. The strongest case in the set — 4 of 5 questions answerable. |
| `03-delivered-assumed-only` | in service, confident prose, no data | At best `estimated`, and only where somebody is named. The benefit statement reads like a result and is not one. |
| `04-rubric-trap` | rubric scores that look like KPIs | Nothing here may become a `measured` claim. Tests whether a prioritisation grade gets promoted to a business result. |
| `05-mixed-tiers` | in service, evidence of all three strengths | Exercises every tier at once: measured figures from a system export, one estimate a named role will own, and a capability with no number. Reach is unanswerable. |

## What to check in the output

- Does any rubric score (effectiveness, efficiency, priority, user scale,
  effort, impact of failure, data sensitivity, integration complexity) appear
  as a business figure? It must not.
- Is every number on the page traceable to a line in one of the source files?
- Are the unanswered leadership questions named, or quietly dropped?
- Does an `estimated` claim name a person or role who owns it?
