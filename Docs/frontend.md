# Frontend

## File structure

```
app/
  index.html          Global CSS, brand variables, CDN scripts
  app-template.html   SPA HTML template (Vue directives, layout)
scripts/
  app-script.js       Vue logic (Composition API): state, computeds, watchers, GAS calls
```

---

## app/index.html

Contains everything that does not change between views:

- CSS variables (`--cp-blue`, `--cp-red`, `--bg-main`, etc.)
- Reusable component classes (`cp-sidebar`, `cp-card`, `cp-kpi`, `btn-primary`, etc.)
- CDN dependency loading in the correct order
- The two GAS include directives: `include('app-template')` and `include('app-script')`

In GAS production, `index.html` is the root file returned by `doGet()`. The includes are resolved on the server before sending the HTML to the browser.

**CDN dependencies (in load order)**

| Library | Version | Purpose |
|---|---|---|
| TailwindCSS | CDN play | Layout and spacing utilities |
| Vue 3 | 3.x | SPA reactive framework |
| FontAwesome | 6.0.0 | Icons |
| Barlow (Google Fonts) | - | Corporate typeface |
| html2canvas | 1.4.1 | Screenshot capture for PDF export |
| html2pdf.js | 0.10.1 | PDF generation |
| SortableJS | latest | Drag and drop for phases and tasks |
| Chart.js | 4.4.0 | Executive Summary charts |

---

## app/app-template.html

Contains the HTML structure of the SPA divided into main sections. Everything is inside a `<div id="app" v-cloak>`.

**Main layout**

```
#app
  sidebar (cp-sidebar)
    logo
    menu items (dashboard, database, summary, gantt, config)
  main
    header (cp-header)
      mobile logo, search, filters, sort, actions
    content area
      VIEW: dashboard
      VIEW: database
      VIEW: summary (Executive)
      VIEW: gantt
      VIEW: configuration
    modals and overlays
      project/template editor
      details panel
      confirmation dialog
      notification toast
```

**Available views** (controlled by `currentView`)

- `dashboard` — project cards grouped by folder with per-folder KPIs
- `database` — project table with editable columns
- `summary` — Executive Summary with global KPIs, insight chips and 5 charts
- `gantt` — Gantt diagram of phases for the selected project
- `configuration` — team configuration panel and phase templates

---

## scripts/app-script.js

The single JavaScript file of the frontend. Implements Vue 3 Composition API's `setup()`. All variables, functions and computeds are defined here and exposed in the `return` at the end.

### Main reactive state (refs)

| Ref | Type | Description |
|---|---|---|
| `projects` | Array | List of all loaded projects |
| `templates` | Array | Reusable phase templates |
| `currentView` | String | Active view: `dashboard`, `database`, `summary`, `gantt`, `config` |
| `filterProject` | String/Number | Selected project ID or `'ALL'` |
| `filterStatus` | String | Lifecycle status filter |
| `filterOwner` | String | Project owner filter |
| `filterFolder` | String | Folder filter |
| `searchQuery` | String | Search text |
| `editingObject` | Object | Deep clone of the project/template being edited |
| `selectedProject` | Object | Project open in the details panel |
| `config` | Object | Team configuration (cpTeam, externalTeam, suggestions) |

### Key computed properties

**Filtering and projections**

- `filteredProjects` — applies all active filters to `projects`
- `projectsByFolder` — groups `filteredProjects` by folder for the dashboard
- `activeProjectsList` — active (non-archived) projects

**Executive Summary — portfolio mode**

- `procurementStats` — global KPIs: total, active, alerts, investment, savings
- `summaryStatusData` — project count by `cycleStatus` for the doughnut chart
- `summaryBudgetByFolder` — investment and savings grouped by folder
- `summaryProjectsByPhase` — projects grouped by current phase
- `summaryProjectsByOwner` — projects per owner
- `summaryProgressPerProject` — % progress per project sorted descending

**Executive Summary — single project mode**

- `selectedProjectObj` — project object selected via `filterProject`
- `projectPhaseStatusData` — phase count by status for doughnut
- `projectPhaseProgress` — % progress per phase
- `projectTasksData` — completed / pending / alerted tasks for the project
- `chartTitles` — dynamic chart card titles based on the active mode
- `insights` — alert/info chips, switches between portfolio and single project mode

**Gantt**

- `projectDateRange` — min/max date range of the project with a 7-day buffer
- `ganttGridColumns` — grid columns based on scale (weekly/monthly/yearly)
- `ganttAllDateRange` / `ganttAllGridColumns` — equivalents for the multi-project view

### Chart lifecycle

Chart.js requires a canvas element mounted in the DOM. The flow is:

1. `onMounted` calls `initCharts()` via `nextTick` if the initial view is `summary`
2. A `watch` on `currentView` calls `destroyCharts()` when leaving `summary` and `initCharts()` when entering
3. A `watch` on `filteredProjects` (which includes `filterProject`) calls `initCharts()` when the filter changes
4. `initCharts()` branches based on whether a project is selected or not, using the corresponding computeds

### Backend communication

All backend calls go through `gsRun`. In a local environment (without GAS), `gsRun` does nothing and the fallbacks defined in each function are used.

Backend functions called by the frontend:

| GAS function | When called |
|---|---|
| `getAppData` | On app mount and on refresh |
| `saveProjectToSheet` | On save, archive, folder move, phase status change |
| `saveTemplateToSheet` | On template save |
| `deleteProjectFromSheet` | On delete confirmation |
| `deleteTemplateFromSheet` | On template deletion |
| `saveFoldersToSheet` | On folder create, reorder or delete |
| `saveConfig` | On team configuration save |
| `getDriveContents` | On Drive explorer open |
| `createDriveSubFolder` | On subfolder create |
| `uploadFileToDrive` | On file drop in Drive explorer |
| `deleteDriveItem` | On file or folder deletion from Drive |
| `sendGoogleChatNotification` | On message send from project chat |
| `getCurrentUserEmail` | On app mount, to determine permissions |

### Phase status automation

A phase's status (`s.status`) is calculated automatically by `computePhaseStatus(stage)` based on:

- All tasks completed → `COMPLETE`
- Any task has an alert → `AT RISK`
- Tasks started but not all completed → `IN PROGRESS`
- No tasks or none started → `PENDING`

The project owner can override this value manually. When they do, `s.statusOverride = true` is saved and the automatic calculation is skipped for that phase.
