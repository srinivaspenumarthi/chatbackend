export interface Room {
  roomId: string;
  p1Id: string;
  p2Id: string | null;
}

export interface MatchPayload {
  roomId: string;
  remoteSocketId: string;
  type: 'p1' | 'p2';
}

export interface SessionInfo {
  roomId: string;
  peerId: string | null;
  type: 'p1' | 'p2';
}
