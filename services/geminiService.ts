
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { blobToBase64 } from './audioUtils';
import { Coordinates, GroundingSource, PlanResponse, GroundingPlace } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `You are Somsri, a friendly, knowledgeable, and helpful Thai travel guide. 
Your persona is non-negotiable: you are a virtual guide who loves Thailand, its culture, food, and hidden gems.
NEVER break character. You are not a generic AI. You are Somsri.
If asked about your identity, insist you are Somsri, here to show them the beauty of Thailand.
You can speak any language the user prefers (multi-lingual), but your personality remains a warm, welcoming Thai local.
Use Thai honorifics like 'ka' (female speaker) occasionally and naturally at the end of sentences, regardless of the language being spoken.
Keep responses concise, warm, and engaging.

IMPORTANT: If you recommend a specific point of interest, tourist attraction, or restaurant, please include its coordinates at the very end of your response in this exact format: {{latitude,longitude}}. Example: {{13.7563,100.5018}}. Only do this for specific single locations, not broad cities or regions.`;

export interface ChatResponse {
  text: string;
  groundingSources?: GroundingSource[];
  location?: Coordinates;
}

export const sendMessage = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[],
  location?: Coordinates
): Promise<ChatResponse> => {
  try {
    const toolConfig: any = {};
    if (location) {
      toolConfig.retrievalConfig = {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude,
        }
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...history.map(h => ({ role: h.role, parts: h.parts })),
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
        toolConfig: toolConfig,
      }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let groundingSources: GroundingSource[] = [];

    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          groundingSources.push({ title: chunk.web.title, uri: chunk.web.uri });
        }
        if (chunk.maps?.uri && chunk.maps?.title) {
           groundingSources.push({ title: chunk.maps.title || "Google Maps", uri: chunk.maps.uri });
        }
      });
    }

    // De-duplicate
    groundingSources = groundingSources.filter((v, i, a) => a.findIndex(t => (t.uri === v.uri)) === i);

    let text = response.text || "I'm sorry, I couldn't generate a response.";
    let parsedLocation: Coordinates | undefined;

    // Parse coordinates from text response
    const coordRegex = /\{\{([\d.-]+),([\d.-]+)\}\}/;
    const match = text.match(coordRegex);
    if (match) {
      parsedLocation = {
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2])
      };
      text = text.replace(match[0], '').trim();
    }

    return {
      text,
      groundingSources,
      location: parsedLocation
    };

  } catch (error) {
    console.error("Chat error:", error);
    throw error;
  }
};

export const generatePlan = async (prompt: string): Promise<PlanResponse> => {
  try {
    // Enhanced prompt to force specific formatting for the parser and guard against injection
    const enhancedPrompt = `
    IMPORTANT FORMATTING INSTRUCTIONS:
    Structure your response as a series of specific itinerary sections.
    
    1. Start each major time block or activity with a line starting with "> " and an emoji. Example: "> 🕒 09:00 AM - Grand Palace Tour"
    2. Follow with a brief paragraph description.
    3. Then, list specific details using bullet points with bold keys EXACTLY like this:
       * **The Plan:** [Specific action]
       * **The Vibe:** [Atmosphere description]
       * **Somsri's Tip:** [Your personal advice]
       * **Review:** [A short simulated review quote]
       * **Location:** [Exact Name of the Place for Maps]
    
    End the entire plan with a line: "---DESTINATION: [City/Region Name]---"
    
    Use the Google Maps tool to verify location names.

    USER REQUEST:
    """
    ${prompt}
    """
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: enhancedPrompt,
      config: {
        systemInstruction: "You are Somsri, an expert Thai travel planner. Create detailed, visual, and structured itineraries. You MUST use the formatting requested ( > Headers, * **Key:** Value).",
        tools: [{ googleMaps: {} }],
      }
    });

    const text = response.text || "Could not generate plan.";
    
    // Parse Destination
    let destination = "";
    const destMatch = text.match(/---DESTINATION:\s*(.*?)---/);
    let cleanText = text;
    if (destMatch) {
        destination = destMatch[1].trim();
        cleanText = text.replace(destMatch[0], '').trim();
    }

    // Parse Grounding Metadata for Places
    const places: GroundingPlace[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        chunks.forEach((chunk: any) => {
            if (chunk.maps?.title && chunk.maps?.uri) {
                places.push({
                    title: chunk.maps.title,
                    uri: chunk.maps.uri,
                    placeId: chunk.maps.placeId
                });
            }
        });
    }

    return {
        text: cleanText,
        places: places,
        destination: destination
    };
  } catch (error) {
    console.error("Plan error:", error);
    throw error;
  }
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const base64Audio = await blobToBase64(audioBlob);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type,
              data: base64Audio
            }
          },
          { text: "Transcribe this audio exactly as spoken." }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned");

    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("TTS error:", error);
    throw error;
  }
};

export const summarizeConversation = async (transcript: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Summarize the following travel conversation into a concise, actionable note (max 30 words) that I can stick on my planning board. Focus on destinations, food, or tips mentioned.
      
      Transcript:
      """
      ${transcript}
      """`,
    });
    return response.text || "";
  } catch (error) {
    console.error("Summary error", error);
    return "Call summary unavailable.";
  }
}