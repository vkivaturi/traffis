const MODEL_ID = 'Krutrim-spectre-v2';
const API_URL = 'https://cloud.olakrutrim.com/v1/chat/completions';

async function callLLM(userPrompt) {
    const llmKey = process.env.LLM_KEY;
    // Set a variable with current time in trimmed ISO format - 2025-08-09T11:18
    const now = new Date();
    // Get local time in Asia/Kolkata and format as ISO-like till minutes
    const dateTimeIndia = now.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
    
    console.log(`Current date and time for LLM: ${dateTimeIndia}`);

    // Use the current date and time in the system prompt
    const systemPrompt = "You are a traffic management assistant. Your job is to read user messages and extract relevant information about traffic incidents or events.\n" +
    "Use Hyderabad coordinates (17.385044, 78.486671 as center) and estimate appropriate coordinates based on the location details mentioned.\n" +
    "Based on the user's description of traffic incidents, generate a response which MUST follow this structure. DO NOT RESPOND WITH ANYTHING OTHER THAN THE JSON:\n " +
    "{\n" +
    "  \"latitude\": <latitude of the location being referred by the user prompt>,\n" +
    "  \"longitude\": <longitude of the location being referred by the user prompt>,\n" +
    "  \"status\": <value can be active or inactive. If user prompt indicates and ongoing issue, set status as active. If a traffic issue has been resolved, set status as inactive>,\n" +
    "}\n"
    ;
    if (!llmKey) {
        throw new Error('LLM_KEY environment variable is not set');
    }

    const requestBody = {
        model: MODEL_ID,
        messages: [
            {
                role: "system",
                content: systemPrompt
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
        
        // Extract LLM response content
        let llmContent = '';
        if (result.choices && result.choices[0] && result.choices[0].message) {
            llmContent = result.choices[0].message.content;
        }
        
        // Try to parse LLM response as JSON
        let parsedLLM;
        try {
            parsedLLM = JSON.parse(llmContent);
            console.log('Parsed LLM response:', parsedLLM);
        } catch (error) {
            throw new Error('LLM response is not valid JSON');
        }
        
        // Validate required fields
        const requiredFields = ['latitude', 'longitude', 'status'];
        for (const field of requiredFields) {
            if (!(field in parsedLLM)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        // Add timing fields
        parsedLLM.start_time = dateTimeIndia;
        const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
        parsedLLM.end_time = endTime.toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
        
        // Add notes field based on valid_notes
        parsedLLM.notes = userPrompt;

        console.log('LLM response ready for database:', parsedLLM);

        return parsedLLM;
    } catch (error) {
        console.error('Error calling LLM API:', error);
        throw error;
    }
}

module.exports = {
    callLLM,
    MODEL_ID
};