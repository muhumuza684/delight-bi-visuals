# Variance Bridge - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Category | `category` | Grouping | Required | The drivers of variance (for example product or department). |
| Actual | `actual` | Measure | Required | Actual value per category. |
| Plan | `plan` | Measure | Required | Plan or budget value per category. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
