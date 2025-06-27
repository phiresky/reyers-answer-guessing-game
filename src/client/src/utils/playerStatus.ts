export interface PlayerWithStatus {
  status: 'online' | 'away' | 'offline'
  lastSeen: Date | string
}

export const getPlayerStatusColor = (player: PlayerWithStatus): string => {
  // Use the actual status field from the server
  if (player.status === 'offline') return 'bg-red-500'
  if (player.status === 'away') return 'bg-yellow-500'
  if (player.status === 'online') {
    // For online players, also check if they're recently active
    const lastSeenDate = player.lastSeen instanceof Date ? player.lastSeen : new Date(player.lastSeen)
    const timeSinceLastSeen = Date.now() - lastSeenDate.getTime()
    if (timeSinceLastSeen < 20000) return 'bg-green-500'
    return 'bg-yellow-500' // Online but not recently active
  }
  return 'bg-red-500' // Fallback
}