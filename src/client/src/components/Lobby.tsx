import React, { useState, useEffect } from 'react'
import { trpc } from '../trpc'
import { getSessionId, getPlayerName, setPlayerName, getRoomId, setRoomId, clearRoomId } from '../utils/storage'
import { getRoomCodeFromUrl, setRoomCodeInUrl, clearRoomCodeFromUrl } from '../utils/url'
import { getPlayerStatusColor } from '../utils/playerStatus'
import GameConfig from './GameConfig'
import Game from './Game'

interface Player {
  id: string
  name: string
  country: string | null
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
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'join-via-url' | 'room' | 'game'>('menu')
  console.log('Lobby mode:', mode)
  const [playerName, setPlayerNameState] = useState(getPlayerName())
  const [roomCode, setRoomCode] = useState('')
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])

  const createRoomMutation = trpc.room.create.useMutation()
  const joinRoomMutation = trpc.room.join.useMutation()
  const updatePlayerStatusMutation = trpc.room.updatePlayerStatus.useMutation()
  // const markPlayerOfflineMutation = trpc.room.markPlayerOffline.useMutation()
  const leaveRoomMutation = trpc.room.leave.useMutation()
  const kickPlayerMutation = trpc.room.kickPlayer.useMutation()
  const { data: roomData, refetch: refetchRoom, error: roomError } = trpc.room.getRoom.useQuery(
    { roomId: currentRoom?.id || '', sessionId: getSessionId() },
    { 
      enabled: !!currentRoom,
      retry: false, // Don't retry if room doesn't exist
    }
  )
  
  const urlRoomCode = getRoomCodeFromUrl()
  const { data: roomByCodeData } = trpc.room.getRoomByCode.useQuery(
    { roomCode: urlRoomCode || '', sessionId: getSessionId() },
    { enabled: !!urlRoomCode && !currentRoom }
  )
  
  trpc.room.onRoomUpdate.useSubscription(
    { roomId: currentRoom?.id || '' },
    {
      enabled: !!currentRoom,
      onData: (data) => {
        setCurrentRoom(data.room)
        setPlayers(data.players.map(p => ({
          ...p,
          lastSeen: new Date(p.lastSeen),
          country: p.country ?? null
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
  console.log("room info", currentRoom, roomData, roomError);

  useEffect(() => {
    const urlRoomCode = getRoomCodeFromUrl()
    const savedRoomId = getRoomId()
    
    if (urlRoomCode) {
      // Priority: URL room code - show join interface first
      setRoomCode(urlRoomCode)
      setMode('join-via-url')
    } else if (savedRoomId) {
      // Fallback: saved room ID - set currentRoom to trigger roomData query
      setCurrentRoom({ id: savedRoomId } as Room)
      setMode('room')
    }
  }, [])

  useEffect(() => {
    if (roomData) {
      setCurrentRoom(roomData.room)
      setPlayers(roomData.players.map(p => ({
        ...p,
        lastSeen: new Date(p.lastSeen),
        country: p.country ?? null
      })))
      
      // Update URL with room code if not already there
      const urlRoomCode = getRoomCodeFromUrl()
      if (!urlRoomCode) {
        setRoomCodeInUrl(roomData.room.code)
      }
      
      // Set current player ID if available
      if ((roomData as any).currentPlayerId && !currentPlayerId) {
        setCurrentPlayerId((roomData as any).currentPlayerId)
      }
    }
  }, [roomData])
  
  useEffect(() => {
    if (roomByCodeData) {
      setCurrentRoom(roomByCodeData.room)
      setPlayers(roomByCodeData.players.map((p: any) => ({
        ...p,
        lastSeen: new Date(p.lastSeen),
        country: p.country ?? null
      })))
      
      // Only transition to room mode if we have a current player ID (means we joined)
      if (roomByCodeData.currentPlayerId) {
        setCurrentPlayerId(roomByCodeData.currentPlayerId)
        setRoomId(roomByCodeData.room.id)
        setMode('room')
      }
    }
  }, [roomByCodeData])

  // Handle room errors (room deleted, etc.)
  useEffect(() => {
    if (roomError) {
      console.error('Room error:', roomError)
      // Clear saved data and go back to menu
      clearRoomId()
      clearRoomCodeFromUrl()
      setCurrentRoom(null)
      setCurrentPlayerId(null)
      setPlayers([])
      setMode('menu')
    }
  }, [roomError])

  useEffect(() => {
    if (!currentPlayerId) return

    const interval = setInterval(() => {
      updatePlayerStatusMutation.mutate({ playerId: currentPlayerId })
    }, 5000)

    // Mark player as offline when they close the browser (but keep them in room)
    const handleBeforeUnload = () => {
      if (currentPlayerId) {
        // Use sendBeacon for reliability during page unload
        navigator.sendBeacon('/trpc/room.markPlayerOffline', JSON.stringify({
          json: { playerId: currentPlayerId }
        }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
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
      setRoomCodeInUrl(result.room.code)
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
      setRoomCodeInUrl(result.room.code)
      setMode('room')
    } catch (error) {
      console.error('Failed to join room:', error)
    }
  }

  const handleJoinRoomViaUrl = async () => {
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

  const handleLeaveRoom = async () => {
    if (!currentPlayerId) {
      // If no player ID, just clear local state
      clearRoomId()
      clearRoomCodeFromUrl()
      setCurrentRoom(null)
      setCurrentPlayerId(null)
      setPlayers([])
      setMode('menu')
      return
    }

    try {
      await leaveRoomMutation.mutateAsync({ playerId: currentPlayerId })
      
      // Clear local state after successful leave
      clearRoomId()
      clearRoomCodeFromUrl()
      setCurrentRoom(null)
      setCurrentPlayerId(null)
      setPlayers([])
      setMode('menu')
    } catch (error) {
      console.error('Failed to leave room:', error)
      // Still clear local state even if server call fails
      clearRoomId()
      clearRoomCodeFromUrl()
      setCurrentRoom(null)
      setCurrentPlayerId(null)
      setPlayers([])
      setMode('menu')
    }
  }

  const handleKickPlayer = async (playerToKickId: string, playerName: string) => {
    if (!currentPlayerId) return
    
    if (confirm(`Are you sure you want to kick ${playerName} from the room?`)) {
      try {
        await kickPlayerMutation.mutateAsync({ 
          playerId: playerToKickId, 
          kickerId: currentPlayerId 
        })
      } catch (error) {
        console.error('Failed to kick player:', error)
        alert('Failed to kick player')
      }
    }
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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">Reyers Answer Guessing Game</h1>
          <p className="text-gray-600">A fun multiplayer guessing game</p>
        </div>
        
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
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-600 mb-1">Reyers Answer Guessing Game</h1>
          <h2 className="text-xl font-semibold">Create Room</h2>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            You will create a new room as: <strong>{playerName}</strong>
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleCreateRoom}
            disabled={createRoomMutation.isPending}
            className="w-full py-3 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300"
          >
            {createRoomMutation.isPending ? 'Creating...' : 'Create Room'}
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
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-600 mb-1">Reyers Answer Guessing Game</h1>
          <h2 className="text-xl font-semibold">Join Room</h2>
        </div>
        
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
            disabled={joinRoomMutation.isPending || roomCode.length !== 5}
            className="w-full py-3 px-4 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
          >
            {joinRoomMutation.isPending ? 'Joining...' : 'Join Room'}
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

  if (mode === 'join-via-url' && currentRoom) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-blue-600 mb-1">Reyers Answer Guessing Game</h1>
            <h2 className="text-2xl font-bold mb-2">Join Room {currentRoom.code}</h2>
            <p className="text-gray-600">Enter your name to join this room</p>
          </div>

          <div className="max-w-md mx-auto mb-8">
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
                onClick={handleJoinRoomViaUrl}
                disabled={joinRoomMutation.isPending || !playerName.trim()}
                className="w-full py-3 px-4 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-300"
              >
                {joinRoomMutation.isPending ? 'Joining...' : 'Join Room'}
              </button>
              
              <button
                onClick={() => {
                  clearRoomCodeFromUrl()
                  setMode('menu')
                }}
                className="w-full py-3 px-4 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Back to Menu
              </button>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Players Already in Room ({players.length})</h2>
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
              <h1 className="text-2xl font-bold text-blue-600">Reyers Answer Guessing Game</h1>
              <h2 className="text-2xl font-bold">Room {currentRoom.code}</h2>
              <p className="text-gray-600">Status: {currentRoom.status}</p>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Leave Room
            </button>
          </div>

          <div className="mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Invite Players</h3>
              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={`${window.location.origin}${import.meta.env.BASE_URL || '/'}?room=${currentRoom.code}`.replace(/\/+/g, '/').replace(':/', '://')}
                    readOnly
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL || '/'}?room=${currentRoom.code}`.replace(/\/+/g, '/').replace(':/', '://'))
                      .then(() => {
                        // Could add a toast notification here
                        alert('Invite link copied to clipboard!')
                      })
                      .catch(() => {
                        alert('Failed to copy link')
                      })
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 whitespace-nowrap"
                >
                  Copy Link
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Share this link with friends to invite them to your room
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
            <div className="space-y-3">
              {players.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center space-x-3">
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
                  
                  {/* Kick button - only show for room creator and only for other players */}
                  {currentRoom && currentPlayerId === currentRoom.creatorId && 
                   player.id !== currentPlayerId && (
                    <button
                      onClick={() => handleKickPlayer(player.id, player.name)}
                      disabled={kickPlayerMutation.isPending}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:bg-gray-300"
                    >
                      {kickPlayerMutation.isPending ? 'Kicking...' : 'Kick'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {currentRoom.status === 'lobby' && (
            <GameConfig
              roomId={currentRoom.id}
              playerId={currentPlayerId!}
              currentConfig={{
                totalRounds: currentRoom.totalRounds,
                roundTimeLimit: currentRoom.roundTimeLimit,
                initialPrompt: currentRoom.initialPrompt,
              }}
              onConfigUpdate={() => refetchRoom()}
              onStartGame={() => refetchRoom()}
              isCreator={currentPlayerId === currentRoom.creatorId}
              creatorName={players.find(p => p.isCreator)?.name}
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
        onExitRoom={handleLeaveRoom}
      />
    )
  }

  return null
}

export default Lobby