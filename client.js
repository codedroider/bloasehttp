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
    const b64 = dataBuffer.toString('base64');
    const payload = `${generateGarbage()}|${b64}`;
    return Buffer.concat([Buffer.from(`${Buffer.byteLength(payload)}:`), Buffer.from(payload)]);
}

function handleTunnel(clientSocket, initialData, host, port) {
    const serverSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
        const meta = JSON.stringify({ host, port: parseInt(port) });
        serverSocket.write(packData(Buffer.from(meta)));
        if (initialData && initialData.length > 0) {
            serverSocket.write(packData(initialData));
        }
    });

    clientSocket.on('data', chunk => {
        if (serverSocket.writable) serverSocket.write(packData(chunk));
    });

    let buffer = Buffer.alloc(0);
    serverSocket.on('data', data => {
        buffer = Buffer.concat([buffer, data]);
        while (true) {
            const index = buffer.indexOf(':');
            if (index === -1) break;
            const length = parseInt(buffer.subarray(0, index).toString());
            if (isNaN(length)) { buffer = Buffer.alloc(0); break; }
            if (buffer.length < index + 1 + length) break;
            
            const payload = buffer.subarray(index + 1, index + 1 + length).toString();
            buffer = buffer.subarray(index + 1 + length);
            
            const parts = payload.split('|');
            if (parts.length >= 2 && clientSocket.writable) {
                clientSocket.write(Buffer.from(parts[1], 'base64'));
            }
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
        let host = req.headers.host || '';
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
    let host = req.url;
    let port = 443;
    if (host.includes(':')) {
        const parts = host.split(':');
        host = parts[0];
        port = parseInt(parts[1]);
    }
    handleTunnel(clientSocket, head, host, port);
});

clientServer.listen(LOCAL_PORT);
