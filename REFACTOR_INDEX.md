# Refactor Plan: index.html

## Context

The `index.html` file is a single-file Vue 3 app served by Google Apps Script via `HtmlService`. Because Apps Script does not support ES modules or external `.js` files for the frontend, all JavaScript lives inside one `<script>` tag at the bottom of the HTML. That is expected and will stay that way.

The problem is that the script block has grown without structure. Business logic, UI helpers, computed state, backend calls, and configuration constants are all mixed together. This makes it hard to reason about, hard to test manually, and risky to modify — changing one thing breaks another because dependencies are implicit.

The goal of this refactor is to **organize the existing code without changing behavior**. No new features. No visual changes. The app must work exactly the same before and after.

---

## What Is Wrong Right Now

### 1. Gantt logic is duplicated with the backend

`projectDateRange` and `ganttGridColumns` are `computed` properties in the Vue setup that re-implement date parsing and column generation. The backend already has `DateService` and `GanttService` for exactly this purpose. The frontend version uses `T00:00:00` (local time) while the backend uses `T00:00:00Z` (UTC) — two different timezone interpretations of the same data.

**Risk:** A date that renders correctly in one place will shift by one day in the other.

---

### 2. Hardcoded mock data mixed with real state

The default `config` ref has hardcoded team names and phase suggestions:

```js
cpTeam: ['Alex S.', 'Elena R.'],
externalTeam: ['Mike T.', 'John D.', 'Agency X'],
```

And `customFolders` has hardcoded folder names:

```js
customFolders: ref(['Optimization', 'Sustainability', 'Marketing', 'Uncategorized'])
```

These are displayed to real users until `fetchData` overwrites them. If the backend is slow or fails, users see fake data with no warning.

---

### 3. Backend call functions are scattered and inconsistent

There are at least 8 different `google.script.run` call sites spread across the script. Some have `withFailureHandler`, some do not. Some show a toast on error, some call `console.error`, some do nothing. There is no consistent pattern.

**Example of inconsistency:**

```js
// Has failure handler:
google.script.run.withSuccessHandler(...).withFailureHandler(...).getAppData();

// No failure handler, silent on error:
google.script.run.saveProjectToSheet(JSON.parse(JSON.stringify(p)));
```

---

### 4. `alert()` and `confirm()` used for user interaction

`createNewFolder` uses `prompt()`, `deleteFolder` uses `confirm()`, and `toggleDictation` uses `alert()`. Native browser dialogs are blocked inside Google Apps Script iframes in some browsers, and they provide no styling or context.

---

### 5. All state declared flat at the top of `setup()`

All `ref()` declarations are in one block — UI state, data models, filter state, drive state, dictation state, and config are all at the same level with no grouping. With ~30 refs, reading the setup function to understand what belongs to what feature is slow.

---

### 6. `getGanttBarStyle` and `ganttGridColumns` ignore `GanttService`

The frontend has its own bar-style calculation that duplicates `GanttService.calculateBarStyle`. Since the backend already has this logic and it can be called via `google.script.run`, keeping a local copy means maintaining two implementations.

> Note: Per the project README, Gantt and PDF export are explicitly out of scope. However the code is already there and being maintained. The refactor will consolidate it, not remove it.

---

### 7. `sortBy` comparison uses `a.id - b.id` (numeric subtraction on string IDs)

```js
if (sortBy.value === 'date_asc') return a.id - b.id;
if (sortBy.value === 'date_desc') return b.id - a.id;
```

Project IDs are strings like `"PRJ-001"`. Subtracting two strings results in `NaN`, which makes the sort unstable and unpredictable. The sort should use `createdAt` instead.

---

## What Will Be Done

### Step 1 — Group state declarations by domain

- [x] Group `ref()` declarations into labeled sections: UI State, Data Models, Drive State, Filter State, Dictation State, Config.
- [x] No logic changes. Purely organizational.

---

### Step 2 — Replace mock defaults with empty state

- [x] Change default `config` ref to `{ cpTeam: [], externalTeam: [], suggestions: [] }`.
- [x] Change default `customFolders` to `['Uncategorized']` only.
- [x] Add a loading state guard so the UI shows a spinner instead of stale mock data while `fetchData` runs.

---

### Step 3 — Create a centralized `gsRun` helper

- [x] Create a local function `gsRun(fnName, args, onSuccess, onError)` that wraps `google.script.run` with consistent `withSuccessHandler` and `withFailureHandler` behavior.
- [x] All 15 call sites replaced to use this helper.
- [x] Default `onError` shows a toast with the error message.

```js
// Before (inconsistent, no failure handler):
google.script.run.saveProjectToSheet(JSON.parse(JSON.stringify(p)));

// After (consistent):
gsRun('saveProjectToSheet', [JSON.parse(JSON.stringify(p))]);
```

---

### Step 4 -- Replace `alert()` / `confirm()` / `prompt()` with Vue-based dialogs

- [x] Add a minimal reactive `dialog` ref: `{ show: false, message: '', type: 'alert'|'confirm'|'prompt', resolve: null }`.
- [x] Replace `prompt(...)` calls with `showPrompt(...)` — renders inline input modal.
- [x] Replace `confirm(...)` calls with `showConfirm(...)` — confirm/cancel button pair.
- [x] Replace `alert(...)` calls with `showToast(...)` or `showAlert(...)`.

---

### Step 5 -- Fix `sortBy` date comparison

- [ ] Replace `a.id - b.id` and `b.id - a.id` with `new Date(a.createdAt) - new Date(b.createdAt)` and its reverse.
- [ ] This is a one-line fix per case but affects sort correctness for all users.

---

### Step 6 -- Consolidate Gantt date logic

- [ ] Remove the local `projectDateRange` computed that duplicates `DateService.getProjectDateRange`.
- [ ] Remove the local `ganttGridColumns` computed that duplicates `GanttService.generateGridColumns`.
- [ ] Call the backend equivalents via `gsRun` and cache the result reactively.
- [ ] Standardize timezone handling to `T00:00:00Z` (UTC) in both frontend date parsing instances.

---

## What Will NOT Change

- The HTML template structure.
- All CSS and Tailwind classes.
- The visual appearance of the app.
- Any backend `.js` files.
- The `doGet`, `saveProject`, or any other Apps Script function signatures.

---

## Definition of Done

- [ ] All 8 `google.script.run` call sites use the `gsRun` helper.
- [ ] No `alert()`, `confirm()`, or `prompt()` remain in the script.
- [ ] `customFolders` default is `['Uncategorized']`.
- [ ] `config` default has no hardcoded names.
- [ ] `sortBy` date comparison uses `createdAt`.
- [ ] Gantt computed properties use backend services or a shared local utility, not duplicated code.
- [ ] `setup()` state declarations are grouped by domain with section comments.
- [ ] App loads and all features work identically to before the refactor.
