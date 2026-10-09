# Flow Explorer - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Source | `source` | Grouping | Required | Where the flow starts. |
| Target | `target` | Grouping | Required | Where the flow ends. |
| Value | `value` | Measure | Required | The size of each flow. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
