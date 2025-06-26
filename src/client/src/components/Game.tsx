import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'

interface GameProps {
  roomId: string
  playerId: string
  onBackToLobby: () => void
}

interface Game {
  id: string
  question: string
  status: 'answering' | 'guessing' | 'rating' | 'completed'
  round: number
}

const Game: React.FC<GameProps> = ({ roomId, playerId, onBackToLobby }) => {
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [currentGame, setCurrentGame] = useState<Game | null>(null)

  const { data: gameData, refetch: refetchGame } = trpc.game.getCurrentGame.useQuery(
    { roomId },
    { enabled: !!roomId }
  )

  const submitAnswerMutation = trpc.game.submitAnswer.useMutation()

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

  const handleSubmitAnswer = async () => {
    if (!currentGame || !currentAnswer.trim()) return

    try {
      await submitAnswerMutation.mutateAsync({
        gameId: currentGame.id,
        playerId,
        answer: currentAnswer.trim(),
      })
      setCurrentAnswer('')
    } catch (error) {
      console.error('Failed to submit answer:', error)
    }
  }

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
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Your Answer</h3>
            <textarea
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder="Enter your answer (around one sentence)"
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              maxLength={500}
            />
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-500">
                {currentAnswer.length}/500 characters
              </span>
              <button
                onClick={handleSubmitAnswer}
                disabled={!currentAnswer.trim() || submitAnswerMutation.isPending}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300"
              >
                {submitAnswerMutation.isPending ? 'Submitting...' : 'Submit Answer'}
              </button>
            </div>
          </div>
        )}

        {currentGame.status === 'guessing' && (
          <div className="bg-green-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Guessing Phase</h3>
            <p className="text-gray-600">
              Now you'll guess what other players answered!
            </p>
          </div>
        )}

        {currentGame.status === 'rating' && (
          <div className="bg-yellow-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">AI is Rating Answers</h3>
            <p className="text-gray-600">
              Please wait while the AI rates everyone's guesses...
            </p>
          </div>
        )}

        {currentGame.status === 'completed' && (
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4">Round Complete!</h3>
            <p className="text-gray-600">
              Results will be shown here...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Game