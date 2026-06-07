const WebSocket = require('ws');

class Bot68GB {
    constructor(shared) {
        this.shared = shared;
        this.txhu = {
            last_result: null,
            history: []
        };
        this.md5 = {
            last_result: null,
            history: []
        };
        this.ws = null;
        this.alive = false;
        this.reconnectTimer = null;
        this.heartbeatInterval = null;
        this.pingTimeout = null;
        this.landing = '';
    }

    run(landingUrl) {
        this.landing = landingUrl;
        this.connect();
    }

    connect() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
        }
        console.log(`🔌 Connecting to ${this.shared.WS_URL}`);
        this.ws = new WebSocket(this.shared.WS_URL);
        
        this.ws.on('open', () => {
            console.log('✅ WebSocket connected');
            this.alive = true;
            // Gửi gói handshake
            if (this.shared.PKT_HANDSHAKE) {
                this.ws.send(this.shared.PKT_HANDSHAKE);
                console.log('📤 Sent handshake');
            }
            // Chờ handshake ack rồi gửi auth
            // Thường server sẽ trả lời, nhưng ta cũng có thể gửi auth ngay sau handshake
            setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    if (this.shared.PKT_AUTH && this.shared.PKT_AUTH.length > 0) {
                        this.ws.send(this.shared.PKT_AUTH);
                        console.log('📤 Sent auth');
                    }
                }
            }, 500);
            
            // Bắt đầu heartbeat
            this.startHeartbeat();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
            this.alive = false;
            this.stopHeartbeat();
            this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
            console.error('❌ WebSocket error:', err.message);
            this.alive = false;
            this.stopHeartbeat();
            // Lỗi sẽ kích hoạt close
        });
    }

    handleMessage(data) {
        try {
            // Kiểm tra xem có phải gói tin nhị phân không
            if (Buffer.isBuffer(data)) {
                // Gói tin nhị phân có thể chứa dữ liệu game
                this.parseBinary(data);
            } else if (typeof data === 'string') {
                // Có thể là JSON hoặc text
                this.parseText(data);
            }
        } catch (e) {
            console.error('Message handling error:', e);
        }
    }

    parseBinary(buffer) {
        // Logic parse đặc thù 68GB: tìm chuỗi "Phiên" trong buffer
        const str = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));
        // Nếu tìm thấy cả hai loại game
        if (str.includes('"type":"txhu"') || str.includes('txhu')) {
            this.extractTxhu(str, buffer);
        } else if (str.includes('"type":"md5"') || str.includes('md5')) {
            this.extractMd5(str, buffer);
        } else {
            // Fallback: thử parse như một bản tin chứa JSON
            this.tryParseAsJSON(str, buffer);
        }
    }

    parseText(text) {
        // Thường là JSON
        try {
            const data = JSON.parse(text);
            if (data.type === 'handshake_ack') {
                console.log('🤝 Handshake acknowledged');
                // Gửi auth ngay
                if (this.shared.PKT_AUTH && this.shared.PKT_AUTH.length > 0) {
                    this.ws.send(this.shared.PKT_AUTH);
                }
            } else if (data.type === 'auth_ok') {
                console.log('🔑 Auth successful');
            } else if (data.game === 'txhu' || data.type === 'txhu') {
                this.processTxhuResult(data);
            } else if (data.game === 'md5' || data.type === 'md5') {
                this.processMd5Result(data);
            }
        } catch (e) {
            // không phải JSON, bỏ qua
        }
    }

    tryParseAsJSON(str, buffer) {
        // Cố gắng lấy phần JSON từ buffer
        try {
            const jsonStart = str.indexOf('{');
            if (jsonStart === -1) return;
            const jsonStr = str.slice(jsonStart);
            const data = JSON.parse(jsonStr);
            if (data.game === 'txhu' || data.type === 'txhu') {
                this.processTxhuResult(data);
            } else if (data.game === 'md5' || data.type === 'md5') {
                this.processMd5Result(data);
            } else if (data.phiên || data.phien) {
                // Có thể là kết quả, kiểm tra thêm
                if (data.xúc_xắc_1 !== undefined || data['xúc xắc 1'] !== undefined) {
                    if (data.game === 'txhu' || data.table === 'txhu') {
                        this.processTxhuResult(data);
                    } else {
                        this.processMd5Result(data);
                    }
                }
            }
        } catch (e) {}
    }

    extractTxhu(str, buffer) {
        // Tìm pattern cụ thể cho txhu
        const match = this.extractGameData(str);
        if (match) {
            this.processTxhuResult(match);
        }
    }

    extractMd5(str, buffer) {
        const match = this.extractGameData(str);
        if (match) {
            this.processMd5Result(match);
        }
    }

    extractGameData(str) {
        // Cố gắng trích xuất dữ liệu cần thiết từ chuỗi
        // Phụ thuộc format thực tế, đây là ví dụ:
        const phienMatch = str.match(/(?:Phiên|phien|phiên)\s*[#:]*\s*(\d+)/i);
        if (!phienMatch) return null;
        const phien = parseInt(phienMatch[1]);
        
        let ketQua = null;
        if (str.includes('TÀI')) ketQua = 'TÀI';
        else if (str.includes('XỈU')) ketQua = 'XỈU';
        if (!ketQua) return null;
        
        // Tìm xúc xắc
        const diceMatch = str.match(/(\d+)\s*[-,\s]\s*(\d+)\s*[-,\s]\s*(\d+)/);
        let x1 = 0, x2 = 0, x3 = 0;
        if (diceMatch) {
            x1 = parseInt(diceMatch[1]);
            x2 = parseInt(diceMatch[2]);
            x3 = parseInt(diceMatch[3]);
        }
        return {
            'Phiên trước': phien,
            'kết quả': ketQua,
            'xúc xắc 1': x1,
            'xúc xắc 2': x2,
            'xúc xắc 3': x3
        };
    }

    processTxhuResult(data) {
        const result = this.normalizeResult(data);
        if (!result) return;
        this.txhu.last_result = result;
        this.txhu.history.push(result);
        // Giới hạn lịch sử
        if (this.txhu.history.length > 500) this.txhu.history.shift();
        console.log(`🎲 TXHU: #${result['Phiên trước']} - ${result['kết quả']} [${result['xúc xắc 1']},${result['xúc xắc 2']},${result['xúc xắc 3']}]`);
    }

    processMd5Result(data) {
        const result = this.normalizeResult(data);
        if (!result) return;
        this.md5.last_result = result;
        this.md5.history.push(result);
        if (this.md5.history.length > 500) this.md5.history.shift();
        console.log(`🔐 MD5: #${result['Phiên trước']} - ${result['kết quả']} [${result['xúc xắc 1']},${result['xúc xắc 2']},${result['xúc xắc 3']}]`);
    }

    normalizeResult(data) {
        // Chuẩn hóa các tên trường khác nhau
        const phien = data['Phiên trước'] || data['phiên'] || data['phien'] || data.Phien;
        const ketQua = data['kết quả'] || data['ketqua'] || data.ket_qua || data.KetQua;
        const x1 = data['xúc xắc 1'] || data['xuc_xac_1'] || data.dice1 || 0;
        const x2 = data['xúc xắc 2'] || data['xuc_xac_2'] || data.dice2 || 0;
        const x3 = data['xúc xắc 3'] || data['xuc_xac_3'] || data.dice3 || 0;
        if (!phien || !ketQua) return null;
        return {
            'Phiên trước': phien,
            'kết quả': ketQua,
            'xúc xắc 1': parseInt(x1) || 0,
            'xúc xắc 2': parseInt(x2) || 0,
            'xúc xắc 3': parseInt(x3) || 0
        };
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                if (this.shared.PKT_HEARTBEAT) {
                    this.ws.send(this.shared.PKT_HEARTBEAT);
                } else {
                    // Nếu không có gói heartbeat đặc biệt, gửi ping frame
                    this.ws.ping();
                }
            }
        }, 15000); // Mỗi 15 giây
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        console.log('🔄 Scheduling reconnect in 10s...');
        this.reconnectTimer = setTimeout(() => {
            if (!this.alive) {
                this.connect();
            }
        }, 10000);
    }

    isAlive() {
        return this.alive && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

module.exports = Bot68GB;