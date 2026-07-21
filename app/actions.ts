'use server'

import { GoogleGenAI } from '@google/genai'

interface ChatMessageInput {
  role: 'user' | 'model';
  text: string;
  fileData?: { base64: string; mimeType: string };
}

export async function askGemini(history: ChatMessageInput[], model: string = 'gemini-3.5-flash') {
  if (!history || history.length === 0) {
    return { error: 'Chat history cannot be empty.' };
  }

  // OPTIMIZATION: Trim history to send only the last 8 messages to speed up response times and reduce payload limits
  const trimmedHistory = history.length > 8 ? history.slice(history.length - 8) : history;

  // 1. ROUTING: If it's a Gemini model, use the native SDK
  if (model.startsWith('gemini')) {
    return await handleGoogleRequest(trimmedHistory, model);
  } 
  
  // 2. ROUTING: Otherwise (like Poolside Laguna or OpenAI via OpenRouter), route to OpenRouter
  return await handleOpenRouterRequest(trimmedHistory, model);
}

// Native Google SDK Handler with Auto-Retry Logic for 503 Errors
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
      const hasValidFile = idx === lastFileUserIdx && msg.fileData?.base64 && msg.fileData.base64.length > 0;
      const sanitizedText = typeof msg.text === 'string' ? msg.text : '';

      if (hasValidFile) {
        return {
          role,
          parts: [
            { inlineData: { mimeType: msg.fileData!.mimeType, data: msg.fileData!.base64 } },
            { text: sanitizedText }
          ]
        };
      }
      return { role, parts: [{ text: sanitizedText }] };
    });

    // Auto-retry loop to catch temporary 503 high demand traffic spikes on Gemini
    let response;
    let retries = 3;
    let lastError: any = null;

    while (retries > 0) {
      try {
        response = await ai.models.generateContent({ model, contents });
        break;
      } catch (err: any) {
        lastError = err;
        retries--;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      }
    }

    return { text: response?.text || 'No response.' };
  } catch (error: any) {
    return { error: `Gemini Error: ${error.message || 'Service experiencing high demand or payload issue.'}` };
  }
}

// OpenRouter Handler (Supports Poolside Laguna, GPT, and other non-Gemini models)
async function handleOpenRouterRequest(history: ChatMessageInput[], model: string) {
  if (!process.env.OPENROUTER_API_KEY) return { error: 'OpenRouter API Key missing.' };

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: history.map(msg => ({
          role: msg.role === 'model' ? 'assistant' : 'user',
          content: msg.text || ''
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