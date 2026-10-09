# Work Planner - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Task | `task` | Grouping | Required | The task or work item name. |
| Due date | `due` | Grouping | Required | Task end or due date. |
| Start date | `start` | Grouping | Optional | Task start date. Without it, tasks show as milestones. |
| Owner | `owner` | Grouping | Optional | Person or team responsible. |
| Status | `status` | Grouping | Optional | For example Not started, In progress, Done. |
| Progress | `progress` | Measure | Optional | 0 to 1 (or 0 to 100) percent complete. |
| Group | `group` | Grouping | Optional | Phase or workstream to group tasks under. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
