/**
 * Code.gs
 * Punto de entrada principal - Expone API pública al frontend
 * Responsabilidad única: Orquestar servicios y exponer funciones
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('PackTrack - Packaging Engineering')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================
// INITIALIZATION
// =====================================================

/**
 * Inicializa la base de datos por primera vez
 * Crea todas las hojas necesarias con sus headers
 */
function setupDatabase() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const SHEET_SCHEMAS = {
      Projects: [
        'id', 'code', 'title', 'folder', 'category',
        'cycleStatus', 'archived', 'projectOwner',
        'members', 'externalTeam', 'stages', 'finances',
        'detail', 'reason', 'generalComments', 'icon',
        'driveFolderId', 'driveRootUrl', 'webhookUrl',
        'createdAt', 'updatedAt', 'ownerEmail', 'collaboratorEmails'
      ],
      Templates: ['id', 'name', 'category', 'stages', 'createdAt'],
      Folders:   ['id', 'projectId', 'name', 'driveFolderId', 'createdAt'],
      Configuration: ['key', 'value']
    };

    const CONFIG_DEFAULTS = [
      ['NEXT_PRJ_ID', 1],
      ['DRIVE_ROOT_FOLDER_ID', 'PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE'],
      ['CHAT_WEBHOOK_URL', ''],
      ['CP_TEAM', '[]'],
      ['EXTERNAL_TEAM', '[]'],
      ['SUGGESTIONS', '[]']
    ];

    Object.entries(SHEET_SCHEMAS).forEach(([sheetName, headers]) => {
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold')
          .setBackground('#1F2937')
          .setFontColor('#FFFFFF');
        Logger.log(`Hoja creada: ${sheetName}`);

        if (sheetName === 'Configuration') {
          sheet.getRange(2, 1, CONFIG_DEFAULTS.length, 2).setValues(CONFIG_DEFAULTS);
          Logger.log('Valores por defecto de Configuration insertados');
        }
      } else {
        // Migrate: add new columns if the schema has grown
        const existingCols = sheet.getLastColumn();
        if (existingCols < headers.length) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          sheet.getRange(1, existingCols + 1, 1, headers.length - existingCols)
            .setFontWeight('bold')
            .setBackground('#1F2937')
            .setFontColor('#FFFFFF');
          Logger.log(`Hoja ${sheetName}: migrada de ${existingCols} a ${headers.length} columnas`);
        } else {
          Logger.log(`Hoja ya existe: ${sheetName}`);
        }
      }
    });

    Logger.log('Base de datos inicializada');
    return { success: true, message: 'Database initialized' };
  } catch (e) {
    Logger.log(`Error en setupDatabase: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// =====================================================
// DATA MANAGEMENT
// =====================================================

/**
 * Obtiene todos los datos de la aplicación
 * Deserializa filas de Sheets en objetos usables por el frontend
 */
function getAppData() {
  try {
    const sheetRepo = new SheetRepository();

    const payload = {
      projects:  sheetRepo.getAllData('Projects').map(_deserializeProject),
      templates: sheetRepo.getAllData('Templates').map(_deserializeTemplate),
      folders:   sheetRepo.getAllData('Folders').map(_deserializeFolder),
      config:    ConfigService.getFullConfig()
    };

    Logger.log(`App data retrieved: ${payload.projects.length} projects`);
    return payload;
  } catch (e) {
    Logger.log(`Error en getAppData: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Mapea una fila de la hoja Projects a un objeto
 * @private
 */
function _deserializeProject(row) {
  const _tryParse = (val, fallback) => {
    try { return val ? JSON.parse(val) : fallback; } catch(e) { return fallback; }
  };
  // Columns: 0=id, 1=code, 2=title, 3=folder, 4=category,
  //   5=cycleStatus, 6=archived, 7=projectOwner,
  //   8=members, 9=externalTeam, 10=stages, 11=finances,
  //   12=detail, 13=reason, 14=generalComments, 15=icon,
  //   16=driveFolderId, 17=driveRootUrl, 18=webhookUrl,
  //   19=createdAt, 20=updatedAt
  return {
    id:              String(row[0]  || ''),
    code:            row[1]  || '',
    title:           row[2]  || '',
    folder:          row[3]  || 'Uncategorized',
    category:        row[4]  || '',
    cycleStatus:     row[5]  || 'ON TRACK',
    archived:        row[6]  === 'true' || row[6]  === true,
    projectOwner:    row[7]  || '',
    members:         _tryParse(row[8],  []),
    externalTeam:    _tryParse(row[9],  []),
    stages:          _tryParse(row[10], []),
    finances:        _tryParse(row[11], { amount: null, unit: 'none', calculated: 0 }),
    detail:          row[12] || '',
    reason:          row[13] || '',
    generalComments: row[14] || '',
    icon:            row[15] || 'fa-rocket',
    driveFolderId:   row[16] || '',
    driveRootUrl:    row[17] || '',
    webhookUrl:      row[18] || '',
    createdAt:       row[19] || '',
    updatedAt:       row[20] || '',
    ownerEmail:      row[21] || '',
    collaboratorEmails: _tryParse(row[22], [])
  };
}

/**
 * Mapea una fila de la hoja Templates a un objeto
 * @private
 */
function _deserializeTemplate(row) {
  const _tryParse = (val, fallback) => {
    try { return val ? JSON.parse(val) : fallback; } catch(e) { return fallback; }
  };
  return {
    id:        row[0] || '',
    name:      row[1] || '',
    category:  row[2] || '',
    stages:    _tryParse(row[3], []),
    createdAt: row[4] || ''
  };
}

/**
 * Mapea una fila de la hoja Folders a un objeto
 * @private
 */
function _deserializeFolder(row) {
  return {
    id:           row[0] || '',
    projectId:    row[1] || '',
    name:         row[2] || '',
    driveFolderId:row[3] || '',
    createdAt:    row[4] || ''
  };
}

/**
 * Guarda un proyecto (crea o actualiza)
 * @param {Object} project - Objeto del proyecto
 * @return {Object} Proyecto guardado o {error}
 */
function saveProject(project) {
  try {
    const sheetRepo = new SheetRepository();

    // Asignar ID si es nuevo
    if (!project.id) {
      project.id = ConfigService.getNextProjectId();
      project.code = project.id;
      project.createdAt = new Date().toISOString();
    }
    project.updatedAt = new Date().toISOString();

    // Crear carpeta en Drive si no existe
    if (!project.driveFolderId) {
      const driveResult = DriveService.createProjectFolder(project.code, project.title);
      if (driveResult.success) {
        project.driveFolderId = driveResult.id;
      }
    }

    // Columns must match _deserializeProject order exactly (21 cols)
    const rowData = [
      project.id,
      project.code            || '',
      project.title           || '',
      project.folder          || 'Uncategorized',
      project.category        || '',
      project.cycleStatus     || 'ON TRACK',
      project.archived        ? 'true' : 'false',
      project.projectOwner    || '',
      JSON.stringify(project.members         || []),
      JSON.stringify(project.externalTeam    || []),
      JSON.stringify(project.stages          || []),
      JSON.stringify(project.finances        || { amount: null, unit: 'none', calculated: 0 }),
      project.detail          || '',
      project.reason          || '',
      project.generalComments || '',
      project.icon            || 'fa-rocket',
      project.driveFolderId   || '',
      project.driveRootUrl    || '',
      project.webhookUrl      || project.chatWebhook || '',
      project.createdAt       || '',
      project.updatedAt       || '',
      project.ownerEmail      || '',
      JSON.stringify(project.collaboratorEmails || [])
    ];

    const existing = sheetRepo.findRow('Projects', project.id, 0);
    if (existing) {
      sheetRepo.updateRow('Projects', existing.rowIndex, rowData);
      Logger.log(`Proyecto actualizado: ${project.title}`);
    } else {
      sheetRepo.appendRow('Projects', rowData);
      Logger.log(`Proyecto creado: ${project.title}`);
    }

    return project;
  } catch (e) {
    Logger.log(`❌ Error en saveProject: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Alias público para saveProject — usado por el frontend
 * Guarda o actualiza un proyecto; si trae chatWebhook lo persiste en Configuration
 * @param {Object} project
 * @return {Object} Proyecto guardado o {error}
 */
function saveProjectToSheet(project) {
  try {
    const sheetRepo = new SheetRepository();
    const existing = sheetRepo.findRow('Projects', project.id, 0);
    
    if (existing) {
      const oldProject = _deserializeProject(existing.data);
      const email = Session.getActiveUser().getEmail();
      const isOwner = oldProject.ownerEmail === email;
      const isCollaborator = isOwner || (oldProject.collaboratorEmails || []).includes(email);
      
      if (!isCollaborator) {
        throw new Error('You must be a collaborator to modify this project.');
      }
      
      if (!isOwner) {
        // Enforce that only stages and tasks can change
        // Revert all other fields to oldProject's values
        project.code = oldProject.code;
        project.title = oldProject.title;
        project.folder = oldProject.folder;
        project.category = oldProject.category;
        project.cycleStatus = oldProject.cycleStatus;
        project.archived = oldProject.archived;
        project.projectOwner = oldProject.projectOwner;
        project.members = oldProject.members;
        project.externalTeam = oldProject.externalTeam;
        project.finances = oldProject.finances;
        project.detail = oldProject.detail;
        project.reason = oldProject.reason;
        project.generalComments = oldProject.generalComments;
        project.icon = oldProject.icon;
        project.driveFolderId = oldProject.driveFolderId;
        project.driveRootUrl = oldProject.driveRootUrl;
        project.webhookUrl = oldProject.webhookUrl;
        project.chatWebhook = oldProject.webhookUrl;
        project.createdAt = oldProject.createdAt;
        project.ownerEmail = oldProject.ownerEmail;
        project.collaboratorEmails = oldProject.collaboratorEmails;
      }
    } else {
      // New project
      project.ownerEmail = Session.getActiveUser().getEmail();
    }

    if (project.chatWebhook !== undefined) {
      saveChatWebhookUrl(project.chatWebhook);
    }
    return saveProject(project);
  } catch (e) {
    Logger.log(`❌ Error en saveProjectToSheet: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Guarda o actualiza una plantilla en la hoja Templates
 * @param {Object} template - {id?, name, category, stages}
 * @return {Object} Plantilla guardada o {error}
 */
function saveTemplateToSheet(template) {
  try {
    const sheetRepo = new SheetRepository();

    if (!template.id) {
      template.id = 'TPL-' + Date.now();
      template.createdAt = new Date().toISOString();
    }

    const rowData = [
      template.id,
      template.name     || '',
      template.category || '',
      JSON.stringify(template.stages || []),
      template.createdAt
    ];

    const existing = sheetRepo.findRow('Templates', template.id, 0);
    if (existing) {
      sheetRepo.updateRow('Templates', existing.rowIndex, rowData);
      Logger.log(`✅ Template actualizado: ${template.name}`);
    } else {
      sheetRepo.appendRow('Templates', rowData);
      Logger.log(`✅ Template creado: ${template.name}`);
    }

    return template;
  } catch (e) {
    Logger.log(`❌ Error en saveTemplateToSheet: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Elimina un proyecto de la hoja Projects
 * @param {string} projectId
 * @return {Object} {success: boolean}
 */
function deleteProjectFromSheet(projectId) {
  try {
    const sheetRepo = new SheetRepository();
    const existing = sheetRepo.findRow('Projects', projectId, 0);
    if (!existing) return { success: false, error: 'Project not found' };
    
    const oldProject = _deserializeProject(existing.data);
    const email = Session.getActiveUser().getEmail();
    if (oldProject.ownerEmail !== email) {
      throw new Error('Only the Project Owner can perform this action.');
    }

    sheetRepo.deleteRow('Projects', existing.rowIndex);
    Logger.log(`✅ Proyecto eliminado: ${projectId}`);
    return { success: true };
  } catch (e) {
    Logger.log(`❌ Error en deleteProjectFromSheet: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Elimina una plantilla de la hoja Templates
 * @param {string} templateId
 * @return {Object} {success: boolean}
 */
function deleteTemplateFromSheet(templateId) {
  try {
    const sheetRepo = new SheetRepository();
    const existing = sheetRepo.findRow('Templates', templateId, 0);
    if (!existing) return { success: false, error: 'Template not found' };
    sheetRepo.deleteRow('Templates', existing.rowIndex);
    Logger.log(`✅ Template eliminado: ${templateId}`);
    return { success: true };
  } catch (e) {
    Logger.log(`❌ Error en deleteTemplateFromSheet: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Guarda el estado de carpetas en la hoja Folders
 * @param {Array} folders - [{name, isOpen, order}]
 * @return {boolean}
 */
function saveFoldersToSheet(folders) {
  try {
    const sheetRepo = new SheetRepository();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Folders');
    if (!sheet) return false;

    const lastRow = sheetRepo.getLastRow('Folders');
    if (lastRow > 1) sheetRepo.clearRange('Folders', 2, lastRow - 1, 5);

    folders.forEach(f => {
      sheetRepo.appendRow('Folders', [
        f.name || '',
        '',
        f.name || '',
        '',
        new Date().toISOString()
      ]);
    });

    Logger.log(`✅ Folders guardados: ${folders.length}`);
    return true;
  } catch (e) {
    Logger.log(`❌ Error en saveFoldersToSheet: ${e.message}`);
    return false;
  }
}

// =====================================================
// GANTT & DATES
// =====================================================

/**
 * Obtiene rango de fechas del proyecto
 */
function getProjectDateRange(projectStages, bufferDays) {
  try {
    bufferDays = bufferDays || 7;
    const range = DateService.getProjectDateRange(projectStages, bufferDays);
    
    return {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      totalDays: range.totalDays
    };
  } catch (error) {
    Logger.log(`❌ Error en getProjectDateRange: ${error.message}`);
    return { error: error.toString() };
  }
}

/**
 * Genera columnas de grid para Gantt
 */
function generateGridColumns(dateRange, scale) {
  try {
    if (typeof dateRange.start === 'string') {
      dateRange.start = new Date(dateRange.start);
    }
    if (typeof dateRange.end === 'string') {
      dateRange.end = new Date(dateRange.end);
    }
    
    return GanttService.generateGridColumns(dateRange, scale);
  } catch (error) {
    Logger.log(`Error en generateGridColumns: ${error.message}`);
    return [];
  }
}

/**
 * Calcula estilo de barra Gantt
 */
function calculateGanttBarStyle(item, dateRange) {
  try {
    if (typeof dateRange.start === 'string') {
      dateRange.start = new Date(dateRange.start);
    }
    if (typeof dateRange.end === 'string') {
      dateRange.end = new Date(dateRange.end);
    }
    
    return GanttService.calculateBarStyle(item, dateRange);
  } catch (error) {
    Logger.log(`Error en calculateGanttBarStyle: ${error.message}`);
    return { display: 'none' };
  }
}

/**
 * Calcula días entre fechas
 */
function calculateDaysBetween(startDate, endDate) {
  try {
    return DateService.calculateDays(startDate, endDate);
  } catch (error) {
    Logger.log(`Error en calculateDaysBetween: ${error.message}`);
    return 0;
  }
}

// =====================================================
// GOOGLE CHAT NOTIFICATIONS
// =====================================================

/**
 * Envía notificación a Google Chat
 * El webhookUrl se obtiene desde la configuración del servidor, no del cliente
 * @param {string} message - Mensaje a enviar
 * @return {Object} {success: boolean, error?: string}
 */
function sendGoogleChatNotification(message) {
  const webhookUrl = ConfigService.getChatWebhookUrl();
  return ChatService.sendNotification(webhookUrl, message);
}

/**
 * Guarda el webhook URL de Google Chat en la configuración del servidor
 * @param {string} webhookUrl - URL del webhook
 * @return {boolean}
 */
function saveChatWebhookUrl(webhookUrl) {
  try {
    const sheetRepo = new SheetRepository();
    const configData = sheetRepo.getAllData('Configuration');
    for (let i = 0; i < configData.length; i++) {
      if (configData[i][0] === 'CHAT_WEBHOOK_URL') {
        sheetRepo.setCellValue('Configuration', i + 2, 2, webhookUrl);
        Logger.log('Webhook URL guardado');
        return true;
      }
    }
    sheetRepo.appendRow('Configuration', ['CHAT_WEBHOOK_URL', webhookUrl]);
    Logger.log('Webhook URL creado');
    return true;
  } catch (e) {
    Logger.log(`Error en saveChatWebhookUrl: ${e.message}`);
    return false;
  }
}

// =====================================================
// GOOGLE DRIVE
// =====================================================

/**
 * Obtiene contenido de carpeta en Drive
 */
function getDriveContents(folderId) {
  try {
    return DriveService.getFolderContents(folderId);
  } catch (e) {
    Logger.log(`Error en getDriveContents: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Crea subcarpeta en Drive
 */
function createDriveSubFolder(parentFolderId, name) {
  try {
    return DriveService.createSubFolder(parentFolderId, name);
  } catch (e) {
    Logger.log(`Error en createDriveSubFolder: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Sube archivo a Drive
 */
function uploadFileToDrive(parentFolderId, base64Data, filename, mimeType) {
  try {
    return DriveService.uploadFile(parentFolderId, base64Data, filename, mimeType);
  } catch (e) {
    Logger.log(`Error en uploadFileToDrive: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Elimina archivo o carpeta en Drive
 */
function deleteDriveItem(id, isFolder) {
  try {
    return DriveService.deleteItem(id, isFolder);
  } catch (e) {
    Logger.log(`Error en deleteDriveItem: ${e.message}`);
    return { error: e.message };
  }
}

// =====================================================
// USER IDENTITY
// =====================================================

/**
 * Returns the email address of the currently authenticated GAS user.
 * Used by the frontend to determine if the current user is a Project Owner,
 * enabling the manual phase-status override dropdown.
 * @return {string} User email, or empty string if unavailable.
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (e) {
    Logger.log('Could not get current user email: ' + e.message);
    return '';
  }
}

// =====================================================
// HTML TEMPLATE HELPER
// =====================================================

/**
 * Inyecta el contenido de un archivo HTML parcial dentro de un template.
 * Usado con la sintaxis <?!= include('nombre-archivo') ?> en index.html
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
