let socket;
let peerConnection;
let localStream;
const classColors = [
    "rgb(50, 205, 154)",    // 綠豆色
    "rgb(106, 233, 247)",   // 淺黃
    "rgb(0, 0, 0)",         // 黑
    "rgb(255, 69, 0)",      // 橘紅
    "rgb(255, 255, 0)"      // 黃
];

document.getElementById('serverIp').value = window.location.hostname; // 這裡改為使用瀏覽器的 hostname
function updateServerIp() {
    const serverIp = document.getElementById('serverIp').value;
    const clientName = 'peer1'; // 設定客戶端的名字
    if (!serverIp) {
        alert('Please enter a valid server IP');
        return;
    }

    const signalingServerUrl = `https://${serverIp}:3000`;
    if (socket) {
        socket.disconnect();
    }
    socket = io(signalingServerUrl, { query: { name: clientName } }); // 傳遞 name 參數

    const statusElement = document.getElementById('status');
    const peer2condition = document.getElementById('I_status');
    peerConnection = new RTCPeerConnection();
    socket.on('peer2Condition', (message) => {
        if (message === 'ok') {
            peer2condition.textContent = 'connected';
        }
        else {
            peer2condition.textContent = 'reconnecting...';
        }
    });
    socket.on('connect', () => {
        statusElement.textContent = 'Connected to signaling server';
        socket.emit('joinRoom', 'room1'); // 加入房間
        startWebRTCProcess();
    });

    socket.on('peerconnectSignaling', (message) => {
        if (message.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(message))
                .then(() => {
                    console.log('Received answer from peer');
                    statusElement.textContent = 'Received answer from peer';
                })
                .catch(error => {
                    console.error('Error setting remote description:', error);
                    console.log(message);
                    statusElement.textContent = `Error setting remote description: ${error.name} - ${error.message}`;
                });
        } else if (message.type === 'candidate') {
            peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
                .then(() => {
                    console.log('Received ICE candidate from peer');
                })
                .catch(error => {
                    console.error('Error adding ICE candidate:', error);
                    statusElement.textContent = `Error adding ICE candidate: ${error.name} - ${error.message}`;
                });
        }
    });

    socket.on('disconnect', () => {
        statusElement.textContent = 'Disconnected from signaling server';
    });

    function startWebRTCProcess() {
        let w, h;
        // get resoultion selection
        if (document.getElementById('resolution').value == "640x360") {
            w = 640;
            h = 360;
        } else if (document.getElementById('resolution').value == "1280x720") {
            w = 1280;
            h = 720;
        } else if (document.getElementById('resolution').value == "1920x1080") {
            w = 1920;
            h = 1080;
        } 

        // close existing connections
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
            });
            localStream = null;
        }

        navigator.mediaDevices.getUserMedia({ video: true, audio: false , video: { facingMode: "environment", width: w , height: h }})
            .then(stream => {
                localStream = stream;
                document.getElementById('localVideo').srcObject = stream;

                stream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, stream);
                });

                let id = setInterval(() => {
                    const res = document.getElementById('res');
                    const s_res = document.getElementById('s-res');
                    const qlr = document.getElementById('qlr');
                    const rRTT= document.getElementById('rRTT');
                    try{
                        peerConnection.getSenders().forEach(x => {
                            x.getStats().then(stats => {
                                stats.forEach(report => {
                                    console.log(report);
                                    if (report.type === 'outbound-rtp') {
                                        res.textContent = report.frameWidth + 'x' + report.frameHeight + ', FPS: ' + report.framesPerSecond;
                                        qlr.textContent = report.qualityLimitationReason;
                                    }
                                    else if (report.type === 'media-source') {
                                        s_res.textContent = report.width + 'x' + report.height + ', FPS: ' + report.framesPerSecond;
                                    }
                                    else if (report.type === 'remote-inbound-rtp') {
                                        rRTT.textContent = report.roundTripTime*1000 + ' ms';
                                    }
                                });
                            });
                            console.warn("===================================");
                        });
                    }
                    catch (error) {
                        console.error('Error getting video resolution:', error);
                        res.textContent = 'Error getting video resolution';
                        clearInterval(id);
                    }
                }, 1000); // 延遲 1 秒來確保數據已更新

                return peerConnection.createOffer();
            })
            .then(offer => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                if (socket.connected) {
                    socket.emit('peerconnectSignaling', { type: 'offer', sdp: peerConnection.localDescription });
                    statusElement.textContent = 'Offer sent to signaling server';
                } else {
                    statusElement.textContent = 'Waiting for signaling server connection...';
                    socket.on('connect', () => {
                        socket.emit('peerconnectSignaling', { type: 'offer', sdp: peerConnection.localDescription });
                        statusElement.textContent = 'Offer sent to signaling server';
                    });
                }
            })
            .catch(error => {
                alert('Error accessing media devices.', error);
                statusElement.textContent = `Error accessing media devices: ${error.name} - ${error.message}`;
            });
    }

    peerConnection.onicecandidate = (event) => {
        // 嘗試找到所有可能的網絡候選，這些候選描述了其他對等端可以通過網絡連接到當前瀏覽器的方式

        if (event.candidate) {
            if (socket.connected) {
                socket.emit('peerconnectSignaling', { type: 'candidate', candidate: event.candidate });
                statusElement.textContent = 'Sending ICE candidate to signaling server';
            } else {
                socket.on('connect', () => {
                    socket.emit('peerconnectSignaling', { type: 'candidate', candidate: event.candidate });
                    statusElement.textContent = 'Sending ICE candidate to signaling server';
                });
            }
        }
    };

    // 創建 Data Channel
    let dataChannel = peerConnection.createDataChannel('bboxChannel');

    // Data Channel 開啟事件
    dataChannel.onopen = function() {
        function sendTimestamp() {
            const timestamp = Date.now();
            dataChannel.send(JSON.stringify({ type: 'timestamp', timestamp }));
            console.log('Timestamp sent:', timestamp);
        }
        sendTimestamp();
    };

    // Data Channel 接收訊息事件
    dataChannel.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.type === 'timestamp-reply') {
            const rtt = Date.now() - message.originalTimestamp;
            console.log('RTT calculated:', rtt, 'ms');
            document.getElementById('RTT').textContent = rtt + ' ms';
        }
        else if (message.type === 'bbox') {
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
    
            // 清除先前的繪製
            ctx.clearRect(0, 0, canvas.width, canvas.height);
    
            if (message.bboxes.length === 0) {
                document.getElementById('bbox').textContent = 'No target detected';
            } else {
                // 顯示第一個 bbox 的標籤
                document.getElementById('bbox').textContent = message.bboxes[0].label;
    
                // 繪製所有 bbox
                message.bboxes.forEach(bbox => {
                    // 計算縮放比例
                    const scaleX = canvas.width / bbox.w;
                    const scaleY = canvas.height / bbox.h;
    
                    // 計算縮放後的 bbox 座標
                    const x1 = bbox.x1 * scaleX;
                    const y1 = bbox.y1 * scaleY;
                    const x2 = bbox.x2 * scaleX;
                    const y2 = bbox.y2 * scaleY;
    
                    // 獲取對應 cls 的顏色
                    const color = classColors[bbox.class % classColors.length];
    
                    // 繪製矩形
                    ctx.beginPath();
                    ctx.rect(x1, y1, x2 - x1, y2 - y1);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.stroke();
    
                    // 添加標籤文字
                    ctx.fillStyle = color;
                    ctx.font = '16px Arial';
                    ctx.fillText(`${bbox.label}`, x1, y1 - 11);
                });
            }
        }
    };

    // Data Channel 關閉事件
    dataChannel.onclose = function() {
        alert('Data Channel is closed');
    };

    // Data Channel 錯誤事件
    dataChannel.onerror = function(error) {
        console.log('Data Channel Error:', error);
    };

}

function resizeVideo() {
    const video = document.getElementById('localVideo');
    const aspectRatio = video.videoWidth / video.videoHeight;
    const windowRatio = window.innerWidth / window.innerHeight;
    const canvas = document.getElementById('canvas');
    if (windowRatio < aspectRatio) {
      video.style.width = 'auto';
      video.style.height = '100%';
    } else {
      video.style.width = '100%';
      video.style.height = 'auto';
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeVideo);
window.addEventListener('load', resizeVideo);
function toggleVideo() {
    const video = document.getElementById('localVideo');
    const button = document.getElementById('toggleButton');
    const canvas = document.getElementById('canvas');
    if (video.style.display === 'none' || video.style.display === '') {
        video.style.display = 'block';
        canvas.style.display = 'block';
        button.textContent = '隱藏視頻';
    } else {
        video.style.display = 'none';
        canvas.style.display = 'none';
        button.textContent = '顯示視頻';
    }
}
const toggleButton = document.getElementById('toggleButton').onclick = toggleVideo;

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.mozFullScreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}
const fullscreenButton = document.getElementById('fullscreenButton').onclick = toggleFullscreen;