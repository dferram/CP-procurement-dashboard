/**
 * ConfigService.gs
 * Responsabilidad única: Gestionar configuración del sistema
 * Aísla acceso a datos de configuración
 */

class ConfigService {
  /**
   * Obtiene el siguiente ID de proyecto
   * @return {string} "PRJ-001", "PRJ-002", etc.
   */
  static getNextProjectId() {
    try {
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');
      
      for (let i = 0; i < configData.length; i++) {
        if (configData[i][0] === "NEXT_PRJ_ID") {
          let currentId = parseInt(configData[i][1], 10) || 1;
          // Actualizar contador
          const rowIndex = i + 2; // +2 porque removemos headers
          sheetRepo.setCellValue('Configuration', rowIndex, 2, currentId + 1);
          return "PRJ-" + String(currentId).padStart(3, '0');
        }
      }
      return "PRJ-XXX";
    } catch (e) {
      Logger.log(`❌ Error en getNextProjectId: ${e.message}`);
      return "PRJ-XXX";
    }
  }

  /**
   * Obtiene ID de carpeta raíz de Google Drive
   * @return {string} ID de carpeta o null
   */
  static getRootDriveId() {
    try {
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');
      
      for (let i = 0; i < configData.length; i++) {
        if (configData[i][0] === "DRIVE_ROOT_FOLDER_ID") {
          return configData[i][1];
        }
      }
      return null;
    } catch (e) {
      Logger.log(`❌ Error en getRootDriveId: ${e.message}`);
      return null;
    }
  }

  /**
   * Obtiene configuración completa (CP Team, External Team, Suggestions)
   * @return {Object} {cpTeam, externalTeam, suggestions}
   */
  static getFullConfig() {
    try {
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');
      
      const config = { cpTeam: [], externalTeam: [], suggestions: [] };
      
      configData.forEach(row => {
        if (row[0] === "CP_TEAM") {
          try { config.cpTeam = JSON.parse(row[1]); } catch(e) {}
        }
        if (row[0] === "EXTERNAL_TEAM") {
          try { config.externalTeam = JSON.parse(row[1]); } catch(e) {}
        }
        if (row[0] === "SUGGESTIONS") {
          try { config.suggestions = JSON.parse(row[1]); } catch(e) {}
        }
      });
      
      return config;
    } catch (e) {
      Logger.log(`❌ Error en getFullConfig: ${e.message}`);
      return { cpTeam: [], externalTeam: [], suggestions: [] };
    }
  }

  /**
   * Guarda configuración
   * @param {Object} configObj - {cpTeam, externalTeam, suggestions}
   * @return {boolean}
   */
  static saveConfig(configObj) {
    try {
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');
      
      for (let i = 0; i < configData.length; i++) {
        const rowIndex = i + 2;
        if (configData[i][0] === "CP_TEAM") {
          sheetRepo.setCellValue('Configuration', rowIndex, 2, JSON.stringify(configObj.cpTeam));
        }
        if (configData[i][0] === "EXTERNAL_TEAM") {
          sheetRepo.setCellValue('Configuration', rowIndex, 2, JSON.stringify(configObj.externalTeam));
        }
        if (configData[i][0] === "SUGGESTIONS") {
          sheetRepo.setCellValue('Configuration', rowIndex, 2, JSON.stringify(configObj.suggestions));
        }
      }
      
      Logger.log('✅ Configuración guardada');
      return true;
    } catch (e) {
      Logger.log(`❌ Error en saveConfig: ${e.message}`);
      return false;
    }
  }
}
