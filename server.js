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
    return `${generateGarbage()}|${b64}\n`;
}

function unpackData(maskedString) {
    const parts = maskedString.split('|');
    if (parts.length < 2) return Buffer.alloc(0);
    return Buffer.from(parts[1], 'base64');
}

const server = net.createServer((socket) => {
    let targetSocket = null;
    let bufferString = '';

    socket.on('data', chunk => {
        bufferString += chunk.toString('utf8');
        let boundary = bufferString.indexOf('\n');
        
        while (boundary !== -1) {
            const line = bufferString.substring(0, boundary);
            bufferString = bufferString.substring(boundary + 1);
            
            if (line.trim()) {
                const decrypted = unpackData(line);
                if (decrypted.length === 0) {
                    boundary = bufferString.indexOf('\n');
                    continue;
                }

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
                    if (targetSocket.writable) {
                        targetSocket.write(decrypted);
                    }
                }
            }
            boundary = bufferString.indexOf('\n');
        }
    });

    socket.on('error', () => targetSocket && targetSocket.end());
    socket.on('end', () => targetSocket && targetSocket.end());
});

server.listen(SERVER_PORT);
