const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');  // Add this line

const app = express();
const upload = multer({ dest: 'uploads/' });

const appId = '1505587279905625';
const userAccessToken = 'EAAVZAUtrZCQ1kBO9dpWCD4clZCzBpHLuZAvfnh0l3aoxufygVTQjqwUbxbBrz9Df0mr9nwVeqY9DH7XfyyVO93ZAuJRVRhlRFGkLU5QyMOf1sGfSRttxiAQNhiJ1re3OEeMhfYQQ7cZBUE9O3e2dUKLfA7QYUtWDZBK4yDZBPITiziDHDok0k3ROQYnIVb5UOY4vjahKQYaCA7rQbbHenwZDZD';

// Step 1: Start an upload session
async function startUploadSession(filePath) {
    try {
        const fileLength = fs.statSync(filePath).size;
        const fileName = path.basename(filePath);
        const fileType = mime.lookup(filePath);  // Use mime-types to get MIME type

        const response = await axios.post(`https://graph.facebook.com/v20.0/${appId}/uploads`, null, {
            params: {
                file_name: fileName,
                file_length: fileLength,
                file_type: fileType,
                access_token: userAccessToken
            }
        });
        const uploadSessionId = response.data.id.split(':')[1];
        console.log('Upload session started:', uploadSessionId);
        return uploadSessionId;
    } catch (error) {
        console.error('Error starting upload session:', error.response ? error.response.data : error.message);
    }
}

// Step 2: Start the upload
async function uploadFile(uploadSessionId, filePath, fileOffset = 0) {
    try {
        const fileStream = fs.createReadStream(filePath, { start: fileOffset });
        const fileSize = fs.statSync(filePath).size;

        const response = await axios.post(`https://graph.facebook.com/v20.0/upload:${uploadSessionId}`, fileStream, {
            headers: {
                Authorization: `OAuth ${userAccessToken}`,
                'file_offset': fileOffset,
                'Content-Length': fileSize - fileOffset
            }
        });
        const uploadedFileHandle = response.data.h;
        console.log('File uploaded successfully:', uploadedFileHandle);
        return uploadedFileHandle;
    } catch (error) {
        console.error('Error uploading file:', error.response ? error.response.data : error.message);
    }
}

// Step 3: Resume an interrupted upload
async function resumeUpload(uploadSessionId, filePath) {
    try {
        const response = await axios.get(`https://graph.facebook.com/v20.0/upload:${uploadSessionId}`, {
            headers: {
                Authorization: `OAuth ${userAccessToken}`
            }
        });
        const fileOffset = response.data.file_offset;
        console.log('Resuming upload from offset:', fileOffset);
        return uploadFile(uploadSessionId, filePath, fileOffset);
    } catch (error) {
        console.error('Error resuming upload:', error.response ? error.response.data : error.message);
    }
}

// Publishing the uploaded file as a photo (as an example)
async function publishFile(uploadedFileHandle) {
    try {
        const response = await axios.post(`https://graph.facebook.com/v20.0/me/photos`, null, {
            params: {
                access_token: userAccessToken,
                published: 'false', // Add this line if you don't want to publish immediately
            },
            data: {
                file_url: uploadedFileHandle,
                caption: 'Uploaded via API'
            }
        });
        console.log('Photo published successfully:', response.data);
    } catch (error) {
        console.error('Error publishing photo:', error.response ? error.response.data : error.message);
    }
}

// Endpoint to handle file upload from body
app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = req.file.path;
    try {
        const uploadSessionId = await startUploadSession(filePath);
        if (uploadSessionId) {
            const uploadedFileHandle = await uploadFile(uploadSessionId, filePath);
            if (!uploadedFileHandle) {
                await resumeUpload(uploadSessionId, filePath);
            } else {
                await publishFile(uploadedFileHandle);
            }
            res.status(200).json({ message: 'File uploaded and published successfully', fileHandle: uploadedFileHandle });
        } else {
            res.status(500).json({ message: 'Failed to start upload session' });
        }
    } catch (error) {
        console.error('Error during upload process:', error.message);
        res.status(500).json({ message: 'Upload failed', error: error.message });
    } finally {
        // Cleanup: remove the file from the server
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err.message);
            } else {
                console.log('File deleted successfully');
            }
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
