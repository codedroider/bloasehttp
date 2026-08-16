const net = require('net');

const SERVER_PORT = 9090;

const server = net.createServer((socket) => {
    let targetSocket = null;
    let buffer = Buffer.alloc(0);
    let metaLength = -1;

    socket.on('data', chunk => {
        if (!targetSocket) {
            buffer = Buffer.concat([buffer, chunk]);
            
            if (metaLength === -1 && buffer.length >= 4) {
                metaLength = buffer.readUInt32BE(0);
            }
            
            if (metaLength !== -1 && buffer.length >= 4 + metaLength) {
                const metaBuffer = buffer.subarray(4, 4 + metaLength);
                const remainingBuffer = buffer.subarray(4 + metaLength);
                
                try {
                    const meta = JSON.parse(metaBuffer.toString());
                    targetSocket = net.connect(meta.port, meta.host, () => {
                        if (remainingBuffer.length > 0 && targetSocket.writable) {
                            targetSocket.write(remainingBuffer);
                        }
                    });

                    targetSocket.on('data', data => {
                        if (socket.writable) socket.write(data);
                    });

                    targetSocket.on('error', () => socket.end());
                    targetSocket.on('end', () => socket.end());
                } catch (e) {
                    socket.end();
                }
            }
        } else {
            if (targetSocket.writable) targetSocket.write(chunk);
        }
    });

    socket.on('error', () => targetSocket && targetSocket.end());
    socket.on('end', () => targetSocket && targetSocket.end());
});

server.listen(SERVER_PORT);
