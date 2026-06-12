# System Architecture

## Overview

The application runs entirely within the Google ecosystem. There are no external servers, proprietary databases, or background processes outside of GAS. The entire data lifecycle flows through three pieces:

1. **Google Apps Script** — acts as both the web server and the data access layer
2. **Google Sheets** — acts as a simplified relational database
3. **The user's browser** — runs the Vue interface as a SPA

```
User (browser)
      |
      | HTTPS
      v
Google Apps Script (Web App)
      |
      |-- doGet() --> HtmlService --> index.html (with app-template + app-script injected)
      |
      |-- google.script.run --> public functions in Code.gs
                  |
                  v
         SheetRepository --> Google Sheets
         DriveService    --> Google Drive
         ChatService     --> Google Chat (webhook)
         ConfigService   --> Configuration sheet
```

---

## Frontend-backend communication pattern

GAS does not expose a conventional REST API. Communication between the Vue frontend and the GAS backend occurs through `google.script.run`, which is GAS's own async bridge.

The frontend has a helper function called `gsRun` that wraps all calls:

```javascript
const gsRun = (fnName, args, onSuccess, onError) => {
    if (typeof google === 'undefined' || !google.script) return;
    google.script.run
        .withSuccessHandler(onSuccess)
        .withFailureHandler(onError)
        [fnName](...args);
};
```

When the app runs locally (without GAS), `gsRun` silently skips the call and mock data or timeouts are used. This allows developing and previewing without needing the project deployed.

---

## Main data flows

**Initial load**

1. The user accesses the web app URL
2. GAS executes `doGet()` and returns the compiled HTML (index + template + script)
3. Vue mounts the app on `#app`
4. `onMounted` calls `fetchData()` via `gsRun('getAppData', ...)`
5. `getAppData()` reads Projects, Templates, Folders and Configuration from Sheets
6. Vue updates the reactive refs and the UI renders

**Saving a project**

1. The user edits a project in the modal
2. On save, Vue calls `gsRun('saveProjectToSheet', [project])`
3. `saveProjectToSheet` serializes the object into a 21-value array and upserts it in the Projects sheet
4. The backend returns the saved project (with id and timestamps assigned if new)
5. Vue updates the reactive `projects` array in memory

---

## Separation of concerns

| Layer | File(s) | Responsibility |
|---|---|---|
| HTTP entry point | `Code.gs` | `doGet()`, public functions exposed to `google.script.run` |
| Data access | `SheetRepository.gs` | Reading and writing rows in Google Sheets, no business logic |
| Services | `ConfigService`, `DriveService`, `ChatService`, `DateService`, `GanttService` | Domain logic isolated per service |
| Serialization | `_deserializeProject`, `_deserializeTemplate` in `Code.gs` | Mapping between Sheets rows and JS objects |
| UI / frontend logic | `app-script.js` | Vue reactive state, computed properties, watchers |
| HTML template | `app-template.html` | SPA HTML structure, Vue directives |
| Styles and dependencies | `index.html` | CSS, CDN scripts, design variables |

---

## Performance considerations

Google Apps Script has a 6-minute execution limit per call. The app's operations (reading projects, individual saves) are point operations that do not come close to that limit under normal usage.

The frontend does not paginate data — all projects are loaded into memory on startup. For volumes larger than a few hundred projects, it is worth evaluating server-side pagination or filtering.

CDN dependencies (Vue, Tailwind, Chart.js, etc.) are loaded from the internet on each user session. On corporate networks with external access restrictions, it may be necessary to host these dependencies internally or verify that the domains are allowed.
