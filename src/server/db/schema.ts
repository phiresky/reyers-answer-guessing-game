import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { createId } from '@paralleldrive/cuid2'

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  code: text('code').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  status: text('status', { enum: ['lobby', 'configuring', 'playing', 'finished'] }).notNull().default('lobby'),
  creatorId: text('creator_id').notNull(),
  currentRound: integer('current_round').notNull().default(0),
  totalRounds: integer('total_rounds').notNull().default(3),
  roundTimeLimit: integer('round_time_limit').notNull().default(120),
  initialPrompt: text('initial_prompt').notNull().default('Intriguing Hypothetical Scenarios'),
})

export const players = sqliteTable('players', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  country: text('country'),
  sessionId: text('session_id').notNull(),
  isCreator: integer('is_creator', { mode: 'boolean' }).notNull().default(false),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  status: text('status', { enum: ['online', 'away', 'offline'] }).notNull().default('online'),
  totalScore: real('total_score').notNull().default(0),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const games = sqliteTable('games', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  round: integer('round').notNull(),
  question: text('question').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['active', 'answering', 'guessing', 'rating', 'completed'] }).notNull().default('active'),
})

export const answers = sqliteTable('answers', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  answer: text('answer').notNull(),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const guesses = sqliteTable('guesses', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  guesserId: text('guesser_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  targetPlayerId: text('target_player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  guess: text('guess').notNull(),
  rating: real('rating'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  ratedAt: integer('rated_at', { mode: 'timestamp' }),
})

export type Room = typeof rooms.$inferSelect
export type NewRoom = typeof rooms.$inferInsert
export type Player = typeof players.$inferSelect
export type NewPlayer = typeof players.$inferInsert
export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert
export type Answer = typeof answers.$inferSelect
export type NewAnswer = typeof answers.$inferInsert
export type Guess = typeof guesses.$inferSelect
export type NewGuess = typeof guesses.$inferInsert