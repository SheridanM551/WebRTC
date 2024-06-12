# 階段二
目標：在不連接外網的條件下，實現peer-to-peer影像串流，將peer1鏡頭影像串流給peer2。

主要角色：
* Https Server on Laptop
* Signaling Server on Laptop
* Peer 1 on Laptop
* Peer 2 on Smart phone
* Connection: through common Wi-Fi

# 使用方式
請依序進行
## 開啟防火牆 port 3000
參考：https://wiki.mcneel.com/zh-tw/zoo/window7firewall

## SignalingServer run 在筆電 or nano
cd SignalingServer
node server.js

## peer2 接收端 一樣 run 在筆電 or nano
瀏覽器開啟：https://localhost:3000/
點選peer2。

## peer1 輸入端 run 在智慧影鏡或手機
瀏覽器開啟：https://{你的筆電的wifi ipv4}:3000/
查詢你的筆電的wifi ipv4： cmd ipconfig (on windows)
