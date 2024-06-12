let socket;
let peerConnection;
let localStream;

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
    peerConnection = new RTCPeerConnection();

    socket.on('connect', () => {
        statusElement.textContent = 'Connected to signaling server';
        socket.emit('joinRoom', 'room1'); // 加入房間
        startWebRTCProcess();
    });

    socket.on('peerconnectSignaling', (message) => {
        if (message.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                .then(() => {
                    statusElement.textContent = 'Received answer from peer';
                })
                .catch(error => {
                    console.error('Error setting remote description:', error);
                    statusElement.textContent = `Error setting remote description: ${error.name} - ${error.message}`;
                });
        } else if (message.type === 'candidate') {
            peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
                .then(() => {
                    statusElement.textContent = 'Received ICE candidate from peer';
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
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then(stream => {
                localStream = stream;
                document.getElementById('localVideo').srcObject = stream;

                stream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, stream);
                });

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
                console.error('Error accessing media devices.', error);
                statusElement.textContent = `Error accessing media devices: ${error.name} - ${error.message}`;
            });
    }

    peerConnection.onicecandidate = (event) => {
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
}
