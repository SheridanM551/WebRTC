const constraints = {
    audio: false,
    video: {
        width: { min: 1024, ideal: 1280, max: 1920 },
        height: { min: 776, ideal: 720, max: 1080 }
    }
}
const myVideo = document.querySelector('#myVideo');
const condition_text = document.getElementById('condition');
let localstream;

navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        // 取得成功
        myVideo.srcObject = stream;
        condition_text.innerText = "狀態：取得成功"
    })
    .catch(function(err) {
        // 取得失敗
        console.error('Error accessing media devices.', err);
        condition_text.innerText = "狀態：取得失敗"
    });

