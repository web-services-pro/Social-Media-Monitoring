const BaseScraper = require('./BaseScraper');
const logger = require('../utils/logger');
const { randomDelay, humanLikeTyping } = require('../utils/helpers');

class YouTubeScraper extends BaseScraper {
  constructor(browser) {
    super(browser, 'youtube');
    this.loginUrl = 'https://accounts.google.com/signin';
    this.homeUrl = 'https://www.youtube.com';
  }

  async login() {
    const page = await this.createPage();
    
    try {
      logger.info('Logging into YouTube...');
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      // Fill email
      await page.waitForSelector('#identifierId');
      await humanLikeTyping(page, '#identifierId', process.env.YOUTUBE_EMAIL);
      await randomDelay(1000, 2000);

      // Click Next
      await page.click('#identifierNext');
      await randomDelay(3000, 5000);

      // Fill password
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });
      await humanLikeTyping(page, 'input[name="password"]', process.env.YOUTUBE_PASSWORD);
      await randomDelay(1000, 2000);

      // Click Next
      await page.click('#passwordNext');
      await randomDelay(5000, 8000);

      // Navigate to YouTube
      await page.goto(this.homeUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);

      // Verify login success
      try {
        await page.waitForSelector('#avatar-btn', { timeout: 10000 });
        logger.info('YouTube login successful');
        this.isLoggedIn = true;
      } catch (error) {
        throw new Error('YouTube login verification failed');
      }

      this.page = page;
      
    } catch (error) {
      logger.error('YouTube login failed:', error);
      await page.close();
      throw error;
    }
  }

  async scanForPosts() {
    if (!this.page) {
      throw new Error('Not logged in to YouTube');
    }

    const posts = [];
    
    try {
      // Scan video comments from business/marketing channels
      await this.scanChannelVideos(posts);
      
      // Scan community posts
      await this.scanCommunityPosts(posts);
      
      return posts;
      
    } catch (error) {
      logger.error('YouTube post scanning failed:', error);
      return posts;
    }
  }

  async scanChannelVideos(posts) {
    const businessChannels = [
      // Add YouTube channel URLs for business/marketing content
      'https://www.youtube.com/@GaryVee',
      'https://www.youtube.com/@NeilPatel',
      'https://www.youtube.com/@HubSpot'
      // You can customize these with more relevant channels
    ];

    for (const channelUrl of businessChannels) {
      try {
        await this.page.goto(`${channelUrl}/videos`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Get recent videos
        const videoLinks = await this.page.$$eval(
          '#video-title-link', 
          links => links.slice(0, 3).map(link => link.href) // Reduced to 3 videos per channel
        ).catch(() => []);
        
        // Scan comments on recent videos
        for (const videoUrl of videoLinks) {
          await this.scanVideoComments(posts, videoUrl);
          await randomDelay(15000, 25000); // Longer delay between videos
        }
        
      } catch (error) {
        logger.error(`Failed to scan YouTube channel: ${channelUrl}`, error);
      }
    }
  }

  async scanVideoComments(posts, videoUrl) {
    try {
      await this.page.goto(videoUrl, { waitUntil: 'networkidle2' });
      await randomDelay(5000, 8000);
      
      // Scroll to load comments
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 3);
      });
      await randomDelay(3000, 5000);
      
      // Wait for comments to load
      try {
        await this.page.waitForSelector('#comments #contents', { timeout: 15000 });
      } catch (error) {
        logger.debug('Comments not loaded, skipping video');
        return;
      }
      
      // Extract comments
      const comments = await this.page.evaluate((videoUrl) => {
        const commentElements = document.querySelectorAll('#comments #contents ytd-comment-thread-renderer');
        const posts = [];
        
        commentElements.forEach((element, index) => {
          if (index >= 15) return; // Limit to first 15 comments
          
          try {
            const contentElement = element.querySelector('#content-text');
            if (!contentElement) return;
            
            const content = contentElement.innerText?.trim();
            if (!content || content.length < 15) return;
            
            // Skip promotional comments
            if (content.toLowerCase().includes('check out my') ||
                content.toLowerCase().includes('subscribe to') ||
                content.toLowerCase().includes('click here') ||
                content.toLowerCase().includes('follow me') ||
                content.toLowerCase().includes('dm me')) {
              return;
            }
            
            // Extract profile link
            const profileElement = element.querySelector('#author-text a');
            const profileLink = profileElement ? profileElement.href : '';
            
            posts.push({
              content,
              link: videoUrl + '#comments',
              profileLink,
              platform: 'youtube',
              type: 'comment'
            });
            
          } catch (error) {
            console.error('Error extracting YouTube comment:', error);
          }
        });
        
        return posts;
      }, videoUrl);
      
      posts.push(...comments);
      logger.debug(`Extracted ${comments.length} comments from YouTube video`);
      
    } catch (error) {
      logger.error(`Failed to scan video comments: ${videoUrl}`, error);
    }
  }

  async scanCommunityPosts(posts) {
    const businessChannels = [
      'https://www.youtube.com/@GaryVee',
      'https://www.youtube.com/@NeilPatel',
      'https://www.youtube.com/@HubSpot'
    ];

    for (const channelUrl of businessChannels) {
      try {
        await this.page.goto(`${channelUrl}/community`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Check if community tab exists
        const communityExists = await this.page.$('#contents ytd-backstage-post-thread-renderer').catch(() => null);
        if (!communityExists) {
          logger.debug(`No community posts found for channel: ${channelUrl}`);
          continue;
        }
        
        // Extract community posts
        const communityPosts = await this.page.evaluate((channelUrl) => {
          const postElements = document.querySelectorAll('#contents ytd-backstage-post-thread-renderer');
          const posts = [];
          
          postElements.forEach((element, index) => {
            if (index >= 10) return; // Limit to first 10 community posts
            
            try {
              const contentElement = element.querySelector('#content-text');
              if (!contentElement) return;
              
              const content = contentElement.innerText?.trim();
              if (!content || content.length < 20) return;
              
              // Skip promotional content
              if (content.toLowerCase().includes('new video') ||
                  content.toLowerCase().includes('subscribe') ||
                  content.toLowerCase().includes('check out')) {
                return;
              }
              
              posts.push({
                content,
                link: channelUrl + '/community',
                profileLink: channelUrl,
                platform: 'youtube',
                type: 'community_post'
              });
              
            } catch (error) {
              console.error('Error extracting YouTube community post:', error);
            }
          });
          
          return posts;
        }, channelUrl);
        
        posts.push(...communityPosts);
        logger.debug(`Extracted ${communityPosts.length} community posts from ${channelUrl}`);
        
      } catch (error) {
        logger.error(`Failed to scan community posts: ${channelUrl}`, error);
      }
    }
  }

  async scanSearchResults(posts) {
    const searchQueries = [
      'need website developer',
      'looking for marketing agency',
      'CRM software recommendations',
      'business automation tools'
    ];

    for (const query of searchQueries) {
      try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Get video results
        const videoLinks = await this.page.$$eval(
          'a#video-title',
          links => links.slice(0, 2).map(link => link.href)
        ).catch(() => []);
        
        // Scan comments on search result videos
        for (const videoUrl of videoLinks) {
          await this.scanVideoComments(posts, videoUrl);
          await randomDelay(20000, 30000); // Long delay between videos
        }
        
      } catch (error) {
        logger.error(`Failed to search YouTube for: ${query}`, error);
      }
    }
  }
}

module.exports = YouTubeScraper;
