# Deployment Guide — Google Apps Script

This document describes how to deploy the app to Google Apps Script for the first time, and how to update it after code changes.

---

## Prerequisites

- A Google account with access to Google Drive and Google Sheets
- A Google Drive folder already created to store project files (you will need its folder ID)
- Access to [script.google.com](https://script.google.com)

---

## First-time Setup

### 1. Create the GAS project

Go to [script.google.com](https://script.google.com) and click **New project**. Give it a name (e.g. "Colgate PMO").

### 2. Add the backend script files

For each file in the `middleware/` folder, create a new script file in GAS:

- In the GAS editor, click the **+** next to "Files" and select **Script**
- Name it exactly as shown below (no extension needed)
- Paste the contents of the corresponding local file

| Local file | GAS file name |
|---|---|
| `middleware/SheetRepository.js` | `SheetRepository` |
| `middleware/ConfigService.js` | `ConfigService` |
| `middleware/DateService.js` | `DateService` |
| `middleware/GanttService.js` | `GanttService` |
| `middleware/DriveService.js` | `DriveService` |
| `middleware/ChatService.js` | `ChatService` |
| `middleware/ImagesService.js` | `ImagesService` |
| `middleware/Code.js` | `Code` |

The default `Code.gs` file created by GAS can be renamed to `Code` or replaced with the contents of `middleware/Code.js`.

### 3. Add the frontend HTML files

For each frontend file, create a new HTML file in GAS:

- Click the **+** next to "Files" and select **HTML**
- Name it exactly as shown below

| Local file | GAS file name |
|---|---|
| `app/index.html` | `index` |
| `app/app-template.html` | `app-template` |
| `scripts/app-script.js` | `app-script` |

Note: `app-script` is saved as an HTML file in GAS even though it contains JavaScript. This is because `index.html` injects it using `include()` inside a `<script>` tag. Do not create it as a Script file.

### 4. Initialize the database

In the GAS editor, select the function `setupDatabase` from the function dropdown at the top and click **Run** (the play button). GAS will ask for permissions — accept them all.

This creates four sheets in the active Google Spreadsheet:

- `Projects`
- `Templates`
- `Folders`
- `Configuration`

If the sheets already exist with an older schema, `setupDatabase` will add any missing columns without deleting existing data.

### 5. Set the Google Drive root folder

Open the Google Spreadsheet that was linked to the GAS project. In the `Configuration` sheet, find the row with key `DRIVE_ROOT_FOLDER_ID` and paste the ID of your root Drive folder in the value column.

To get a folder ID: open the folder in Google Drive and copy the last part of the URL after `/folders/`.

### 6. Deploy as a Web App

In the GAS editor:

1. Click **Deploy** in the top-right corner
2. Select **New deployment**
3. Click the gear icon next to "Type" and select **Web app**
4. Configure the settings:
   - **Description**: any label (e.g. "v1.0")
   - **Execute as**: Me
   - **Who has access**: Anyone within your organization (or adjust as needed)
5. Click **Deploy** and copy the web app URL

---

## Updating the App

After making code changes locally:

1. Copy the updated file contents into the corresponding GAS files
2. In the GAS editor, click **Deploy** and select **Manage deployments**
3. Click the pencil icon on the existing deployment
4. Under "Version", select **New version**
5. Click **Deploy**

Note: changes to script files take effect immediately when you run functions from the editor. For the web app to reflect changes, you must create a new deployment version.

---

## File Structure Reference

```
Local project/
  app/
    index.html          ->  index.html        (GAS HTML file)
    app-template.html   ->  app-template.html (GAS HTML file)
  scripts/
    app-script.js       ->  app-script.html   (GAS HTML file — contains Vue frontend)
  middleware/
    Code.js             ->  Code.gs           (GAS Script file — main entry point)
    SheetRepository.js  ->  SheetRepository.gs
    ConfigService.js    ->  ConfigService.gs
    DateService.js      ->  DateService.gs
    GanttService.js     ->  GanttService.gs
    DriveService.js     ->  DriveService.gs
    ChatService.js      ->  ChatService.gs
    ImagesService.js    ->  ImagesService.gs
```

---

## Notes

- `setupDatabase` only needs to be run once per spreadsheet. Do not run it repeatedly in production as it will attempt to recreate sheets that already exist.
- The Google Drive integration requires the Drive folder ID to be set in `Configuration` before creating projects, otherwise folders will not be created automatically.
- The Google Chat webhook is optional. If not set, chat notifications will simply not send — the rest of the app functions normally.
- All CDN dependencies (Vue, Tailwind, Chart.js, etc.) are loaded from the internet at runtime, so users need an active internet connect