let socket;
let peerConnection;

function updateServerIp() {
    const serverIp = document.getElementById('serverIp').value;
    const clientName = "peer2";
    if (!serverIp) {
        alert('Please enter a valid server IP');
        return;
    }

    const signalingServerUrl = `https://${serverIp}:3000`;
    if (socket) {
        socket.disconnect();
    }
    socket = io(signalingServerUrl, { query: { name: clientName } });

    const statusElement = document.getElementById('status');
    peerConnection = new RTCPeerConnection();

    socket.on('connect', () => {
        statusElement.textContent = 'Connected to signaling server, waiting for Offer';
        socket.emit('joinRoom', 'room1'); // 加入房間
    });

    socket.on('peerconnectSignaling', (message) => {
        console.log('Received signaling message:', message);
        if (message.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp))
                .then(() => {
                    return peerConnection.createAnswer();
                })
                .then(answer => {
                    return peerConnection.setLocalDescription(answer);
                })
                .then(() => {
                    socket.emit('peerconnectSignaling', { type: 'answer', sdp: peerConnection.localDescription });
                    statusElement.textContent = 'Sent answer to signaling server';
                })
                .catch(error => {
                    console.error('Error creating answer:', error);
                    statusElement.textContent = `Error creating answer: ${error.name} - ${error.message}`;
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

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('peerconnectSignaling', { type: 'candidate', candidate: event.candidate });
            statusElement.textContent = 'Sending ICE candidate to signaling server';
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            statusElement.textContent = 'Received remote stream';
        }
    };
}
