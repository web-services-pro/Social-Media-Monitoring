const axios = require('axios');
const logger = require('../utils/logger');

class AIAnalyzer {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'openai';
    this.threshold = parseFloat(process.env.INTENT_THRESHOLD) || 0.7;
    this.apiKey = null;
    this.baseURL = null;
    this.model = null;
  }

  async initialize() {
    logger.info(`Initializing AI Analyzer with provider: ${this.provider}`);
    
    if (this.provider === 'openai') {
      this.apiKey = process.env.OPENAI_API_KEY;
      this.baseURL = 'https://api.openai.com/v1';
      this.model = 'gpt-4o';
    } else if (this.provider === 'gemini') {
      this.apiKey = process.env.GEMINI_API_KEY;
      this.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
      this.model = 'gemini-pro';
    }

    if (!this.apiKey) {
      throw new Error(`API key not found for provider: ${this.provider}`);
    }

    logger.info('AI Analyzer initialized successfully');
  }

  async analyzeBuyerIntent(content) {
    const prompt = `
Analyze the following social media post/comment for buyer intent. Look for genuine expressions of need, frustration with current solutions, budget mentions, timeline urgency, or requests for recommendations.

GENUINE HIGH INTENT examples:
- "Our website is terrible, we need to hire someone to rebuild it"
- "Looking for a reliable CRM, our current one crashes daily"
- "Budget approved for new marketing software, need recommendations"
- "Urgent: need a web developer by next month for our launch"

FALSE INTENT examples (IGNORE these):
- "Need a website? Contact our agency today!"
- "Check out our services for all your needs"
- "DM me for quotes"
- Generic promotional content

Post/Comment to analyze:
"${content}"

Respond with a JSON object containing:
{
  "hasHighIntent": boolean,
  "intentLevel": "mild" | "moderate" | "strong" | "desperate",
  "reasoning": "explanation of your analysis",
  "keywords": ["array", "of", "relevant", "keywords"],
  "confidence": number between 0 and 1
}
`;

    try {
      let response;
      if (this.provider === 'openai') {
        response = await this.callOpenAI(prompt);
      } else if (this.provider === 'gemini') {
        response = await this.callGemini(prompt);
      }

      const analysis = JSON.parse(response);
      analysis.hasHighIntent = analysis.hasHighIntent && analysis.confidence >= this.threshold;
      
      return analysis;
      
    } catch (error) {
      logger.error('Failed to analyze buyer intent:', error);
      return {
        hasHighIntent: false,
        intentLevel: 'mild',
        reasoning: 'Analysis failed',
        keywords: [],
        confidence: 0
      };
    }
  }

  async generateResponse(originalContent, analysis) {
    const prompt = `
You are a helpful professional responding to a social media post that shows buyer intent.

Original post: "${originalContent}"
Intent analysis: ${analysis.reasoning}
Intent level: ${analysis.intentLevel}

Generate a helpful, genuine response that:
1. Acknowledges their specific pain point or need
2. Offers valuable insight or advice (not just promotion)
3. Feels natural and conversational
4. Builds trust before any sales attempt
5. Is brief but valuable (2-3 sentences max)

Context about my business: [You should customize this in the code with your business details]
- We help businesses with digital solutions
- Focus on websites, marketing automation, and business processes
- Emphasize genuine help over immediate sales

Generate a helpful response:
`;

    try {
      let response;
      if (this.provider === 'openai') {
        response = await this.callOpenAI(prompt);
      } else if (this.provider === 'gemini') {
        response = await this.callGemini(prompt);
      }

      return response.trim();
      
    } catch (error) {
      logger.error('Failed to generate response:', error);
      return 'I understand your situation and would be happy to help. Feel free to reach out if you need any advice.';
    }
  }

  async callOpenAI(prompt) {
    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  }

  async callGemini(prompt) {
    const response = await axios.post(
      `${this.baseURL}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.candidates[0].content.parts[0].text;
  }
}

module.exports = AIAnalyzer;