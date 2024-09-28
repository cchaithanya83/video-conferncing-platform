const videoElement = document.getElementById('video');
const expressionDiv = document.getElementById('expression');
const transcriptionDiv = document.getElementById('transcription');
const startButton = document.getElementById('startButton'); // Button to start recording
const stopButton = document.getElementById('stopButton'); // Button to stop recording
let recorder; // Store the recorder instance
let audioStream; // Store the audio stream

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,

    });

    videoElement.srcObject = stream;
    return stream;
}

async function analyzeExpressions(video) {
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceExpressionNet.loadFromUri('/models');

    setInterval(async () => {
        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
        if (detections.length > 0) {
            const expression = detections[0].expressions.asSortedArray()[0];
            expressionDiv.innerText = `Expression: ${expression.expression} (${(expression.probability * 100).toFixed(2)}%)`;
        }
    }, 100);
}

async function setupAudioRecording(stream) {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
        audioStream = new MediaStream();
        audioStream.addTrack(audioTracks[0]); // Only take the audio track from the stream

        recorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm; codecs=opus' // Change to a suitable mime type if needed
        });
        
        const audioChunks = [];
        
        recorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        recorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            const reader = new FileReader();
            
            reader.onloadend = async () => {
                const audioContent = reader.result.split(',')[1]; // Get base64 string
                const response = await fetch('http://localhost:3000/transcribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ audio: audioContent }),
                });
                
                const result = await response.json();
                transcriptionDiv.innerText = `Transcription: ${result.transcription}`;
            };
            
            reader.readAsDataURL(audioBlob); // Convert Blob to base64
        };
    } else {
        console.error("No audio tracks available.");
    }
}


// Function to start recording
function startRecording() {
    if (recorder) {
        recorder.start();
        console.log("Recording started");
    }
}

// Function to stop recording
function stopRecording() {
    if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        console.log("Recording stopped");
    }
}

async function main() {
    const stream = await setupCamera();
    await setupAudioRecording(stream); // Set up audio recording
    await analyzeExpressions(videoElement); // Uncomment if you want to analyze expressions
}

// Set up button event listeners
startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);

main();
