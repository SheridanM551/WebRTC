let signalingSocket;
let peerConnection;

function updateServerIp() {
    const serverIp = document.getElementById('serverIp').value;
    if (!serverIp) {
        alert('Please enter a valid server IP');
        return;
    }

    const signalingServerUrl = `wss://${serverIp}:8080`;
    if (signalingSocket) {
        signalingSocket.close();
    }
    signalingSocket = new WebSocket(signalingServerUrl);

    const statusElement = document.getElementById('status');
    peerConnection = new RTCPeerConnection();

    signalingSocket.onopen = () => {
        statusElement.textContent = 'Connected to signaling server';
    };

    signalingSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusElement.textContent = 'WebSocket error';
    };

    signalingSocket.onmessage = (message) => {
        const data = JSON.parse(message.data);

        if (data.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
                .then(() => {
                    return peerConnection.createAnswer();
                })
                .then(answer => {
                    return peerConnection.setLocalDescription(answer);
                })
                .then(() => {
                    if (signalingSocket.readyState === WebSocket.OPEN) {
                        signalingSocket.send(JSON.stringify({ type: 'answer', sdp: peerConnection.localDescription }));
                        statusElement.textContent = 'Sent answer to signaling server';
                    } else {
                        signalingSocket.addEventListener('open', () => {
                            signalingSocket.send(JSON.stringify({ type: 'answer', sdp: peerConnection.localDescription }));
                            statusElement.textContent = 'Sent answer to signaling server';
                        });
                    }
                })
                .catch(error => {
                    console.error('Error creating answer.', error);
                    statusElement.textContent = `Error creating answer: ${error.name} - ${error.message}`;
                });
        } else if (data.type === 'candidate') {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                .then(() => {
                    statusElement.textContent = 'Received ICE candidate from peer';
                })
                .catch(error => {
                    console.error('Error adding ICE candidate:', error);
                    statusElement.textContent = `Error adding ICE candidate: ${error.name} - ${error.message}`;
                });
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            if (signalingSocket.readyState === WebSocket.OPEN) {
                signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
                statusElement.textContent = 'Sending ICE candidate to signaling server';
            } else {
                signalingSocket.addEventListener('open', () => {
                    signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
                    statusElement.textContent = 'Sending ICE candidate to signaling server';
                });
            }
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
