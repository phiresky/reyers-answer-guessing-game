# Multiplayer Answer Guessing Game

A social guessing game for friends to play together online. Players answer AI-generated questions and try to guess what their friends answered, with AI scoring the accuracy of guesses.

## How to Play

### 1. Join or Create a Room
- Create a new room or join an existing one with a 5-letter room code
- Share the room link with friends
- Set your name (saved in browser for future sessions)

### 2. Game Setup (Room Creator Only)
Configure game parameters:
- **Number of rounds** (default: 3)
- **Initial prompt** (default: "Intriguing Hypothetical Scenarios")  
- **Time limit per round** (default: 120 seconds)

### 3. Playing a Round
1. **Question Generation**: AI creates an interesting question based on your prompt
2. **Answer**: Write your response (aim for ~1 sentence)
3. **Guess**: Try to predict what another randomly assigned player answered
4. **Submit**: Press done when finished

### 4. Results & Scoring
- All answers and guesses are revealed
- AI rates each guess on accuracy (1-10 points)
- Players earn points equal to their rating scores
- Live leaderboard shows current standings

### 5. Game End
After all rounds, final rankings are displayed. The room creator can restart the game or return to lobby.

## Features

- **Real-time multiplayer** with live status indicators
- **Cross-device support** (desktop and mobile browsers)
- **Country flags** and connection status for each player
- **AI-powered** question generation and answer scoring
- **No registration required** - just join and play

## Technical Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Fastify + tRPC + TypeScript
- **Database**: SQLite with Drizzle ORM
- **AI**: OpenRouter AI SDK with Anthropic models
- **Real-time**: Server-Sent Events via tRPC subscriptions

## Development

### Prerequisites
- Node.js 18+
- pnpm

### Setup
```bash
# Install dependencies
pnpm install

# Setup database
pnpm db:generate
pnpm db:migrate

# Start development server
pnpm dev
```

### Available Scripts
- `pnpm dev` - Start both client and server in development mode
- `pnpm build` - Build for production
- `pnpm db:studio` - Open Drizzle Studio for database management

### Project Structure
```
src/
├── client/     # React frontend
├── server/     # Fastify backend
└── shared/     # Shared types and utilities
```

## Contributing

This is a personal project for playing with friends. Feel free to fork and customize for your own use!