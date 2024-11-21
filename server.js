const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const { SpeechClient } = require("@google-cloud/speech");
const stream = require("stream");
const mongoose = require("mongoose");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Initialize Google Cloud Speech-to-Text client
const speechClient = new SpeechClient();

// MongoDB connection
mongoose
  .connect("mongodb+srv://21d12chaithanya:FyO6JsIDpypOTjl9@cluster0.1m7tq.mongodb.net/", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Define the Meeting schema and model
const meetingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  intervieweeName: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true },
  jobDescription: { type: String, required: true },
  interviewType: { type: String, required: true },
  importantQuestions: { type: [String], required: true },
  interviewerName: { type: String, required: true },
  interviewerEmail: { type: String, required: true },
});

const Meeting = mongoose.model('Meeting', meetingSchema);

// Define the Resume schema and model
const resumeSchema = new mongoose.Schema({
  filename: String,
  content: String,
  name: String,
  email: String,
});

const Resume = mongoose.model('Resume', resumeSchema);

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

// API to fetch meeting details by meeting ID and corresponding resume by email
app.get("/api/meeting/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch meeting by ID
    const meeting = await Meeting.findById(id);

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    // Fetch the corresponding resume by email (from the meeting)
    const resume = await Resume.findOne({ email: meeting.email });

    if (!resume) {
      return res.status(404).json({ message: "Resume not found for the given email" });
    }

    // Send the meeting and resume data back as a response
    res.status(200).json({
      meeting,
      resume,
    });
  } catch (error) {
    console.error("Error fetching meeting or resume details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
