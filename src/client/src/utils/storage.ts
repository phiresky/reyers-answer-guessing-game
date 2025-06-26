export function getSessionId(): string {
  let sessionId = localStorage.getItem('sessionId')
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    localStorage.setItem('sessionId', sessionId)
  }
  return sessionId
}

export function getPlayerName(): string {
  return localStorage.getItem('playerName') || ''
}

export function setPlayerName(name: string): void {
  localStorage.setItem('playerName', name)
}

export function getRoomId(): string | null {
  return localStorage.getItem('roomId')
}

export function setRoomId(roomId: string): void {
  localStorage.setItem('roomId', roomId)
}

export function clearRoomId(): void {
  localStorage.removeItem('roomId')
}