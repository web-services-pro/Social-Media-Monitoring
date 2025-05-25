const BaseScraper = require('./BaseScraper');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

class FacebookScraper extends BaseScraper {
  constructor(browser) {
    super(browser, 'facebook');
    this.loginUrl = 'https://www.facebook.com/login';
    this.homeUrl = 'https://www.facebook.com';
  }

  async login() {
    const page = await this.createPage();
    
    try {
      logger.info('Logging into Facebook...');
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      // Fill email
      await page.waitForSelector('#email');
      await humanLikeTyping(page, '#email', process.env.FACEBOOK_EMAIL);
      await randomDelay(1000, 2000);

      // Fill password
      await humanLikeTyping(page, '#pass', process.env.FACEBOOK_PASSWORD);
      await randomDelay(1000, 2000);

      // Click login button
      await page.click('button[name="login"]');
      await randomDelay(5000, 8000);

      // Wait for home page or handle 2FA
      try {
        await page.waitForSelector('[data-pagelet="FeedUnit_0"]', { timeout: 15000 });
        logger.info('Facebook login successful');
      } catch (error) {
        // Check if 2FA is required
        if (await page.$('input[name="approvals_code"]')) {
          logger.warn('Facebook 2FA required - manual intervention needed');
          throw new Error('2FA required for Facebook login');
        }
        throw error;
      }

      this.page = page;
      
    } catch (error) {
      logger.error('Facebook login failed:', error);
      await page.close();
      throw error;
    }
  }

  async scanForPosts() {
    if (!this.page) {
      throw new Error('Not logged in to Facebook');
    }

    const posts = [];
    
    try {
      // Navigate to groups or specific pages
      await this.scanGroups(posts);
      await randomDelay(5000, 10000);
      
      // Scan news feed
      await this.scanNewsFeed(posts);
      
      return posts;
      
    } catch (error) {
      logger.error('Facebook post scanning failed:', error);
      return posts;
    }
  }

  async scanGroups(posts) {
    // You can customize this with specific group URLs
    const groupUrls = [
      // Add your Facebook group URLs here
      // 'https://www.facebook.com/groups/your-group-id',
    ];

    for (const groupUrl of groupUrls) {
      try {
        await this.page.goto(groupUrl, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Scroll to load more posts
        await this.scrollAndCollectPosts(posts, 5);
        
      } catch (error) {
        logger.error(`Failed to scan Facebook group: ${groupUrl}`, error);
      }
    }
  }

  async scanNewsFeed(posts) {
    try {
      await this.page.goto(this.homeUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 6000);
      
      // Scroll to load more posts
      await this.scrollAndCollectPosts(posts, 10);
      
    } catch (error) {
      logger.error('Failed to scan Facebook news feed:', error);
    }
  }

  async scrollAndCollectPosts(posts, maxScrolls = 5) {
    let scrollCount = 0;
    
    while (scrollCount < maxScrolls) {
      try {
        // Get current posts on page
        const currentPosts = await this.page.evaluate(() => {
          const postElements = document.querySelectorAll('[data-pagelet^="FeedUnit_"]');
          const posts = [];
          
          postElements.forEach(element => {
            try {
              // Extract post content
              const contentElement = element.querySelector('[data-ad-preview="message"]') || 
                                   element.querySelector('[data-testid="post_message"]') ||
                                   element.querySelector('.userContent');
              
              if (!contentElement) return;
              
              const content = contentElement.innerText?.trim();
              if (!content || content.length < 10) return;
              
              // Extract post link
              const linkElement = element.querySelector('a[href*="/posts/"]') ||
                                element.querySelector('a[href*="/permalink/"]');
              const postLink = linkElement ? linkElement.href : '';
              
              // Extract profile link
              const profileElement = element.querySelector('a[data-hovercard-prefer-more-content-show]') ||
                                   element.querySelector('a[href*="/profile.php"]') ||
                                   element.querySelector('a[href*="facebook.com/"][href*="/posts/"]');
              const profileLink = profileElement ? profileElement.href.split('/posts/')[0] : '';
              
              if (content && postLink) {
                posts.push({
                  content,
                  link: postLink,
                  profileLink,
                  platform: 'facebook'
                });
              }
            } catch (error) {
              console.error('Error extracting post:', error);
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
          window.scrollBy(0, window.innerHeight * 2);
        });
        
        await randomDelay(3000, 6000);
        scrollCount++;
        
      } catch (error) {
        logger.error('Error during scroll and collect:', error);
        break;
      }
    }
  }
}

module.exports = FacebookScraper;