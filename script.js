const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const localWebcamButton = document.getElementById('localWebcamButton');
const ipWebcamButton = document.getElementById('ipWebcamButton');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const saveButton = document.getElementById('saveButton');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let model;
let combinedCanvas;
let combinedCtx;
let chunks = [];
let mediaRecorder;
let detectedObjects = {}; // Object to store detected objects and their counts
let detectionsData = []; // Array to store detection data
let usingLocalWebcam = true;

// Check if webcam access is supported.
function getUserMediaSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// If webcam supported, add event listener to button for when user
// wants to activate it to call enableCam function which we will 
// define in the next step.
if (getUserMediaSupported()) {
    localWebcamButton.addEventListener('click', enableLocalWebcam);
    ipWebcamButton.addEventListener('click', enableIPWebcam);
} else {
    console.warn('getUserMedia() is not supported by your browser');
}

// Add event listener to the upload button
document.getElementById('uploadButton').addEventListener('click', enableUploadVideo);

// Enable the live webcam view and start classification.
function enableLocalWebcam(event) {
    usingLocalWebcam = true;
    enableCam(event);
}

function enableIPWebcam(event) {
    usingLocalWebcam = false;
    enableCam(event);
}

function enableUploadVideo(event) {
    event.preventDefault(); // Prevent default form submission behavior
    enableCam(event);
}

function enableCam(event) {
    // Only continue if the COCO-SSD has finished loading.
    if (!model) {
        return;
    }

    // Hide the button once clicked.
    event.target.classList.add('removed');

    // Check if a video file has been uploaded
    const videoUpload = document.getElementById('videoUpload');
    if (videoUpload.files.length > 0) {
        const uploadedVideo = videoUpload.files[0];
        video.src = URL.createObjectURL(uploadedVideo);
        video.addEventListener('loadeddata', () => {
            predictVideo();
        });
    } else {
        // Determine the video source URL based on whether it's a local webcam or IP webcam
        let videoSource;
        if (usingLocalWebcam) {
            videoSource = 'local';
        } else {
            // Replace 'YOUR_IP_WEBCAM_URL' with the actual URL of your IP webcam stream
            videoSource = 'http://192.168.1.3:8080/video';
        }

        // Activate the webcam stream.
        if (videoSource === 'local') {
            const constraints = {
                video: true
            };
            navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
                video.srcObject = stream;
                video.addEventListener('loadeddata', () => {
                    predictVideo();
                });
            });
        } else {
            document.getElementById('liveView').value = videoSource;
            // Set the src attribute of the video element to the IP webcam URL
            video.src = videoSource;
            video.addEventListener('loadeddata', () => {
                predictVideo();
            });
        }
    }
}

// Pretend model has loaded so we can try out the webcam code.
demosSection.classList.remove('invisible');

// Store the resulting model in the global scope of our app.
model = undefined;

// Before we can use COCO-SSD class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment 
// to get everything needed to run.
// Note: cocoSsd is an external object loaded from our index.html
// script tag import so ignore any warning in Glitch.
cocoSsd.load().then(function (loadedModel) {
    model = loadedModel;
    // Show demo section now model is ready to use.
    demosSection.classList.remove('invisible');
    
    // Initialize combined canvas after the model is loaded
    combinedCanvas = document.createElement('canvas');
    combinedCtx = combinedCanvas.getContext('2d');
    combinedCanvas.width = video.width;
    combinedCanvas.height = video.height;
    liveView.appendChild(combinedCanvas);
});

function predictVideo() {
    // Now let's start classifying a frame in the stream.
    model.detect(video).then(function (predictions) {
        // Draw video frame
        combinedCtx.drawImage(video, 0, 0, combinedCanvas.width, combinedCanvas.height);

        // Draw bounding boxes and labels on the combined canvas
        for (let n = 0; n < predictions.length; n++) {
            if (predictions[n].score > 0.66) {
                const bbox = predictions[n].bbox;
                // Draw bounding box
                combinedCtx.beginPath();
                combinedCtx.rect(bbox[0], bbox[1], bbox[2], bbox[3]);
                combinedCtx.lineWidth = 2;
                combinedCtx.strokeStyle = 'green';
                combinedCtx.stroke();
                combinedCtx.closePath();
                // Draw label
                combinedCtx.fillText(
                    predictions[n].class + ' - ' + Math.round(predictions[n].score * 100) + '%',
                    bbox[0],
                    bbox[1] > 10 ? bbox[1] - 5 : 10
                );

                // Increment the count of detected object
                if (detectedObjects.hasOwnProperty(predictions[n].class)) {
                    detectedObjects[predictions[n].class]++;
                } else {
                    detectedObjects[predictions[n].class] = 1;
                }

                // Store detection data
                detectionsData.push({
                    class: predictions[n].class,
                    score: predictions[n].score,
                    bbox: bbox
                });
            }
        }

        // Call this function again to keep predicting when the browser is ready.
        window.requestAnimationFrame(predictVideo);
    });
}

// Recording functions
startButton.addEventListener('click', startRecording);
stopButton.addEventListener('click', stopRecording);
saveButton.addEventListener('click', saveRecording);

function startRecording() {
    chunks = [];
    detectionsData = []; // Reset detection data
    const stream = combinedCanvas.captureStream();
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function(event) {
        if (event.data.size > 0) {
            chunks.push(event.data);
        }
    };
    mediaRecorder.start();
}

function stopRecording() {
    mediaRecorder.stop();
    // saveRecording();
}

function saveRecording() {
    // Save the detected objects, their counts, and detection data to a text file
    let textToWrite = '';

    // Detected objects and their counts
    for (const [object, count] of Object.entries(detectedObjects)) {
        textToWrite += `${object} ${count}\n`;
    }

    // Append the total count of each object at the end
    textToWrite += '\nTotal Counts:\n';
    for (const [object, count] of Object.entries(detectedObjects)) {
        textToWrite += `${object} ${count}\n`;
    }

    // Detection data
    for (let i = 0; i < detectionsData.length; i++) {
        const obj = detectionsData[i];
        textToWrite += `${obj.class} - ${Math.round(obj.score * 100)}%: ${obj.bbox}\n`;
    }

    const textBlob = new Blob([textToWrite], { type: 'text/plain' });

    // Save video and text files together
    const allChunks = chunks.concat(textBlob); // Combine video chunks with text file

    const videoBlob = new Blob(allChunks, { type: 'video/webm' });
    const videoUrl = URL.createObjectURL(videoBlob);
    const aVideo = document.createElement('a');
    document.body.appendChild(aVideo);
    aVideo.style = 'display: none';
    aVideo.href = videoUrl;
    aVideo.download = 'recorded_video.webm';
    aVideo.click();
    window.URL.revokeObjectURL(videoUrl);

    const textUrl = URL.createObjectURL(textBlob);
    const aText = document.createElement('a');
    document.body.appendChild(aText);
    aText.style = 'display: none';
    aText.href = textUrl;
    aText.download = 'recorded_data.txt';
    aText.click();
    window.URL.revokeObjectURL(textUrl);
}
