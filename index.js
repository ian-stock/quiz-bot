import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['QUIZ_URL', 'QUIZ_EMAIL', 'QUIZ_PINCODE'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Helper function to log both to terminal and browser console
async function log(page, message, type = 'log') {
  console[type](message);
  await page.evaluate((msg) => console.log('[Quiz Bot]:', msg), message);
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
    await setTimeout(2000);
  } catch (error) {
    await log(page, `Error during login process: ${error.message}`, 'error');
    throw error;
  }
}

async function runQuizBot() {
  let browser;
  let page;
  try {
    // Launch the browser in headed mode
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();

    // Listen to all browser console logs
    page.on('console', msg => {
      const type = msg.type();
      console.log(`[Browser Console] ${type}: ${msg.text()}`);
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
        // Wait for the question to be visible
        await page.waitForSelector('.question', { timeout: 5000 });

        // Get the question text
        const questionText = await page.$eval('.question', el => el.textContent);

        // Get all answer options
        const options = await page.$$eval('.option', elements => 
          elements.map(el => el.textContent)
        );

        await log(page, `Question: ${questionText}`);
        await log(page, `Options: ${JSON.stringify(options)}`);

        // Get answer from Ollama
        const answerIndex = await getOllamaAnswer(questionText, options);
        
        if (answerIndex) {
          await log(page, `Ollama suggests answer: ${answerIndex}`);
          
          try {
            // Log available options for debugging
            const availableOptions = await page.$$eval('.option', elements => 
              elements.map((el, i) => `${i + 1}: ${el.textContent}`)
            );
            await log(page, `Available options: ${JSON.stringify(availableOptions)}`);
            
            // Click the corresponding answer option
            const optionSelector = `.option:nth-child(${answerIndex})`;
            await log(page, `Attempting to click option with selector: ${optionSelector}`);
            
            // Wait for the option to be clickable
            await page.waitForSelector(optionSelector, { state: 'visible', timeout: 5000 });
            await page.click(optionSelector);
            await log(page, 'Successfully clicked answer option');
            
            // Wait for and click the submit button
            const submitSelector = '#submit-button';
            await log(page, `Attempting to click submit button with selector: ${submitSelector}`);
            
            // Wait for the submit button to be clickable
            await page.waitForSelector(submitSelector, { state: 'visible', timeout: 5000 });
            await page.click(submitSelector);
            await log(page, 'Successfully clicked submit button');
            
            // Wait a bit before next question
            await setTimeout(2000);
          } catch (clickError) {
            await log(page, `Error clicking elements: ${clickError.message}`, 'error');
            // Take a screenshot for debugging
            await page.screenshot({ path: 'error-screenshot.png' });
            throw clickError;
          }
        } else {
          await log(page, 'Failed to get answer from Ollama', 'error');
        }
      } catch (error) {
        if (error.message.includes('timeout')) {
          await log(page, 'No more questions found. Quiz might be complete.');
          break;
        }
        await log(page, `Error during quiz: ${error.message}`, 'error');
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