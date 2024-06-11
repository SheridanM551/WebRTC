const signalingServerUrl = 'wss://140.114.87.235:8080';
const signalingSocket = new WebSocket(signalingServerUrl);

const statusElement = document.getElementById('status');
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
        statusElement.textContent = 'Offer sent to signaling server';
    })
    .catch(error => {
        console.error('Error accessing media devices.', error);
        statusElement.textContent = `Error accessing media devices: ${error.name} - ${error.message}`;
    });

signalingSocket.onopen = () => {
    statusElement.textContent = 'Connected to signaling server';
};

signalingSocket.onerror = (error) => {
    console.error('WebSocket error:', error);
    statusElement.textContent = 'WebSocket error';
};

signalingSocket.onmessage = (message) => {
    const data = JSON.parse(message.data);

    if (data.type === 'answer') {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
            .then(() => {
                statusElement.textContent = 'Received answer from peer';
            })
            .catch(error => {
                console.error('Error setting remote description:', error);
                statusElement.textContent = `Error setting remote description: ${error.name} - ${error.message}`;
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
        signalingSocket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
        statusElement.textContent = 'Sending ICE candidate to signaling server';
    }
};
