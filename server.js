const net = require('net');

const SERVER_PORT = 9090;

function generateGarbage() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function packData(dataBuffer) {
    const b64 = dataBuffer.toString('base64');
    const payload = `${generateGarbage()}|${b64}`;
    return Buffer.concat([Buffer.from(`${Buffer.byteLength(payload)}:`), Buffer.from(payload)]);
}

const server = net.createServer((socket) => {
    let targetSocket = null;
    let buffer = Buffer.alloc(0);

    socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
            const index = buffer.indexOf(':');
            if (index === -1) break;
            const length = parseInt(buffer.subarray(0, index).toString());
            if (isNaN(length)) { socket.end(); return; }
            if (buffer.length < index + 1 + length) break;
            
            const payload = buffer.subarray(index + 1, index + 1 + length).toString();
            buffer = buffer.subarray(index + 1 + length);
            
            const parts = payload.split('|');
            if (parts.length < 2) continue;
            const decrypted = Buffer.from(parts[1], 'base64');

            if (!targetSocket) {
                try {
                    const meta = JSON.parse(decrypted.toString());
                    targetSocket = net.connect(meta.port, meta.host);

                    targetSocket.on('data', data => {
                        if (socket.writable) socket.write(packData(data));
                    });

                    targetSocket.on('error', () => socket.end());
                    targetSocket.on('end', () => socket.end());
                } catch (e) {
                    socket.end();
                    return;
                }
            } else {
                if (targetSocket.writable) targetSocket.write(decrypted);
            }
        }
    });

    socket.on('error', () => targetSocket && targetSocket.end());
    socket.on('end', () => targetSocket && targetSocket.end());
});

server.listen(SERVER_PORT);
