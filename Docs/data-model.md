# Data Model

The database is made up of four sheets in Google Sheets. Complex objects (arrays, nested objects) are serialized as JSON into a single cell.

---

## Sheet: Projects

21 columns. Each row is a project.

| Column | Field | Type | Description |
|---|---|---|---|
| 0 | id | String | Unique identifier. Format `PRJ-001`. When created from a local mock it is a timestamp. |
| 1 | code | String | Visible project code. Generally the same as the id. |
| 2 | title | String | Project name |
| 3 | folder | String | Organizational folder or category. Default: `Uncategorized` |
| 4 | category | String | Project type or category (packaging, sourcing, etc.) |
| 5 | cycleStatus | String | Cycle status: `ON TRACK`, `AT RISK`, `DELAYED`, `ON HOLD`, `CANCELLED` |
| 6 | archived | String | `'true'` or `'false'`. Converted to boolean on deserialization. |
| 7 | projectOwner | String | Name or email of the project owner |
| 8 | members | JSON Array | Internal team members (CP) |
| 9 | externalTeam | JSON Array | External collaborators |
| 10 | stages | JSON Array | Project phases (see Stage structure below) |
| 11 | finances | JSON Object | `{amount, unit, calculated}` |
| 12 | detail | String | Detailed project description |
| 13 | reason | String | Project justification or reason |
| 14 | generalComments | String | General comments |
| 15 | icon | String | FontAwesome class for the project icon (e.g. `fa-box`) |
| 16 | driveFolderId | String | Google Drive folder ID |
| 17 | driveRootUrl | String | Direct URL to the Drive folder |
| 18 | webhookUrl | String | Project-specific Google Chat webhook |
| 19 | createdAt | String | ISO 8601 timestamp |
| 20 | updatedAt | String | ISO 8601 timestamp |

### Stage structure

Stages are stored as a JSON array in the `stages` column.

```json
{
  "title": "BRIEFING",
  "status": "IN PROGRESS",
  "icon": "fa-clipboard-list",
  "assignee": "name@colgate.com",
  "startDate": "2025-01-15",
  "endDate": "2025-02-01",
  "statusOverride": false,
  "tasks": [...]
}
```

| Field | Description |
|---|---|
| `title` | Phase name |
| `status` | Calculated or overridden status: `PENDING`, `IN PROGRESS`, `AT RISK`, `COMPLETE` |
| `icon` | FontAwesome class for the phase icon |
| `assignee` | Person responsible for the phase |
| `startDate` | Start date in `YYYY-MM-DD` format |
| `endDate` | End date in `YYYY-MM-DD` format |
| `statusOverride` | If `true`, the status was set manually and will not be recalculated |
| `tasks` | Array of tasks (see below) |

### Task structure

```json
{
  "title": "Send brief to supplier",
  "done": false,
  "alert": true,
  "assignee": "name@colgate.com",
  "startDate": "2025-01-16",
  "endDate": "2025-01-20"
}
```

| Field | Description |
|---|---|
| `title` | Task description |
| `done` | Boolean: task completed |
| `alert` | Boolean: task has an active alert |
| `assignee` | Person responsible for the task |
| `startDate` | Start date |
| `endDate` | Due date |

### Finances structure

```json
{
  "amount": 150,
  "unit": "k",
  "calculated": 150000
}
```

| Field | Description |
|---|---|
| `amount` | Numeric value entered by the user |
| `unit` | Unit: `none`, `k` (thousands), `M` (millions) |
| `calculated` | Actual calculated value (`amount * multiplier`). This is the value used by the KPIs. |

A negative `calculated` value is interpreted as savings (FTG). A positive value is interpreted as investment (on-cost).

---

## Sheet: Templates

5 columns. Reusable phase templates for creating projects.

| Column | Field | Type | Description |
|---|---|---|---|
| 0 | id | String | Unique identifier. Format `TPL-{timestamp}` |
| 1 | name | String | Template name |
| 2 | category | String | Category or type |
| 3 | stages | JSON Array | Predefined phases (same structure as in Projects) |
| 4 | createdAt | String | ISO 8601 timestamp |

---

## Sheet: Folders

5 columns. Stores the list of folders defined by the user.

| Column | Field | Type | Description |
|---|---|---|---|
| 0 | id | String | Folder name (used as id) |
| 1 | projectId | String | Not currently used |
| 2 | name | String | Visible folder name |
| 3 | driveFolderId | String | Not currently used |
| 4 | createdAt | String | ISO 8601 timestamp |

Projects do not hold a direct reference to a Folders record. The project folder is stored in `project.folder` as a string. The Folders sheet only persists the folder list so it can be reconstructed on reload.

---

## Sheet: Configuration

2 columns (key, value). Stores global application configuration.

| Key | Description |
|---|---|
| `NEXT_PRJ_ID` | Numeric counter for the next project ID |
| `DRIVE_ROOT_FOLDER_ID` | Google Drive root folder ID |
| `CHAT_WEBHOOK_URL` | Google Chat webhook URL for global notifications |
| `CP_TEAM` | JSON Array of names/emails of internal CP team members |
| `EXTERNAL_TEAM` | JSON Array of names/emails of external collaborators |
| `SUGGESTIONS` | JSON Array of suggested phase names for new projects |

---

## Serialization notes

- Boolean values are stored as strings `'true'` / `'false'` because Google Sheets can transform boolean values in unexpected ways.
- Dates are stored as strings `YYYY-MM-DD` and always parsed with the suffix `T00:00:00Z` to avoid timezone offset issues.
- The `_localId` fields used by the frontend for SortableJS are never persisted; they are stripped before calling `saveProjectToSheet`.
- The `chatWebhook` field on the frontend object is mapped to `webhookUrl` on save to maintain consistency with the column name.
