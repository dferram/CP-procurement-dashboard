/**
 * ChatService.gs
 * Responsabilidad única: Enviar notificaciones a Google Chat
 * Aísla integración con Google Chat API
 */

class ChatService {
  /**
   * Envía una notificación a Google Chat
   * @param {string} webhookUrl - URL del webhook de Google Chat
   * @param {string} message - Mensaje a enviar
   * @return {Object} {success: boolean, error?: string}
   */
  static sendNotification(webhookUrl, message) {
    if (!webhookUrl || webhookUrl.trim() === '') {
      return { success: false, error: "No webhook URL provided" };
    }
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: message }),
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(webhookUrl, options);
      const code = response.getResponseCode();
      
      if (code >= 200 && code < 300) {
        Logger.log(`Notificación enviada: ${message.substring(0, 50)}...`);
        return { success: true };
      } else {
        Logger.log(`Google Chat response: ${response.getContentText()}`);
        return { success: false, error: response.getContentText() };
      }
    } catch (e) {
      Logger.log(`Error en sendNotification: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * Envía notificación formateada cuando se crea un proyecto
   * @param {string} webhookUrl - URL del webhook
   * @param {Object} project - Objeto del proyecto
   * @return {Object} {success: boolean}
   */
  static notifyProjectCreated(webhookUrl, project) {
    const message = `Nuevo proyecto creado:\n*${project.title}* (${project.code})\nCategoría: ${project.category || 'Sin categoría'}`;
    return this.sendNotification(webhookUrl, message);
  }

  /**
   * Envía notificación de alerta
   * @param {string} webhookUrl - URL del webhook
   * @param {string} projectTitle - Título del proyecto
   * @param {string} alertMessage - Mensaje de alerta
   * @return {Object} {success: boolean}
   */
  static notifyAlert(webhookUrl, projectTitle, alertMessage) {
    const message = `ALERTA en *${projectTitle}*:\n${alertMessage}`;
    return this.sendNotification(webhookUrl, message);
  }

  /**
   * Envía notificación de fase completada
   * @param {string} webhookUrl - URL del webhook
   * @param {string} projectTitle - Título del proyecto
   * @param {string} stageName - Nombre de la fase
   * @return {Object} {success: boolean}
   */
  static notifyStageCompleted(webhookUrl, projectTitle, stageName) {
    const message = `Fase completada en *${projectTitle}*:\n${stageName}`;
    return this.sendNotification(webhookUrl, message);
  }
}
