const signalingServerUrl = 'ws://localhost:8080';
const signalingSocket = new WebSocket(signalingServerUrl);

const peerConnection = new RTCPeerConnection();

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
                signalingSocket.send(JSON.stringify({ type: 'answer', sdp: peerConnection.localDescription }));
            })
            .catch(error => console.error('Error creating answer.', error));
    } else if (data.type === 'candidate') {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
};

peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
};

peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
    }
};
