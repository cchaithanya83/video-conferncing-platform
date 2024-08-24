// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Handle socket connections
io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Join a room
  socket.on("join-room", (roomID, userName) => {
    socket.join(roomID);
    console.log(`${userName} joined room: ${roomID}`);

    // Notify others in the room about the new user
    socket.to(roomID).emit("user-connected", socket.id, userName);

    // Handle signaling messages
    socket.on("signal", (data) => {
      // Data contains: to, signal, userName
      io.to(data.to).emit("signal", {
        from: socket.id,
        signal: data.signal,
        userName: data.userName,
      });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`${userName} disconnected`);
      socket.to(roomID).emit("user-disconnected", socket.id, userName);
    });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
