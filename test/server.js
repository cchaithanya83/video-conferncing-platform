const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs'); // Required for file operations
const { SpeechClient } = require('@google-cloud/speech');

// Initialize Express app
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Google Cloud Speech-to-Text client
const client = new SpeechClient({
    keyFilename: './long-leaf-336308-60d419b7f42d.json', // Update with your path
});

// Route for audio transcription
app.post('/transcribe', async (req, res) => {
    const audioContent = req.body.audio;

    // Save the audio to a file
    const audioBuffer = Buffer.from(audioContent, 'base64'); // Convert base64 string to buffer
    const audioFilePath = './audio.wav'; // Define the path where you want to save the audio

    fs.writeFile(audioFilePath, audioBuffer, (err) => {
        if (err) {
            console.error('Error saving audio:', err);
            return res.status(500).send('Error saving audio');
        }
        console.log('Audio saved successfully:', audioFilePath);
    });

    const request = {
        config: {
            encoding: 'LINEAR16', // Ensure this matches your audio encoding
            sampleRateHertz: 48000, // Update to 48000 Hz
            languageCode: 'en-US',
        },
        audio: {
            content: audioContent,
        },
    };
    

    try {
        const [response] = await client.recognize(request);
        console.log(response);  // Log the response for debugging

        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');
        
        console.log(transcription);  // Log the response for debugging

        res.json({ transcription });
    } catch (error) {
        console.error('Transcription error:', error);  // Log the error details
        res.status(500).send('Error transcribing audio');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
