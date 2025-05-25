const { CronJob } = require('cron');
const logger = require('./utils/logger');
const SocialMediaMonitor = require('./core/SocialMediaMonitor');
require('dotenv').config();

class Application {
  constructor() {
    this.monitor = new SocialMediaMonitor();
    this.isRunning = false;
  }

  async start() {
    logger.info('Starting Social Media Intent Monitor...');
    
    try {
      // Initialize the monitoring system
      await this.monitor.initialize();
      
      // Set up scheduled scanning (every hour by default)
      const scanInterval = process.env.SCAN_INTERVAL || 3600000; // 1 hour
      
      const job = new CronJob(
        `0 */${Math.floor(scanInterval / 3600000)} * * *`, // Convert ms to hours for cron
        () => this.runScan(),
        null,
        true,
        'America/New_York'
      );

      logger.info(`Scheduled scanning every ${scanInterval / 3600000} hour(s)`);
      
      // Run initial scan
      await this.runScan();
      
      // Keep the process alive
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  async runScan() {
    if (this.isRunning) {
      logger.warn('Scan already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scheduled scan...');
    
    try {
      const results = await this.monitor.scanAllPlatforms();
      logger.info(`Scan completed. Found ${results.totalPosts} high-intent posts across all platforms.`);
    } catch (error) {
      logger.error('Scan failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async shutdown() {
    logger.info('Shutting down application...');
    await this.monitor.cleanup();
    process.exit(0);
  }
}

// Start the application
const app = new Application();
app.start().catch(error => {
  logger.error('Application failed to start:', error);
  process.exit(1);
});