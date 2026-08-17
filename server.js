const net = require('net');

const PORT = 3000;

const server = net.createServer((clientSocket) => {
    let buffer = '';
    let targetSocket = null;
    let isConnected = false;
    let hasSkippedJunk = false;

    console.log('[Server] Client connected');

    clientSocket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        
        while (true) {
            const lineEnd = buffer.indexOf('\n');
            if (lineEnd === -1) break;

            const line = buffer.substring(0, lineEnd).trim();
            buffer = buffer.substring(lineEnd + 1);

            if (!hasSkippedJunk) {
                hasSkippedJunk = true;
                console.log('[Server] Skipped 25 junk characters');
                continue;
            }

            if (!isConnected) {
                try {
                    const decodedTarget = Buffer.from(line, 'base64').toString('utf8');
                    const [hostname, portStr] = decodedTarget.split(':');
                    const port = parseInt(portStr, 10) || 80;

                    console.log(`[Server] Opening tunnel to ${hostname}:${port}`);

                    targetSocket = net.connect(port, hostname, () => {
                        isConnected = true;
                        console.log(`[Server] Tunnel established to ${hostname}:${port}`);
                        
                        if (buffer.length > 0) {
                            handleClientLines(buffer);
                            buffer = '';
                        }
                    });

                    targetSocket.on('data', (targetChunk) => {
                        const base64Data = targetChunk.toString('base64') + '\n';
                        clientSocket.write(base64Data);
                    });

                    targetSocket.on('error', (err) => {
                        console.error('[Server] Target socket error:', err.message);
                        clientSocket.end();
                    });

                    targetSocket.on('close', () => {
                        clientSocket.end();
                    });

                } catch (e) {
                    console.error('[Server] Failed to parse target metadata');
                    clientSocket.end();
                }
                break;
            } else {
                if (line) {
                    const rawBuffer = Buffer.from(line, 'base64');
                    targetSocket.write(rawBuffer);
                }
            }
        }
    });

    function handleClientLines(strData) {
        const lines = strData.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && targetSocket) {
                const rawBuffer = Buffer.from(line, 'base64');
                targetSocket.write(rawBuffer);
            }
        }
    }

    clientSocket.on('error', (err) => {
        console.error('[Server] Client socket error:', err.message);
        if (targetSocket) targetSocket.end();
    });

    clientSocket.on('close', () => {
        console.log('[Server] Client disconnected');
        if (targetSocket) targetSocket.end();
    });
});

server.listen(PORT, () => {
    console.log(`[Server] TCP Server running on port ${PORT}`);
});
