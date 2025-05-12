# Quiz Bot

A Node.js bot that automatically plays web-based quiz games using Playwright and ChatGPT.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Create a `.env` file in the root directory and add your configuration:
```
OPENAI_API_KEY=your_api_key_here
QUIZ_URL=your_quiz_url_here
QUIZ_EMAIL=your_email_here
QUIZ_PINCODE=your_pincode_here
```

4. Modify the `index.js` file to update:
   - The CSS selectors for questions (`.question`), options (`.option`), and submit button (`#submit-button`) to match your quiz page structure

## Usage

Run the bot:
```bash
npm start
```

The bot will:
1. Open a browser window (so you can see what's happening)
2. Navigate to the quiz page
3. For each question:
   - Read the question and options
   - Send them to ChatGPT for analysis
   - Click the suggested answer
   - Submit the answer
   - Move to the next question

## Requirements

- Node.js 16 or higher
- An OpenAI API key
- Internet connection 