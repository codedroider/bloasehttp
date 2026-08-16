const http = require('http');

const LOCAL_PORT = 8080;
const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 9090;

function generateGarbage() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let result = '';
    const length = Math.floor(Math.random() * 15) + 5;
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

const clientServer = http.createServer((req, res) => {
    let bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    
    req.on('end', () => {
        const bodyBuffer = Buffer.concat(bodyChunks);
        
        const requestMetadata = {
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: bodyBuffer.toString('base64')
        };

        const packedRequest = packData(Buffer.from(JSON.stringify(requestMetadata)));

        const proxyOpts = {
            hostname: SERVER_HOST,
            port: SERVER_PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(packedRequest)
            }
        };

        const proxyReq = http.request(proxyOpts, (proxyRes) => {
            let resChunks = [];
            proxyRes.on('data', chunk => resChunks.push(chunk));
            
            proxyRes.on('end', () => {
                const responseText = Buffer.concat(resChunks).toString();
                const decryptedBuffer = unpackData(responseText);
                if (decryptedBuffer.length === 0) {
                    res.writeHead(500);
                    res.end();
                    return;
                }

                try {
                    const responseData = JSON.parse(decryptedBuffer.toString());
                    res.writeHead(responseData.statusCode, responseData.headers);
                    res.end(Buffer.from(responseData.body, 'base64'));
                } catch (e) {
                    res.writeHead(500);
                    res.end();
                }
            });
        });

        proxyReq.on('error', () => {
            res.writeHead(502);
            res.end();
        });

        proxyReq.write(packedRequest);
        proxyReq.end();
    });
});

clientServer.listen(LOCAL_PORT);
