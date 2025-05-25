const BaseScraper = require('./BaseScraper');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

class TwitterScraper extends BaseScraper {
  constructor(browser) {
    super(browser, 'twitter');
    this.loginUrl = 'https://x.com/i/flow/login';
    this.homeUrl = 'https://x.com/home';
  }

  async login() {
    const page = await this.createPage();
    
    try {
      logger.info('Logging into Twitter/X...');
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);

      // Fill username/email
      await page.waitForSelector('input[autocomplete="username"]');
      await humanLikeTyping(page, 'input[autocomplete="username"]', process.env.TWITTER_EMAIL);
      await randomDelay(1000, 2000);

      // Click Next
      await page.click('[role="button"]:has-text("Next")');
      await randomDelay(2000, 3000);

      // Fill password
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });
      await humanLikeTyping(page, 'input[name="password"]', process.env.TWITTER_PASSWORD);
      await randomDelay(1000, 2000);

      // Click Log in
      await page.click('[data-testid="LoginForm_Login_Button"]');
      await randomDelay(5000, 8000);

      // Wait for home timeline
      try {
        await page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 15000 });
        logger.info('Twitter login successful');
      } catch (error) {
        // Check for additional verification
        if (await page.$('input[data-testid="ocfEnterTextTextInput"]')) {
          logger.warn('Twitter additional verification required - manual intervention needed');
          throw new Error('Additional verification required for Twitter login');
        }
        throw error;
      }

      this.page = page;
      
    } catch (error) {
      logger.error('Twitter login failed:', error);
      await page.close();
      throw error;
    }
  }

  async scanForPosts() {
    if (!this.page) {
      throw new Error('Not logged in to Twitter');
    }

    const posts = [];
    
    try {
      // Navigate to home timeline
      await this.page.goto(this.homeUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 6000);
      
      // Scroll and collect tweets
      await this.scrollAndCollectPosts(posts, 10);
      
      // Scan specific searches or hashtags
      await this.scanSearches(posts);
      
      return posts;
      
    } catch (error) {
      logger.error('Twitter post scanning failed:', error);
      return posts;
    }
  }

  async scanSearches(posts) {
    const searchQueries = [
      'need website',
      'looking for developer',
      'need marketing help',
      'CRM recommendations',
      'software recommendations'
      // Add more relevant search terms
    ];

    for (const query of searchQueries) {
      try {
        // Navigate to search
        const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        await this.scrollAndCollectPosts(posts, 3);
        
      } catch (error) {
        logger.error(`Failed to search Twitter for: ${query}`, error);
      }
    }
  }

  async scrollAndCollectPosts(posts, maxScrolls = 5) {
    let scrollCount = 0;
    
    while (scrollCount < maxScrolls) {
      try {
        // Get current tweets on page
        const currentPosts = await this.page.evaluate(() => {
          const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
          const posts = [];
          
          tweetElements.forEach(element => {
            try {
              // Extract tweet content
              const contentElement = element.querySelector('[data-testid="tweetText"]');
              if (!contentElement) return;
              
              const content = contentElement.innerText?.trim();
              if (!content || content.length < 10) return;
              
              // Skip retweets and promotional content
              if (content.startsWith('RT @') || 
                  element.querySelector('[data-testid="socialContext"]')?.innerText?.includes('Promoted')) {
                return;
              }
              
              // Extract tweet link
              const timeElement = element.querySelector('time');
              const linkElement = timeElement?.parentElement;
              const postLink = linkElement ? `https://x.com${linkElement.getAttribute('href')}` : '';
              
              // Extract profile link
              const profileElement = element.querySelector('[data-testid="User-Name"] a');
              const profileLink = profileElement ? `https://x.com${profileElement.getAttribute('href')}` : '';
              
              if (content && postLink && profileLink) {
                posts.push({
                  content,
                  link: postLink,
                  profileLink,
                  platform: 'twitter'
                });
              }
            } catch (error) {
              console.error('Error extracting tweet:', error);
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
        logger.error('Error during Twitter scroll and collect:', error);
        break;
      }
    }
  }
}

module.exports = TwitterScraper;