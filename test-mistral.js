async function testMistral() {
  const testQuestion = "What is the capital of France?";
  const testOptions = [
    "London",
    "Paris",
    "Berlin",
    "Madrid"
  ];

  try {
    console.log('Testing Mistral with a sample question...\n');
    console.log('Question:', testQuestion);
    console.log('Options:', testOptions);

    const prompt = `
Question: ${testQuestion}
Options:
${testOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}

Please analyze the question and options carefully. Respond with ONLY the number (1, 2, 3, or 4) of the correct answer. Just the number, no explanation needed.`;

    console.log('\nSending to Mistral:', prompt);

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
    console.log('\nMistral response:', answer);

    const numericAnswer = parseInt(answer);
    console.log('\nParsed answer:', numericAnswer);

    if (numericAnswer === 2) {
      console.log('✅ Test passed! Mistral correctly identified Paris as the capital of France.');
    } else {
      console.log('❌ Test failed! Expected answer: 2 (Paris)');
    }
  } catch (error) {
    console.error('Error testing Mistral:', error);
  }
}

// Run the test
testMistral(); 