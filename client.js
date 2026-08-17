const http = require('http');
const net = require('net');
const crypto = require('crypto');

const LOCAL_PROXY_PORT = 8080;
const REMOTE_SERVER_HOST = '127.0.0.1';
const REMOTE_SERVER_PORT = 3000;

function generateJunk() {
    return crypto.randomBytes(19).toString('base64').substring(0, 25) + '\n';
}

const server = http.createServer((req, res) => {
    try {
        const targetUrl = new URL(req.url);
        const targetHost = `${targetUrl.hostname}:${targetUrl.port || 80}`;
        handleTunnel(targetHost, req, res, false);
    } catch (err) {
        res.writeHead(400);
        res.end();
    }
});

server.on('connect', (req, clientSocket, head) => {
    handleTunnel(req.url, clientSocket, head, true);
});

function handleTunnel(targetHost, clientReqOrSocket, resOrHead, isHttps) {
    const remoteSocket = net.connect(REMOTE_SERVER_PORT, REMOTE_SERVER_HOST, () => {
        remoteSocket.write(generateJunk());

        const tunnelType = isHttps ? "TUNNEL_HTTPS" : "TUNNEL_HTTP";
        const encodedTarget = Buffer.from(`${tunnelType}:${targetHost}`).toString('base64') + '\n';
        remoteSocket.write(encodedTarget);

        if (isHttps) {
            const clientSocket = clientReqOrSocket;
            const head = resOrHead;

            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            
            if (head && head.length > 0) {
                remoteSocket.write(head.toString('hex') + '\n');
            }

            clientSocket.on('data', (chunk) => {
                remoteSocket.write(chunk.toString('hex') + '\n');
            });

            let responseBuffer = '';
            remoteSocket.on('data', (chunk) => {
                responseBuffer += chunk.toString('utf8');
                const lines = responseBuffer.split('\n');
                responseBuffer = lines.pop();

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (cleanLine) {
                        clientSocket.write(Buffer.from(cleanLine, 'hex'));
                    }
                }
            });

            clientSocket.on('error', () => remoteSocket.end());
            clientSocket.on('close', () => remoteSocket.end());
            clientSocket.on('end', () => remoteSocket.end());
            
            remoteSocket.on('error', () => clientSocket.end());
            remoteSocket.on('close', () => clientSocket.end());
            remoteSocket.on('end', () => clientSocket.end());
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
            remoteSocket.on('error', () => res.end());
            remoteSocket.on('close', () => res.end());
            
            remoteSocket.on('end', () => res.end());
            remoteSocket.on('error', () => res.end());
            remoteSocket.on('close', () => res.end());
        }
    });

    remoteSocket.on('error', () => {
        if (isHttps) clientReqOrSocket.end(); 
        else resOrHead.end();
    });
}

server.listen(LOCAL_PROXY_PORT);