# Universal Filter - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Field | `field` | Grouping | Required | The field whose values you can pick. |
| Count | `count` | Measure | Optional | Optional measure shown beside each value. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
