import express from "express";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { registerGameHandlers } from "./sockets/game.js";
import { store } from "./store/index.js";
import {
  removePlayer,
  changeCurrentSpeaker,
} from "./store/gameSlice.js";
import { stopSpeakerTimer, startSpeakerTimer } from "./engine/timer.js";
import { updateRoomState } from "./engine/broadcast.js";

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Shadow Signal Server is Online");
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket"],
});

io.on("connection", (socket: Socket) => {
  console.log("Signal Connected:", socket.id);

  registerGameHandlers(io, socket);

  socket.on("disconnect", () => {
    const state = store.getState().game.rooms;

    // Find the room the player was in
    for (const roomCode in state) {
      const room = state[roomCode];
      if (!room) return;
      const playerIndex = room.players.findIndex(
        (p) => p.socketId === socket.id,
      );

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        if (!player) return;
        console.log(`Signal Lost: ${player.name} from ${roomCode}`);

        // If it was their turn to speak, skip them before removing
        const alivePlayers = room.players.filter((p) => p.isAlive);
        const currentSpeaker =
          alivePlayers[room.currentSpeakerIndex % alivePlayers.length];

        if (
          room.phase === "SPEAKING" &&
          currentSpeaker?.socketId === socket.id
        ) {
          stopSpeakerTimer(roomCode);
          store.dispatch(changeCurrentSpeaker({ roomCode }));
          startSpeakerTimer(io, roomCode);
        }

        // Remove the player from state
        store.dispatch(removePlayer({ socketId: socket.id }));

        // Final Sync
        updateRoomState(io, roomCode);
        break;
      }
    }
  });
});
