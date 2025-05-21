import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { setTimeout as sleep } from 'timers/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['QUIZ_URL', 'QUIZ_EMAIL', 'QUIZ_PINCODE'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Configure logging level
const LOG_LEVELS = {
  ALL_LOGS: 'ALL_LOGS',   // Log everything
  AI_LOGS: 'AI_LOGS',     // Log only AI interactions
  NO_LOGS: 'NO_LOGS'      // Log nothing
};

// Configure AI models
const AI_MODELS = {
  OLLAMA: 'OLLAMA',
  CHATGPT: 'CHATGPT'
};

const logLevel = process.env.LOG_LEVEL || LOG_LEVELS.ALL_LOGS;
const aiModel = process.env.AI_MODEL || AI_MODELS.OLLAMA;

// Validate configurations
if (!Object.values(LOG_LEVELS).includes(logLevel)) {
  console.error(`Invalid LOG_LEVEL. Must be one of: ${Object.values(LOG_LEVELS).join(', ')}`);
  process.exit(1);
}

if (!Object.values(AI_MODELS).includes(aiModel)) {
  console.error(`Invalid AI_MODEL. Must be one of: ${Object.values(AI_MODELS).join(', ')}`);
  process.exit(1);
}

// Validate OpenAI API key if ChatGPT is selected
if (aiModel === AI_MODELS.CHATGPT && !process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required when using CHATGPT model');
  process.exit(1);
}

const execAsync = promisify(exec);

async function checkAndStartOllama() {
  try {
    // Check if Ollama is running by making a request to its API
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      console.log('✅ Ollama is running');
      // Start the llama3.2 model in the background
      exec('ollama run llama3.2 &');
      return true;
    }
  } catch (error) {
    console.log('❌ Ollama is not running, attempting to start it...');
    
    try {
      // On macOS, try to start Ollama using the app
      await execAsync('open -a Ollama');
      
      // Wait for Ollama to start (retry a few times)
      let retries = 5;
      while (retries > 0) {
        try {
          await sleep(2000); // Wait 2 seconds
          const checkResponse = await fetch('http://localhost:11434/api/tags');
          if (checkResponse.ok) {
            console.log('✅ Ollama started successfully');
            // Start the llama3.2 model in the background
            exec('ollama run llama3.2 &');
            return true;
          }
        } catch (e) {
          retries--;
          if (retries === 0) throw new Error('Failed to start Ollama after multiple attempts');
        }
      }
    } catch (startError) {
      console.error('Failed to start Ollama:', startError.message);
      console.error('Please start Ollama manually and try again');
      process.exit(1);
    }
  }
  return false;
}

// Helper function to log both to terminal and browser console
async function log(page, message, type = 'log', category = 'general') {
  // Don't log anything if NO_LOGS is set
  if (logLevel === LOG_LEVELS.NO_LOGS) {
    return;
  }

  // Only log AI-related messages if AI_LOGS is set
  if (logLevel === LOG_LEVELS.AI_LOGS && category !== 'ai') {
    return;
  }

  console[type](message);
  await page.evaluate((msg) => console.log('[Quiz Bot]:', msg), message);
}

async function getChatGPTAnswer(question, options) {
  try {
    const prompt = `
Question: ${question}
Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Please analyze the question and options carefully. Respond with ONLY the number (1, 2, 3, or 4) of the correct answer. Just the number, no explanation needed.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a quiz assistant. Respond only with the number of the correct answer (1, 2, 3, or 4). No explanation needed.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 5
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message);
    }

    const answer = data.choices[0].message.content.trim();
    return parseInt(answer);
  } catch (error) {
    console.error('Error getting answer from ChatGPT:', error);
    return null;
  }
}

async function getOllamaAnswer(question, options) {
  try {
    const prompt = `
Question: ${question}
Options:
${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Please analyze the question and options carefully. Respond with ONLY the number (1, 2, 3, or 4) of the correct answer. Just the number, no explanation needed.`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral',
        prompt: prompt,
        stream: false
      })
    });

    const data = await response.json();
    const answer = data.response.trim();
    return parseInt(answer);
  } catch (error) {
    console.error('Error getting answer from Ollama:', error);
    return null;
  }
}

async function getAIAnswer(page, question, options) {
  await log(page, `Using AI Model: ${aiModel}`, 'log', 'ai');
  await log(page, `Processing question: ${question}`, 'log', 'ai');
  await log(page, `Options: ${JSON.stringify(options)}`, 'log', 'ai');

  let answer;
  try {
    if (aiModel === AI_MODELS.CHATGPT) {
      answer = await getChatGPTAnswer(question, options);
    } else {
      answer = await getOllamaAnswer(question, options);
    }

    await log(page, `AI response: ${answer}`, 'log', 'ai');
    return answer;
  } catch (error) {
    await log(page, `Error getting AI answer: ${error.message}`, 'error', 'ai');
    return null;
  }
}

async function handleQuizLogin(page) {
  try {
    // Wait for and click the Enter button with the correct selector
    await page.waitForSelector('div.button.bg-blue div.buttonText', { timeout: 5000 });
    await page.click('div.button.bg-blue');
    await log(page, 'Clicked Enter button');

    // Wait for email input and enter email
    await page.waitForSelector('input[name="email"]', { timeout: 5000 });
    await page.fill('input[name="email"]', process.env.QUIZ_EMAIL);
    await log(page, 'Entered email');

    // Wait for pincode input and enter pincode
    await page.waitForSelector('input[name="pin"]', { timeout: 5000 });
    await page.fill('input[name="pin"]', process.env.QUIZ_PINCODE);
    await log(page, 'Entered pincode');

    // Wait for and click the Enter button again
    await page.waitForSelector('div.button.bg-blue div.buttonText', { timeout: 5000 });
    await page.click('div.button.bg-blue');
    await log(page, 'Submitted login credentials');

    // Wait a moment for the login to complete
    await sleep(2000);
  } catch (error) {
    await log(page, `Error during login process: ${error.message}`, 'error');
    throw error;
  }
}

async function waitForElementWithRetry(page, selector, options = {}) {
  const maxAttempts = 3;
  const baseTimeout = 50000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await log(page, `Attempting to find element "${selector}" (attempt ${attempt}/${maxAttempts})`);
      const element = await page.waitForSelector(selector, {
        timeout: baseTimeout * attempt,
        state: 'visible',
        ...options
      });
      if (element) {
        await log(page, `Successfully found element "${selector}" on attempt ${attempt}`);
        return element;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await log(page, `Attempt ${attempt} failed, retrying...`);
      await sleep(1000); // Wait 1 second between attempts
    }
  }
  throw new Error(`Failed to find element "${selector}" after ${maxAttempts} attempts`);
}

async function runQuizBot() {
  // Check and start Ollama before proceeding
  if (aiModel === AI_MODELS.OLLAMA) {
    await checkAndStartOllama();
  }

  let browser;
  let page;
  try {
    // Launch the browser in headed mode
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();

    // Listen to all browser console logs
    page.on('console', msg => {
      if (logLevel === LOG_LEVELS.ALL_LOGS) {
        const type = msg.type();
        console.log(`[Browser Console] ${type}: ${msg.text()}`);
      }
    });

    // Listen for page close event
    page.on('close', () => {
      console.log('Browser window was closed. Cleaning up...');
      if (browser) {
        browser.close().then(() => {
          console.log('Browser closed successfully');
          process.exit(0);
        }).catch(err => {
          console.error('Error closing browser:', err);
          process.exit(1);
        });
      }
    });

    // Navigate to the quiz page using the environment variable
    await page.goto(process.env.QUIZ_URL);
    await log(page, 'Navigated to quiz page');

    // Handle the login process
    await handleQuizLogin(page);
    await log(page, 'Login completed successfully');

    // Wait for the Join button
    await log(page, 'Waiting for quiz to start (Join button to appear)...');
    await page.waitForSelector('div.button.bg-blue div.buttonText:has-text("Join")', { timeout: 0 });
    await log(page, 'Join button found! Quiz is starting...');
    await page.click('div.button.bg-blue');
    await log(page, 'Clicked Join button');

    while (true) {
      try {
        await log(page, 'Waiting for question...', 'log', 'general');
        
        // Wait for the question pane and text to be visible with retry
        await waitForElementWithRetry(page, 'div.questionPane');
        await log(page, 'Found question pane', 'log', 'general');
        
        await waitForElementWithRetry(page, 'div.questionPane div.questionText');
        await log(page, 'Found question text element', 'log', 'general');

        // Get the question text
        const questionText = await page.$eval('div.questionPane div.questionText', el => el.textContent);
        await log(page, 'Question text extracted', 'log', 'general');

        // Debug: Log the raw question element and take screenshot
        const rawQuestion = await page.$eval('div.questionPane', el => el.outerHTML);
        await log(page, `Raw question HTML: ${rawQuestion}`, 'log', 'general');
        await page.screenshot({ path: 'debug-question.png' });

        // Wait for answer pane to be visible with retry
        await log(page, 'Waiting for answer pane...', 'log', 'general');
        await waitForElementWithRetry(page, 'div.answerPane');
        await log(page, 'Found answer pane', 'log', 'general');

        // Get all answer options
        const options = await page.$$eval('div.answerPane div.answerText', elements => {
          const texts = elements.map(el => el.textContent);
          return texts;
        });
        
        if (!options || options.length === 0) {
          throw new Error('No answer options found');
        }
        
        await log(page, `Found ${options.length} answer options`, 'log', 'general');
        await log(page, `Question: ${questionText}`, 'log', 'ai');
        await log(page, `Options: ${JSON.stringify(options)}`, 'log', 'ai');

        // Get answer from AI
        await log(page, 'Sending to AI for analysis...', 'log', 'ai');
        const answerIndex = await getAIAnswer(page, questionText, options);
        
        if (answerIndex) {
          await log(page, `AI suggests answer: ${answerIndex}`, 'log', 'ai');
          
          try {
            // Log available options for debugging
            const availableOptions = await page.$$eval('div.answerPane div.answerText', elements => 
              elements.map((el, i) => `${i + 1}: ${el.textContent}`)
            );
            await log(page, `Available options: ${JSON.stringify(availableOptions)}`, 'log', 'ai');
            
            // Click the corresponding answer option (using array index since it's 0-based)
            const optionSelector = `div.answerPane div.answer:nth-child(${answerIndex})`;
            await log(page, `Attempting to click option with selector: ${optionSelector}`);
            
            // Wait for the option to be clickable with retry
            await waitForElementWithRetry(page, optionSelector);
            await page.click(optionSelector);
            await log(page, 'Successfully clicked answer option');
            
            // Wait for and click the submit button with retry
            const submitSelector = 'div.button.bg-yellow div.buttonText:has-text("Submit")';
            await log(page, `Attempting to click submit button with selector: ${submitSelector}`);
            
            await waitForElementWithRetry(page, submitSelector);
            await page.click('div.button.bg-yellow');
            await log(page, 'Successfully clicked submit button');
            
            // Take a success screenshot
            await page.screenshot({ path: 'success-submission.png' });
            
            // Wait a bit longer before next question
            await sleep(3000);
          } catch (clickError) {
            await log(page, `Error clicking elements: ${clickError.message}`, 'error');
            await page.screenshot({ path: 'error-screenshot.png' });
            throw clickError;
          }
        } else {
          await log(page, 'Failed to get answer from AI', 'error');
        }
      } catch (error) {
        if (error.message.includes('timeout')) {
          await log(page, `Timeout error: ${error.message}`);
          await page.screenshot({ path: 'timeout-error.png' });
          
          // Additional debugging for timeout errors
          const pageContent = await page.content();
          await log(page, 'Current page content structure:');
          await log(page, pageContent.substring(0, 500) + '...'); // Log first 500 chars
          
          if (await page.$('div.questionPane')) {
            await log(page, 'Question pane exists but might not be visible');
            const html = await page.$eval('div.questionPane', el => el.outerHTML);
            await log(page, `Question pane HTML: ${html}`);
          } else {
            await log(page, 'Question pane not found in DOM');
          }
          
          // Try to recover by refreshing the page
          await log(page, 'Attempting to recover by refreshing the page...');
          await page.reload();
          await sleep(5000); // Wait 5 seconds after refresh
          continue; // Try again from the beginning
        }
        await log(page, `Error during quiz: ${error.message}`, 'error');
        await page.screenshot({ path: 'quiz-error.png' });
        break;
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (page) {
      await log(page, `Error: ${error.message}`, 'error').catch(console.error);
    }
    if (browser) {
      await browser.close().catch(console.error);
    }
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('Received SIGINT. Cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Cleaning up...');
  process.exit(0);
});

// Run the bot
runQuizBot().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}); 