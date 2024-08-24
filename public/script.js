// public/script.js
const socket = io();

// DOM elements
const nameModal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const videoGrid = document.getElementById("video-grid");
const toggleCameraButton = document.getElementById("toggleCamera");
const toggleMicButton = document.getElementById("toggleMic");
const leaveBtn = document.getElementById("leaveBtn");

// User information
let userName = "";
let localStream;
let peers = {}; // Map of peerId to RTCPeerConnection

// STUN servers configuration
const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, // Google's public STUN server
  ],
};

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
  // Get user's media (camera and microphone)
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      addVideoStream("local", stream, userName, true);
      socket.emit("join-room", "mainRoom", userName);
      setupControls();
      monitorAudio(stream, "local", true);
    })
    .catch((error) => {
      console.error("Error accessing media devices.", error);
      alert("Could not access camera and microphone.");
    });
}

// Listen for users connecting to the room
socket.on("user-connected", (peerId, peerName) => {
  console.log("User connected:", peerId, peerName);
  connectToPeer(peerId, peerName);
});

// Listen for signaling messages
socket.on("signal", async (data) => {
  const { from, signal, userName: peerName } = data;
  console.log(`Received ${signal.type} from ${from}`);

  if (from === socket.id) return; // Ignore messages from self

  if (!peers[from]) {
    // Create a new peer connection if it doesn't exist
    await connectToPeer(from, peerName, signal);
  }

  const peerConnection = peers[from].connection;

  if (signal.type === "offer") {
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(signal)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", {
        to: from,
        signal: peerConnection.localDescription,
        userName,
      });
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  } else if (signal.type === "answer") {
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(signal)
      );
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  } else if (signal.candidate) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(signal.candidate)
      );
    } catch (err) {
      console.error("Error adding received ICE candidate:", err);
    }
  }
});

// Listen for users disconnecting from the room
socket.on("user-disconnected", (peerId, peerName) => {
  console.log("User disconnected:", peerId, peerName);
  if (peers[peerId]) {
    peers[peerId].connection.close();
    delete peers[peerId];
  }
  removeVideoStream(peerId);
});

// Function to connect to a new peer
async function connectToPeer(peerId, peerName, incomingSignal = null) {
  const peerConnection = new RTCPeerConnection(servers);
  peers[peerId] = { connection: peerConnection, name: peerName };

  // Add local stream tracks to the peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Create a new remote stream for this peer
  const remoteStream = new MediaStream();

  // When a remote track is received, add it to the remote stream
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    addVideoStream(peerId, remoteStream, peerName, false);
    monitorAudio(remoteStream, peerId, false);
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        to: peerId,
        signal: { candidate: event.candidate },
        userName,
      });
    }
  };

  // Handle negotiation needed event
  peerConnection.onnegotiationneeded = async () => {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("signal", {
        to: peerId,
        signal: peerConnection.localDescription,
        userName,
      });
    } catch (err) {
      console.error("Error during negotiation:", err);
    }
  };

  // If there's an incoming offer, set the remote description and respond with an answer
  if (incomingSignal && incomingSignal.type === "offer") {
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(incomingSignal)
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("signal", {
        to: peerId,
        signal: peerConnection.localDescription,
        userName,
      });
    } catch (err) {
      console.error("Error handling incoming offer:", err);
    }
  }
}

// Function to add a video stream to the UI
function addVideoStream(peerId, stream, name, isLocal) {
  // Check if the video container already exists
  let videoContainer = document.getElementById(`video-container-${peerId}`);
  if (!videoContainer) {
    // Create video container
    videoContainer = document.createElement("div");
    videoContainer.classList.add("video-container");
    videoContainer.id = `video-container-${peerId}`;

    // Create video element
    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true; // Mute local video to prevent echo
    videoContainer.appendChild(video);

    // Create name tag
    const nameTag = document.createElement("div");
    nameTag.classList.add("name-tag");
    nameTag.textContent = name;
    videoContainer.appendChild(nameTag);

    // Create speaking indicator
    const speakingIndicator = document.createElement("div");
    speakingIndicator.classList.add("speaking-indicator");
    videoContainer.appendChild(speakingIndicator);

    // Add to video grid
    videoGrid.appendChild(videoContainer);
  }
}

// Function to remove a video stream from the UI
function removeVideoStream(peerId) {
  const videoContainer = document.getElementById(`video-container-${peerId}`);
  if (videoContainer) {
    videoGrid.removeChild(videoContainer);
  }
}

// Function to set up control buttons
function setupControls() {
  // Toggle Camera
  toggleCameraButton.addEventListener("click", () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      toggleCameraButton.textContent = videoTrack.enabled
        ? "Turn Camera Off"
        : "Turn Camera On";
    }
  });

  // Toggle Microphone
  toggleMicButton.addEventListener("click", () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      toggleMicButton.textContent = audioTrack.enabled
        ? "Turn Mic Off"
        : "Turn Mic On";
    }
  });

  // Leave Conference
  leaveBtn.addEventListener("click", () => {
    // Close all peer connections
    for (let peerId in peers) {
      peers[peerId].connection.close();
    }
    peers = {};

    // Stop all local media tracks
    localStream.getTracks().forEach((track) => track.stop());

    // Remove all video elements
    videoGrid.innerHTML = "";

    // Reload the page to reset
    window.location.reload();
  });
}

// Function to monitor audio and display speaking indicator
function monitorAudio(stream, peerId, isLocal) {
  const videoContainer = document.getElementById(`video-container-${peerId}`);
  if (!videoContainer) return;
  const speakingIndicator = videoContainer.querySelector(".speaking-indicator");

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function detectSpeaking() {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    const threshold = isLocal ? 20 : 30; // Adjust thresholds as needed

    if (avg > threshold) {
      speakingIndicator.style.display = "block";
    } else {
      speakingIndicator.style.display = "none";
    }

    requestAnimationFrame(detectSpeaking);
  }

  detectSpeaking();
}
