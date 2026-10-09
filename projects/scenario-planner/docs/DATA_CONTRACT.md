# Scenario Planner - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Driver | `driver` | Grouping | Required | The items you want to flex (for example product or cost line). |
| Base value | `base` | Measure | Required | The baseline value for each driver. |
| Target | `target` | Measure | Optional | Optional target total to compare the scenario against. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
