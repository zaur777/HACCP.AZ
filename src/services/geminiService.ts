import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const geminiService = {
  analyzeHazards: async (productDescription: string) => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `As a food safety expert, analyze the following product description and suggest potential biological, chemical, and physical hazards for a HACCP plan. Return the response in a structured JSON format with a list of hazards, each having a 'type', 'hazard', and 'control_measure'.
      
      Product Description: ${productDescription}`,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Failed to parse Gemini response", e);
      return [];
    }
  }
};
