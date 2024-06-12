const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// 讀取自簽名證書
const server = https.createServer({
    cert: fs.readFileSync('ssl/cert.pem'), // 替換為你的證書路徑
    key: fs.readFileSync('ssl/key.pem') // 替換為你的證書路徑
}, app);

// 使用 express 來提供靜態文件
app.use(express.static('public'));

const io = require('socket.io')(server);

function findNowRoom(client) {
    return Object.keys(client.rooms).find(item => {
        return item !== client.id;
    });
}

io.on('connection', client => {
    const { name } = client.handshake.query; // 獲取客戶端的 name 參數
    console.log(`socket 用戶連接 ${client.id} - 名字: ${name}`);

    client.on('joinRoom', room => {
        console.log(`${name} 加入房間: ${room}`);
        
        const nowRoom = findNowRoom(client);
        if (nowRoom) {
            client.leave(nowRoom);
        }
        client.join(room, () => {
            io.sockets.in(room).emit('roomBroadcast', `${name} 已經加入聊天室！`);
        });
    });

    client.on('peerconnectSignaling', message => {
        console.log(`${name} 傳送了：`, message);
    
        const nowRoom = "room1"; //原本是用findNowRoom，但不知為何有錯，這裡直接寫死
        console.log(`boardcasting to ${nowRoom}`)
        client.to(nowRoom).emit('peerconnectSignaling', message);
    });

    client.on('disconnect', () => {
        console.log(`socket 用戶離開 ${client.id} - 名字: ${name}`);
    });
});

server.listen(port,'0.0.0.0', () => { // 確保服務器監聽所有接口
    console.log(`Listening on port ${port}...`);
});