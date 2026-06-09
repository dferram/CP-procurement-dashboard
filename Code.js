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
 * Crea todas las hojas necesarias
 */
function setupDatabase() {
  try {
    const sheetRepo = new SheetRepository();
    
    // Crear hojas si no existen
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ['Projects', 'Templates', 'Folders', 'Configuration'];
    
    sheets.forEach(sheetName => {
      if (!ss.getSheetByName(sheetName)) {
        Logger.log(`📝 Creando hoja: ${sheetName}`);
        // Las hojas se crearán cuando se usen
      }
    });
    
    Logger.log('✅ Base de datos inicializada');
    return { success: true, message: 'Database initialized' };
  } catch (e) {
    Logger.log(`❌ Error en setupDatabase: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// =====================================================
// DATA MANAGEMENT
// =====================================================

/**
 * Obtiene todos los datos de la aplicación
 */
function getAppData() {
  try {
    const sheetRepo = new SheetRepository();
    
    const payload = {
      projects: sheetRepo.getAllData('Projects'),
      templates: sheetRepo.getAllData('Templates'),
      folders: sheetRepo.getAllData('Folders'),
      config: ConfigService.getFullConfig()
    };
    
    Logger.log(`✅ App data retrieved: ${payload.projects.length} projects`);
    return payload;
  } catch (e) {
    Logger.log(`❌ Error en getAppData: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * Guarda un proyecto
 */
function saveProject(project) {
  try {
    // Crear carpeta en Drive si no existe
    if (!project.driveFolderId) {
      const driveResult = DriveService.createProjectFolder(project.code, project.title);
      if (driveResult.success) {
        project.driveFolderId = driveResult.id;
      }
    }
    
    const sheetRepo = new SheetRepository();
    Logger.log(`✅ Proyecto guardado: ${project.title}`);
    return project;
  } catch (e) {
    Logger.log(`❌ Error en saveProject: ${e.message}`);
    return { error: e.message };
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
    Logger.log(`❌ Error en generateGridColumns: ${error.message}`);
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
    Logger.log(`❌ Error en calculateGanttBarStyle: ${error.message}`);
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
    Logger.log(`❌ Error en calculateDaysBetween: ${error.message}`);
    return 0;
  }
}

// =====================================================
// GOOGLE CHAT NOTIFICATIONS
// =====================================================

/**
 * Envía notificación a Google Chat
 */
function sendGoogleChatNotification(webhookUrl, message) {
  return ChatService.sendNotification(webhookUrl, message);
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
    Logger.log(`❌ Error en getDriveContents: ${e.message}`);
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
    Logger.log(`❌ Error en createDriveSubFolder: ${e.message}`);
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
    Logger.log(`❌ Error en uploadFileToDrive: ${e.message}`);
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
    Logger.log(`❌ Error en deleteDriveItem: ${e.message}`);
    return { error: e.message };
  }
}
