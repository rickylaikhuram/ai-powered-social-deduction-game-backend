import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// Initialize the Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const getAISpyWord = async (
  secretWord: string,
): Promise<string | null> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      CONTEXT: Social deduction game 'Shadow Signal'.
      SECRET WORD: "${secretWord}"
      TASK: Generate ONE single word for the 'Spy' player.
      RULES:
      1. The word must be in the same category as "${secretWord}".
      2. The word must be different from "${secretWord}".
      3. Respond with ONLY the word. 
      4. No punctuation, no quotes, no explanations.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Safety check-ensure we didn't get a sentence by mistake
    return responseText.split(/\s+/)[0] || null;
  } catch (error) {
    console.error("AI Spy Word Error:", error);
    return null;
  }
};

// Summarize clues at the end of the Speaking Phase
export const getAIHint = async (
  secretWord: string,
) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
      ROLE: You are the 'Shadow Guide' in the game Shadow Signal.
      SECRET WORD: "${secretWord}"

      TASK: Provide a new, subtle one-word hint.
      RULES:
      1. Help the Citizens identify the secret word.
      2. Stay vague enough to keep the Spy confused.
      4. Respond with ONLY the one-word hint.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    return responseText.split(/\s+/)[0] || null;
  } catch (error) {
    console.error("AI Hint Error:", error);
    return null;
  }
};
