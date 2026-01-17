export type GamePhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "SPEAKING"
  | "VOTING"
  | "RESULT"
  | "GAME_OVER";
export type GameMode = "INFILTRATOR" | "SPY";

export interface Player {
  guestId: string;
  socketId: string;
  name: string;
  isHost: boolean;
  role: "CITIZEN" | "INFILTRATOR" | "AGENT" | "SPY" | "PENDING";
  word: string; 
  isAlive: boolean;
  votes: number;
  hasVoted: boolean;
}

export interface GameRoom {
  roomCode: string;
  mode: GameMode;
  phase: GamePhase;
  players: Player[];
  secretWord: string;
  decoyWord?: string;
  currentSpeakerIndex: number;
  winner: "CITIZENS" | "INFILTRATOR" | "AGENTS" | "SPY" | null;
  clues: Array<{ sender: string; text: string; id: string }>;
}

export interface ServerState {
  rooms: Record<string, GameRoom>;
}
export interface CreateRoomPayload {
  roomCode: string;
  hostName: string;
  guestId: string;
  socketId: string;
  mode: GameMode;
}

export interface JoinRoomPayload {
  guestId: string;
  name: string;
  roomCode: string;
  socketId: string;
}
export interface CluePayload {
  id: string;
  text: string;
  sender: string;
  roomCode: string;
}
