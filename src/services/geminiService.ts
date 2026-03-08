import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

export const geminiService = {
  analyzeHazards: async (productDescription: string) => {
    if (!productDescription || productDescription.trim().length < 10) {
      throw new Error("Product description is too short for meaningful analysis. Please provide more details.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing in environment");
      throw new Error("AI Analysis is currently unavailable (API key missing).");
    }

    const ai = new GoogleGenAI({ apiKey });
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `As a food safety expert, analyze the following product description and suggest potential biological, chemical, and physical hazards for a HACCP plan.
        
        Product Description: ${productDescription}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
                  description: "The control measure to prevent or eliminate the hazard",
                },
              },
              required: ["type", "hazard", "control_measure"],
            },
          },
        },
      });
      
      const text = response.text;
      if (!text) {
        throw new Error("AI returned an empty response. Please try again.");
      }

      return JSON.parse(text);
    } catch (e: any) {
      console.error("Gemini AI Analysis failed:", e);
      if (e.message?.includes("API key")) {
        throw new Error("Invalid API key. Please check your configuration.");
      }
      throw new Error(e.message || "AI Analysis failed due to a technical error.");
    }
  }
};
