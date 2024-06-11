const signalingServerUrl = 'ws://140.114.87.235:8080';
const signalingSocket = new WebSocket(signalingServerUrl);

const peerConnection = new RTCPeerConnection();
let localStream;

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
        signalingSocket.send(JSON.stringify({ type: 'offer', sdp: peerConnection.localDescription }));
    })
    .catch(error => console.error('Error accessing media devices.', error));

signalingSocket.onmessage = (message) => {
    const data = JSON.parse(message.data);

    if (data.type === 'answer') {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'candidate') {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
};

peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
        signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
};
