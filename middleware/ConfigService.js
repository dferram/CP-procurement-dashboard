/**
 * ConfigService.gs
 * Responsabilidad única: Gestionar configuración del sistema
 * Aísla acceso a datos de configuración
 */

class ConfigService {
  /**
   * Obtiene el siguiente ID de proyecto
   * Usa LockService para evitar IDs duplicados en acceso concurrente
   * @return {string} "PRJ-001", "PRJ-002", etc.
   */
  static getNextProjectId() {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');

      for (let i = 0; i < configData.length; i++) {
        if (configData[i][0] === "NEXT_PRJ_ID") {
          const currentId = parseInt(configData[i][1], 10) || 1;
          const rowIndex = i + 2;
          sheetRepo.setCellValue('Configuration', rowIndex, 2, currentId + 1);
          return "PRJ-" + String(currentId).padStart(3, '0');
        }
      }
      return "PRJ-XXX";
    } catch (e) {
      Logger.log(`Error en getNextProjectId: ${e.message}`);
      return "PRJ-XXX";
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Obtiene ID de carpeta raíz de Google Drive
   * @return {string} ID de carpeta o null
   */
  static getRootDriveId() {
    return ConfigService._getConfigValue("DRIVE_ROOT_FOLDER_ID");
  }

  /**
   * Obtiene URL del webhook de Google Chat desde configuración del servidor
   * @return {string} URL del webhook o cadena vacía
   */
  static getChatWebhookUrl() {
    return ConfigService._getConfigValue("CHAT_WEBHOOK_URL") || '';
  }

  /**
   * Obtiene un valor de configuración por clave
   * @private
   * @param {string} key - Clave a buscar en la hoja Configuration
   * @return {string|null}
   */
  static _getConfigValue(key) {
    try {
      const sheetRepo = new SheetRepository();
      const configData = sheetRepo.getAllData('Configuration');
      for (let i = 0; i < configData.length; i++) {
        if (configData[i][0] === key) return configData[i][1];
      }
      return null;
    } catch (e) {
      Logger.log(`Error en _getConfigValue(${key}): ${e.message}`);
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

      const config = { cpTeam: [], externalTeam: [], suggestions: [], dashboardWidgets: null };

      configData.forEach(row => {
        if (row[0] === "CP_TEAM") {
          try { config.cpTeam = JSON.parse(row[1]); }
          catch (e) { Logger.log(`Error al parsear CP_TEAM: ${e.message}`); }
        }
        if (row[0] === "EXTERNAL_TEAM") {
          try { config.externalTeam = JSON.parse(row[1]); }
          catch (e) { Logger.log(`Error al parsear EXTERNAL_TEAM: ${e.message}`); }
        }
        if (row[0] === "SUGGESTIONS") {
          try { config.suggestions = JSON.parse(row[1]); }
          catch (e) { Logger.log(`Error al parsear SUGGESTIONS: ${e.message}`); }
        }
        if (row[0] === "DASHBOARD_WIDGETS") {
          config.dashboardWidgets = row[1] || null;
        }
      });

      return config;
    } catch (e) {
      Logger.log(`Error en getFullConfig: ${e.message}`);
      return { cpTeam: [], externalTeam: [], suggestions: [], dashboardWidgets: null };
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

      const updates = {
        CP_TEAM:       JSON.stringify(configObj.cpTeam       || []),
        EXTERNAL_TEAM: JSON.stringify(configObj.externalTeam || []),
        SUGGESTIONS:   JSON.stringify(configObj.suggestions  || []),
        DASHBOARD_WIDGETS: configObj.dashboardWidgets || null
      };

      for (let i = 0; i < configData.length; i++) {
        const key = configData[i][0];
        if (updates[key] !== undefined) {
          sheetRepo.setCellValue('Configuration', i + 2, 2, updates[key]);
          delete updates[key];
        }
      }

      // Añadir claves nuevas que no existían
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined && updates[key] !== null) {
          sheetRepo.appendRow('Configuration', [key, updates[key]]);
        }
      });

      Logger.log('Configuración guardada');
      return true;
    } catch (e) {
      Logger.log(`Error en saveConfig: ${e.message}`);
      return false;
    }
  }
}
