/**
 * DateService.gs
 * Responsabilidad única: Operaciones y utilidades de fechas
 * Centraliza toda la lógica de fechas para evitar duplicación
 */

class DateService {
  /**
   * Calcula días entre dos fechas
   * @param {string} startDateStr - "YYYY-MM-DD"
   * @param {string} endDateStr - "YYYY-MM-DD"
   * @return {number} Número de días
   */
  static calculateDays(startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return 0;
    
    try {
      const start = this._parseDate(startDateStr);
      const end = this._parseDate(endDateStr);
      
      if (!start || !end) return 0;
      
      const diffMs = end - start;
      return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    } catch (e) {
      Logger.log(`❌ DateService.calculateDays error: ${e.message}`);
      return 0;
    }
  }

  /**
   * Valida si una fecha tiene formato válido
   * @param {string} dateStr - "YYYY-MM-DD"
   * @return {boolean}
   */
  static isValidDateFormat(dateStr) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;
    
    const date = this._parseDate(dateStr);
    return date !== null;
  }

  /**
   * Formatea fecha para display
   * @param {string} dateStr - "YYYY-MM-DD"
   * @return {string} "DD MMM YYYY"
   */
  static formatDate(dateStr) {
    if (!dateStr) return '';
    
    const date = this._parseDate(dateStr);
    if (!date) return dateStr;
    
    return date.toLocaleDateString('en-US', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }

  /**
   * Obtiene rango de fechas de un proyecto
   * @param {Array} stages - Array de fases del proyecto
   * @param {number} bufferDays - Días de buffer (default 7)
   * @return {Object} {start, end, totalDays}
   */
  static getProjectDateRange(stages, bufferDays = 7) {
    if (!Array.isArray(stages) || stages.length === 0) {
      return this._getDefaultDateRange();
    }

    try {
      const dates = this._extractAllDates(stages);
      
      if (dates.length === 0) {
        return this._getDefaultDateRange();
      }

      let minDate = new Date(Math.min(...dates));
      let maxDate = new Date(Math.max(...dates));

      // Aplicar buffer
      minDate = new Date(minDate.getTime() - bufferDays * 24 * 60 * 60 * 1000);
      maxDate = new Date(maxDate.getTime() + bufferDays * 24 * 60 * 60 * 1000);

      const totalDays = Math.max(1, Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)));

      return { 
        start: minDate, 
        end: maxDate, 
        totalDays: totalDays 
      };
    } catch (e) {
      Logger.log(`❌ DateService.getProjectDateRange error: ${e.message}`);
      return this._getDefaultDateRange();
    }
  }

  /**
   * Obtiene rango de fechas por defecto
   * @private
   */
  static _getDefaultDateRange() {
    const today = new Date();
    const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      start: today,
      end: future,
      totalDays: 30
    };
  }

  /**
   * Extrae todas las fechas de stages
   * @private
   */
  static _extractAllDates(stages) {
    const dates = [];

    stages.forEach(stage => {
      if (stage.startDate && this.isValidDateFormat(stage.startDate)) {
        const date = this._parseDate(stage.startDate);
        if (date) dates.push(date.getTime());
      }
      if (stage.endDate && this.isValidDateFormat(stage.endDate)) {
        const date = this._parseDate(stage.endDate);
        if (date) dates.push(date.getTime());
      }

      if (stage.tasks && Array.isArray(stage.tasks)) {
        stage.tasks.forEach(task => {
          if (task.startDate && this.isValidDateFormat(task.startDate)) {
            const date = this._parseDate(task.startDate);
            if (date) dates.push(date.getTime());
          }
          if (task.endDate && this.isValidDateFormat(task.endDate)) {
            const date = this._parseDate(task.endDate);
            if (date) dates.push(date.getTime());
          }
        });
      }
    });

    return dates;
  }

  /**
   * Parsea una fecha string a Date object
   * Maneja timezone correctamente
   * @private
   */
  static _parseDate(dateStr) {
    try {
      const date = new Date(dateStr + 'T00:00:00Z');
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      return null;
    }
  }

  /**
   * Compara dos fechas
   * @param {string} date1 - "YYYY-MM-DD"
   * @param {string} date2 - "YYYY-MM-DD"
   * @return {number} -1 si date1 < date2, 0 si iguales, 1 si date1 > date2
   */
  static compareDates(date1, date2) {
    const d1 = this._parseDate(date1);
    const d2 = this._parseDate(date2);
    
    if (!d1 || !d2) return 0;
    
    if (d1 < d2) return -1;
    if (d1 > d2) return 1;
    return 0;
  }
}
