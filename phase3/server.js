const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const os = require('os');

// 獲取所有網絡接口
const networkInterfaces = os.networkInterfaces();

const print_wifi_ip = () => {
    // 這裡設定你的 WiFi 接口名稱
    const wifiInterfaceName = 'Wi-Fi';  // 這可能需要根據你的作業系統進行調整
    // 檢查是否存在 WiFi 網絡接口
    if (networkInterfaces[wifiInterfaceName]) {
        networkInterfaces[wifiInterfaceName].forEach(function(details) {
            if (details.family === 'IPv4' && !details.internal) {
                console.log(`WiFi IPv4 Address: ${details.address}`);
            }
        });
    } else {
        console.log('WiFi interface not found. Please check the interface name.');
        console.log(networkInterfaces)
    }
}
print_wifi_ip();
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

// peer2 condition
let peer2condition = false;

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
        if (name === 'peer2') {
            peer2condition = true;
            client.to(room).emit('peer2Condition', 'ok');
        } else if (name === 'peer1' && peer2condition) {
            client.to(room).emit('peer2Condition', 'ok');
        }

        
    });

    client.on('peerconnectSignaling', message => {
        const nowRoom = "room1"; //原本是用findNowRoom，但不知為何有錯，這裡直接寫死
        if (message['type'] === 'offer') {
            peer1offer = message;
        }
        console.log(`${name} 傳送了：`, message['type'], `, boardcasting to ${nowRoom}`);
        client.to(nowRoom).emit('peerconnectSignaling', message);
    });

    client.on('disconnect', () => {
        console.log(`socket 用戶離開 ${client.id} - 名字: ${name}`);
        if (name === 'peer2') {
            peer2condition = false;
        }
    });
});

server.listen(port,'0.0.0.0', () => { // 確保服務器監聽所有接口
    console.log(`Listening on port ${port}...`);
});