import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'
import { getSessionId } from '../utils/storage'
import { getPlayerStatusColor } from '../utils/playerStatus'
import type { Game, Answer, Guess, Player, GameResult, GuessTarget } from '../../../shared/types'

interface GameProps {
  roomId: string
  playerId: string
  onBackToLobby: () => void
  onExitRoom: () => void
}


const Game: React.FC<GameProps> = ({ roomId, playerId, onBackToLobby, onExitRoom }) => {
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [currentGuess, setCurrentGuess] = useState('')
  const [currentGame, setCurrentGame] = useState<Game | null>(null)
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false)
  const [isGuessSubmitted, setIsGuessSubmitted] = useState(false)
  const [guessTargetPlayer, setGuessTargetPlayer] = useState<GuessTarget | null>(null)
  const [isReadyForNextRound, setIsReadyForNextRound] = useState(false)
  const [gameGuesses, setGameGuesses] = useState<Guess[]>([])
  const [showFinalResults, setShowFinalResults] = useState(false)
  const [roomPlayers, setRoomPlayers] = useState<Player[]>([])
  const [gameAnswers, setGameAnswers] = useState<Answer[]>([])

  const [hasInitiallyFetched, setHasInitiallyFetched] = useState(false)
  const { data: initialGameData, refetch: fetchCurrentGame } = trpc.game.getCurrentGame.useQuery(
    { roomId },
    { enabled: false } // We'll manually trigger this
  )




  const { data: roomData } = trpc.room.getRoom.useQuery(
    { roomId: roomId, sessionId: getSessionId() },
    { enabled: !!roomId }
  )


  const { data: gameResults, refetch: refetchGameResults } = trpc.game.getGameResults.useQuery(
    { gameId: currentGame?.id || '' },
    { 
      enabled: !!currentGame && (currentGame.status === 'rating' || currentGame.status === 'completed'),
      refetchInterval: currentGame?.status === 'rating' ? 2000 : false,
    }
  )

  const saveAnswerMutation = trpc.game.saveAnswer.useMutation()
  const saveGuessMutation = trpc.game.saveGuess.useMutation()
  const checkProgressMutation = trpc.game.checkGameProgress.useMutation()
  const readyForNextRoundMutation = trpc.game.readyForNextRound.useMutation()

  const { data: guessTargetData } = trpc.game.getGuessTarget.useQuery(
    { gameId: currentGame?.id || '', playerId },
    { enabled: !!currentGame && isAnswerSubmitted && !guessTargetPlayer }
  )

  const { data: roundReadyStatus } = trpc.game.getRoundReadyStatus.useQuery(
    { roomId },
    { 
      enabled: !!currentGame && currentGame.status === 'completed' && roomData && currentGame.round < roomData.room.totalRounds,
      refetchInterval: 2000
    }
  )

  trpc.game.onGameUpdate.useSubscription(
    { roomId },
    {
      enabled: !!roomId,
      onData: (data) => {
        console.log('Game update received:', data.game, 'Guesses:', data.guesses, 'Answers:', data.answers)
        setCurrentGame(data.game)
        
        // Update guess data if available
        if (data.guesses) {
          setGameGuesses(data.guesses)
        }
        
        // Update answer data if available
        if (data.answers) {
          setGameAnswers(data.answers)
        }
        
        // If game status changed to rating or completed, refetch results immediately
        if (data.game.status === 'rating' || data.game.status === 'completed') {
          refetchGameResults()
        }
      },
      onError: (error) => {
        console.error('Game subscription error:', error)
      },
    }
  )

  trpc.room.onRoomUpdate.useSubscription(
    { roomId },
    {
      enabled: !!roomId,
      onData: (data) => {
        // When room updates (like currentRound increment), fetch new game
        console.log('Room update received, current round:', data.room.currentRound)
        
        // Update room players with latest data (including scores)
        setRoomPlayers(data.players)
        
        if (data.room.currentRound > (currentGame?.round || 0)) {
          console.log('New round detected, fetching new game')
          fetchCurrentGame()
        }
      },
      onError: (error) => {
        console.error('Room subscription error:', error)
      },
    }
  )

  // Fetch initial game data when component mounts
  useEffect(() => {
    if (roomId && !hasInitiallyFetched) {
      fetchCurrentGame()
      setHasInitiallyFetched(true)
    }
  }, [roomId, hasInitiallyFetched, fetchCurrentGame])

  // Handle initial game data response
  useEffect(() => {
    if (initialGameData) {
      const game = initialGameData.game
      const guesses = initialGameData.guesses || []
      const answers = initialGameData.answers || []
      
      if (game && (!currentGame || currentGame.id !== game.id)) {
        console.log('Setting initial game:', game, 'Guesses:', guesses, 'Answers:', answers)
        setCurrentGame(game)
        setGameGuesses(guesses)
        setGameAnswers(answers)
        // Reset all game state when new game starts
        setIsReadyForNextRound(false)
        setCurrentAnswer('')
        setCurrentGuess('')
        setIsAnswerSubmitted(false)
        setIsGuessSubmitted(false)
        setGuessTargetPlayer(null)
      }
    }
  }, [initialGameData, currentGame])

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

  // Set guess target from API response
  useEffect(() => {
    if (guessTargetData && !guessTargetPlayer) {
      setGuessTargetPlayer(guessTargetData)
    }
  }, [guessTargetData, guessTargetPlayer])

  // Initialize room players from roomData
  useEffect(() => {
    if (roomData?.players && roomPlayers.length === 0) {
      setRoomPlayers(roomData.players)
    }
  }, [roomData?.players, roomPlayers.length])

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

  const handleNextRound = async () => {
    if (!currentGame) return
    
    try {
      await readyForNextRoundMutation.mutateAsync({
        gameId: currentGame.id,
        playerId,
      })
      setIsReadyForNextRound(true)
    } catch (error) {
      console.error('Failed to mark ready for next round:', error)
    }
  }


  const getPlayerActivity = (player: Player): string => {
    if (!gameAnswers || !currentGame || currentGame.status !== 'answering') return 'waiting'
    
    const playerAnswer = gameAnswers.find((answer: Answer) => answer.playerId === player.id)
    console.log("player activity", player, gameAnswers);
    // Phase 1: Thinking (no answer started)
    if (!playerAnswer) return 'thinking'
    
    // Phase 2: Writing answer (answer exists but not submitted)
    if (!playerAnswer.isSubmitted) return 'writing their answer'
    
    // Phase 3: Player has submitted their answer, now check guess status
    const playerGuess = gameGuesses.find((guess: Guess) => guess.guesserId === player.id)
    
    if (!playerGuess) {
      // Player hasn't started guessing yet - they should be guessing someone
      if (player.id === playerId && guessTargetPlayer) {
        return `guessing ${guessTargetPlayer.name}'s answer`
      }
      
      // For other players, calculate their deterministic assignment
      if (roomPlayers.length > 0 && currentGame) {
        const sortedPlayers = [...roomPlayers].sort((a, b) => a.id.localeCompare(b.id))
        const currentPlayerIndex = sortedPlayers.findIndex(p => p.id === player.id)
        
        if (currentPlayerIndex !== -1) {
          const offset = currentGame.round % sortedPlayers.length
          const targetIndex = (currentPlayerIndex + offset) % sortedPlayers.length
          const finalTargetIndex = targetIndex === currentPlayerIndex 
            ? (currentPlayerIndex + 1) % sortedPlayers.length 
            : targetIndex
          
          const targetPlayer = sortedPlayers[finalTargetIndex]
          return `guessing ${targetPlayer.name}'s answer`
        }
      }
      
      return 'guessing...'
    }
    
    if (!playerGuess.isSubmitted) {
      // Player is currently writing their guess
      const targetPlayer = roomPlayers.find(p => p.id === playerGuess.targetPlayerId)
      return `guessing ${targetPlayer?.name || 'another player'}'s answer`
    }
    
    // Player has submitted their guess - NOW they wait
    return 'waiting for others'
  }

  const getPlayerPosition = (player: Player, sortedPlayers: Player[]): string => {
    const position = sortedPlayers.findIndex(p => p.id === player.id) + 1
    if (position === 1) return '1st'
    if (position === 2) return '2nd' 
    if (position === 3) return '3rd'
    return `${position}th`
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
          <div>
            <h1 className="text-2xl font-bold text-blue-600">Reyers Answer Guessing Game</h1>
            <h2 className="text-2xl font-bold">
              Round {currentGame.round}{roomData?.room?.totalRounds ? `/${roomData.room.totalRounds}` : ''}
            </h2>
          </div>
          <button
            onClick={onExitRoom}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
          >
            Exit Room
          </button>
        </div>

        {/* Player List */}
        {roomPlayers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Players</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                {roomPlayers
                  .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
                  .map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-2 bg-white rounded border">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm text-gray-600">
                            {getPlayerPosition(player, roomPlayers.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)))}
                          </span>
                          <div className={`w-3 h-3 rounded-full ${getPlayerStatusColor(player)}`}></div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{player.name}</span>
                          {player.isCreator && <span className="text-yellow-500">👑</span>}
                          {player.country && <span>{player.country}</span>}
                        </div>
                        <span className="text-sm font-medium text-blue-600">
                          {Math.round((player.totalScore || 0) * 10) / 10} pts
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 italic">
                        {getPlayerActivity(player)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

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

        {currentGame.status === 'rating' && (
          <div className="bg-yellow-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-6">Round {currentGame.round} Results</h3>
            <p className="text-gray-600 mb-6">AI is rating the guesses...</p>
            
            {!gameResults ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading results...</p>
              </div>
            ) : (
            
            <div className="space-y-6">
              {gameResults.results.map((result: GameResult, index: number) => (
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
                          {result.rating || 0}/10
                        </span>
                        <div className="flex">
                          {[...Array(10)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-full mx-0.5 ${
                                i < (result.rating || 0) ? 'bg-blue-500' : 'bg-gray-200'
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
            )}
          </div>
        )}

        {currentGame.status === 'completed' && (
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-6">Round {currentGame.round} Results</h3>
            
            {!gameResults ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading results...</p>
              </div>
            ) : (
            
            <div className="space-y-6">
              {gameResults.results.map((result: GameResult, index: number) => (
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
                          {result.rating || 0}/10
                        </span>
                        <div className="flex">
                          {[...Array(10)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-3 h-3 rounded-full mx-0.5 ${
                                i < (result.rating || 0) ? 'bg-blue-500' : 'bg-gray-200'
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
            )}
            
            <div className="mt-8 text-center">
              {roomData && currentGame.round >= roomData.room.totalRounds ? (
                // Final round completed - show results or back to lobby
                showFinalResults ? (
                  <button
                    onClick={onBackToLobby}
                    className="px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    Back to Lobby
                  </button>
                ) : (
                  <button
                    onClick={() => setShowFinalResults(true)}
                    className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600"
                  >
                    Show Results!
                  </button>
                )
              ) : (
                // Not final round - show Next button
                <div className="space-y-4">
                  {!isReadyForNextRound ? (
                    <button
                      onClick={handleNextRound}
                      disabled={readyForNextRoundMutation.isPending}
                      className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
                    >
                      {readyForNextRoundMutation.isPending ? 'Loading...' : 'Next Round'}
                    </button>
                  ) : (
                    <div className="px-6 py-3 bg-gray-100 text-gray-600 rounded-md border">
                      ✓ Ready for Next Round
                    </div>
                  )}
                  {roundReadyStatus && (
                    <div className="text-sm text-gray-600">
                      {roundReadyStatus.notReadyPlayers.length > 0 ? (
                        roundReadyStatus.notReadyPlayers.length <= 2 ? (
                          <>Waiting for {roundReadyStatus.notReadyPlayers.join(', ')}</>
                        ) : (
                          <>Waiting for {roundReadyStatus.notReadyPlayers.length} players</>
                        )
                      ) : (
                        <>All players ready! Starting next round...</>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Final Results Screen */}
        {showFinalResults && roomData && roomPlayers.length > 0 && (
          <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-8 rounded-lg border-2 border-yellow-300 mt-6">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-yellow-800 mb-2">🎉 Final Results! 🎉</h2>
              <p className="text-lg text-yellow-700">Game completed after {roomData.room.totalRounds} rounds</p>
            </div>
            
            <div className="space-y-4">
              {roomPlayers
                .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
                .map((player, index) => (
                  <div 
                    key={player.id} 
                    className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                      index === 0 
                        ? 'bg-yellow-100 border-yellow-400' 
                        : index === 1 
                        ? 'bg-gray-100 border-gray-400'
                        : index === 2
                        ? 'bg-orange-100 border-orange-400'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl font-bold">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xl font-semibold">{player.name}</span>
                        {player.isCreator && <span className="text-yellow-500">👑</span>}
                        {player.country && <span>{player.country}</span>}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round((player.totalScore || 0) * 10) / 10} pts
                    </div>
                  </div>
                ))}
            </div>
            
            <div className="mt-8 text-center">
              <p className="text-gray-600 mb-4">
                Thanks for playing! 🎮
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Game