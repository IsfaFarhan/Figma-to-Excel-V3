
import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedCopy } from "../types";

export const extractCopywritingFromText = async (ocrText: string): Promise<ExtractedCopy> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    The following is raw OCR (Optical Character Recognition) text extracted from a Figma screen. 
    The text might be slightly scrambled, contain minor recognition errors, or be out of order.

    YOUR TASK:
    1. CLEAN: Fix obvious typos or OCR artifacts.
    2. RESTRUCTURE: Organize the text into a logical UI hierarchy (Headers, Body, Buttons, Modals, etc.).
    3. PRESERVE COPY: Ensure all original copywriting is present.
    4. FORMATTING: Use Markdown (e.g., # for sections, - for items) to make the structure clear.

    RAW OCR TEXT:
    """
    ${ocrText}
    """

    Return the cleaned and structured copywriting in the 'remark' field.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            remark: { 
              type: Type.STRING, 
              description: "The cleaned and logically structured copywriting derived from the OCR text." 
            },
          },
          required: ["remark"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      remark: result.remark || "Processing failed or no meaningful text found in OCR.",
    };
  } catch (error) {
    console.error("Gemini OCR Processing Error:", error);
    throw error;
  }
};
