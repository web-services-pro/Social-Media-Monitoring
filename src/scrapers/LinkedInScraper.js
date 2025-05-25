const BaseScraper = require('./BaseScraper');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

class LinkedInScraper extends BaseScraper {
  constructor(browser) {
    super(browser, 'linkedin');
    this.loginUrl = 'https://www.linkedin.com/login';
    this.homeUrl = 'https://www.linkedin.com/feed/';
  }

  async login() {
    const page = await this.createPage();
    
    try {
      logger.info('Logging into LinkedIn...');
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      // Fill email/username
      await page.waitForSelector('#username');
      await humanLikeTyping(page, '#username', process.env.LINKEDIN_EMAIL);
      await randomDelay(1000, 2000);

      // Fill password
      await humanLikeTyping(page, '#password', process.env.LINKEDIN_PASSWORD);
      await randomDelay(1000, 2000);

      // Click login button
      await page.click('.login__form_action_container button');
      await randomDelay(5000, 8000);

      // Wait for home page
      try {
        await page.waitForSelector('.feed-container-theme', { timeout: 15000 });
        logger.info('LinkedIn login successful');
      } catch (error) {
        // Check for verification challenge
        if (await page.$('input[name="pin"]')) {
          logger.warn('LinkedIn verification required - manual intervention needed');
          throw new Error('Verification required for LinkedIn login');
        }
        throw error;
      }

      this.page = page;
      
    } catch (error) {
      logger.error('LinkedIn login failed:', error);
      await page.close();
      throw error;
    }
  }

  async scanForPosts() {
    if (!this.page) {
      throw new Error('Not logged in to LinkedIn');
    }

    const posts = [];
    
    try {
      // Navigate to feed
      await this.page.goto(this.homeUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 6000);
      
      // Scroll and collect posts from feed
      await this.scrollAndCollectPosts(posts, 8);
      
      // Scan specific groups if configured
      await this.scanGroups(posts);
      
      return posts;
      
    } catch (error) {
      logger.error('LinkedIn post scanning failed:', error);
      return posts;
    }
  }

  async scanGroups(posts) {
    // You can customize this with specific LinkedIn group URLs
    const groupUrls = [
      // Add your LinkedIn group URLs here
      // 'https://www.linkedin.com/groups/your-group-id',
    ];

    for (const groupUrl of groupUrls) {
      try {
        await this.page.goto(groupUrl, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Navigate to discussions
        const discussionsTab = await this.page.$('a[href*="discussions"]');
        if (discussionsTab) {
          await discussionsTab.click();
          await randomDelay(2000, 4000);
        }
        
        await this.scrollAndCollectPosts(posts, 5);
        
      } catch (error) {
        logger.error(`Failed to scan LinkedIn group: ${groupUrl}`, error);
      }
    }
  }

  async scrollAndCollectPosts(posts, maxScrolls = 5) {
    let scrollCount = 0;
    
    while (scrollCount < maxScrolls) {
      try {
        // Get current posts on page
        const currentPosts = await this.page.evaluate(() => {
          const postElements = document.querySelectorAll('.feed-shared-update-v2, .occludable-update');
          const posts = [];
          
          postElements.forEach(element => {
            try {
              // Extract post content
              const contentElement = element.querySelector('.feed-shared-text') ||
                                   element.querySelector('.break-words') ||
                                   element.querySelector('[data-test-id="main-feed-activity-card__commentary"]');
              
              if (!contentElement) return;
              
              let content = contentElement.innerText?.trim();
              if (!content || content.length < 10) return;
              
              // Remove "...see more" text
              content = content.replace(/\.\.\.\s*see more$/i, '').trim();
              
              // Extract post link
              const linkElement = element.querySelector('a[href*="/feed/update/"]') ||
                                element.querySelector('.feed-shared-control-menu__trigger');
              let postLink = '';
              if (linkElement) {
                const href = linkElement.href || linkElement.getAttribute('href');
                if (href && href.includes('/feed/update/')) {
                  postLink = href.split('?')[0]; // Remove query parameters
                }
              }
              
              // Extract profile link
              const profileElement = element.querySelector('.feed-shared-actor__container a') ||
                                   element.querySelector('a[href*="/in/"]');
              const profileLink = profileElement ? profileElement.href.split('?')[0] : '';
              
              // Skip promotional or sponsored content
              if (element.querySelector('.feed-shared-header__sponsored-label') ||
                  content.toLowerCase().includes('promoted') ||
                  content.toLowerCase().includes('sponsored')) {
                return;
              }
              
              if (content && (postLink || profileLink)) {
                posts.push({
                  content,
                  link: postLink || `${profileLink}#activity`,
                  profileLink,
                  platform: 'linkedin'
                });
              }
            } catch (error) {
              console.error('Error extracting LinkedIn post:', error);
            }
          });
          
          return posts;
        });
        
        // Add new posts to collection
        for (const post of currentPosts) {
          if (!posts.find(p => p.link === post.link)) {
            posts.push(post);
          }
        }
        
        // Scroll down
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 1.5);
        });
        
        await randomDelay(4000, 7000);
        scrollCount++;
        
      } catch (error) {
        logger.error('Error during LinkedIn scroll and collect:', error);
        break;
      }
    }
  }
}

module.exports = LinkedInScraper;