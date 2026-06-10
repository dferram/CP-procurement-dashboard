/**
 * SheetRepository.gs
 * Responsabilidad única: Acceso a datos en Google Sheets
 * Patrón: Repository Pattern (aísla acceso a datos)
 */

const SHEET_NAMES = {
  PROJECTS: "Projects",
  TEMPLATES: "Templates",
  FOLDERS: "Folders",
  CONFIG: "Configuration"
};

class SheetRepository {
  constructor() {
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }

  /**
   * Obtiene una hoja por nombre
   * @param {string} sheetName - Nombre de la hoja
   * @return {Sheet}
   */
  getSheet(sheetName) {
    let sheet = this.spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }
    return sheet;
  }

  /**
   * Obtiene todos los datos de una hoja
   * @param {string} sheetName
   * @return {Array}
   */
  getAllData(sheetName) {
    try {
      const sheet = this.getSheet(sheetName);
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        data.shift(); // Elimina headers
      }
      return data;
    } catch (e) {
      Logger.log(`Error reading ${sheetName}: ${e.message}`);
      return [];
    }
  }

  /**
   * Busca una fila por ID
   * @param {string} sheetName
   * @param {*} searchValue - Valor a buscar
   * @param {number} columnIndex - Columna donde buscar (0-based)
   * @return {Object} {rowIndex, data}
   */
  findRow(sheetName, searchValue, columnIndex = 0) {
    const data = this.getAllData(sheetName);
    for (let i = 0; i < data.length; i++) {
      if (data[i][columnIndex] && data[i][columnIndex].toString() === searchValue.toString()) {
        return { rowIndex: i + 2, data: data[i] }; // +2 porque removimos headers y las filas empiezan en 1
      }
    }
    return null;
  }

  /**
   * Inserta una fila
   * @param {string} sheetName
   * @param {Array} rowData
   */
  appendRow(sheetName, rowData) {
    const sheet = this.getSheet(sheetName);
    sheet.appendRow(rowData);
  }

  /**
   * Actualiza una fila
   * @param {string} sheetName
   * @param {number} rowIndex - Número de fila (1-based)
   * @param {Array} rowData
   */
  updateRow(sheetName, rowIndex, rowData) {
    const sheet = this.getSheet(sheetName);
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  }

  /**
   * Elimina una fila
   * @param {string} sheetName
   * @param {number} rowIndex
   */
  deleteRow(sheetName, rowIndex) {
    const sheet = this.getSheet(sheetName);
    sheet.deleteRow(rowIndex);
  }

  /**
   * Actualiza una celda específica
   * @param {string} sheetName
   * @param {number} row
   * @param {number} column
   * @param {*} value
   */
  setCellValue(sheetName, row, column, value) {
    const sheet = this.getSheet(sheetName);
    sheet.getRange(row, column).setValue(value);
  }

  /**
   * Obtiene valor de una celda
   * @param {string} sheetName
   * @param {number} row
   * @param {number} column
   * @return {*}
   */
  getCellValue(sheetName, row, column) {
    const sheet = this.getSheet(sheetName);
    return sheet.getRange(row, column).getValue();
  }

  /**
   * Limpia rango de datos
   * @param {string} sheetName
   * @param {number} startRow
   * @param {number} numRows
   * @param {number} numCols
   */
  clearRange(sheetName, startRow, numRows, numCols) {
    const sheet = this.getSheet(sheetName);
    sheet.getRange(startRow, 1, numRows, numCols).clearContent();
  }

  /**
   * Obtiene última fila con datos
   * @param {string} sheetName
   * @return {number}
   */
  getLastRow(sheetName) {
    const sheet = this.getSheet(sheetName);
    return sheet.getLastRow();
  }
}

