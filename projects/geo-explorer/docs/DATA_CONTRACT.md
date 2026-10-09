# Geo Explorer - data contract

| Field well | Role | Kind | | Purpose |
|---|---|---|---|---|
| Location | `location` | Grouping | Optional | A country name for a filled map (for example Uganda or Kenya), or the label for each point. |
| Latitude | `latitude` | GroupingOrMeasure | Optional | Latitude in decimal degrees. Use together with Longitude. |
| Longitude | `longitude` | GroupingOrMeasure | Optional | Longitude in decimal degrees. Use together with Latitude. |
| Size / colour | `value` | Measure | Optional | Measure that sets bubble size, or the depth of colour for a country. |
| Tooltips | `tooltips` | GroupingOrMeasure | Optional | Extra fields shown in the Power BI tooltip. |

Data arrives as a Power BI *table* mapping (up to 30,000 rows). The visual reads columns by role name, never by position.
