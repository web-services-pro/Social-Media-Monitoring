const BaseScraper = require('./BaseScraper');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

class RedditScraper extends BaseScraper {
  constructor(browser) {
    super(browser, 'reddit');
    this.loginUrl = 'https://www.reddit.com/login';
    this.homeUrl = 'https://www.reddit.com';
  }

  async login() {
    const page = await this.createPage();
    
    try {
      logger.info('Logging into Reddit...');
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      // Fill username
      await page.waitForSelector('#loginUsername');
      await humanLikeTyping(page, '#loginUsername', process.env.REDDIT_USERNAME);
      await randomDelay(1000, 2000);

      // Fill password
      await humanLikeTyping(page, '#loginPassword', process.env.REDDIT_PASSWORD);
      await randomDelay(1000, 2000);

      // Click login button
      await page.click('.AnimatedForm__submitButton');
      await randomDelay(5000, 8000);

      // Wait for successful login
      try {
        await page.waitForFunction(() => 
          document.querySelector('[data-testid="user-menu-button"]') !== null,
          { timeout: 15000 }
        );
        logger.info('Reddit login successful');
      } catch (error) {
        throw new Error('Reddit login verification failed');
      }

      this.page = page;
      
    } catch (error) {
      logger.error('Reddit login failed:', error);
      await page.close();
      throw error;
    }
  }

  async scanForPosts() {
    if (!this.page) {
      throw new Error('Not logged in to Reddit');
    }

    const posts = [];
    
    try {
      // Scan specific subreddits
      await this.scanSubreddits(posts);
      
      // Scan front page
      await this.scanFrontPage(posts);
      
      return posts;
      
    } catch (error) {
      logger.error('Reddit post scanning failed:', error);
      return posts;
    }
  }

  async scanSubreddits(posts) {
    const subreddits = [
      'entrepreneur',
      'smallbusiness',
      'webdev',
      'marketing',
      'startups',
      'freelance',
      'business',
      'advertising',
      'ecommerce'
      // Add more relevant subreddits
    ];

    for (const subreddit of subreddits) {
      try {
        const subredditUrl = `https://www.reddit.com/r/${subreddit}/new`;
        await this.page.goto(subredditUrl, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        await this.scrollAndCollectPosts(posts, 5);
        
      } catch (error) {
        logger.error(`Failed to scan subreddit r/${subreddit}:`, error);
      }
    }
  }

  async scanFrontPage(posts) {
    try {
      await this.page.goto(this.homeUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 6000);
      
      await this.scrollAndCollectPosts(posts, 3);
      
    } catch (error) {
      logger.error('Failed to scan Reddit front page:', error);
    }
  }

  async scrollAndCollectPosts(posts, maxScrolls = 5) {
    let scrollCount = 0;
    
    while (scrollCount < maxScrolls) {
      try {
        // Get current posts on page
        const currentPosts = await this.page.evaluate(() => {
          const postElements = document.querySelectorAll('[data-testid="post-container"]');
          const posts = [];
          
          postElements.forEach(element => {
            try {
              // Extract post title and content
              const titleElement = element.querySelector('h3[slot="title"]') ||
                                 element.querySelector('[data-testid="post-content"] h3');
              const contentElement = element.querySelector('[data-testid="post-content"] div[slot="text-body"]') ||
                                   element.querySelector('.RichTextJSON-root p');
              
              let content = '';
              if (titleElement) {
                content += titleElement.innerText?.trim() || '';
              }
              if (contentElement) {
                const bodyText = contentElement.innerText?.trim() || '';
                if (bodyText && bodyText !== content) {
                  content += (content ? ' ' : '') + bodyText;
                }
              }
              
              if (!content || content.length < 10) return;
              
              // Extract post link
              const linkElement = element.querySelector('a[data-click-id="body"]') ||
                                element.querySelector('a[slot="full-post-link"]');
              const postLink = linkElement ? linkElement.href : '';
              
              // Extract profile link
              const authorElement = element.querySelector('[data-testid="post_author_link"]') ||
                                  element.querySelector('a[href*="/user/"]');
              const profileLink = authorElement ? authorElement.href : '';
              
              // Skip promotional content
              if (element.querySelector('[data-testid="promoted-label"]') ||
                  content.toLowerCase().includes('promoted')) {
                return;
              }
              
              if (content && postLink) {
                posts.push({
                  content,
                  link: postLink,
                  profileLink,
                  platform: 'reddit'
                });
              }
            } catch (error) {
              console.error('Error extracting Reddit post:', error);
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
        
        // Also scan comments for high-intent replies
        await this.scanComments(posts);
        
        // Scroll down
        await this.page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 2);
        });
        
        await randomDelay(4000, 7000);
        scrollCount++;
        
      } catch (error) {
        logger.error('Error during Reddit scroll and collect:', error);
        break;
      }
    }
  }

  async scanComments(posts) {
    try {
      // Look for comment threads that might contain buyer intent
      const commentElements = await this.page.$$('[data-testid="comment"]');
      
      for (let i = 0; i < Math.min(commentElements.length, 10); i++) {
        try {
          const element = commentElements[i];
          
          const content = await element.$eval('[data-testid="comment-content"] p', 
            el => el.innerText?.trim()).catch(() => '');
          
          if (!content || content.length < 15) continue;
          
          const linkElement = await element.$('a').catch(() => null);
          const postLink = linkElement ? await linkElement.evaluate(el => el.href) : '';
          
          const authorElement = await element.$('[data-testid="comment_author_link"]').catch(() => null);
          const profileLink = authorElement ? await authorElement.evaluate(el => el.href) : '';
          
          if (content && postLink) {
            posts.push({
              content,
              link: postLink,
              profileLink,
              platform: 'reddit',
              type: 'comment'
            });
          }
          
        } catch (error) {
          // Skip failed comment extractions
          continue;
        }
      }
      
    } catch (error) {
      logger.debug('Comment scanning failed:', error);
    }
  }
}

module.exports = RedditScraper;