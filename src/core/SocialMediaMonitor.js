const BrowserManager = require('./BrowserManager');
const AIAnalyzer = require('./AIAnalyzer');
const GoogleSheetsManager = require('./GoogleSheetsManager');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

// Platform scrapers
const FacebookScraper = require('../scrapers/FacebookScraper');
const LinkedInScraper = require('../scrapers/LinkedInScraper');
const TwitterScraper = require('../scrapers/TwitterScraper');
const RedditScraper = require('../scrapers/RedditScraper');
const YouTubeScraper = require('../scrapers/YouTubeScraper');

class SocialMediaMonitor {
  constructor() {
    this.browserManager = new BrowserManager();
    this.aiAnalyzer = new AIAnalyzer();
    this.sheetsManager = new GoogleSheetsManager();
    this.scrapers = {};
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    logger.info('Initializing Social Media Monitor...');
    
    try {
      // Initialize browser
      await this.browserManager.initialize();
      
      // Initialize AI analyzer
      await this.aiAnalyzer.initialize();
      
      // Initialize Google Sheets
      await this.sheetsManager.initialize();
      
      // Initialize scrapers
      const browser = this.browserManager.getBrowser();
      this.scrapers = {
        facebook: new FacebookScraper(browser),
        linkedin: new LinkedInScraper(browser),
        twitter: new TwitterScraper(browser),
        reddit: new RedditScraper(browser),
        youtube: new YouTubeScraper(browser)
      };

      this.isInitialized = true;
      logger.info('Social Media Monitor initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Social Media Monitor:', error);
      throw error;
    }
  }

  async scanAllPlatforms() {
    const results = {
      totalPosts: 0,
      platformResults: {}
    };

    const platforms = ['facebook', 'linkedin', 'twitter', 'reddit', 'youtube'];
    
    for (const platform of platforms) {
      try {
        logger.info(`Starting scan for ${platform.toUpperCase()}...`);
        
        // Random delay between platforms (5-15 minutes)
        if (results.totalPosts > 0) {
          await randomDelay(300000, 900000);
        }
        
        const platformResult = await this.scanPlatform(platform);
        results.platformResults[platform] = platformResult;
        results.totalPosts += platformResult.postsFound;
        
        logger.info(`${platform.toUpperCase()} scan completed: ${platformResult.postsFound} high-intent posts found`);
        
      } catch (error) {
        logger.error(`Failed to scan ${platform}:`, error);
        results.platformResults[platform] = { postsFound: 0, error: error.message };
      }
    }

    return results;
  }

  async scanPlatform(platform) {
    const scraper = this.scrapers[platform];
    
    if (!scraper) {
      throw new Error(`Scraper not found for platform: ${platform}`);
    }

    try {
      // Login to platform
      await scraper.login();
      await randomDelay(5000, 10000);
      
      // Get posts from groups/feeds
      const posts = await scraper.scanForPosts();
      logger.info(`Found ${posts.length} posts to analyze on ${platform}`);
      
      let highIntentPosts = 0;
      
      // Analyze each post
      for (const post of posts) {
        try {
          // Add human-like delay between analyses
          await randomDelay(3000, 8000);
          
          // Analyze post for buyer intent
          const analysis = await this.aiAnalyzer.analyzeBuyerIntent(post.content);
          
          if (analysis.hasHighIntent) {
            // Generate response
            const response = await this.aiAnalyzer.generateResponse(post.content, analysis);
            
            // Save to Google Sheets
            await this.saveToSheets({
              platform,
              postLink: post.link,
              profileLink: post.profileLink,
              content: post.content,
              intentScore: analysis.intentLevel,
              generatedResponse: response,
              timestamp: new Date().toISOString()
            });
            
            highIntentPosts++;
            logger.info(`High intent post saved from ${platform}: ${analysis.intentLevel}`);
          }
          
        } catch (error) {
          logger.error(`Failed to analyze post:`, error);
        }
      }
      
      return { postsFound: highIntentPosts };
      
    } catch (error) {
      logger.error(`Platform scan failed for ${platform}:`, error);
      throw error;
    }
  }

  async saveToSheets(data) {
    try {
      await this.sheetsManager.appendRow([
        data.platform,
        data.postLink,
        data.profileLink,
        data.content,
        data.intentScore,
        data.generatedResponse,
        data.timestamp
      ]);
      
      logger.debug('Data saved to Google Sheets successfully');
      
    } catch (error) {
      logger.error('Failed to save to Google Sheets:', error);
      throw error;
    }
  }

  async cleanup() {
    logger.info('Cleaning up Social Media Monitor...');
    
    if (this.browserManager) {
      await this.browserManager.cleanup();
    }
    
    logger.info('Cleanup completed');
  }
}

module.exports = SocialMediaMonitor;