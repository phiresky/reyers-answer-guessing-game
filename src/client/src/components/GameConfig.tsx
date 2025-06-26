import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'

interface GameConfigProps {
  roomId: string
  playerId: string
  currentConfig: {
    totalRounds: number
    roundTimeLimit: number
    initialPrompt: string
  }
  onConfigUpdate: () => void
  onStartGame: () => void
  isCreator?: boolean
  creatorName?: string
}

const GameConfig: React.FC<GameConfigProps> = ({
  roomId,
  playerId,
  currentConfig,
  onConfigUpdate,
  onStartGame,
  isCreator = true,
  creatorName,
}) => {
  const [totalRounds, setTotalRounds] = useState(currentConfig.totalRounds)
  const [roundTimeLimit, setRoundTimeLimit] = useState(currentConfig.roundTimeLimit)
  const [initialPrompt, setInitialPrompt] = useState(currentConfig.initialPrompt)

  const updateConfigMutation = trpc.game.updateConfig.useMutation()
  const startGameMutation = trpc.game.startGame.useMutation()

  // Sync local state with props when currentConfig changes
  useEffect(() => {
    setTotalRounds(currentConfig.totalRounds)
    setRoundTimeLimit(currentConfig.roundTimeLimit)
    setInitialPrompt(currentConfig.initialPrompt)
  }, [currentConfig.totalRounds, currentConfig.roundTimeLimit, currentConfig.initialPrompt])

  const handleUpdateConfig = async () => {
    try {
      await updateConfigMutation.mutateAsync({
        roomId,
        playerId,
        totalRounds,
        roundTimeLimit,
        initialPrompt: initialPrompt.trim(),
      })
      onConfigUpdate()
    } catch (error) {
      console.error('Failed to update config:', error)
    }
  }

  const handleStartGame = async () => {
    try {
      await startGameMutation.mutateAsync({
        roomId,
        playerId,
      })
      onStartGame()
    } catch (error) {
      console.error('Failed to start game:', error)
    }
  }

  // Auto-save function
  const autoSave = async () => {
    if (!isCreator) return
    
    try {
      await updateConfigMutation.mutateAsync({
        roomId,
        playerId,
        totalRounds,
        roundTimeLimit,
        initialPrompt: initialPrompt.trim(),
      })
      onConfigUpdate()
    } catch (error) {
      console.error('Failed to auto-save config:', error)
    }
  }

  // Auto-save when totalRounds changes (immediate)
  useEffect(() => {
    if (isCreator && totalRounds !== currentConfig.totalRounds) {
      autoSave()
    }
  }, [totalRounds])

  // Auto-save when roundTimeLimit changes (immediate)
  useEffect(() => {
    if (isCreator && roundTimeLimit !== currentConfig.roundTimeLimit) {
      autoSave()
    }
  }, [roundTimeLimit])

  // Auto-save when initialPrompt changes (debounced)
  useEffect(() => {
    if (isCreator && initialPrompt.trim() !== currentConfig.initialPrompt && initialPrompt.trim().length > 0) {
      const timer = setTimeout(() => {
        autoSave()
      }, 1000) // 1 second debounce for text input
      
      return () => clearTimeout(timer)
    }
  }, [initialPrompt])

  return (
    <div className="bg-blue-50 p-6 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">Game Configuration</h3>
        {isCreator && updateConfigMutation.isPending && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span>Saving...</span>
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Rounds
          </label>
          <select
            value={totalRounds}
            onChange={(e) => setTotalRounds(Number(e.target.value))}
            disabled={!isCreator}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isCreator ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Limit per Round (seconds)
          </label>
          <select
            value={roundTimeLimit}
            onChange={(e) => setRoundTimeLimit(Number(e.target.value))}
            disabled={!isCreator}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isCreator ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={90}>1.5 minutes</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
            <option value={240}>4 minutes</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Initial Prompt
          </label>
          <textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="Enter the theme for AI question generation"
            disabled={!isCreator}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${!isCreator ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            rows={3}
            maxLength={200}
          />
          <p className="text-sm text-gray-500 mt-1">
            {initialPrompt.length}/200 characters
          </p>
        </div>

        <div className="flex space-x-3">
          {isCreator ? (
            <button
              onClick={handleStartGame}
              disabled={startGameMutation.isPending}
              className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
            >
              {startGameMutation.isPending ? 'Starting...' : 'Start Game'}
            </button>
          ) : (
            <div className="flex items-center space-x-2 text-gray-600">
              <span>Waiting for</span>
              <span className="text-yellow-500">👑</span>
              <span className="font-medium">{creatorName}</span>
              <span>to start the game</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GameConfig