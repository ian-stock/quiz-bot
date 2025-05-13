# Quiz Bot

A Node.js bot that automatically plays web-based quiz games using Playwright for browser automation and Ollama's Mistral model for answering questions.

## Prerequisites

1. Node.js 16 or higher
2. [Ollama](https://ollama.ai/) installed on your system
3. Mistral model pulled in Ollama

## Setup

1. Install Ollama if you haven't already:
   - Visit https://ollama.ai/
   - Download and install for your system
   - Verify installation by running `ollama list` in terminal

2. Pull the Mistral model:
```bash
ollama pull mistral
```

3. Install project dependencies:
```bash
npm install
```

4. Create a `.env` file in the root directory and add your configuration:
```
# Required variables
QUIZ_URL=https://quiz.iattend.uk/
QUIZ_EMAIL=your_email_here
QUIZ_PINCODE=your_pincode_here

# Optional variables
LOG_LEVEL=ALL_LOGS  # Options: ALL_LOGS, AI_LOGS, NO_LOGS
AI_MODEL=OLLAMA     # Options: OLLAMA, CHATGPT

# Required only if using CHATGPT model
OPENAI_API_KEY=your_api_key_here  # Required if AI_MODEL=CHATGPT
```

## Usage

1. Make sure Ollama is running on your system
2. Run the bot:
```bash
npm start
```

The bot will:
1. Open a browser window (so you can see what's happening)
2. Navigate to the quiz page
3. Log in with your credentials
4. Wait for the quiz to start (Join button)
5. For each question:
   - Read the question and options
   - Send them to Mistral for analysis
   - Click the suggested answer
   - Submit the answer
   - Move to the next question

## Debugging

- The bot creates detailed logs in both the terminal and browser console
- You can close the browser window at any time to stop the bot

## Files

- `index.js` - Main bot script
- `.env` - Configuration file (not in git)
- `package.json` - Project dependencies
- `.gitignore` - Git ignore rules

## Development

The project uses:
- Playwright for browser automation
- Ollama's Mistral model for question answering
- Node.js native fetch for Ollama API calls
- dotenv for environment variable management

## Notes

- The bot runs in headed mode so you can see what it's doing
- It will automatically clean up when you close the browser window
- Mistral runs locally, so no API keys are needed
- The quiz answers are processed completely offline 