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
      // 'https://www.youtube.com/@channelname',
    ];

    for (const channelUrl of businessChannels) {
      try {
        await this.page.goto(`${channelUrl}/videos`, { waitUntil: 'networkidle2' });
        await randomDelay(3000, 6000);
        
        // Get recent videos
        const videoLinks = await this.page.$$eval(
          '#video-title-link', 
          links => links.slice(0, 5).map(link => link.href)
        );
        
        // Scan comments on recent videos
        for (const videoUrl of videoLinks) {
          await this.scanVideoComments(posts, videoUrl);
          await randomDelay(10000, 20000); // Longer delay between videos
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
      await this.page.waitForSelector('#comments #contents', { timeout: 10000 });
      
      // Extract comments
      const comments = await this.page.evaluate((videoUrl) => {
        const commentElements = document.querySelectorAll('#comments #contents ytd-comment-thread-renderer');
        const posts = [];
        
        commentElements.forEach((element, index) => {
          if (index >= 20) return; // Limit to first 20 comments
          
          try {
            const contentElement = element.querySelector('#content-text');
            if (!contentElement) return;
            
            const content = contentElement.innerText?.trim();
            if (!content || content.length < 15) return;
            
            // Skip promotional comments
            if (content.toLowerCase().includes('check out my') ||
                content.toLowerCase().includes('subscribe to') ||
                content.toLowerCase().includes('click here')) {
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