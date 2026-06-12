# Backend — Services and Middleware

All files in `middleware/` are GAS classes. They are loaded in the same global scope of the Apps Script project, so they can reference each other without any imports.

---

## Code.js (Code.gs)

System entry point. It is the only file that exposes public functions to the frontend via `google.script.run` and the one that defines `doGet()`.

**Main public functions**

| Function | Description |
|---|---|
| `doGet()` | Serves the web app HTML. Uses `HtmlService.createTemplateFromFile('index')` |
| `setupDatabase()` | Creates (or migrates) the spreadsheet sheets with the correct schema |
| `getAppData()` | Reads and returns all projects, templates, folders and configuration |
| `saveProjectToSheet(project)` | Creates or updates a project in the Projects sheet |
| `saveTemplateToSheet(template)` | Creates or updates a template in the Templates sheet |
| `deleteProjectFromSheet(id)` | Deletes a project by ID |
| `deleteTemplateFromSheet(id)` | Deletes a template by ID |
| `saveFoldersToSheet(folders)` | Replaces the contents of the Folders sheet |
| `saveConfig(configObj)` | Saves cpTeam, externalTeam and suggestions to Configuration |
| `sendGoogleChatNotification(message)` | Sends a notification to the webhook configured on the server |
| `getDriveContents(folderId)` | Gets files and subfolders from a Drive folder |
| `createDriveSubFolder(parentId, name)` | Creates a subfolder in Drive |
| `uploadFileToDrive(parentId, base64, name, mime)` | Uploads a base64-encoded file to Drive |
| `deleteDriveItem(id, isFolder)` | Moves a file or folder to the trash |
| `getCurrentUserEmail()` | Returns the email of the authenticated GAS user |
| `include(filename)` | Helper to inject HTML partials into the template (internal use) |

**Private functions**

- `_deserializeProject(row)` — converts a Sheets row into a complete project object
- `_deserializeTemplate(row)` — converts a row into a template object
- `_deserializeFolder(row)` — converts a row into a folder object

---

## SheetRepository.js (SheetRepository.gs)

Repository pattern: single responsibility is reading and writing rows in Google Sheets. Contains no business logic.

| Method | Description |
|---|---|
| `getAllData(sheetName)` | Returns all data rows (without header) as a 2D array |
| `findRow(sheetName, value, colIndex)` | Finds a row by value in a column; returns `{rowIndex, data}` |
| `appendRow(sheetName, rowData)` | Appends a row to the end of the sheet |
| `updateRow(sheetName, rowIndex, rowData)` | Replaces a complete row by index |
| `deleteRow(sheetName, rowIndex)` | Deletes a row by index |
| `setCellValue(sheetName, row, col, value)` | Updates a specific cell |
| `getCellValue(sheetName, row, col)` | Reads a specific cell |
| `clearRange(sheetName, startRow, numRows, numCols)` | Clears a range of content |
| `getLastRow(sheetName)` | Returns the number of the last row with data |

---

## ConfigService.js (ConfigService.gs)

Manages the values in the `Configuration` sheet. Uses `LockService` to prevent race conditions when generating project IDs.

| Method | Description |
|---|---|
| `getNextProjectId()` | Returns the next formatted ID (`PRJ-001`, `PRJ-002`, ...) and increments the counter |
| `getRootDriveId()` | Reads `DRIVE_ROOT_FOLDER_ID` from Configuration |
| `getChatWebhookUrl()` | Reads `CHAT_WEBHOOK_URL` from Configuration |
| `getFullConfig()` | Returns `{cpTeam, externalTeam, suggestions}` by parsing the JSON values |
| `saveConfig(configObj)` | Updates `CP_TEAM`, `EXTERNAL_TEAM` and `SUGGESTIONS` in the sheet |

---

## DriveService.js (DriveService.gs)

Encapsulates all Google Drive operations using `DriveApp`.

| Method | Description |
|---|---|
| `getFolderContents(folderId)` | Lists subfolders and files in a folder; returns `{folders, files}` |
| `createSubFolder(parentId, name)` | Creates a subfolder; returns `{success, id}` |
| `createProjectFolder(code, title)` | Creates the project root folder with standard subfolders (Briefings, CAD, Approvals) |
| `uploadFile(parentId, base64, name, mime)` | Uploads a base64-encoded file using `Utilities.base64Decode` |
| `deleteItem(id, isFolder)` | Moves an item to the trash with `setTrashed(true)` |

When a project is created, `DriveService.createProjectFolder` is called automatically if the project does not have a `driveFolderId`. It creates the folder using the root ID configured in `DRIVE_ROOT_FOLDER_ID`.

---

## ChatService.js (ChatService.gs)

Sends messages to Google Chat via incoming webhooks using `UrlFetchApp.fetch`.

| Method | Description |
|---|---|
| `sendNotification(webhookUrl, message)` | Sends a text message to the webhook; returns `{success, error?}` |
| `notifyProjectCreated(webhookUrl, project)` | Predefined message for a new project |
| `notifyAlert(webhookUrl, title, message)` | Alert message |
| `notifyStageCompleted(webhookUrl, title, stage)` | Stage completed message |

The webhook URL is stored in the `Configuration` sheet (key `CHAT_WEBHOOK_URL`). The frontend does not know the URL; it always calls `sendGoogleChatNotification(message)` and the server retrieves the URL.

---

## DateService.js (DateService.gs)

Date handling utilities. All dates are handled in `YYYY-MM-DD` format and parsed with `T00:00:00Z` to avoid timezone issues.

| Method | Description |
|---|---|
| `calculateDays(start, end)` | Returns days between two date strings |
| `isValidDateFormat(dateStr)` | Validates `YYYY-MM-DD` format |
| `formatDate(dateStr)` | Converts to readable format (`DD MMM YYYY`) |
| `getProjectDateRange(stages, buffer)` | Extracts the min/max date range from all phases and tasks, with a configurable buffer |
| `compareDates(d1, d2)` | Compares two dates; returns -1, 0 or 1 |

---

## GanttService.js (GanttService.gs)

Position and column calculations for the Gantt diagram.

| Method | Description |
|---|---|
| `generateGridColumns(dateRange, scale)` | Generates column labels based on scale (`weekly`, `monthly`, `yearly`) |
| `generateWeeklyColumns(dateRange)` | Weekly columns (`W1`, `W2`, ...) |
| `generateMonthlyColumns(dateRange)` | Monthly columns (`Jan 25`, `Feb 25`, ...) |
| `generateYearlyColumns(dateRange)` | Yearly columns |
| `calculateBarStyle(item, dateRange)` | Calculates `{left, width, display}` in % for a Gantt bar given the range |
| `validateGanttItem(item)` | Validates that an item has valid and coherent dates |

---

## ImagesService.js (ImagesService.gs)

Contains base64-encoded images (logos, static icons). It has no business logic. Used to embed visual assets without depending on external URLs.
