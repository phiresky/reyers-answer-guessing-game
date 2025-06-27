// Shared types used across client and server
export interface Game {
  id: string
  question: string
  status: 'active' | 'answering' | 'guessing' | 'rating' | 'completed'
  round: number
  roomId: string
  startedAt: string
  endedAt?: string | null
}

export interface Answer {
  id: string
  playerId: string
  answer: string
  isSubmitted: boolean
  submittedAt?: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
  gameId: string
}

export interface Guess {
  id: string
  gameId: string
  guesserId: string
  targetPlayerId: string
  guess: string
  isSubmitted: boolean
  rating?: number | null
  submittedAt?: string | Date | null
  ratedAt?: string | Date | null
  createdAt: string | Date
  updatedAt: string | Date
}

export interface Player {
  id: string
  name: string
  country?: string | null
  isCreator: boolean
  status: 'online' | 'away' | 'offline'
  lastSeen: Date | string
  totalScore: number
  isReadyForNextRound: boolean
  roomId: string
  sessionId: string
  joinedAt: string | Date
}

export interface Room {
  id: string
  code: string
  status: 'lobby' | 'configuring' | 'playing' | 'finished'
  creatorId: string
  currentRound: number
  totalRounds: number
  roundTimeLimit: number
  initialPrompt: string
  createdAt: string | Date
  updatedAt: string | Date
}

export interface GameResult {
  player?: Player
  answer: string
  guess?: string | null
  guesser?: Player | null
  rating?: number | null
  isRated: boolean
}

export interface GuessTarget {
  id: string
  name: string
}

// API Response types
export interface RoomUpdateData {
  roomId: string
  room: Room
  players: Player[]
}

export interface GameUpdateData {
  roomId: string
  game: Game
  guesses: Guess[]
  answers: Answer[]
}