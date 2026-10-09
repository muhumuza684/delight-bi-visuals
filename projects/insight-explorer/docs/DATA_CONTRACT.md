# Insight Explorer - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Dimension | `dimension` | Grouping | Required | One or more fields. Click a bar to drill to the next field. |
| Measure | `measure` | Measure | Required | The measure to rank by. |
| Compare to | `compare` | Measure | Optional | Optional benchmark (plan, last year) to find gaps. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
