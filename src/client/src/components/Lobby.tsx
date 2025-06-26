import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'
import { getSessionId, getPlayerName, setPlayerName, getRoomId, setRoomId, clearRoomId } from '../utils/storage'
import GameConfig from './GameConfig'
import Game from './Game'

interface Player {
  id: string
  name: string
  country?: string
  isCreator: boolean
  status: 'online' | 'away' | 'offline'
  lastSeen: Date
}

interface Room {
  id: string
  code: string
  status: string
  creatorId: string
  totalRounds: number
  roundTimeLimit: number
  initialPrompt: string
}

const Lobby: React.FC = () => {
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'room' | 'game'>('menu')
  const [playerName, setPlayerNameState] = useState(getPlayerName())
  const [roomCode, setRoomCode] = useState('')
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])

  const createRoomMutation = trpc.room.create.useMutation()
  const joinRoomMutation = trpc.room.join.useMutation()
  const updatePlayerStatusMutation = trpc.room.updatePlayerStatus.useMutation()
  const { data: roomData, refetch: refetchRoom } = trpc.room.getRoom.useQuery(
    { roomId: currentRoom?.id || '' },
    { enabled: !!currentRoom }
  )
  
  trpc.room.onRoomUpdate.useSubscription(
    { roomId: currentRoom?.id || '' },
    {
      enabled: !!currentRoom,
      onData: (data) => {
        setCurrentRoom(data.room)
        setPlayers(data.players.map(p => ({
          ...p,
          lastSeen: new Date(p.lastSeen)
        })))
        
        if (data.room.status === 'playing' && mode === 'room') {
          setMode('game')
        }
      },
      onError: (error) => {
        console.error('Subscription error:', error)
      },
    }
  )

  useEffect(() => {
    const savedRoomId = getRoomId()
    if (savedRoomId) {
      setMode('room')
    }
  }, [])

  useEffect(() => {
    if (roomData) {
      setCurrentRoom(roomData.room)
      setPlayers(roomData.players.map(p => ({
        ...p,
        lastSeen: new Date(p.lastSeen)
      })))
    }
  }, [roomData])

  useEffect(() => {
    if (!currentPlayerId) return

    const interval = setInterval(() => {
      updatePlayerStatusMutation.mutate({ playerId: currentPlayerId })
    }, 5000)

    return () => clearInterval(interval)
  }, [currentPlayerId])

  const handleCreateRoom = async () => {
    if (!playerName.trim()) return
    
    try {
      const result = await createRoomMutation.mutateAsync({
        playerName: playerName.trim(),
        sessionId: getSessionId(),
      })
      
      setPlayerName(playerName.trim())
      setCurrentRoom(result.room)
      setCurrentPlayerId(result.playerId)
      setRoomId(result.room.id)
      setMode('room')
    } catch (error) {
      console.error('Failed to create room:', error)
    }
  }

  const handleJoinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) return
    
    try {
      const result = await joinRoomMutation.mutateAsync({
        roomCode: roomCode.trim().toUpperCase(),
        playerName: playerName.trim(),
        sessionId: getSessionId(),
      })
      
      setPlayerName(playerName.trim())
      setCurrentRoom(result.room)
      setCurrentPlayerId(result.playerId)
      setRoomId(result.room.id)
      setMode('room')
    } catch (error) {
      console.error('Failed to join room:', error)
    }
  }

  const handleLeaveRoom = () => {
    clearRoomId()
    setCurrentRoom(null)
    setCurrentPlayerId(null)
    setPlayers([])
    setMode('menu')
  }

  const getPlayerStatusColor = (player: Player) => {
    const timeSinceLastSeen = Date.now() - player.lastSeen.getTime()
    if (timeSinceLastSeen < 20000) return 'bg-green-500'
    if (timeSinceLastSeen < 60000) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getTimeSinceLastSeen = (player: Player) => {
    const timeSinceLastSeen = Date.now() - player.lastSeen.getTime()
    if (timeSinceLastSeen < 20000) return ''
    const seconds = Math.floor(timeSinceLastSeen / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  if (mode === 'menu') {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-8">Word Game</h1>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerNameState(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={50}
          />
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setMode('create')}
            disabled={!playerName.trim()}
            className="w-full py-3 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Create New Room
          </button>
          
          <button
            onClick={() => setMode('join')}
            disabled={!playerName.trim()}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Join Room
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6">Create Room</h2>
        
        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            You will create a new room as: <strong>{playerName}</strong>
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateRoom}
            disabled={createRoomMutation.isLoading}
            className="w-full py-3 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300"
          >
            {createRoomMutation.isLoading ? 'Creating...' : 'Create Room'}
          </button>
          
          <button
            onClick={() => setMode('menu')}
            className="w-full py-3 px-4 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="max-w-md mx-auto mt-16 p-6 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6">Join Room</h2>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Room Code
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Enter 5-letter room code"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-lg font-mono"
            maxLength={5}
          />
        </div>

        <div className="space-y-4">
          <button
            onClick={handleJoinRoom}
            disabled={joinRoomMutation.isLoading || roomCode.length !== 5}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
          >
            {joinRoomMutation.isLoading ? 'Joining...' : 'Join Room'}
          </button>
          
          <button
            onClick={() => setMode('menu')}
            className="w-full py-3 px-4 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'room' && currentRoom) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Room {currentRoom.code}</h1>
              <p className="text-gray-600">Status: {currentRoom.status}</p>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Leave Room
            </button>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
            <div className="space-y-3">
              {players.map((player) => (
                <div key={player.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                  <div className={`w-3 h-3 rounded-full ${getPlayerStatusColor(player)}`}></div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{player.name}</span>
                      {player.isCreator && <span className="text-yellow-500">👑</span>}
                      {player.country && <span>{player.country}</span>}
                    </div>
                    {getTimeSinceLastSeen(player) && (
                      <span className="text-sm text-gray-500">{getTimeSinceLastSeen(player)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {currentPlayerId === currentRoom.creatorId && currentRoom.status === 'lobby' && (
            <GameConfig
              roomId={currentRoom.id}
              playerId={currentPlayerId}
              currentConfig={{
                totalRounds: currentRoom.totalRounds,
                roundTimeLimit: currentRoom.roundTimeLimit,
                initialPrompt: currentRoom.initialPrompt,
              }}
              onConfigUpdate={() => refetchRoom()}
              onStartGame={() => refetchRoom()}
            />
          )}
        </div>
      </div>
    )
  }

  if (mode === 'game' && currentRoom && currentPlayerId) {
    return (
      <Game
        roomId={currentRoom.id}
        playerId={currentPlayerId}
        onBackToLobby={() => setMode('room')}
      />
    )
  }

  return null
}

export default Lobby