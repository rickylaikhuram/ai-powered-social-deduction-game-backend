import { Server } from "socket.io";
import { store } from "../store/index.js";

export function updateRoomState(io: Server, roomCode: string) {
  const room = store.getState().game.rooms[roomCode];
  if (room) {
    io.to(roomCode).emit("GAME_STATE_UPDATE", room);
  }
}
