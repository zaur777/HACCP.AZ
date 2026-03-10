import { GoogleGenAI, Type } from "@google/genai";

export const geminiService = {
  analyzeHazards: async (productDescription: string) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("AI Analysis is currently unavailable (API key missing).");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `As a food safety expert, analyze the following product description and suggest potential biological, chemical, and physical hazards for a HACCP plan.
        
        Product Description: ${productDescription}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description: "The type of hazard (Biological, Chemical, or Physical)",
                },
                hazard: {
                  type: Type.STRING,
                  description: "A brief description of the hazard",
                },
                control_measure: {
                  type: Type.STRING,
                  description: "A brief description of the control measure",
                }
              },
              required: ["type", "hazard", "control_measure"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from AI");
      }
      return JSON.parse(text);
    } catch (error: any) {
      console.error("Gemini Service Error:", error);
      throw error;
    }
  }
};
