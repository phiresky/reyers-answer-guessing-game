import { openrouter } from '@openrouter/ai-sdk-provider'
import { streamText, generateText } from 'ai'

const ai = openrouter({
  apiKey: process.env.OPENROUTER_API_KEY || '',
})

export async function generateQuestion(prompt: string): Promise<AsyncIterable<string>> {
  const result = await streamText({
    model: ai('openai/gpt-3.5-turbo'),
    messages: [
      {
        role: 'system',
        content: `You are a creative question generator for a social guessing game. Generate interesting, thought-provoking questions based on the given prompt. The questions should:
        
        1. Be open-ended and allow for creative, personal answers
        2. Be engaging and fun for friends to discuss
        3. Encourage answers that are about 1 sentence long but can be shorter or longer
        4. Be appropriate for all audiences
        5. Make people think about hypothetical scenarios, preferences, or creative ideas
        
        Generate exactly ONE question. Do not include any prefixes, suffixes, or explanations - just the question itself.`,
      },
      {
        role: 'user',
        content: `Generate a question based on this theme: "${prompt}"`,
      },
    ],
    temperature: 0.9,
  })

  return result.textStream
}

export async function rateGuess(originalAnswer: string, guess: string, question: string): Promise<number> {
  const result = await generateText({
    model: ai('openai/gpt-3.5-turbo'),
    messages: [
      {
        role: 'system',
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
        role: 'user',
        content: `Question: "${question}"

Original Answer: "${originalAnswer}"
Guess: "${guess}"

Rate this guess (1-10):`,
      },
    ],
    temperature: 0.3,
  })

  const rating = parseFloat(result.text.trim())
  return isNaN(rating) ? 5 : Math.min(10, Math.max(1, rating))
}