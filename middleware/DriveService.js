/**
 * DriveService.gs
 * Responsabilidad única: Operaciones con Google Drive
 * Aísla acceso al Drive API
 */

class DriveService {
  /**
   * Obtiene contenido de una carpeta (subcarpetas y archivos)
   * @param {string} folderId - ID de la carpeta
   * @return {Object} {folders: [], files: []}
   */
  static getFolderContents(folderId) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      const subFolders = folder.getFolders();
      const files = folder.getFiles();
      
      const result = { folders: [], files: [] };
      
      while (subFolders.hasNext()) {
        const f = subFolders.next();
        result.folders.push({
          id: f.getId(),
          name: f.getName()
        });
      }
      
      while (files.hasNext()) {
        const f = files.next();
        result.files.push({
          id: f.getId(),
          name: f.getName(),
          mimeType: f.getMimeType(),
          url: f.getUrl()
        });
      }
      
      return result;
    } catch (e) {
      Logger.log(`❌ Error en getFolderContents: ${e.message}`);
      throw new Error("No se pudo acceder a la carpeta de Drive. Verifica permisos.");
    }
  }

  /**
   * Crea una subcarpeta
   * @param {string} parentFolderId - ID de carpeta padre
   * @param {string} name - Nombre de la nueva carpeta
   * @return {Object} {success: boolean, id?: string}
   */
  static createSubFolder(parentFolderId, name) {
    try {
      const parent = DriveApp.getFolderById(parentFolderId);
      const newFolder = parent.createFolder(name);
      Logger.log(`✅ Subcarpeta creada: ${name}`);
      return { success: true, id: newFolder.getId() };
    } catch (e) {
      Logger.log(`❌ Error en createSubFolder: ${e.message}`);
      throw new Error("Error al crear carpeta: " + e.message);
    }
  }

  /**
   * Crea carpeta de proyecto automáticamente
   * @param {string} projectCode - Código del proyecto
   * @param {string} projectTitle - Título del proyecto
   * @return {Object} {success: boolean, id?: string, error?: string}
   */
  static createProjectFolder(projectCode, projectTitle) {
    try {
      const rootId = ConfigService.getRootDriveId();
      if (!rootId || rootId === "PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
        throw new Error("Google Drive root folder ID no configurado");
      }
      
      const rootFolder = DriveApp.getFolderById(rootId);
      const newFolder = rootFolder.createFolder(`${projectCode} - ${projectTitle}`);
      
      // Crear subcarpetas estándar
      newFolder.createFolder("1. Briefings & Specs");
      newFolder.createFolder("2. CAD & Designs");
      newFolder.createFolder("3. Approvals");
      
      Logger.log(`Carpeta de proyecto creada: ${projectCode}`);
      return { success: true, id: newFolder.getId() };
    } catch (e) {
      Logger.log(`Error en createProjectFolder: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Sube archivo a Drive
   * @param {string} parentFolderId - ID de carpeta destino
   * @param {string} base64Data - Datos del archivo en base64
   * @param {string} filename - Nombre del archivo
   * @param {string} mimeType - Tipo MIME del archivo
   * @return {Object} {success: boolean, id?: string, url?: string}
   */
  static uploadFile(parentFolderId, base64Data, filename, mimeType) {
    try {
      if (!base64Data) throw new Error("base64Data está vacío o es inválido");
      const parent = DriveApp.getFolderById(parentFolderId);
      const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      if (!data) throw new Error("No se pudo extraer datos base64 del archivo");
      const blob = Utilities.newBlob(
        Utilities.base64Decode(data),
        mimeType,
        filename
      );
      const file = parent.createFile(blob);
      
      Logger.log(`Archivo subido: ${filename}`);
      return {
        success: true,
        id: file.getId(),
        url: file.getUrl()
      };
    } catch (e) {
      Logger.log(`Error en uploadFile: ${e.message}`);
      throw new Error("Error al subir archivo: " + e.message);
    }
  }

  /**
   * Elimina archivo o carpeta en Drive
   * @param {string} id - ID del archivo o carpeta
   * @param {boolean} isFolder - True si es carpeta, false si es archivo
   * @return {Object} {success: boolean}
   */
  static deleteItem(id, isFolder) {
    try {
      if (isFolder) {
        DriveApp.getFolderById(id).setTrashed(true);
        Logger.log(`Carpeta eliminada: ${id}`);
      } else {
        DriveApp.getFileById(id).setTrashed(true);
        Logger.log(`Archivo eliminado: ${id}`);
      }
      return { success: true };
    } catch (e) {
      Logger.log(`Error en deleteItem: ${e.message}`);
      throw new Error("Error al eliminar: " + e.message);
    }
  }
}
