/**
 * Frontend Service for AI Hazard Analysis
 * This calls our backend proxy instead of Google directly to keep API keys secure.
 */
export const geminiService = {
  analyzeHazards: async (productDescription: string) => {
    if (!productDescription || productDescription.trim().length < 10) {
      throw new Error("Please provide a more detailed product description (minimum 10 characters).");
    }

    try {
      const response = await fetch('/api/analyze-hazards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productDescription }),
      });

      if (!response.ok) {
        // Handle the "Unexpected end of JSON input" by checking response validity first
        const errorData = await response.json().catch(() => ({ error: 'Server returned a non-JSON error.' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error("HACCP AI Service Error:", error);
      throw new Error(error.message || "Could not connect to the AI analysis service.");
    }
  }
};
