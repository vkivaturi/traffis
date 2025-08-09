const MODEL_ID = 'Krutrim-spectre-v2';
const API_URL = 'https://cloud.olakrutrim.com/v1/chat/completions';

async function callLLM(userPrompt) {
    const llmKey = process.env.LLM_KEY;
    
    if (!llmKey) {
        throw new Error('LLM_KEY environment variable is not set');
    }

    const requestBody = {
        model: MODEL_ID,
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant."
            },
            {
                role: "user",
                content: userPrompt
            }
        ]
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${llmKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error calling LLM API:', error);
        throw error;
    }
}

module.exports = {
    callLLM,
    MODEL_ID
};