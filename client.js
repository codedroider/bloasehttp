const http = require('http');
const net = require('net');

const LOCAL_PORT = 8080;
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 9090;

function generateGarbage() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = Math.floor(Math.random() * 15) + 5;
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

const clientServer = http.createServer((req, res) => {
    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
        const requestMetadata = {
            isConnect: false,
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: Buffer.concat(bodyChunks).toString('base64')
        };

        const packedRequest = packData(Buffer.from(JSON.stringify(requestMetadata)));
        const proxyReq = http.request({
            hostname: SERVER_HOST, port: SERVER_PORT, path: '/', method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(packedRequest) }
        }, (proxyRes) => {
            let resChunks = [];
            proxyRes.on('data', chunk => resChunks.push(chunk));
            proxyRes.on('end', () => {
                const decryptedBuffer = unpackData(Buffer.concat(resChunks).toString());
                try {
                    const responseData = JSON.parse(decryptedBuffer.toString());
                    res.writeHead(responseData.statusCode, responseData.headers);
                    res.end(Buffer.from(responseData.body, 'base64'));
                } catch (e) { res.writeHead(500); res.end(); }
            });
        });
        proxyReq.on('error', () => { res.writeHead(502); res.end(); });
        proxyReq.write(packedRequest);
        proxyReq.end();
    });
});

clientServer.on('connect', (req, clientSocket, head) => {
    const serverSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        const requestMetadata = { isConnect: true, url: req.url };
        serverSocket.write(packData(Buffer.from(JSON.stringify(requestMetadata))) + '\n'); 
        if (head && head.length > 0) serverSocket.write(packData(head) + '\n');
    });

    clientSocket.on('data', chunk => {
        if (serverSocket.writable) serverSocket.write(packData(chunk) + '\n');
    });

    serverSocket.on('data', data => {
        const lines = data.toString().split('\n');
        for (let line of lines) {
            if (!line.trim()) continue;
            const decrypted = unpackData(line);
            if (decrypted.length > 0 && clientSocket.writable) clientSocket.write(decrypted);
        }
    });

    clientSocket.on('error', () => serverSocket.end());
    serverSocket.on('error', () => clientSocket.end());
    clientSocket.on('end', () => serverSocket.end());
    serverSocket.on('end', () => clientSocket.end());
});

clientServer.listen(LOCAL_PORT);
