// services/wordService.ts
import wordData from "../data/words.json" with { type: "json" };
import { getAISpyWord } from "./aiService.js";

export const getGameWords = async (mode: "INFILTRATOR" | "SPY") => {
  const domains = wordData.domains;

  // Guard against empty domains array
  if (!domains || domains.length === 0) {
    throw new Error("No word domains found in JSON dataset.");
  }

  const randomDomain = domains[Math.floor(Math.random() * domains.length)];

  // Guard against undefined domain or empty words array
  if (!randomDomain || !randomDomain.words || randomDomain.words.length === 0) {
    throw new Error("Selected domain is invalid or empty.");
  }

  const entry = randomDomain.words[Math.floor(Math.random() * randomDomain.words.length)];

  // Final guard for the entry itself to satisfy the 'undefined' error
  if (!entry) {
    throw new Error("Failed to select a valid word entry.");
  }

  const secretWord = entry.word;
  let decoyWord = "";

  if (mode === "SPY") {
    // Fulfills requirement: Use AI as much as possible for word pairs
    const aiGeneratedWord = await getAISpyWord(secretWord);
    
    // Fallback: If AI fails, pick a random word from the 'similar' array in JSON
    decoyWord = aiGeneratedWord || entry.similar[Math.floor(Math.random() * entry.similar.length)] || "Secret";
  }

  return { secretWord, decoyWord };
};