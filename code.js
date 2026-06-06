/**
 * ProjectTracker - Backend de Google Apps Script
 * Full Relational Google Sheets & Google Drive Integration.
 */
// Obtiene las paginas de sheets y las guarda en una constante
const TAB_PROJECTS = "Projects"; 
const TAB_TEMPLATES = "Templates";
const TAB_FOLDERS = "Folders";
const TAB_CONFIG = "Configuration";
// Crea la aplicación web
function doGet() {
  return HtmlService.createTemplateFromFile('index') //Busca el archivo index del proyecto
    .evaluate() // Evalua el codigo dentro del index
    .setTitle('PackTrack - Packaging Engineering') // Titulo de la pagina
    .addMetaTag('viewport', 'width=device-width, initial-scale=1') // Adaptación a la pantalla
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Permite que se vea en paginas externas
}
// Inicia la estructura base de datos
function setupDatabase() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Da el acceso a la hoja

  // 1. Projects
  let sheetProjects = ss.getSheetByName(TAB_PROJECTS); // Busca la tabla de projectos
  if (!sheetProjects) { // Si no esta, la crea y le agrega todas las columnas necesarias, las modifica y las fija
    sheetProjects = ss.insertSheet(TAB_PROJECTS);
    const headers = ["ID", "Code", "Title", "Category", "Owner", "Folder", "CycleStatus", "FinanceVal", "Archived", "Data_JSON"];
    sheetProjects.appendRow(headers);
    sheetProjects.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1e293b").setFontColor("#ffffff");
    sheetProjects.setFrozenRows(1);
  }

  // 2. Templates
  let sheetTemplates = ss.getSheetByName(TAB_TEMPLATES); // Busca la tabla de projectos
  if (!sheetTemplates) { // Si no esta, la crea y le agrega todas las columnas necesarias, las modifica y las fija
    sheetTemplates = ss.insertSheet(TAB_TEMPLATES);
    const headers = ["ID", "Name", "Description", "Stages_JSON"];
    sheetTemplates.appendRow(headers);
    sheetTemplates.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#4f46e5").setFontColor("#ffffff");
    sheetTemplates.setFrozenRows(1);
  }

  // 3. Folders
  let sheetFolders = ss.getSheetByName(TAB_FOLDERS); // Busca la tabla de projectos
  if (!sheetFolders) { // Si no esta, la crea y le agrega todas las columnas necesarias, las modifica y las fija
    sheetFolders = ss.insertSheet(TAB_FOLDERS);
    const headers = ["FolderName", "IsOpen", "OrderIndex"];
    sheetFolders.appendRow(headers);
    sheetFolders.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f172a").setFontColor("#ffffff");
    sheetFolders.setFrozenRows(1);
    sheetFolders.getRange(2, 1, 4, 3).setValues([["Optimization", true, 0], ["Sustainability", true, 1], ["Marketing", true, 2], ["Uncategorized", true, 3]]);
  }

  // 4. Configuration
  let sheetConfig = ss.getSheetByName(TAB_CONFIG); // Busca la tabla de projectos
  if (!sheetConfig) { // Si no esta, la crea y le agrega todas las columnas necesarias, las modifica y las fija
    sheetConfig = ss.insertSheet(TAB_CONFIG);
    const headers = ["Config_Key", "Config_Value"];
    sheetConfig.appendRow(headers);
    sheetConfig.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0ea5e9").setFontColor("#ffffff");
    sheetConfig.setFrozenRows(1);
    sheetConfig.setColumnWidth(2, 400);
    
    // Default configurations
    const defaults = [
      ["NEXT_PRJ_ID", "1"],
      ["DRIVE_ROOT_FOLDER_ID", "1n8GXWCZUEgKQFDQAHNOPywKg7RuRSLEh"],
      ["CP_TEAM", JSON.stringify(["Alex S.", "Elena R.", "Sarah L."])],
      ["EXTERNAL_TEAM", JSON.stringify(["Mike T.", "Agency X"])],
      ["SUGGESTIONS", JSON.stringify([
          { title: 'INITIAL BRIEFING', icon: 'fa-clipboard-list' },
          { title: 'CAD DESIGN', icon: 'fa-pencil-ruler' },
          { title: 'PROTOTYPING', icon: 'fa-box' },
          { title: 'LAB TESTING', icon: 'fa-microscope' },
          { title: 'SUSTAINABILITY', icon: 'fa-leaf' },
          { title: 'LOGISTICS', icon: 'fa-truck' }
      ])]
    ];
    sheetConfig.getRange(2, 1, defaults.length, 2).setValues(defaults);
  }

  return "Database initialized correctly.";
}

function getAppData() { // Obtiene la base de datos 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Guarda las hojas de sheets en una constante
  if (!ss.getSheetByName(TAB_PROJECTS)) setupDatabase(); // Si no existe corre el codigo de arriba
  
  const payload = { projects: [], templates: [], folders: [], config: {} }; // Crea un objeto vacio de las hojas 

  try { // Sirve en caso de error
    // 1. Projects
    const dataP = ss.getSheetByName(TAB_PROJECTS).getDataRange().getValues(); // Guarda toda la información de la hoja project en una constante
    if (dataP.length > 1) { // Verifica si hay mas filas en las hojas
      dataP.shift(); // Elimina los encabezados
      payload.projects = dataP.map(row => { // Guarda toda la informacion obtenida en la constante previamente creada
        let parsedData = {}; // Si alguien lee esto, explique que hace este segundo try
        try { if (row[9] && row[9].toString().trim() !== "") parsedData = JSON.parse(row[9]); } catch (e) {}
        return {
          id: row[0],
          code: row[1],
          title: row[2],
          category: row[3],
          projectOwner: row[4],
          folder: row[5],
          cycleStatus: row[6],
          archived: row[8] === true || row[8] === "TRUE",
          icon: parsedData.icon || 'fa-folder-open',
          detail: parsedData.detail || '',
          reason: parsedData.reason || '',
          generalComments: parsedData.generalComments || '',
          finances: parsedData.finances || { amount: null, unit: 'none', calculated: 0 },
          driveFolderId: parsedData.driveFolderId || null,
          chatWebhook: parsedData.chatWebhook || '',
          stages: parsedData.stages || []
        };
      });
    }

    // 2. Templates
    const dataT = ss.getSheetByName(TAB_TEMPLATES).getDataRange().getValues();
    if (dataT.length > 1) {
      dataT.shift();
      payload.templates = dataT.map(row => {
        let parsedStages = [];
        try { if (row[3] && row[3].toString().trim() !== "") parsedStages = JSON.parse(row[3]); } catch (e) {}
        return { id: row[0], name: row[1], description: row[2], stages: parsedStages };
      });
    }

    // 3. Folders
    const dataF = ss.getSheetByName(TAB_FOLDERS).getDataRange().getValues();
    if (dataF.length > 1) {
      dataF.shift();
      dataF.sort((a, b) => a[2] - b[2]); 
      payload.folders = dataF.map(row => { return { name: row[0], isOpen: row[1] === true || row[1] === "TRUE" }; });
    }

    // 4. Configuration
    const dataC = ss.getSheetByName(TAB_CONFIG).getDataRange().getValues();
    dataC.shift();
    let cpTeam = [], externalTeam = [], suggestions = [];
    dataC.forEach(row => {
      if(row[0] === "CP_TEAM") try { cpTeam = JSON.parse(row[1]); } catch(e){}
      if(row[0] === "EXTERNAL_TEAM") try { externalTeam = JSON.parse(row[1]); } catch(e){}
      if(row[0] === "SUGGESTIONS") try { suggestions = JSON.parse(row[1]); } catch(e){}
    });
    payload.config = { cpTeam, externalTeam, suggestions };

    return payload;
  } catch (e) {
    throw new Error("Failed to read database state: " + e.message);
  }
}

function getNextProjectId() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_CONFIG);
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] === "NEXT_PRJ_ID") {
      let currentId = parseInt(data[i][1], 10) || 1;
      sheet.getRange(i+1, 2).setValue(currentId + 1);
      return "PRJ-" + String(currentId).padStart(3, '0');
    }
  }
  return "PRJ-XXX";
}

function getRootDriveId() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_CONFIG);
  const data = sheet.getDataRange().getValues();
  for(let i=0; i<data.length; i++) {
    if(data[i][0] === "DRIVE_ROOT_FOLDER_ID") return data[i][1];
  }
  return null;
}

function saveConfigToSheet(configObj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_CONFIG);
  const data = sheet.getDataRange().getValues();
  
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === "CP_TEAM") sheet.getRange(i+1, 2).setValue(JSON.stringify(configObj.cpTeam));
    if(data[i][0] === "EXTERNAL_TEAM") sheet.getRange(i+1, 2).setValue(JSON.stringify(configObj.externalTeam));
    if(data[i][0] === "SUGGESTIONS") sheet.getRange(i+1, 2).setValue(JSON.stringify(configObj.suggestions));
  }
  return true;
}

function saveProjectToSheet(project) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_PROJECTS);
    const data = sheet.getDataRange().getValues();
    
    if (!project.code || project.code.trim() === '') {
      project.code = getNextProjectId();
    }

    if (!project.driveFolderId) {
      const rootId = getRootDriveId();
      if (rootId && rootId !== "PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
        try {
          const rootFolder = DriveApp.getFolderById(rootId);
          const newFolder = rootFolder.createFolder(`${project.code} - ${project.title}`);
          project.driveFolderId = newFolder.getId();
          
          // Generate default subfolders
          newFolder.createFolder("1. Briefings & Specs");
          newFolder.createFolder("2. CAD & Designs");
          newFolder.createFolder("3. Approvals");
        } catch(err) {
          console.error("Drive creation failed: Check root ID permissions.", err);
        }
      }
    }
    
    const idToFind = project.id;
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === idToFind.toString()) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const jsonPayload = {
      icon: project.icon,
      detail: project.detail,
      reason: project.reason,
      generalComments: project.generalComments,
      finances: project.finances,
      driveFolderId: project.driveFolderId,
      chatWebhook: project.chatWebhook,
      stages: project.stages
    };

    const rowValues = [
      project.id,
      project.code,
      project.title,
      project.category || '',
      project.projectOwner,
      project.folder || 'Uncategorized',
      project.cycleStatus,
      project.finances ? project.finances.calculated : 0,
      project.archived,
      JSON.stringify(jsonPayload)
    ];
    
    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, 10).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    return project; 
  } catch (e) {
    throw new Error("Error saving project: " + e.message);
  }
}

function deleteProjectFromSheet(projectId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_PROJECTS);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === projectId.toString()) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, message: "ID not found" };
  } catch (e) {
    throw new Error("Error deleting project: " + e.message);
  }
}

function saveTemplateToSheet(template) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_TEMPLATES);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === template.id.toString()) {
      rowIndex = i + 1;
      break;
    }
  }
  const rowValues = [template.id, template.name, template.description, JSON.stringify(template.stages)];
  if (rowIndex !== -1) sheet.getRange(rowIndex, 1, 1, 4).setValues([rowValues]);
  else sheet.appendRow(rowValues);
  return template;
}

function deleteTemplateFromSheet(templateId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_TEMPLATES);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() === templateId.toString()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
}

function saveFoldersToSheet(foldersData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_FOLDERS);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  if (foldersData && foldersData.length > 0) {
    const rows = foldersData.map(f => [f.name, f.isOpen, f.order]);
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
}

// --- GOOGLE DRIVE API FUNCTIONS ---

function getDriveContents(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const subFolders = folder.getFolders();
    const files = folder.getFiles();
    
    const result = { folders: [], files: [] };
    while(subFolders.hasNext()) {
      let f = subFolders.next();
      result.folders.push({ id: f.getId(), name: f.getName() });
    }
    while(files.hasNext()) {
      let f = files.next();
      result.files.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType(), url: f.getUrl() });
    }
    return result;
  } catch(e) {
    throw new Error("Unable to access Drive folder. Verify permissions or ID validity.");
  }
}

function createDriveSubFolder(parentFolderId, name) {
  const parent = DriveApp.getFolderById(parentFolderId);
  parent.createFolder(name);
  return true;
}

function uploadFileToDrive(parentFolderId, base64Data, filename, mimeType) {
  const parent = DriveApp.getFolderById(parentFolderId);
  const data = base64Data.split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);
  const file = parent.createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

function deleteDriveItem(id, isFolder) {
  if(isFolder) {
    DriveApp.getFolderById(id).setTrashed(true);
  } else {
    DriveApp.getFileById(id).setTrashed(true);
  }
  return true;
}

// --- GOOGLE CHAT API NOTIFICATIONS ---

function sendGoogleChatNotification(webhookUrl, message) {
  if (!webhookUrl || webhookUrl.trim() === '') {
    return { success: false, error: "No Webhook URL provided." };
  }
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: message }),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(webhookUrl, options);
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      return { success: true };
    } else {
      return { success: false, error: response.getContentText() };
    }
  } catch(e) {
    return { success: false, error: e.message };
  }
}
