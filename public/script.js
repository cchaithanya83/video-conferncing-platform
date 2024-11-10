const socket = io();

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

// Initialize Web Speech API for speech recognition
let recognition;
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition(); // For Chrome
} else if ('SpeechRecognition' in window) {
  recognition = new SpeechRecognition(); // For other browsers
}

if (recognition) {
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    updateTranscription(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
  };

  recognition.start();
}

// Prompt user for their name and start the app
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
      setupControls();
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

// Function to add a video stream to the UI
function addVideoStream(peerId, stream, name, isLocal) {
  let videoContainer = document.getElementById(`video-container-${peerId}`);
  if (!videoContainer) {
    videoContainer = document.createElement("div");
    videoContainer.classList.add("video-container");
    videoContainer.id = `video-container-${peerId}`;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    videoContainer.appendChild(video);

    const nameTag = document.createElement("div");
    nameTag.classList.add("name-tag");
    nameTag.textContent = name;
    videoContainer.appendChild(nameTag);

    videoGrid.appendChild(videoContainer);
  }
}

// Set up control buttons for single user
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
    window.location.reload();
  });
}
