export function getRoomCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('room')
}

export function setRoomCodeInUrl(roomCode: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomCode)
  window.history.pushState({}, '', url.toString())
}

export function clearRoomCodeFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('room')
  window.history.pushState({}, '', url.toString())
}

export function getRoomIdFromUrl(): string | null {
  const hash = window.location.hash.substring(1) // Remove the #
  return hash || null
}

export function setRoomIdInUrl(roomId: string): void {
  window.history.pushState({}, '', `#${roomId}`)
}

export function clearRoomIdFromUrl(): void {
  window.history.pushState({}, '', window.location.pathname + window.location.search)
}