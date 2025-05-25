const puppeteer = require('puppeteer');
const UserAgent = require('user-agents');
const logger = require('../utils/logger');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.userAgent = new UserAgent({ deviceCategory: 'desktop' });
  }

  async initialize() {
    logger.info('Initializing browser...');
    
    try {
      this.browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-translate',
          '--disable-device-discovery-notifications',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--window-size=1366,768'
        ],
        defaultViewport: {
          width: 1366,
          height: 768
        },
        timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000
      });

      logger.info('Browser initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async createPage() {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    
    // Set random user agent
    await page.setUserAgent(this.userAgent.toString());
    
    // Set viewport
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
    // Add random mouse movements
    await page.evaluateOnNewDocument(() => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'mousemove') {
          const wrappedListener = function(event) {
            // Add slight randomness to mouse events
            event.clientX += Math.random() * 2 - 1;
            event.clientY += Math.random() * 2 - 1;
            return listener.call(this, event);
          };
          return originalAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    });

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
    });
  }

  getBrowser() {
    return this.browser;
  }

  async cleanup() {
    if (this.browser) {
      logger.info('Closing browser...');
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = BrowserManager;