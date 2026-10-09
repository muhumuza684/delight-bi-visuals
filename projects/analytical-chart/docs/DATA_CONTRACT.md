# Analytical Chart - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Category | `category` | Grouping | Required | The axis categories (for example month or region). |
| Series | `series` | Grouping | Optional | Optional legend field that splits each category. |
| Values | `values` | Measure | Required | One or more measures to plot. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
