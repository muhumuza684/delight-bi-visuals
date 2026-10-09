# Universal Table - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Columns | `rows` | Grouping | Required | The fields shown as columns. Add as many as you need. |
| Group by | `groupBy` | Grouping | Optional | Optional field to group rows with collapsible subtotals. |
| Values | `values` | Measure | Optional | Measures shown as numeric columns with totals. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
