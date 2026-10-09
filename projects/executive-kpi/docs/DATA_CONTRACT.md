# Executive KPI - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| KPI name | `kpi` | Grouping | Optional | Creates one card per value. Leave empty for a single overall card. |
| Actual | `actual` | Measure | Required | The current value of the KPI. |
| Target | `target` | Measure | Optional | Goal to compare against; drives the status colour. |
| Previous period | `previous` | Measure | Optional | Shows change versus the previous period. |
| Trend axis | `period` | Grouping | Optional | Date or period used to draw the sparkline and pick the latest value. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
