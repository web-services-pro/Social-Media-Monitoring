const { google } = require('googleapis');
const logger = require('../utils/logger');

class GoogleSheetsManager {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    this.auth = null;
  }

  async initialize() {
    logger.info('Initializing Google Sheets Manager...');
    
    try {
      // Create JWT auth client
      this.auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/spreadsheets']
      );

      // Authorize the client
      await this.auth.authorize();
      
      // Create sheets API instance
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      // Ensure headers exist
      await this.ensureHeaders();
      
      logger.info('Google Sheets Manager initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Google Sheets Manager:', error);
      throw error;
    }
  }

  async ensureHeaders() {
    try {
      // Check if headers already exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A1:G1'
      });

      if (!response.data.values || response.data.values.length === 0) {
        // Add headers
        const headers = [
          'Platform',
          'Post Link',
          'Profile Link', 
          'Content',
          'Intent Score',
          'Generated Response',
          'Timestamp'
        ];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: 'A1:G1',
          valueInputOption: 'RAW',
          resource: {
            values: [headers]
          }
        });

        logger.info('Headers added to Google Sheet');
      }
      
    } catch (error) {
      logger.error('Failed to ensure headers:', error);
      throw error;
    }
  }

  async appendRow(data) {
    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'A:G',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [data]
        }
      });

      logger.debug(`Row appended to Google Sheet: ${response.data.updates.updatedCells} cells updated`);
      return response.data;
      
    } catch (error) {
      logger.error('Failed to append row to Google Sheet:', error);
      throw error;
    }
  }

  async updateRow(rowIndex, data) {
    try {
      const range = `A${rowIndex}:G${rowIndex}`;
      
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [data]
        }
      });

      logger.debug(`Row ${rowIndex} updated in Google Sheet`);
      return response.data;
      
    } catch (error) {
      logger.error(`Failed to update row ${rowIndex}:`, error);
      throw error;
    }
  }

  async getLastRow() {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:A'
      });

      if (response.data.values) {
        return response.data.values.length;
      }
      
      return 1; // Only headers exist
      
    } catch (error) {
      logger.error('Failed to get last row:', error);
      return 1;
    }
  }
}

module.exports = GoogleSheetsManager;