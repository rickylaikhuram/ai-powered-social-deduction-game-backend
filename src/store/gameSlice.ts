import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ServerState,
  CreateRoomPayload,
  JoinRoomPayload,
  GamePhase,
} from "../types/game.js";

const initialState: ServerState = { rooms: {} };

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    // Create a specific type of room
    createRoom: (state, action: PayloadAction<CreateRoomPayload>) => {
      const { roomCode, mode, hostName, guestId, socketId } = action.payload;

      state.rooms[roomCode] = {
        roomCode,
        mode, // Now dynamically set by the host!
        phase: "LOBBY",
        players: [
          {
            guestId,
            socketId,
            name: hostName,
            isHost: true,
            role: "PENDING",
            word: "",
            isAlive: true,
            votes: 0,
            hasVoted: false,
          },
        ],
        secretWord: "",
        currentSpeakerIndex: 0,
        winner: null,
        clues: [],
      };
    },

    // Just for joining existing rooms
    joinRoom: (state, action: PayloadAction<JoinRoomPayload>) => {
      const { roomCode, guestId, name, socketId } = action.payload;
      const room = state.rooms[roomCode];

      if (!room) return; // Logic for "Room Not Found"

      const existingPlayer = room.players.find((p) => p.guestId === guestId);
      if (existingPlayer) {
        existingPlayer.socketId = socketId;
      } else {
        room.players.push({
          guestId,
          socketId,
          name,
          isHost: false,
          role: "PENDING",
          word: "",
          isAlive: true,
          votes: 0,
          hasVoted: false,
        });
      }
    },

    // start games
    startGame: (
      state,
      action: PayloadAction<{
        roomCode: string;
        secretWord: string;
        decoyWord: string | undefined;
      }>,
    ) => {
      const { roomCode, secretWord, decoyWord } = action.payload;
      const room = state.rooms[roomCode];

      if (!room || room.players.length < 3) return;

      // 1. Change Phase
      room.phase = "ROLE_REVEAL";
      room.secretWord = secretWord;

      // 2. Pick a random player to be the "Shadow" (Infiltrator or Spy)
      const shadowIndex = Math.floor(Math.random() * room.players.length);

      room.players.forEach((player, index) => {
        if (index === shadowIndex) {
          // Logic for the special role
          if (room.mode === "SPY") {
            player.role = "SPY";
            player.word = decoyWord || "Error: No decoy";
          } else {
            player.role = "INFILTRATOR";
            player.word = ""; // Infiltrator gets no word!
          }
        } else {
          // Logic for the majority
          player.role = room.mode === "SPY" ? "AGENT" : "CITIZEN";
          player.word = secretWord;
        }
      });
    },

    // change phase
    changePhase: (
      state,
      action: PayloadAction<{
        roomCode: string;
        phase: GamePhase;
      }>,
    ) => {
      const { roomCode, phase } = action.payload;
      const room = state.rooms[roomCode];

      if (!room) return;

      // 1. Change Phase
      room.phase = phase;
    },

    // add clue
    addClue: (
      state,
      action: PayloadAction<{ roomCode: string; sender: string; text: string }>,
    ) => {
      const room = state.rooms[action.payload.roomCode];
      if (room) {
        room.clues.push({
          sender: action.payload.sender,
          text: action.payload.text,
          id: Math.random().toString(36).substring(7),
        });
      }
    },

    // change current speaker
    changeCurrentSpeaker: (
      state,
      action: PayloadAction<{ roomCode: string }>,
    ) => {
      const room = state.rooms[action.payload.roomCode];
      if (room) {
        room.currentSpeakerIndex += 1;
      }
    },

    // restart speaking round
    restartSpeakingRound: (
      state,
      action: PayloadAction<{ roomCode: string }>,
    ) => {
      const room = state.rooms[action.payload.roomCode];
      if (!room) return;

      // Reset turn state
      room.currentSpeakerIndex = 0;

      // Reset speaking state
      room.clues = [];
      room.phase = "SPEAKING";

      // Reset voting state
      room.players.forEach((player) => {
        player.votes = 0;
        player.hasVoted = false;
      });
    },

    // sumbit vote
    submitVote: (
      state,
      action: PayloadAction<{
        roomCode: string;
        voterId: string;
        targetId: string;
      }>,
    ) => {
      const { roomCode, voterId, targetId } = action.payload;
      const room = state.rooms[roomCode];
      if (!room) return;

      const voter = room.players.find((p) => p.guestId === voterId);
      const target = room.players.find((p) => p.guestId === targetId);

      if (!voter || !target || voter.hasVoted || !voter.isAlive) return;

      voter.hasVoted = true;
      target.votes += 1;
    },

    // calculate vote and eliminate
    calculateElimination: (
      state,
      action: PayloadAction<{ roomCode: string }>,
    ) => {
      const room = state.rooms[action.payload.roomCode];
      if (!room) return;

      const alivePlayers = room.players.filter((p) => p.isAlive);

      // Find max votes
      const maxVotes = Math.max(...alivePlayers.map((p) => p.votes));
      const topCandidates = alivePlayers.filter((p) => p.votes === maxVotes);

      // Handle tie (NO elimination)
      if (topCandidates.length !== 1) {
        room.phase = "RESULT";
        return;
      }

      // 3. Eliminate victim
      const victim = topCandidates[0];
      if (!victim) {
        return;
      }
      victim.isAlive = false;

      // 4. Enter result phase
      room.phase = "RESULT";

      // 5. Check win condition
      const remaining = room.players.filter((p) => p.isAlive);

      const spiesAlive = remaining.filter(
        (p) => p.role === "SPY" || p.role === "INFILTRATOR",
      );

      const citizensAlive = remaining.filter(
        (p) => p.role === "CITIZEN" || p.role === "AGENT",
      );

      if (spiesAlive.length === 0) {
        room.winner = room.mode === "SPY" ? "AGENTS" : "CITIZENS";
      } else if (spiesAlive.length >= citizensAlive.length) {
        room.winner = room.mode === "SPY" ? "SPY" : "INFILTRATOR";
      }
    },

    // remove platyers from room
    removePlayer: (state, action: PayloadAction<{ socketId: string }>) => {
      const allRoomCodes = Object.keys(state.rooms);

      allRoomCodes.forEach((roomCode) => {
        const room = state.rooms[roomCode];

        // 1. Guard against undefined room
        if (!room) return;

        // 2. Filter out the player
        room.players = room.players.filter(
          (p) => p.socketId !== action.payload.socketId,
        );

        // 3. Host Migration (Safe version)
        if (room.players.length > 0 && !room.players.some((p) => p.isHost)) {
          const newHost = room.players[0]; // Capture the potential new host
          if (newHost) {
            newHost.isHost = true;
          }
        }

        // 4. Cleanup empty rooms
        if (room.players.length === 0) {
          delete state.rooms[roomCode];
        }
      });
    },
  },
});

export const {
  createRoom,
  joinRoom,
  removePlayer,
  startGame,
  addClue,
  changeCurrentSpeaker,
  submitVote,
  calculateElimination,
  restartSpeakingRound,
  changePhase,
} = gameSlice.actions;
export default gameSlice.reducer;
