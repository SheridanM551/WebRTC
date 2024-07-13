import asyncio
import cv2  # 導入 OpenCV
import numpy as np
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate
from aiortc.rtcrtpreceiver import RemoteStreamTrack
import socketio
import argparse
sio = socketio.AsyncClient(ssl_verify=False)

async def connect_to_signaling_server(server_ip, client_name):
    url = f'https://{server_ip}:3000?name={client_name}'
    await sio.connect(url, socketio_path='/socket.io/')

@sio.event
async def connect():
    print("Connected to signaling server, waiting for Offer")
    await sio.emit('joinRoom', 'room1')

@sio.event
async def connect_error(data):
    print("Connection failed:", data)

async def main(args):
    pc = RTCPeerConnection()

    data_channel = pc.createDataChannel("chat")
    server_ip = "localhost" 
    client_name = "peer2"

    await connect_to_signaling_server(server_ip, client_name)

    @pc.on('track')
    async def on_track_received(track: RemoteStreamTrack):
        print("Track received, kind:", track.kind)
        if track.kind == "video":
            try:
                while True:
                    frame = await track.recv()
                    image = frame.to_ndarray(format="bgr24")
                    if args.debugmode:
                        # 使用 OpenCV 顯示視頻，測試用。
                        cv2.imshow("Received Video", image)
                        if cv2.waitKey(1) & 0xFF == ord('q'):
                            print("Stop receiving video.")
                            break
            except asyncio.CancelledError:
                print("Stream ended.")
            finally:
                cv2.destroyAllWindows()

    @sio.on('peerconnectSignaling')
    async def on_peerconnectSignaling(data):
        if data['type'] == 'candidate':
            candidate_data = data['candidate']
            # print(f"Received ICE Candidate: {candidate_data['candidate']}")
            parts = candidate_data['candidate'].split()
            candidate = RTCIceCandidate(
                foundation=parts[0][10:],
                component=int(parts[1]),
                protocol=parts[2],
                priority=int(parts[3]),
                ip=parts[4],
                port=int(parts[5]),
                type=parts[7],
                sdpMid=candidate_data['sdpMid'],
                sdpMLineIndex=candidate_data['sdpMLineIndex'],
                tcpType= parts[9] if parts[2]=="tcp" else None,
            )
            await pc.addIceCandidate(candidate)
            # print(f"Added ICE Candidate: foundation={candidate.foundation}, component={candidate.component}, protocol={candidate.protocol}, priority={candidate.priority}, ip={candidate.ip}, port={candidate.port}, type={candidate.type}, sdpMid={candidate.sdpMid}, sdpMLineIndex={candidate.sdpMLineIndex}, tcpType={candidate.tcpType}")
        elif data['type'] == 'offer':
            # print("Received an Offer, sending Answer.")
            await pc.setRemoteDescription(RTCSessionDescription(sdp=data['sdp']['sdp'], type='offer'))
            try:
                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                await sio.emit('peerconnectSignaling', {
                    "type": "answer",
                    "sdp": pc.localDescription.sdp,
                })
                # print("Answer sent.")
            except Exception as e:
                print("Error creating answer:", e)

    
    @pc.on("icecandidate")
    async def on_icecandidate(event):
        # 嘗試找到所有可能的網絡候選，這些候選描述了其他對等端可以通過網絡連接到當前瀏覽器的方式
        if event.candidate:
            print("Found ICE Candidate:", event.candidate)
            await sio.emit('peerconnectSignaling', {
                "type": "candidate",
                "candidate": {
                    "candidate": event.candidate.candidate,
                    "sdpMid": event.candidate.sdpMid,
                    "sdpMLineIndex": event.candidate.sdpMLineIndex,
                }
            })
        else:
            print("No more ICE candidates.")

    # 這裡是一些狀態監聽器，用於調試
    @pc.on("iceconnectionstatechange")
    async def on_ice_connection_state_change():
        print(f"ICE Connection State is now: {pc.iceConnectionState}")
    @pc.on("connectionstatechange")
    async def on_connection_state_change():
        print(f"Connection State is now: {pc.connectionState}")
    @pc.on("icegatheringstatechange")
    async def on_ice_gathering_state_change():
        print(f"ICE Gathering State is now: {pc.iceGatheringState}")
    
    await sio.wait()

if __name__ == "__main__":
    arg = argparse.ArgumentParser()
    arg.add_argument("--debugmode", default=False, type=bool)
    args = arg.parse_args()
    asyncio.run(main(args))

