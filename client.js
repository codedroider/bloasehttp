const http = require('http');
const net = require('net');
const crypto = require('crypto');

const LOCAL_PROXY_PORT = 8080;
const REMOTE_SERVER_HOST = 'localhost'; // your server here
const REMOTE_SERVER_PORT = 3000;

function generateJunk() {
    return crypto.randomBytes(19).toString('base64').substring(0, 25) + '\n';
}

const server = http.createServer((req, res) => {
    console.log(`[Client Proxy] Handling HTTP request to: ${req.url}`);
    
    const targetUrl = new URL(req.url);
    const targetHost = `${targetUrl.hostname}:${targetUrl.port || 80}`;
    
    handleTunnel(targetHost, req, res, false);
});

server.on('connect', (req, clientSocket, head) => {
    console.log(`[Client Proxy] Handling HTTPS tunnel to: ${req.url}`);
    handleTunnel(req.url, clientSocket, head, true);
});

function handleTunnel(targetHost, clientReqOrSocket, resOrHead, isHttps) {
    const remoteSocket = net.connect(REMOTE_SERVER_PORT, REMOTE_SERVER_HOST, () => {
        remoteSocket.write(generateJunk());

        const encodedTarget = Buffer.from(targetHost).toString('base64') + '\n';
        remoteSocket.write(encodedTarget);

        if (isHttps) {
            const clientSocket = clientReqOrSocket;
            const head = resOrHead;

            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head && head.length > 0) {
                remoteSocket.write(Buffer.from(head).toString('base64') + '\n');
            }

            clientSocket.on('data', (chunk) => {
                remoteSocket.write(chunk.toString('base64') + '\n');
            });

            let responseBuffer = '';
            remoteSocket.on('data', (chunk) => {
                responseBuffer += chunk.toString('utf8');
                const lines = responseBuffer.split('\n');
                responseBuffer = lines.pop();

                for (const line of lines) {
                    if (line.trim()) {
                        clientSocket.write(Buffer.from(line.trim(), 'base64'));
                    }
                }
            });

            clientSocket.on('error', () => remoteSocket.end());
            remoteSocket.on('error', () => clientSocket.end());
            clientSocket.on('close', () => remoteSocket.end());
            remoteSocket.on('close', () => clientSocket.end());
        } else {
            const req = clientReqOrSocket;
            const res = resOrHead;

            let initialPayload = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
            for (const [key, value] of Object.entries(req.headers)) {
                initialPayload += `${key}: ${value}\r\n`;
            }
            initialPayload += '\r\n';

            remoteSocket.write(Buffer.from(initialPayload).toString('base64') + '\n');

            req.on('data', (chunk) => {
                remoteSocket.write(chunk.toString('base64') + '\n');
            });

            let responseBuffer = '';
            remoteSocket.on('data', (chunk) => {
                responseBuffer += chunk.toString('utf8');
                const lines = responseBuffer.split('\n');
                responseBuffer = lines.pop();

                for (const line of lines) {
                    if (line.trim()) {
                        res.write(Buffer.from(line.trim(), 'base64'));
                    }
                }
            });

            req.on('end', () => {});
            remoteSocket.on('end', () => res.end());
            remoteSocket.on('error', () => res.end());
        }
    });

    remoteSocket.on('error', (err) => {
        console.error('[Client Proxy] Connection to remote obfuscator failed:', err.message);
        if (isHttps) clientReqOrSocket.end(); 
        else resOrHead.end();
    });
}

server.listen(LOCAL_PROXY_PORT, () => {
    console.log(`[Client Proxy] Proxy available at http://${REMOTE_SERVER_HOST}:${LOCAL_PROXY_PORT}`);
});
