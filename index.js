const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Configuration
const YT_DLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Verify yt-dlp exists
if (!fs.existsSync(YT_DLP_PATH)) {
    console.error('Error: yt-dlp.exe not found. Please download it manually from:');
    console.error('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
    console.error('And place it in:', __dirname);
    process.exit(1);
}

// Create downloads directory if it doesn't exist
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Track active downloads
const activeDownloads = new Map();

// Route to serve HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Download endpoint
app.post('/download', async (req, res) => {
    const url = req.body.url;
    const format = req.body.format || 'best';
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Create a unique identifier for this download
    const downloadId = Date.now();
    const outputTemplate = `${downloadId}_%(title)s.%(ext)s`;
    const outputPath = path.join(DOWNLOADS_DIR, outputTemplate);

    let command;
    if (process.platform === 'win32') {
        // Windows command
        if (format === 'audio') {
            command = `"${YT_DLP_PATH}" -x --audio-format mp3 -o "${outputPath}" "${url}"`;
        } else {
            command = `"${YT_DLP_PATH}" -f ${format} -o "${outputPath}" "${url}"`;
        }
    } else {
        // Unix/Linux/Mac command
        if (format === 'audio') {
            command = `"${YT_DLP_PATH}" -x --audio-format mp3 -o "${outputPath}" "${url}"`;
        } else {
            command = `"${YT_DLP_PATH}" -f ${format} -o "${outputPath}" "${url}"`;
        }
    }

    // Store the download information
    activeDownloads.set(downloadId, {
        url,
        status: 'downloading',
        outputPath: null
    });

    exec(command, (error, stdout, stderr) => {
        const downloadInfo = activeDownloads.get(downloadId);
        
        if (error) {
            console.error(`Error: ${error.message}`);
            activeDownloads.delete(downloadId);
            return res.status(500).json({ 
                error: 'Download failed',
                details: error.message,
                stderr: stderr
            });
        }

        // Find the actual file that was created
        const files = fs.readdirSync(DOWNLOADS_DIR).filter(file => file.startsWith(downloadId));
        if (files.length === 0) {
            activeDownloads.delete(downloadId);
            return res.status(500).json({ error: 'Download completed but no file found' });
        }

        const downloadedFile = files[0];
        const filePath = path.join(DOWNLOADS_DIR, downloadedFile);
        
        // Update download info
        downloadInfo.status = 'completed';
        downloadInfo.outputPath = filePath;
        downloadInfo.fileName = downloadedFile;
        
        res.json({ 
            success: true, 
            fileName: downloadedFile,
            filePath: `/downloads/${downloadedFile}`,
            downloadId
        });
    });
});

// Route to serve downloaded files
app.get('/downloads/:filename', (req, res) => {
    const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).send('File not found');
    }
});

// Route to check download status
app.get('/download/status/:id', (req, res) => {
    const downloadInfo = activeDownloads.get(Number(req.params.id));
    if (!downloadInfo) {
        return res.status(404).json({ error: 'Download not found' });
    }
    res.json(downloadInfo);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Downloads will be saved to: ${DOWNLOADS_DIR}`);
});