export const geminiService = {
  analyzeHazards: async (productDescription: string) => {
    try {
      const response = await fetch('/api/analyze-hazards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDescription }),
      });

      // Fix for "Unexpected end of JSON": check status before parsing
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error("Service Error:", error);
      throw error;
    }
  }
};
