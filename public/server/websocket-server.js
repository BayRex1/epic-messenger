const crypto = require('crypto');

class WebSocketServer {
    constructor(server, dataManager) {
        this.server = server;
        this.dataManager = dataManager;
        this.clients = new Map();
        
        server.on('upgrade', (req, socket, head) => {
            this.handleUpgrade(req, socket, head);
        });
    }

    handleUpgrade(req, socket, head) {
        const key = req.headers['sec-websocket-key'];
        const accept = this.generateAccept(key);
        
        const responseHeaders = [
            'HTTP/1.1 101 Web Socket Protocol Handshake',
            'Upgrade: WebSocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`
        ];

        socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
        
        const clientId = this.generateId();
        const client = {
            id: clientId,
            socket: socket,
            rooms: new Set()
        };
        
        this.clients.set(clientId, client);
        
        socket.on('data', (data) => {
            this.handleMessage(clientId, data);
        });
        
        socket.on('close', () => {
            this.clients.delete(clientId);
            this.broadcast('user_offline', { userId: clientId });
        });
        
        socket.on('error', () => {
            this.clients.delete(clientId);
        });

        this.sendToClient(clientId, 'connected', { clientId });
    }

    generateAccept(key) {
        const sha1 = crypto.createHash('sha1');
        sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
        return sha1.digest('base64');
    }

    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    handleMessage(clientId, data) {
        try {
            const firstByte = data.readUInt8(0);
            const opcode = firstByte & 0x0F;
            
            // Обработка ping фрейма
            if (opcode === 9) {
                console.log('🏓 Получен PING от клиента', clientId);
                this.sendPong(clientId);
                return;
            }
            
            // Обработка pong фрейма
            if (opcode === 10) {
                console.log('🏓 Получен PONG от клиента', clientId);
                return;
            }
            
            // Обработка текстового фрейма
            if (opcode === 1) {
                const message = this.decodeMessage(data);
                if (message && message.type && message.data) {
                    console.log(`📨 WebSocket сообщение от ${clientId}:`, message.type);
                    this.broadcast(message.type, message.data, clientId);
                }
            }
            
        } catch (error) {
            console.log('❌ Ошибка обработки WebSocket сообщения:', error);
        }
    }

    decodeMessage(buffer) {
        try {
            // Проверяем, что это текстовый фрейм (opcode = 1)
            const firstByte = buffer.readUInt8(0);
            const opcode = firstByte & 0x0F;
            
            if (opcode !== 1) {
                console.log('❌ Не текстовый фрейм, opcode:', opcode);
                return null;
            }

            const secondByte = buffer.readUInt8(1);
            
            const isFinalFrame = Boolean(firstByte & 0x80);
            let payloadLength = secondByte & 0x7F;
            let maskStart = 2;
            
            if (payloadLength === 126) {
                if (buffer.length < 4) {
                    console.log('❌ Недостаточно данных для длины 126');
                    return null;
                }
                payloadLength = buffer.readUInt16BE(2);
                maskStart = 4;
            } else if (payloadLength === 127) {
                if (buffer.length < 10) {
                    console.log('❌ Недостаточно данных для длины 127');
                    return null;
                }
                payloadLength = Number(buffer.readBigUInt64BE(2));
                maskStart = 10;
            }
            
            // Проверяем, что в буфере достаточно данных
            if (buffer.length < maskStart + 4 + payloadLength) {
                console.log('❌ Недостаточно данных в буфере');
                return null;
            }
            
            const masks = buffer.slice(maskStart, maskStart + 4);
            const payload = buffer.slice(maskStart + 4, maskStart + 4 + payloadLength);
            
            const decoded = Buffer.alloc(payloadLength);
            for (let i = 0; i < payloadLength; i++) {
                decoded[i] = payload[i] ^ masks[i % 4];
            }
            
            const messageText = decoded.toString('utf8');
            return JSON.parse(messageText);
            
        } catch (error) {
            console.log('❌ Ошибка декодирования WebSocket сообщения:', error.message);
            return null;
        }
    }

    encodeMessage(data) {
        try {
            const json = JSON.stringify(data);
            const jsonBuffer = Buffer.from(json, 'utf8');
            
            const length = jsonBuffer.length;
            let payloadLengthByte;
            let lengthBytes;
            
            if (length <= 125) {
                payloadLengthByte = length;
                lengthBytes = Buffer.alloc(0);
            } else if (length <= 65535) {
                payloadLengthByte = 126;
                lengthBytes = Buffer.alloc(2);
                lengthBytes.writeUInt16BE(length);
            } else {
                payloadLengthByte = 127;
                lengthBytes = Buffer.alloc(8);
                lengthBytes.writeBigUInt64BE(BigInt(length));
            }
            
            const header = Buffer.concat([
                Buffer.from([0x81, payloadLengthByte]), // 0x81 = FIN + текстовый фрейм
                lengthBytes
            ]);
            
            return Buffer.concat([header, jsonBuffer]);
        } catch (error) {
            console.log('❌ Ошибка кодирования WebSocket сообщения:', error);
            return Buffer.from([0x81, 0x00]); // Пустой фрейм в случае ошибки
        }
    }

    sendPong(clientId) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                // Pong фрейм: 0x8A = FIN + Pong opcode
                const pongFrame = Buffer.from([0x8A, 0x00]);
                client.socket.write(pongFrame);
            } catch (error) {
                console.log('❌ Ошибка отправки PONG:', error);
            }
        }
    }

    sendToClient(clientId, type, data) {
        const client = this.clients.get(clientId);
        if (client && client.socket) {
            try {
                const message = this.encodeMessage({ type, data });
                client.socket.write(message);
            } catch (error) {
                console.log('❌ Ошибка отправки клиенту:', error);
            }
        }
    }

    broadcast(type, data, excludeClientId = null) {
        for (const [clientId, client] of this.clients) {
            if (clientId !== excludeClientId) {
                this.sendToClient(clientId, type, data);
            }
        }
    }
}

module.exports = WebSocketServer;
