const logger = require('../utils/logger');
const { randomDelay } = require('../utils/helpers');

class BaseScraper {
  constructor(browser, platform) {
    this.browser = browser;
    this.platform = platform;
    this.page = null;
    this.isLoggedIn = false;
  }

  async createPage() {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    
    // Set random user agent
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    ];
    
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    
    // Set viewport with slight randomization
    await page.setViewport({
      width: 1366 + Math.floor(Math.random() * 100),
      height: 768 + Math.floor(Math.random() * 100)
    });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'image') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Add human-like behaviors
    await this.addHumanBehaviors(page);
    
    return page;
  }

  async addHumanBehaviors(page) {
    // Override navigator properties to appear more human
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Add some randomness to timing functions
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(callback, delay) {
        const randomDelay = delay + (Math.random() * 100 - 50);
        return originalSetTimeout.call(this, callback, Math.max(0, randomDelay));
      };
    });
  }

  async humanClick(selector, page = null) {
    const targetPage = page || this.page;
    if (!targetPage) throw new Error('No page available for clicking');

    try {
      await targetPage.waitForSelector(selector, { timeout: 10000 });
      
      // Add slight delay before clicking
      await randomDelay(500, 1500);
      
      // Move mouse to element before clicking
      const element = await targetPage.$(selector);
      const box = await element.boundingBox();
      
      if (box) {
        await targetPage.mouse.move(
          box.x + box.width / 2 + (Math.random() * 10 - 5),
          box.y + box.height / 2 + (Math.random() * 10 - 5)
        );
        await randomDelay(100, 300);
      }
      
      await targetPage.click(selector);
      
    } catch (error) {
      logger.error(`Failed to click element ${selector}:`, error);
      throw error;
    }
  }

  async humanScroll(page = null, distance = null) {
    const targetPage = page || this.page;
    if (!targetPage) throw new Error('No page available for scrolling');

    const scrollDistance = distance || (Math.random() * 800 + 400);
    
    await targetPage.evaluate((dist) => {
      window.scrollBy({
        top: dist,
        left: 0,
        behavior: 'smooth'
      });
    }, scrollDistance);
    
    await randomDelay(2000, 4000);
  }

  async waitForLoad(timeout = 30000) {
    if (!this.page) throw new Error('No page available');
    
    try {
      await this.page.waitForLoadState('networkidle', { timeout });
    } catch (error) {
      logger.warn(`Page load timeout for ${this.platform}:`, error.message);
    }
  }

  async handlePopups() {
    if (!this.page) return;

    try {
      // Common popup selectors to dismiss
      const popupSelectors = [
        'button[aria-label="Close"]',
        'button[aria-label="Dismiss"]',
        '[data-testid="xMigrationBottomBar"] button',
        '.cookie-banner button',
        '[data-cookiebanner] button',
        '.notification-banner button[aria-label="Dismiss"]'
      ];

      for (const selector of popupSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            await randomDelay(1000, 2000);
            logger.debug(`Dismissed popup: ${selector}`);
          }
        } catch (error) {
          // Ignore popup dismissal errors
        }
      }
    } catch (error) {
      logger.debug('Error handling popups:', error);
    }
  }

  async checkRateLimit() {
    if (!this.page) return false;

    try {
      // Check for common rate limiting indicators
      const rateLimitIndicators = [
        'text*="rate limit"',
        'text*="too many requests"',
        'text*="temporarily blocked"',
        'text*="try again later"'
      ];

      for (const indicator of rateLimitIndicators) {
        const element = await this.page.$(indicator);
        if (element) {
          logger.warn(`Rate limit detected on ${this.platform}`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  async cleanup() {
    if (this.page) {
      try {
        await this.page.close();
        this.page = null;
        this.isLoggedIn = false;
        logger.debug(`Cleaned up ${this.platform} scraper`);
      } catch (error) {
        logger.error(`Error cleaning up ${this.platform} scraper:`, error);
      }
    }
  }

  // Abstract methods that must be implemented by subclasses
  async login() {
    throw new Error('login() method must be implemented by subclass');
  }

  async scanForPosts() {
    throw new Error('scanForPosts() method must be implemented by subclass');
  }
}

module.exports = BaseScraper;