const net = require('net');

const SERVER_PORT = 3000;

const server = net.createServer((clientSocket) => {
    let isJunkSkipped = false;
    let isFirstLine = true;
    let targetSocket = null;
    let isHttpsTunnel = false;
    let buffer = '';

    clientSocket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;

            if (!isJunkSkipped) {
                isJunkSkipped = true;
                continue;
            }

            if (isFirstLine) {
                isFirstLine = false;
                
                let decodedHeader = '';
                try {
                    decodedHeader = Buffer.from(cleanLine, 'base64').toString('utf8');
                } catch (e) {
                    return clientSocket.end();
                }

                let targetHost = '';
                if (decodedHeader.startsWith('TUNNEL_HTTPS:')) {
                    isHttpsTunnel = true;
                    targetHost = decodedHeader.replace('TUNNEL_HTTPS:', '');
                } else if (decodedHeader.startsWith('TUNNEL_HTTP:')) {
                    isHttpsTunnel = false;
                    targetHost = decodedHeader.replace('TUNNEL_HTTP:', '');
                } else {
                    isHttpsTunnel = false;
                    targetHost = decodedHeader;
                }

                const [host, port] = targetHost.split(':');
                const targetPort = port ? parseInt(port) : (isHttpsTunnel ? 443 : 80);

                targetSocket = net.connect(targetPort, host);

                targetSocket.on('data', (targetChunk) => {
                    const encodedResponse = isHttpsTunnel 
                        ? targetChunk.toString('hex') 
                        : targetChunk.toString('base64');
                    clientSocket.write(encodedResponse + '\n');
                });

                targetSocket.on('error', () => clientSocket.end());
                targetSocket.on('close', () => clientSocket.end());
                targetSocket.on('end', () => clientSocket.end());
                continue;
            }

            if (targetSocket && targetSocket.writable) {
                try {
                    const rawPayload = isHttpsTunnel 
                        ? Buffer.from(cleanLine, 'hex') 
                        : Buffer.from(cleanLine, 'base64');
                    targetSocket.write(rawPayload);
                } catch (e) {
                    return clientSocket.end();
                }
            }
        }
    });

    clientSocket.on('error', () => {
        if (targetSocket) targetSocket.end();
    });

    clientSocket.on('close', () => {
        if (targetSocket) targetSocket.end();
    });
});

server.listen(SERVER_PORT);
