# Colgate-Palmolive: Project Management and Data Visualization Dashboard

![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google%20Drive-4285F4?style=for-the-badge&logo=google-drive&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vue](https://img.shields.io/badge/Vue%203-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

> **This repository and its code are part of _Colgate-Palmolive_ Procurement Trainee team. Use of this material with anyone outside the _Procurement Trainee_ team or unauthorized stakeholders is strictly prohibited.**

---

## Project Description
This interactive dashboard streamlines project tracking and data visualization for the Procurement team. It eliminates the need for manual spreadsheet updates by pulling directly from a structured database. The system allows users to manage multiple project phases, assign tasks dynamically, and trigger automated alerts.

## Tech Stack
* **Frontend:** Vue 3, HTML5, CSS3, JavaScript (hosted on GitHub)
* **Database & Data Structure:** Google Sheets (optimized to handle high project volumes and prevent system crashes)
* **Integrations:** Google Webhooks & Google Drive API

---

## Key Features

* **Centralized Dashboard:** A single source of truth to monitor overall project progress at a glance.
* **Phase & Task Management:** Create multiple phases per project, each with individual tasks and statuses. *(Note: Phase structures are for context; details must be aligned and co-developed with Rafael Álvarez).*
* **Role-Based Access:** Add and categorize multiple stakeholders as:
  * Owners (Encargados)
  * Members
  * External Collaborators
* **Automated Notifications:** Powered by Google Webhooks—whenever a task is assigned, the assignee automatically receives a notification message.
* **File Management:** Seamless file storage integration directly into Google Drive.
* **Advanced Search & Templates:** Built-in search filters and reusable project templates for rapid deployment.
* **FTG Module:** Dedicated tracking for savings projects (specific details to be reviewed with Rafa).

**Out of Scope:** Date/Gantt diagrams and PDF exporting are explicitly **not** required for this project.

---

## Dynamic Statuses & Alerts

The active project status updates dynamically based on task progression, while still allowing the Project Owner the flexibility to override it manually. 

Alert logic is dynamically driven based on parameters defined by Rafael Álvarez:
* 🔴 **Delayed:** The phase has passed its scheduled delivery date.
* 🟢 **On Track:** Tasks are completed and moving to the next phase within the original date range.
* 🟡 **At Risk:** *[Definition pending further review with Rafa].*
* ⏸️ **On Hold:** A manual status applied when a project is temporarily paused.


---

### Copyright (c) 2026 Colgate-Palmolive Company. All rights reserved.

This software and associated documentation files are the confidential and proprietary information of Colgate-Palmolive. Unauthorized copying, distribution, or modification of this file, via any medium, is strictly prohibited. Only authorized Procurement Trainees and project stakeholders are permitted to access or use this software.
