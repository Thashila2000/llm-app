'use server'

import { GoogleGenAI } from '@google/genai'

interface ChatMessageInput {
  role: 'user' | 'model';
  text: string;
  fileData?: { base64: string; mimeType: string };
}

// FIX: Added "= 'gemini-3.5-flash'" to make model optional
export async function askGemini(history: ChatMessageInput[], model: string = 'gemini-3.5-flash') {
  if (!history || history.length === 0) {
    return { error: 'Chat history cannot be empty.' };
  }

  // 1. ROUTING: If it's a Gemini model, use the native SDK
  if (model.startsWith('gemini')) {
    return await handleGoogleRequest(history, model);
  } 
  
  // 2. ROUTING: Otherwise, route to OpenRouter for all others
  return await handleOpenRouterRequest(history, model);
}

// Native Google SDK Handler
async function handleGoogleRequest(history: ChatMessageInput[], model: string) {
  if (!process.env.GEMINI_API_KEY) return { error: 'Gemini API Key missing.' };
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Find the index of the last user message that has valid file data
    let lastFileUserIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && history[i].fileData?.base64 && history[i].fileData!.base64.length > 0) {
        lastFileUserIdx = i;
        break;
      }
    }

    const contents = history.map((msg, idx) => {
      const role = msg.role === 'user' ? 'user' : 'model';
      // Only include fileData on the last user message that has a valid attachment
      const hasValidFile = idx === lastFileUserIdx && msg.fileData?.base64 && msg.fileData.base64.length > 0;

      if (hasValidFile) {
        return {
          role,
          parts: [
            { inlineData: { mimeType: msg.fileData!.mimeType, data: msg.fileData!.base64 } },
            { text: msg.text || "" }
          ]
        };
      }
      return { role, parts: [{ text: msg.text || "" }] };
    });

    const response = await ai.models.generateContent({ model, contents });
    return { text: response.text || 'No response.' };
  } catch (error: any) {
    return { error: `Gemini Error: ${error.message}` };
  }
}

// OpenRouter Handler
async function handleOpenRouterRequest(history: ChatMessageInput[], model: string) {
  if (!process.env.OPENROUTER_API_KEY) return { error: 'OpenRouter API Key missing.' };

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-domain.com', // Optional: Helps OpenRouter identify your app
      },
      body: JSON.stringify({
        model: model,
        messages: history.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text
        }))
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Unknown OpenRouter Error');
    return { text: data.choices[0].message.content };
  } catch (error: any) {
    return { error: `Model Provider Error: ${error.message}` };
  }
}