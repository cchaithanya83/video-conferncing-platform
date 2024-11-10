const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const { SpeechClient } = require("@google-cloud/speech");
const stream = require("stream");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Initialize Google Cloud Speech-to-Text client
const speechClient = new SpeechClient();

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Handle socket connections
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Handle audio stream from client
  socket.on("audio-stream", (audioData) => {
    console.log("Receiving audio stream");

    // Convert base64-encoded audio data back to binary
    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(audioData, "base64"));

    // Configure the request for Google Speech API
    const request = {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "en-US",
      },
      interimResults: true,
    };

    // Create a recognize stream
    const recognizeStream = speechClient
      .streamingRecognize(request)
      .on("error", console.error)
      .on("data", (data) => {
        if (data.results[0] && data.results[0].alternatives[0]) {
          const transcript = data.results[0].alternatives[0].transcript;
          console.log(`Transcript: ${transcript}`);

          // Send the transcript back to the client
          socket.emit("transcription-result", transcript);
        }
      });

    // Pipe audio data to Google Speech API
    bufferStream.pipe(recognizeStream);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
