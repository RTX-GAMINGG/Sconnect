// index.js
const fs = require('fs');
const path = require('path');

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Filter = require('bad-words');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const customBadWords = require('./badwords'); 
const filter = new Filter({ list: customBadWords });

let chatHistory = [];

try {
  const data = fs.readFileSync('messages.json', 'utf-8');
  chatHistory = JSON.parse(data);
} catch (error) {
  console.log('Error loading chat history:', error);
}

app.get('/usernames', (req, res) => {
  const filePath = path.join(__dirname, 'usernames.json');
  res.sendFile(filePath);
});


function calculateHeat(message, blockedWord) {
  const regex = new RegExp(blockedWord, 'gi');
  const totalLetters = message.length;
  const matchedLetters = (message.match(regex) || []).join('').length;
  return (matchedLetters / totalLetters) * 100;
}

wss.on('connection', (ws, req) => {
  const clientIP = req.connection.remoteAddress;
  console.log(`Client connected from IP: ${clientIP}`);

  ws.on('close', () => {
    console.log(`Connection closed for client IP: ${clientIP}`);
  });

  chatHistory.forEach((messageData) => {
    if (messageData.type === 'message') {
      ws.send(JSON.stringify(messageData));
    }
  });

  ws.on('message', (message) => {
    try {
      const messageData = JSON.parse(message);
      console.log(`Received message from ${clientIP}:`, messageData);

      if (messageData.type === 'message') {

        if (filter.isProfane(messageData.message)) {
          console.log(`Message contains bad words. Blocked for client IP: ${clientIP}`);
          return; 
        }

        // Check if message matches blocked words by heat threshold
        const blockedWords = customBadWords.filter(word => calculateHeat(messageData.message, word) >= 60);
        if (blockedWords.length > 0) {
          console.log(`Message matches blocked words by heat. Blocked for client IP: ${clientIP}`);
          return; 
        }

        messageData.timestamp = new Date();
        chatHistory.push(messageData);
        fs.writeFileSync('messages.json', JSON.stringify(chatHistory), 'utf-8');
      }

      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(messageData));
        }
      });
    } catch (error) {
      console.error('Invalid JSON message:', message);
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

app.get('/', (req, res) => {
  const WebSocketURL = `wss://${req.get('host')}`;
  console.log(`WebSocket server is running at: ${WebSocketURL}`);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
