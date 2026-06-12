# Colgate-Palmolive — Procurement PMO

![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google%20Drive-4285F4?style=for-the-badge&logo=google-drive&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vue](https://img.shields.io/badge/Vue%203-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

> **This repository and its code are part of the Colgate-Palmolive Procurement Trainee team. Use of this material with anyone outside the Procurement Trainee team or unauthorized stakeholders is strictly prohibited.**

---

## Description

Internal project management tool for the Colgate-Palmolive Procurement team. The application centralizes the tracking of packaging projects, allows managing phases and tasks, visualizing portfolio progress, and connects with Google Drive and Google Chat for notifications and file storage.

It runs on Google Apps Script as a web app, using Google Sheets as the database with no external servers.

---

## Tech stack

**Frontend**
- Vue 3 (Composition API, CDN)
- TailwindCSS (CDN)
- FontAwesome 6
- Chart.js 4.4
- SortableJS
- html2pdf / html2canvas

**Backend**
- Google Apps Script
- Google Sheets (database)
- Google Drive API
- Google Chat (webhooks)

---

## Key features

**Project management**
- Create, edit, archive and delete projects
- Assign project owner, internal members and external collaborators
- Organize by folders (categories)
- Financial tracking (investment / savings)

**Phases and tasks**
- Each project has N phases with start and end dates
- Each phase contains tasks with completed / alert status
- Phase status is calculated automatically based on task progress
- The project owner can manually override the status

**Views**
- Dashboard: project cards grouped by folder
- Database: tabular project list with filters
- Executive Summary: KPIs, insights and charts for the portfolio or a single project
- Gantt: phase timeline per project
- Configuration: teams, phase templates, Google Chat webhook

**Integrations**
- Google Drive: per-project file explorer with upload and download
- Google Chat: automatic notifications when changes are saved
- PDF export of the dashboard

---

## Lifecycle statuses

| Status | Meaning |
|---|---|
| ON TRACK | Normal progress, within schedule |
| AT RISK | At risk of missing deadlines |
| DELAYED | Past the deadline |
| ON HOLD | Manually paused |
| CANCELLED | Cancelled |

---

## Additional documentation

- [System architecture](docs/architecture.md)
- [Frontend — structure and components](docs/frontend.md)
- [Backend — services and middleware](docs/backend.md)
- [Data model](docs/data-model.md)
- [Deployment guide for Google Apps Script](docs/deploy.md)

---

### Copyright (c) 2026 Colgate-Palmolive Company. All rights reserved.

This software and associated documentation files are the confidential and proprietary information of Colgate-Palmolive. Unauthorized copying, distribution, or modification of this file, via any medium, is strictly prohibited. Only authorized Procurement Trainees and project stakeholders are permitted to access or use this software.
