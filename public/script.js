const socket = io();

// Get meeting ID from URL
const urlParams = new URLSearchParams(window.location.search);
const meetingId = urlParams.get("meetingid");

// Function to fetch meeting details and save them to session cookies
async function fetchAndStoreMeetingDetails(meetingId) {
  if (!meetingId) {
    console.log("No meeting ID in the URL");
    return;
  }

  try {
    const response = await fetch(`/api/meeting/${meetingId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch meeting details: ${response.statusText}`);
    }

    const meetingDetails = await response.json();
    sessionStorage.setItem("meetingDetails", JSON.stringify(meetingDetails));
    console.log("Meeting details saved to session storage:", meetingDetails);
  } catch (error) {
    console.error("Error fetching meeting details:", error);
    alert("Failed to retrieve meeting details. Please try again.");
  }
}

// Fetch meeting details on page load
if (meetingId) {
  fetchAndStoreMeetingDetails(meetingId);
}

// DOM elements
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const videoGrid = document.getElementById("video-grid");
const toggleCameraButton = document.getElementById("toggleCamera");
const toggleMicButton = document.getElementById("toggleMic");
const leaveBtn = document.getElementById("leaveBtn");
const transcriptionDiv = document.getElementById("transcription");

// User information
let userName = "";
let localStream;
let peers = {}; // Map of peerId to RTCPeerConnection

// STUN servers configuration
const servers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// Initialize Web Speech API for speech recognition
let recognition;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition(); // For Chrome
} else if ("SpeechRecognition" in window) {
  recognition = new SpeechRecognition(); // For other browsers
} else {
  console.warn("Web Speech API is not supported in this browser.");
}

if (recognition) {
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    updateTranscription(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
  };

  recognition.onend = () => {
    console.log("Speech recognition ended.");
    recognition.start();
  };

  recognition.start();
}

// Prompt user for their name and join the conference
joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (name) {
    userName = name;
    nameModal.style.display = "none";
    initialize();
  } else {
    alert("Please enter your name.");
  }
});

// Initialize the application
function initialize() {
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      addVideoStream("local", stream, userName, true);
      socket.emit("join-room", meetingId, userName);
      setupControls();
      monitorAudio(stream, "local", true);
    })
    .catch((error) => {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera and microphone.");
    });
}

// Update transcription text in the UI
function updateTranscription(text) {
  transcriptionDiv.textContent = text;
}

// Listen for users connecting to the room
socket.on("user-connected", (peerId, peerName) => {
  console.log("User connected:", peerId, peerName);
  connectToPeer(peerId, peerName);
});

// Listen for signaling messages
socket.on("signal", async (data) => {
  const { from, signal, userName: peerName } = data;
  if (from === socket.id) return;

  if (!peers[from]) {
    await connectToPeer(from, peerName, signal);
  }

  const peerConnection = peers[from].connection;

  if (signal.type === "offer") {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", { to: from, signal: peerConnection.localDescription, userName });
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  } else if (signal.type === "answer") {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  } else if (signal.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch (err) {
      console.error("Error adding received ICE candidate:", err);
    }
  }
});

// Function to connect to a new peer
async function connectToPeer(peerId, peerName, incomingSignal = null) {
  const peerConnection = new RTCPeerConnection(servers);
  peers[peerId] = { connection: peerConnection, name: peerName };

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  const remoteStream = new MediaStream();
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    addVideoStream(peerId, remoteStream, peerName, false);
    monitorAudio(remoteStream, peerId, false);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: peerId, signal: { candidate: event.candidate }, userName });
    }
  };

  peerConnection.onnegotiationneeded = async () => {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", { to: peerId, signal: peerConnection.localDescription, userName });
    } catch (err) {
      console.error("Error during negotiation:", err);
    }
  };

  if (incomingSignal && incomingSignal.type === "offer") {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingSignal));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", { to: peerId, signal: peerConnection.localDescription, userName });
    } catch (err) {
      console.error("Error handling incoming offer:", err);
    }
  }
}

// Add video stream to UI
function addVideoStream(peerId, stream, name, isLocal) {
  const videoContainer = document.getElementById(`video-container-${peerId}`);
  if (!videoContainer) {
    const container = document.createElement("div");
    container.classList.add("video-container");
    container.id = `video-container-${peerId}`;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    container.appendChild(video);

    const nameTag = document.createElement("div");
    nameTag.classList.add("name-tag");
    nameTag.textContent = name;
    container.appendChild(nameTag);

    const speakingIndicator = document.createElement("div");
    speakingIndicator.classList.add("speaking-indicator");
    container.appendChild(speakingIndicator);

    videoGrid.appendChild(container);
  }
}

// Remove video stream from UI
function removeVideoStream(peerId) {
  const videoContainer = document.getElementById(`video-container-${peerId}`);
  if (videoContainer) {
    videoGrid.removeChild(videoContainer);
  }
}

// Set up control buttons
function setupControls() {
  toggleCameraButton.addEventListener("click", () => {
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach((track) => (track.enabled = !track.enabled));
    toggleCameraButton.textContent = videoTracks[0].enabled ? "Turn Camera Off" : "Turn Camera On";
  });

  toggleMicButton.addEventListener("click", () => {
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach((track) => (track.enabled = !track.enabled));
    toggleMicButton.textContent = audioTracks[0].enabled ? "Turn Mic Off" : "Turn Mic On";
  });

  leaveBtn.addEventListener("click", () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    Object.keys(peers).forEach((peerId) => peers[peerId].connection.close());
    socket.emit("leave-room");
    window.location.reload();
  });
}

// Monitor audio levels
function monitorAudio(stream, peerId, isLocal) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const speakingIndicator = document.querySelector(`#video-container-${peerId} .speaking-indicator`);
  const data = new Uint8Array(analyser.frequencyBinCount);

  function analyze() {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;

    if (speakingIndicator) {
      speakingIndicator.style.display = average > 10 ? "block" : "none";
    }

    requestAnimationFrame(analyze);
  }

  if (isLocal) analyze();
}
