const http = require('http');

const SERVER_PORT = 9090;

function generateGarbage() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function packData(dataBuffer) {
    const b64 = dataBuffer.toString('base64');
    const garbage = generateGarbage();
    return `${garbage}|${b64}`;
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
        const payload = Buffer.concat(chunks).toString();
        const decryptedBuffer = unpackData(payload);
        if (decryptedBuffer.length === 0) {
            res.writeHead(400);
            res.end();
            return;
        }

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

            if (targetOpts.headers.host) {
                targetOpts.headers.host = targetUrl.hostname;
            }

            const targetReq = http.request(targetOpts, (targetRes) => {
                let targetChunks = [];
                targetRes.on('data', chunk => targetChunks.push(chunk));
                
                targetRes.on('end', () => {
                    const targetBodyBuffer = Buffer.concat(targetChunks);
                    const responseMetadata = {
                        statusCode: targetRes.statusCode,
                        headers: targetRes.headers,
                        body: targetBodyBuffer.toString('base64')
                    };

                    const packedResponse = packData(Buffer.from(JSON.stringify(responseMetadata)));
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(packedResponse);
                });
            });

            targetReq.on('error', () => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                const errorData = packData(Buffer.from(JSON.stringify({
                    statusCode: 502,
                    headers: {},
                    body: Buffer.from('Error').toString('base64')
                })));
                res.end(errorData);
            });

            if (clientReqData.body) {
                targetReq.write(Buffer.from(clientReqData.body, 'base64'));
            }
            targetReq.end();

        } catch (e) {
            res.writeHead(400);
            res.end();
        }
    });
});

remoteServer.listen(SERVER_PORT);
