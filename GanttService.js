/**
 * GanttService.gs
 * Lógica centralizada para gráficos Gantt
 * Responsabilidad única: Cálculos y renderizado de Gantt charts
 */

const GanttService = {
  /**
   * Genera columnas de grid según escala
   * @param {Object} dateRange - {start, end, totalDays}
   * @param {string} scale - 'weekly', 'monthly', 'yearly'
   * @return {Array} Etiquetas de columnas
   */
  generateGridColumns: function(dateRange, scale) {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      return ['Timeline'];
    }

    scale = (scale || 'monthly').toLowerCase();

    switch(scale) {
      case 'weekly':
        return this.generateWeeklyColumns(dateRange);
      case 'monthly':
        return this.generateMonthlyColumns(dateRange);
      case 'yearly':
        return this.generateYearlyColumns(dateRange);
      default:
        Logger.log('⚠️ Escala desconocida: ' + scale);
        return ['Timeline'];
    }
  },

  /**
   * Columnas semanales
   */
  generateWeeklyColumns: function(dateRange) {
    const columns = [];
    let weekNum = 1;
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    let current = new Date(start);

    while (current < end) {
      columns.push('W' + weekNum);
      current.setDate(current.getDate() + 7);
      weekNum++;
    }

    return columns.length > 0 ? columns : ['Timeline'];
  },

  /**
   * Columnas mensuales
   */
  generateMonthlyColumns: function(dateRange) {
    const columns = [];
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    let current = new Date(start);

    while (current < end) {
      const monthStr = current.toLocaleString('en-US', { 
        month: 'short', 
        year: '2-digit' 
      });
      columns.push(monthStr);
      current.setMonth(current.getMonth() + 1);
    }

    return columns.length > 0 ? columns : ['Timeline'];
  },

  /**
   * Columnas anuales
   */
  generateYearlyColumns: function(dateRange) {
    const columns = [];
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    let current = new Date(start);

    while (current.getFullYear() <= end.getFullYear()) {
      columns.push(current.getFullYear().toString());
      current.setFullYear(current.getFullYear() + 1);
    }

    return columns.length > 0 ? columns : ['Timeline'];
  },

  /**
   * Calcula posición y ancho de barra
   * @param {Object} item - {startDate, endDate}
   * @param {Object} dateRange - {start, end, totalDays}
   * @return {Object} {left, width, display}
   */
  calculateBarStyle: function(item, dateRange) {
    if (!item || !item.startDate || !item.endDate || !dateRange) {
      return { display: 'none' };
    }

    try {
      const start = new Date(item.startDate + 'T00:00:00Z');
      const end = new Date(item.endDate + 'T00:00:00Z');
      const rangeStart = new Date(dateRange.start);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { display: 'none' };
      }

      const totalMs = dateRange.totalDays * 24 * 60 * 60 * 1000;
      const startMs = start - rangeStart;
      const durationMs = end - start;

      let leftPct = (startMs / totalMs) * 100;
      let widthPct = (durationMs / totalMs) * 100;

      leftPct = Math.max(0, Math.min(100, leftPct));
      widthPct = Math.max(2, widthPct); // Mínimo 2% para visibilidad

      return {
        left: leftPct.toFixed(2) + '%',
        width: widthPct.toFixed(2) + '%',
        display: 'block'
      };
    } catch (e) {
      Logger.log('❌ Error en calculateBarStyle: ' + e);
      return { display: 'none' };
    }
  },

  /**
   * Valida integridad de datos
   * @param {Object} item
   * @return {Object} {isValid, errors}
   */
  validateGanttItem: function(item) {
    const errors = [];

    if (!item) {
      errors.push('Item es null o undefined');
      return { isValid: false, errors: errors };
    }

    if (!item.startDate && !item.endDate) {
      errors.push('Faltan ambas fechas');
    }

    // ✅ CORREGIDO: Usar DateService en lugar de DateUtils
    if (item.startDate && !DateService.isValidDateFormat(item.startDate)) {
      errors.push('Formato fecha inicio inválido: ' + item.startDate);
    }

    if (item.endDate && !DateService.isValidDateFormat(item.endDate)) {
      errors.push('Formato fecha fin inválido: ' + item.endDate);
    }

    if (item.startDate && item.endDate && errors.length === 0) {
      const start = new Date(item.startDate + 'T00:00:00Z');
      const end = new Date(item.endDate + 'T00:00:00Z');
      if (start > end) {
        errors.push('Fecha inicio es posterior a fecha fin');
      }
    }

    return { 
      isValid: errors.length === 0, 
      errors: errors 
    };
  }
};
