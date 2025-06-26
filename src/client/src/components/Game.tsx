import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'
import { getSessionId } from '../utils/storage'

interface GameProps {
  roomId: string
  playerId: string
  onBackToLobby: () => void
}

interface Game {
  id: string
  question: string
  status: 'active' | 'answering' | 'guessing' | 'rating' | 'completed'
  round: number
}

interface Answer {
  id: string
  playerId: string
  answer: string
  isSubmitted: boolean
}

interface Player {
  id: string
  name: string
}

const Game: React.FC<GameProps> = ({ roomId, playerId, onBackToLobby }) => {
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [currentGuess, setCurrentGuess] = useState('')
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false)
  const [isGuessSubmitted, setIsGuessSubmitted] = useState(false)
  const [guessTargetPlayer, setGuessTargetPlayer] = useState<Player | null>(null)

  const { data: gameData } = trpc.game.getCurrentGame.useQuery(
    { roomId },
    { enabled: !!roomId }
  )

  const { data: gameAnswers } = trpc.game.getGameAnswers.useQuery(
    { gameId: currentGame?.id || '' },
    { enabled: !!currentGame && currentGame.status === 'answering' }
  )

  const { data: roomData } = trpc.room.getRoom.useQuery(
    { roomId: roomId, sessionId: getSessionId() },
    { enabled: !!roomId }
  )


  const { data: gameResults } = trpc.game.getGameResults.useQuery(
    { gameId: currentGame?.id || '' },
    { 
      enabled: !!currentGame && (currentGame.status === 'rating' || currentGame.status === 'completed'),
      refetchInterval: currentGame?.status === 'rating' ? 2000 : false,
    }
  )

  const saveAnswerMutation = trpc.game.saveAnswer.useMutation()
  const saveGuessMutation = trpc.game.saveGuess.useMutation()
  const checkProgressMutation = trpc.game.checkGameProgress.useMutation()

  trpc.game.onGameUpdate.useSubscription(
    { roomId },
    {
      enabled: !!roomId,
      onData: (data) => {
        setCurrentGame(data.game)
      },
      onError: (error) => {
        console.error('Game subscription error:', error)
      },
    }
  )

  useEffect(() => {
    if (gameData) {
      setCurrentGame(gameData)
    }
  }, [gameData])

  useEffect(() => {
    if (gameAnswers) {
      // Check if current player has submitted answer
      const myAnswer = gameAnswers.find((answer: Answer) => answer.playerId === playerId)
      if (myAnswer) {
        setCurrentAnswer(myAnswer.answer)
        setIsAnswerSubmitted(myAnswer.isSubmitted)
      }
    }
  }, [gameAnswers, playerId])

  // Assign a random guess target when player submits their answer
  useEffect(() => {
    if (isAnswerSubmitted && roomData && !guessTargetPlayer) {
      // Get other players (not self)
      const otherPlayers = roomData.players.filter(p => p.id !== playerId)
      
      if (otherPlayers.length > 0) {
        // Pick a random player to guess for
        const randomIndex = Math.floor(Math.random() * otherPlayers.length)
        const targetPlayer = otherPlayers[randomIndex]
        
        setGuessTargetPlayer({ 
          id: targetPlayer.id, 
          name: targetPlayer.name 
        })
      }
    }
  }, [isAnswerSubmitted, roomData, guessTargetPlayer, playerId])

  const handleSaveAnswer = async (submit = false) => {
    if (!currentGame || !currentAnswer.trim()) return

    try {
      await saveAnswerMutation.mutateAsync({
        gameId: currentGame.id,
        playerId,
        answer: currentAnswer.trim(),
        submit,
      })
      
      if (submit) {
        setIsAnswerSubmitted(true)
      }
      
      // Check if game should progress
      await checkProgressMutation.mutateAsync({ gameId: currentGame.id })
    } catch (error) {
      console.error('Failed to save answer:', error)
    }
  }

  const handleSaveGuess = async (submit = false) => {
    if (!currentGame || !currentGuess.trim() || !guessTargetPlayer) return

    try {
      await saveGuessMutation.mutateAsync({
        gameId: currentGame.id,
        guesserId: playerId,
        targetPlayerId: guessTargetPlayer.id,
        guess: currentGuess.trim(),
        submit,
      })
      
      if (submit) {
        setIsGuessSubmitted(true)
      }
      
      // Check if game should progress
      await checkProgressMutation.mutateAsync({ gameId: currentGame.id })
    } catch (error) {
      console.error('Failed to save guess:', error)
    }
  }

  // Auto-save drafts as user types
  useEffect(() => {
    if (currentAnswer && !isAnswerSubmitted) {
      const timer = setTimeout(() => {
        handleSaveAnswer(false)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [currentAnswer, isAnswerSubmitted])

  useEffect(() => {
    if (currentGuess && !isGuessSubmitted && guessTargetPlayer) {
      const timer = setTimeout(() => {
        handleSaveGuess(false)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [currentGuess, isGuessSubmitted, guessTargetPlayer])

  if (!currentGame) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Generating question...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto mt-8 p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Round {currentGame.round}</h1>
          <button
            onClick={onBackToLobby}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Back to Lobby
          </button>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">
            {currentGame.question}
          </h2>
        </div>

        {currentGame.status === 'answering' && (
          <div className="space-y-6">
            {/* Answer Section */}
            <div className="bg-blue-50 p-6 rounded-lg">
              <div className="flex items-center space-x-2 mb-4">
                <h3 className="text-xl font-semibold">Your Answer</h3>
                {isAnswerSubmitted && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                    ✓ Submitted
                  </span>
                )}
              </div>
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="Enter your answer (around one sentence)"
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                maxLength={500}
                disabled={isAnswerSubmitted}
              />
              <div className="flex justify-between items-center mt-4">
                <span className="text-sm text-gray-500">
                  {currentAnswer.length}/500 characters
                </span>
                {!isAnswerSubmitted && (
                  <button
                    onClick={() => handleSaveAnswer(true)}
                    disabled={!currentAnswer.trim() || saveAnswerMutation.isPending}
                    className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300"
                  >
                    {saveAnswerMutation.isPending ? 'Submitting...' : 'Submit Answer'}
                  </button>
                )}
              </div>
            </div>

            {/* Guess Section */}
            {guessTargetPlayer && (
              <div className="bg-green-50 p-6 rounded-lg">
                <div className="flex items-center space-x-2 mb-4">
                  <h3 className="text-xl font-semibold">Your Guess</h3>
                  {isGuessSubmitted && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                      ✓ Submitted
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mb-4">
                  What do you think <strong>{guessTargetPlayer.name}</strong> answered?
                </p>
                <textarea
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value)}
                  placeholder={`Enter your guess for ${guessTargetPlayer.name}'s answer...`}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  rows={3}
                  maxLength={500}
                  disabled={isGuessSubmitted}
                />
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-gray-500">
                    {currentGuess.length}/500 characters
                  </span>
                  {!isGuessSubmitted && (
                    <button
                      onClick={() => handleSaveGuess(true)}
                      disabled={!currentGuess.trim() || saveGuessMutation.isPending}
                      className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
                    >
                      {saveGuessMutation.isPending ? 'Submitting...' : 'Submit Guess'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Status indicators for other players */}
            {gameAnswers && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3">Player Status</h4>
                <div className="space-y-2">
                  {gameAnswers.map((answer: Answer) => (
                    <div key={answer.id} className="flex items-center space-x-2">
                      <span className="text-sm">{answer.playerId === playerId ? 'You' : 'Player'}:</span>
                      {answer.isSubmitted ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          ✓ Submitted
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                          ✏️ Writing...
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentGame.status === 'rating' && gameResults && (
          <div className="bg-yellow-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-6">Round {currentGame.round} Results</h3>
            <p className="text-gray-600 mb-6">AI is rating the guesses...</p>
            
            <div className="space-y-6">
              {gameResults.results.map((result: any, index: number) => (
                <div key={index} className="bg-white p-4 rounded-lg border">
                  <div className="mb-3">
                    <h4 className="font-semibold text-lg">
                      {result.player?.name} answered:
                    </h4>
                    <p className="text-gray-800 italic">"{result.answer}"</p>
                  </div>
                  
                  {result.guess && result.guesser && (
                    <div className="mb-3">
                      <h5 className="font-medium text-gray-700">
                        {result.guesser.name}'s guess for {result.player?.name}'s answer:
                      </h5>
                      <p className="text-gray-600">"{result.guess}"</p>
                    </div>
                  )}
                  
                  {result.isRated && result.rating !== null ? (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Rating:</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-2xl font-bold text-blue-600">
                          {result.rating}/10
                        </span>
                        <div className="flex">
                          {[...Array(10)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-full mx-0.5 ${
                                i < result.rating ? 'bg-blue-500' : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Rating:</span>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span className="text-gray-500">AI is rating...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentGame.status === 'completed' && gameResults && (
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-6">Round {currentGame.round} Results</h3>
            
            <div className="space-y-6">
              {gameResults.results.map((result: any, index: number) => (
                <div key={index} className="bg-white p-4 rounded-lg border">
                  <div className="mb-3">
                    <h4 className="font-semibold text-lg">
                      {result.player?.name} answered:
                    </h4>
                    <p className="text-gray-800 italic">"{result.answer}"</p>
                  </div>
                  
                  {result.guess && result.guesser && (
                    <div className="mb-3">
                      <h5 className="font-medium text-gray-700">
                        {result.guesser.name}'s guess for {result.player?.name}'s answer:
                      </h5>
                      <p className="text-gray-600">"{result.guess}"</p>
                    </div>
                  )}
                  
                  {result.isRated && result.rating !== null ? (
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Rating:</span>
                      <div className="flex items-center space-x-1">
                        <span className="text-2xl font-bold text-blue-600">
                          {result.rating}/10
                        </span>
                        <div className="flex">
                          {[...Array(10)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-full mx-0.5 ${
                                i < result.rating ? 'bg-blue-500' : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Rating:</span>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span className="text-gray-500">AI is rating...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-8 text-center">
              <button
                onClick={onBackToLobby}
                className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Game