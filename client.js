const http = require('http');
const net = require('net');

const LOCAL_PORT = 8080;
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 9090;

function handleTunnel(clientSocket, initialData, host, port) {
    const serverSocket = net.connect(SERVER_PORT, SERVER_HOST, () => {
        const meta = JSON.stringify({ host, port: parseInt(port) });
        const metaLength = Buffer.byteLength(meta);
        
        const header = Buffer.alloc(4);
        header.writeUInt32BE(metaLength, 0);
        
        serverSocket.write(header);
        serverSocket.write(meta);
        
        if (initialData && initialData.length > 0) {
            serverSocket.write(initialData);
        }
    });

    clientSocket.on('data', chunk => {
        if (serverSocket.writable) serverSocket.write(chunk);
    });

    serverSocket.on('data', data => {
        if (clientSocket.writable) clientSocket.write(data);
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
