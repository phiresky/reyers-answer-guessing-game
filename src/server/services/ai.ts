import { streamText, generateText } from "ai";
import { anthropic as ai } from "@ai-sdk/anthropic";

const model = process.env.ANTHROPIC_MODEL!;
if (!model)
  throw new Error(
    "ANTHROPIC_MODEL environment variable is not set. Please set it to the desired model name."
  );

export async function generateQuestion(
  prompt: string,
  previousQuestions: string[] = []
): Promise<AsyncIterable<string>> {
  const result = await streamText({
    model: ai(model),
    messages: [
      {
        role: "system",
        content: `You are a creative question generator for a social guessing game. Generate interesting, thought-provoking questions based on the given prompt. The questions should:
        
        1. Be open-ended and allow for creative, personal answers
        2. Be engaging and fun for friends to discuss
        3. Encourage answers that are about 1 sentence long but can be shorter or longer
        4. Be appropriate for all audiences
        5. Make people think about hypothetical scenarios, preferences, or creative ideas
        6. Be DIFFERENT from any previously asked questions in this game session
        
        Generate exactly ONE question. Do not include any prefixes, suffixes, or explanations - just the question itself.`,
      },
      {
        role: "user",
        content: `Generate a question based on this theme: "${prompt}"${
          previousQuestions.length > 0
            ? `\n\nPrevious questions already asked in this game (make sure your new question is different):\n${previousQuestions
                .map((q, i) => `${i + 1}. ${q}`)
                .join('\n')}`
            : ''
        }`,
      },
    ],
    temperature: 0.9,
  });

  return result.textStream;
}

export async function rateGuess(
  originalAnswer: string,
  guess: string,
  question: string
): Promise<number> {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI rating timeout')), 30000) // 30 second timeout
    })

    const ratingPromise = generateText({
      model: ai(model),
      messages: [
        {
          role: "system",
          content: `You are an AI judge for a social guessing game. Players answer questions, then try to guess what other players answered.

Your job is to rate how well a guess matches the original answer on a scale of 1-10:

1-2: Completely wrong, no similarity
3-4: Some slight connection but mostly wrong
5-6: Partially correct, captures some essence
7-8: Very close, captures most of the meaning
9-10: Excellent match, essentially the same idea

Consider:
- Semantic similarity (same meaning in different words)
- Key concepts and themes
- Overall intent and sentiment
- Don't penalize for minor wording differences
- Reward creative interpretations that capture the spirit

Respond with ONLY a number from 1-10, nothing else.`,
        },
        {
          role: "user",
          content: `Question: "${question}"

Original Answer: "${originalAnswer}"
Guess: "${guess}"

Rate this guess (1-10):`,
        },
      ],
      temperature: 0.3,
    })

    const result = await Promise.race([ratingPromise, timeoutPromise])
    const rating = parseFloat(result.text.trim())
    return isNaN(rating) ? 5 : Math.min(10, Math.max(1, rating))
  } catch (error) {
    console.error('Failed to rate guess:', error)
    // Return default rating if AI fails or times out
    return 5
  }
}
