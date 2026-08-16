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
    return `${generateGarbage()}|${dataBuffer.toString('base64')}\n`;
}

function unpackData(maskedString) {
    const parts = maskedString.split('|');
    if (parts.length < 2) return Buffer.alloc(0);
    return Buffer.from(parts, 'base64');
}

function handleTunnel(clientSocket, initialData, host, port) {
    const serverSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
        const meta = JSON.stringify({ host, port: parseInt(port) });
        serverSocket.write(packData(Buffer.from(meta)));
        if (initialData) serverSocket.write(packData(initialData));
    });

    clientSocket.on('data', chunk => {
        if (serverSocket.writable) serverSocket.write(packData(chunk));
    });

    let bufferStr = '';
    serverSocket.on('data', data => {
        bufferStr += data.toString();
        let boundary = bufferStr.indexOf('\n');
        while (boundary !== -1) {
            const line = bufferStr.substring(0, boundary);
            bufferStr = bufferStr.substring(boundary + 1);
            if (line.trim()) {
                const decrypted = unpackData(line);
                if (decrypted.length > 0 && clientSocket.writable) clientSocket.write(decrypted);
            }
            boundary = bufferStr.indexOf('\n');
        }
    });

    clientSocket.on('error', () => serverSocket.end());
    serverSocket.on('error', () => clientSocket.end());
    clientSocket.on('end', () => serverSocket.end());
    serverSocket.on('end', () => clientSocket.end());
}

const clientServer = http.createServer((req, res) => {
    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
        let host = req.headers.host;
        let port = 80;
        if (host.includes(':')) {
            const parts = host.split(':');
            host = parts[0];
            port = parseInt(parts[1]);
        }

        const reqLine = `${req.method} ${req.url} HTTP/1.1\r\n`;
        let headersStr = '';
        for (const [key, value] of Object.entries(req.headers)) {
            headersStr += `${key}: ${value}\r\n`;
        }
        const httpPayload = Buffer.concat([
            Buffer.from(reqLine + headersStr + '\r\n'),
            Buffer.concat(bodyChunks)
        ]);

        const fakeSocket = {
            writable: true,
            write: (data) => { if (!res.writableEnded) res.write(data); },
            end: (data) => {
                if (data && !res.writableEnded) res.write(data);
                res.end();
            }
        };

        handleTunnel(fakeSocket, httpPayload, host, port);
    });
});

clientServer.on('connect', (req, clientSocket, head) => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const parts = req.url.split(':');
    handleTunnel(clientSocket, head, parts[0], parts[1] || 443);
});

clientServer.listen(LOCAL_PORT);
