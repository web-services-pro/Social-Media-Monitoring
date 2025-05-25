const logger = require('./logger');

/**
 * Generate a random delay between min and max milliseconds
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
async function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  logger.debug(`Waiting ${delay}ms...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Type text in a human-like manner with random delays between keystrokes
 * @param {object} page - Puppeteer page object
 * @param {string} selector - CSS selector for the input element
 * @param {string} text - Text to type
 * @param {object} options - Options for typing behavior
 */
async function humanLikeTyping(page, selector, text, options = {}) {
  const {
    minDelay = 50,
    maxDelay = 150,
    clearFirst = true,
    pressTab = false
  } = options;

  try {
    // Wait for element to be available
    await page.waitForSelector(selector, { timeout: 10000 });
    
    // Click on the element to focus it
    await page.click(selector);
    await randomDelay(200, 500);
    
    // Clear existing content if requested
    if (clearFirst) {
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await randomDelay(100, 200);
    }
    
    // Type each character with human-like delays
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await page.keyboard.type(char);
      
      // Add random delay between keystrokes
      const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Occasionally add longer pauses (simulate thinking)
      if (Math.random() < 0.1) {
        await randomDelay(300, 800);
      }
    }
    
    // Press tab if requested (to move to next field)
    if (pressTab) {
      await randomDelay(200, 500);
      await page.keyboard.press('Tab');
    }
    
  } catch (error) {
    logger.error(`Failed to type in element ${selector}:`, error);
    throw error;
  }
}

/**
 * Scroll page in a human-like manner
 * @param {object} page - Puppeteer page object
 * @param {number} scrolls - Number of scroll actions
 * @param {number} distance - Distance to scroll each time
 */
async function humanLikeScroll(page, scrolls = 3, distance = 500) {
  for (let i = 0; i < scrolls; i++) {
    // Add some randomness to scroll distance
    const randomDistance = distance + (Math.random() * 200 - 100);
    
    await page.evaluate((dist) => {
      window.scrollBy({
        top: dist,
        left: 0,
        behavior: 'smooth'
      });
    }, randomDistance);
    
    // Random delay between scrolls
    await randomDelay(1000, 3000);
    
    // Occasionally scroll up a bit (simulate reading)
    if (Math.random() < 0.3) {
      await page.evaluate(() => {
        window.scrollBy({
          top: -100,
          left: 0,
          behavior: 'smooth'
        });
      });
      await randomDelay(500, 1000);
    }
  }
}

/**
 * Move mouse to element in a human-like way
 * @param {object} page - Puppeteer page object
 * @param {string} selector - CSS selector for the element
 */
async function humanLikeMouseMove(page, selector) {
  try {
    const element = await page.$(selector);
    if (!element) return;
    
    const box = await element.boundingBox();
    if (!box) return;
    
    // Get current mouse position
    const currentPosition = await page.evaluate(() => {
      return { x: window.mouseX || 0, y: window.mouseY || 0 };
    });
    
    // Calculate target position with some randomness
    const targetX = box.x + box.width / 2 + (Math.random() * 20 - 10);
    const targetY = box.y + box.height / 2 + (Math.random() * 20 - 10);
    
    // Move mouse in steps for more natural movement
    const steps = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const x = currentPosition.x + (targetX - currentPosition.x) * progress;
      const y = currentPosition.y + (targetY - currentPosition.y) * progress;
      
      await page.mouse.move(x, y);
      await randomDelay(10, 30);
    }
    
    // Update stored mouse position
    await page.evaluate((x, y) => {
      window.mouseX = x;
      window.mouseY = y;
    }, targetX, targetY);
    
  } catch (error) {
    logger.debug('Mouse move failed:', error);
  }
}

/**
 * Click element with human-like behavior
 * @param {object} page - Puppeteer page object
 * @param {string} selector - CSS selector for the element
 * @param {object} options - Click options
 */
async function humanLikeClick(page, selector, options = {}) {
  const { waitBefore = true, waitAfter = true } = options;
  
  try {
    // Wait for element
    await page.waitForSelector(selector, { timeout: 10000 });
    
    if (waitBefore) {
      await randomDelay(200, 800);
    }
    
    // Move mouse to element
    await humanLikeMouseMove(page, selector);
    await randomDelay(100, 300);
    
    // Click the element
    await page.click(selector);
    
    if (waitAfter) {
      await randomDelay(500, 1500);
    }
    
  } catch (error) {
    logger.error(`Failed to click element ${selector}:`, error);
    throw error;
  }
}

/**
 * Wait for element with retries
 * @param {object} page - Puppeteer page object
 * @param {string} selector - CSS selector for the element
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} timeout - Timeout for each retry
 */
async function waitForElementWithRetry(page, selector, maxRetries = 3, timeout = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      logger.debug(`Attempt ${i + 1} failed to find ${selector}`);
      if (i === maxRetries - 1) {
        throw error;
      }
      await randomDelay(1000, 2000);
    }
  }
}

/**
 * Extract text content from element with fallbacks
 * @param {object} page - Puppeteer page object
 * @param {string|Array} selectors - CSS selector(s) to try
 * @returns {string} Extracted text or empty string
 */
async function extractTextWithFallback(page, selectors) {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
  
  for (const selector of selectorArray) {
    try {
      const text = await page.$eval(selector, el => el.innerText?.trim() || el.textContent?.trim());
      if (text && text.length > 0) {
        return text;
      }
    } catch (error) {
      // Try next selector
      continue;
    }
  }
  
  return '';
}

/**
 * Check if element exists without throwing
 * @param {object} page - Puppeteer page object
 * @param {string} selector - CSS selector for the element
 * @returns {boolean} True if element exists
 */
async function elementExists(page, selector) {
  try {
    const element = await page.$(selector);
    return element !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get random user agent string
 * @returns {string} Random user agent
 */
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/120.0'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Sanitize text content for storage
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/[\r\n\t]/g, ' ') // Replace line breaks and tabs with space
    .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '') // Remove non-printable characters
    .trim()
    .substring(0, 2000); // Limit length
}

/**
 * Create a delay with exponential backoff
 * @param {number} attempt - Current attempt number (starting from 0)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {Promise<void>}
 */
async function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
  const finalDelay = delay + jitter;
  
  logger.debug(`Exponential backoff: attempt ${attempt + 1}, waiting ${Math.round(finalDelay)}ms`);
  return new Promise(resolve => setTimeout(resolve, finalDelay));
}

module.exports = {
  randomDelay,
  humanLikeTyping,
  humanLikeScroll,
  humanLikeMouseMove,
  humanLikeClick,
  waitForElementWithRetry,
  extractTextWithFallback,
  elementExists,
  getRandomUserAgent,
  sanitizeText,
  exponentialBackoff
};