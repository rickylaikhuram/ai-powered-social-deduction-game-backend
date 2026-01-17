import { Server, Socket } from "socket.io";
import { store } from "../store/index.js";
import {
  addClue,
  calculateElimination,
  changeCurrentSpeaker,
  changePhase,
  createRoom,
  joinRoom,
  restartSpeakingRound,
  startGame,
  submitVote,
} from "../store/gameSlice.js";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  CluePayload,
} from "../types/game.js"; // Importing your types
import { getGameWords } from "../services/wordService.js";
import { getAIHint } from "../services/aiService.js";
import { startSpeakerTimer, stopSpeakerTimer } from "../engine/timer.js";
import { updateRoomState } from "../engine/broadcast.js";

export const registerGameHandlers = (io: Server, socket: Socket) => {
  // Handle Create Room
  const handleCreate = (data: CreateRoomPayload) => {
    const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    socket.join(roomCode);

    store.dispatch(
      createRoom({
        roomCode,
        hostName: data.hostName,
        guestId: data.guestId,
        socketId: socket.id,
        mode: data.mode,
      }),
    );

    updateRoomState(io, roomCode);
    console.log(`Room ${roomCode} created by ${socket.id}`);
  };

  // Handle Join Room
  const handleJoin = (data: JoinRoomPayload) => {
    const roomCode = data.roomCode.toUpperCase();
    const roomExists = store.getState().game.rooms[roomCode];

    if (!roomExists) {
      socket.emit("ERROR", "Room not found");
      return;
    }

    if (roomExists.phase !== "LOBBY") {
      socket.emit("ERROR", "Game already in progress.");
      return;
    }

    socket.join(roomCode);
    store.dispatch(
      joinRoom({
        roomCode,
        name: data.name,
        guestId: data.guestId,
        socketId: socket.id,
      }),
    );

    updateRoomState(io, roomCode);
    io.to(roomCode).emit("PLAYER-JOINED", data.name);
  };

  // Handle Start Game
  const handleStartGame = async (data: { roomCode: string }) => {
    const roomCode = data.roomCode.toUpperCase();
    const state = store.getState().game.rooms[roomCode];

    if (!state || state.players.length < 3) {
      socket.emit("ERROR", "Minimum 3 players required.");
      return;
    }

    try {
      const { secretWord, decoyWord } = await getGameWords(state.mode);

      store.dispatch(
        startGame({
          roomCode,
          secretWord,
          decoyWord,
        }),
      );

      // Visual Transition Delay for "ROLE_REVEAL"
      setTimeout(async () => {
        const room = store.getState().game.rooms[roomCode];
        if (!room || room.phase !== "ROLE_REVEAL") return;

        store.dispatch(changePhase({ roomCode, phase: "SPEAKING" }));

        // Inject AI Hint at the very start of Speaking
        await handleGetAIHint({ roomCode });

        updateRoomState(io, roomCode);
        startSpeakerTimer(io, roomCode);
      }, 5000);

      updateRoomState(io, roomCode);
    } catch (error) {
      socket.emit("ERROR", "Failed to initialize game words.");
    }
  };

  // Handle Send Clue
  const handleSendClue = (data: CluePayload) => {
    const roomCode = data.roomCode.toUpperCase();
    const room = store.getState().game.rooms[roomCode];
    if (!room || room.phase !== "SPEAKING") return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player || !player.isAlive) return;

    const alivePlayers = room.players.filter((p) => p.isAlive);
    const currentSpeaker =
      alivePlayers[room.currentSpeakerIndex % alivePlayers.length];

    // Turn Validation
    if (!currentSpeaker || currentSpeaker.guestId !== player.guestId) {
      socket.emit("ERROR", "It is not your turn to speak.");
      return;
    }

    // Accept clue and update state
    store.dispatch(
      addClue({
        roomCode,
        sender: player.name,
        text: data.text.trim().substring(0, 100),
      }),
    );

    stopSpeakerTimer(roomCode);

    const updatedRoom = store.getState().game.rooms[roomCode];
    if (!updatedRoom) return;

    // Correct Logic: Check if all alive HUMAN players have sent a clue
    const humanClues = updatedRoom.clues.filter(
      (c) => c.sender !== "SHADOW_SIGNAL_AI",
    );

    if (humanClues.length >= alivePlayers.length) {
      store.dispatch(changePhase({ roomCode, phase: "VOTING" }));
      updateRoomState(io, roomCode);
    } else {
      store.dispatch(changeCurrentSpeaker({ roomCode }));
      updateRoomState(io, roomCode);
      startSpeakerTimer(io, roomCode);
    }
  };

  // Handle Vote
  const handleVote = (data: { roomCode: string; targetId: string }) => {
    const roomCode = data.roomCode.toUpperCase();
    const room = store.getState().game.rooms[roomCode];
    if (!room || room.phase !== "VOTING") return;

    const voter = room.players.find((p) => p.socketId === socket.id);
    if (!voter || !voter.isAlive || voter.hasVoted) return;

    store.dispatch(
      submitVote({
        roomCode,
        voterId: voter.guestId,
        targetId: data.targetId,
      }),
    );

    const updatedRoom = store.getState().game.rooms[roomCode];
    if (!updatedRoom) return;

    const alivePlayers = updatedRoom.players.filter((p) => p.isAlive);
    const totalVotesCast = updatedRoom.players.filter(
      (p) => p.hasVoted && p.isAlive,
    ).length;

    if (totalVotesCast >= alivePlayers.length) {
      stopSpeakerTimer(roomCode);
      store.dispatch(calculateElimination({ roomCode }));
      updateRoomState(io, roomCode);

      // Delay to show results before next round or game over
      setTimeout(async () => {
        const resultRoom = store.getState().game.rooms[roomCode];
        if (!resultRoom || resultRoom.phase !== "RESULT") return;

        if (resultRoom.winner) {
          store.dispatch(changePhase({ roomCode, phase: "GAME_OVER" }));
        } else {
          store.dispatch(restartSpeakingRound({ roomCode }));
          await handleGetAIHint({ roomCode });
          startSpeakerTimer(io, roomCode);
        }
        updateRoomState(io, roomCode);
      }, 5000);
    } else {
      updateRoomState(io, roomCode);
    }
  };

  // Handle AI Hint
  const handleGetAIHint = async (data: { roomCode: string }) => {
    const state = store.getState().game.rooms[data.roomCode];
    if (!state) return;

    const hint = await getAIHint(state.secretWord);

    if (hint) {
      store.dispatch(
        addClue({
          roomCode: data.roomCode,
          sender: "SHADOW_SIGNAL_AI",
          text: `SYSTEM ANALYSIS: ${hint}`,
        }),
      );
      updateRoomState(io, data.roomCode);
    }
  };

  // Register Listeners
  socket.on("CREATE_ROOM", handleCreate);
  socket.on("JOIN_ROOM", handleJoin);
  socket.on("START_GAME", handleStartGame);
  socket.on("SEND_CLUE", handleSendClue);
  socket.on("SUBMIT_VOTE", handleVote);
};
