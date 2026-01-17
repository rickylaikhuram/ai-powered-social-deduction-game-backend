import { store } from "../store/index.js";
import { changeCurrentSpeaker } from "../store/gameSlice.js";
import { updateRoomState } from "./broadcast.js";
import type { Server } from "socket.io";

const speakingTimers = new Map<string, NodeJS.Timeout>();

export function startSpeakerTimer(io: Server, roomCode: string) {
  stopSpeakerTimer(roomCode);

  const timer = setTimeout(() => {
    const room = store.getState().game.rooms[roomCode];
    if (!room || room.phase !== "SPEAKING") return;

    store.dispatch(changeCurrentSpeaker({ roomCode }));
    updateRoomState(io, roomCode);

    startSpeakerTimer(io, roomCode);
  }, 30_000);

  speakingTimers.set(roomCode, timer);
}

export function stopSpeakerTimer(roomCode: string) {
  const timer = speakingTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    speakingTimers.delete(roomCode);
  }
}

