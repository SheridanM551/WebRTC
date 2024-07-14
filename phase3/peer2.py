import asyncio
import cv2  # 導入 OpenCV
import numpy as np
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCIceCandidate
from aiortc.rtcrtpreceiver import RemoteStreamTrack
import socketio
import argparse
from ultralytics import YOLO
import onnxruntime as onnx
import time

sio = socketio.AsyncClient(ssl_verify=False)

async def connect_to_signaling_server(server_ip, client_name):
    url = f'https://{server_ip}:3000?name={client_name}'
    await sio.connect(url, socketio_path='/socket.io/')

@sio.event
async def connect():
    print("Connected to signaling server, waiting for peer1 to send an Offer.")
    await sio.emit('joinRoom', 'room1')

@sio.event
async def connect_error(data):
    print("Connection failed:", data)

# 模型相關的函數
async def init_model(model_path):
    # 加載模型
    print(f"Loading model from {model_path}, please wait...")
    model = YOLO(model_path, task="detect")
    # 執行一次空推理以完成初始化
    dummy_data = np.zeros((640, 640, 3), dtype=np.uint8)  # 創建一個虛擬的黑色圖像
    model(dummy_data, verbose=False)
    print("Cold start finished.")
    return model
def letterbox_image(image, size):
    ih, iw = image.shape[:2]
    w, h = size
    scale = min(w/iw, h/ih)
    nw = int(iw*scale)
    nh = int(ih*scale)
    image_resized = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    top = (h - nh) // 2
    bottom = h - nh - top
    left = (w - nw) // 2
    right = w - nw - left
    image_padded = cv2.copyMakeBorder(image_resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(128, 128, 128))
    return image_padded, scale, top, left
def sync_inference(frame, model):
    # 定義一個內部函數來處理同步的部分
    frame_padded, scale, top, left = letterbox_image(frame, (640, 640))
    results = model(frame_padded, verbose=False)
    return results, scale, top, left
async def async_inference(model, frame):
    loop = asyncio.get_running_loop()
    # 在異步執行器中執行同步推理
    # 內部有實現thread pooling，不用擔心持續創建新的執行緒
    results, scale, top, left = await loop.run_in_executor(None, sync_inference, frame, model)
    # time.sleep(0.1)  # 模擬推理延遲
    return results, scale, top, left
def draw_boxes(frame, results, scale, top, left, class_names):
    # 在幀上繪製辨識結果
    for result in results:
        boxes = result.boxes.xyxy.cpu().numpy()  # 提取邊界框
        scores = result.boxes.conf.cpu().numpy()  # 提取置信度
        classes = result.boxes.cls.cpu().numpy()  # 提取類別

        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes[i]
            x1 = int((x1 - left) / scale)
            y1 = int((y1 - top) / scale)
            x2 = int((x2 - left) / scale)
            y2 = int((y2 - top) / scale)

            conf = scores[i]
            cls = int(classes[i])
            label = f'{class_names[cls]} {conf:.2f}'
            color = (0, 255, 0)  # 綠色框
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
    return frame

is_inferencing = False  # 推理鎖定標記
should_continue = True  # 控制整個迴圈的標記
frame_count = 0         # 計數推理的幀數
start_time = None       # 計時開始

async def main(args):
    # 初始化模型
    model = await init_model(args.model)

    pc = RTCPeerConnection()

    data_channel = pc.createDataChannel("chat")
    server_ip = "localhost" 
    client_name = "peer2"

    await connect_to_signaling_server(server_ip, client_name)
    
    @pc.on('track')
    async def on_track_received(track: RemoteStreamTrack):
        global is_inferencing, should_continue, frame_count, start_time
        print("Track received, kind:", track.kind)
        if track.kind == "video":
            try:
                start_time = time.time()
                frame_count = 0
                while should_continue:
                    frame = await track.recv()
                    if time.time() - start_time > 1:
                        # 每秒顯示一次FPS
                        print(f"FPS: {frame_count}")
                        start_time = time.time()
                        frame_count = 0
                    if not is_inferencing:
                        image = frame.to_ndarray(format="bgr24")
                        
                        if args.recv:
                            cv2.imshow("Received Video", image)
                            if cv2.waitKey(1) & 0xFF == ord('q'):
                                should_continue = False
                                print("Stop receiving video.")
                                break
                        
                        # 啟動推理鎖定
                        is_inferencing = True
                        results, scale, top, left = await async_inference(model, image)
                        is_inferencing = False
                        frame_count += 1

                        if args.inferenced:
                            image_with_boxes = draw_boxes(image, results, scale, top, left, model.names)
                            cv2.imshow("Inferenced Video", image_with_boxes)
                            if cv2.waitKey(1) & 0xFF == ord('q'):
                                should_continue = False
                                print("Stop receiving video.")
                                break
            except (asyncio.CancelledError, KeyboardInterrupt):
                print("Stream ended.")
                should_continue = False
            finally:
                cv2.destroyAllWindows()
                await sio.disconnect()
                await pc.close()

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
    arg.add_argument("--model", default="best.onnx", type=str)
    arg.add_argument("--recv", default=False, type=bool)
    arg.add_argument("--inferenced", default=False, type=bool)
    args = arg.parse_args()
    asyncio.run(main(args))

