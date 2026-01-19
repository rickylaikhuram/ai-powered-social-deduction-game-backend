import express from "express";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { registerGameHandlers } from "./sockets/game.js";
import { store } from "./store/index.js";
import { removePlayer, changeCurrentSpeaker } from "./store/gameSlice.js";
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
    const roomCode = Object.keys(state).find((code) =>
      state[code]?.players.some((p) => p.socketId === socket.id),
    );

    if (roomCode) {
      const room = state[roomCode];
      if (!room) return;
      const player = room.players.find((p) => p.socketId === socket.id);

      console.log(`Signal Lost: ${player?.name || "Unknown"} from ${roomCode}`);

      // Handle Speaker Timer if they were currently talking
      if (room.phase === "SPEAKING") {
        const alivePlayers = room.players.filter((p) => p.isAlive);
        if (alivePlayers.length > 0) {
          const currentSpeaker =
            alivePlayers[room.currentSpeakerIndex % alivePlayers.length];

          if (currentSpeaker?.socketId === socket.id) {
            stopSpeakerTimer(roomCode);
            store.dispatch(changeCurrentSpeaker({ roomCode }));

            if (alivePlayers.length > 3) {
              startSpeakerTimer(io, roomCode);
            }
          }
        }
      }

      // Remove player
      store.dispatch(removePlayer({ socketId: socket.id }));

      // Final Sync or Cleanup
      const updatedRoom = store.getState().game.rooms[roomCode];
      if (updatedRoom) {
        updateRoomState(io, roomCode);
      } else {
        console.log(`Room ${roomCode} has been closed (all players left).`);
      }
    }
  });
});
