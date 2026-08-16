const http = require('http');
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
    return `${generateGarbage()}|${dataBuffer.toString('base64')}`;
}

function unpackData(maskedString) {
    const parts = maskedString.split('|');
    if (parts.length < 2) return Buffer.alloc(0);
    return Buffer.from(parts[1], 'base64');
}

const remoteServer = http.createServer((req, res) => {
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const decryptedBuffer = unpackData(Buffer.concat(chunks).toString());
        if (decryptedBuffer.length === 0) { res.writeHead(400); res.end(); return; }

        try {
            const clientReqData = JSON.parse(decryptedBuffer.toString());
            const targetUrl = new URL(clientReqData.url);
            const targetOpts = {
                method: clientReqData.method,
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                headers: clientReqData.headers
            };
            if (targetOpts.headers.host) targetOpts.headers.host = targetUrl.hostname;

            const targetReq = http.request(targetOpts, (targetRes) => {
                let targetChunks = [];
                targetRes.on('data', chunk => targetChunks.push(chunk));
                targetRes.on('end', () => {
                    const responseMetadata = {
                        statusCode: targetRes.statusCode,
                        headers: targetRes.headers,
                        body: Buffer.concat(targetChunks).toString('base64')
                    };
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(packData(Buffer.from(JSON.stringify(responseMetadata))));
                });
            });
            targetReq.on('error', () => { res.writeHead(502); res.end(); });
            if (clientReqData.body) targetReq.write(Buffer.from(clientReqData.body, 'base64'));
            targetReq.end();
        } catch (e) { res.writeHead(400); res.end(); }
    });
});

remoteServer.on('connection', (socket) => {
    let targetSocket = null;
    let bufferString = '';

    socket.on('data', chunk => {
        if (!targetSocket) {
            bufferString += chunk.toString();
            const firstLineEnd = bufferString.indexOf('\n');
            if (firstLineEnd === -1) return;

            const firstLine = bufferString.substring(0, firstLineEnd).trim();
            bufferString = bufferString.substring(firstLineEnd + 1);

            if (firstLine.startsWith('POST / HTTP/1.1') || firstLine.startsWith('GET / HTTP/1.1')) {
                socket.removeAllListeners('data');
                socket.unshift(Buffer.from(firstLine + '\r\n' + bufferString));
                remoteServer.emit('connection', socket);
                return;
            }

            const decrypted = unpackData(firstLine);
            try {
                const meta = JSON.parse(decrypted.toString());
                if (meta.isConnect) {
                    const [host, port] = meta.url.split(':');
                    targetSocket = net.connect(port || 443, host, () => {
                        if (bufferString.length > 0) {
                            processLines(bufferString);
                            bufferString = '';
                        }
                    });

                    targetSocket.on('data', data => {
                        if (socket.writable) socket.write(packData(data) + '\n');
                    });

                    targetSocket.on('error', () => socket.end());
                    targetSocket.on('end', () => socket.end());
                }
            } catch (e) { socket.end(); }
        } else {
            processLines(chunk.toString());
        }
    });

    function processLines(str) {
        const lines = str.split('\n');
        for (let line of lines) {
            if (!line.trim()) continue;
            const decrypted = unpackData(line);
            if (decrypted.length > 0 && targetSocket && targetSocket.writable) {
                targetSocket.write(decrypted);
            }
        }
    }

    socket.on('error', () => targetSocket && targetSocket.end());
    socket.on('end', () => targetSocket && targetSocket.end());
});

remoteServer.listen(SERVER_PORT);
