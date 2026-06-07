const http = require('http');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');
const Bot68GB = require('./bot_unified');

// ─── TOKEN & WS URL ─────────────────────────────────────────────────────
const TOKEN_HEX = "010000687b22636f6465223a3230302c22737973223a7b22686561727462656174223a31352c2273657269616c697a657222";
const WS_URL_ENV = "wss://mtsahwkvbim09mnwv.cq.qnwxdhwica.com/";

// ─── CẤU HÌNH ───────────────────────────────────────────────────────────
const LANDING_URL = "https://68gbvn88.bar";
const TOKEN_FILE = "token_shared.bin";
const PORT = parseInt(process.env.PORT || "8080");

const shared = {
    WS_URL: WS_URL_ENV,
    PKT_HANDSHAKE: Buffer.from('010000727b22737973223a7b22706c6174666f726d223a226a732d776562736f636b6574222c22636c69656e744275696c644e756d626572223a22302e302e31222c22636c69656e7456657273696f6e223a223061323134383164373436663932663834323865316236646565623736666561227d7d', 'hex'),
    PKT_HANDSHAKE_ACK: Buffer.from('02000000', 'hex'),
    PKT_HEARTBEAT: Buffer.from('03000000', 'hex'),
    PKT_AUTH: Buffer.from('', 'hex') 
};

// Nạp token từ TOKEN_HEX
if (TOKEN_HEX) {
    console.log("✅ Using TOKEN_HEX from config");
    shared.PKT_AUTH = Buffer.from(
        TOKEN_HEX.replace(/^0x/i, "").replace(/\s+/g, ""),
        "hex"
    );
    shared.SESSION_READY = true;
    console.log("📝 Token loaded, length:", shared.PKT_AUTH.length, "bytes");
} else {
    console.log("Using token_shared.bin");
    if (fs.existsSync(TOKEN_FILE)) {
        shared.PKT_AUTH = fs.readFileSync(TOKEN_FILE);
        shared.SESSION_READY = true;
        console.log("📝 Token loaded from file");
    } else {
        console.log("⚠️ [CONFIG] Không có Token tĩnh. Cần nạp qua POST /api/token.");
    }
}

// ─── AI DỰ ĐOÁN SUPER VIP (ENSEMBLE + TỰ HỌC TRỌNG SỐ) ─────────────────
class AdvancedPatternPredictor {
    constructor() {
        this.history = [];               // {phien, result: 'T'/'X'}
        this.predictions = [];           // {phien, du_doan, do_tin_cay, actual, dung, models_used}
        this.maxHistory = 1000;
        this.maxPredictions = 2000;

        // Các mô hình con với trọng số tự học
        this.models = {
            pattern: { weight: 1.0, correct: 0, total: 0 },
            baccarat: { weight: 1.0, correct: 0, total: 0 },
            frequency: { weight: 1.0, correct: 0, total: 0 },
            distance: { weight: 1.0, correct: 0, total: 0 },
            breakout: { weight: 1.0, correct: 0, total: 0 }
        };
        this.learningRate = 0.1;
        this.decay = 0.98;
    }

    // Nạp lịch sử từ kết quả thực
    loadFromResults(results) {
        if (!Array.isArray(results)) return;
        for (let r of results) {
            if (r && r['Phiên trước'] && r['kết quả']) {
                const res = r['kết quả'] === 'TÀI' ? 'T' : 'X';
                this.history.push({ phien: r['Phiên trước'], result: res });
            }
        }
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(-this.maxHistory);
        }
    }

    // Thêm kết quả mới khi bot nhận được phiên mới
    addResult(phien, result) {
        if (this.history.length > 0 && this.history[this.history.length - 1].phien === phien)
            return;
        this.history.push({ phien, result });
        if (this.history.length > this.maxHistory) this.history.shift();

        // Cập nhật dự đoán cũ nếu có
        const pred = this.predictions.find(p => p.phien === phien && p.actual === null);
        if (pred) {
            pred.actual = result;
            pred.dung = (pred.du_doan === result);
            // Điều chỉnh trọng số các mô hình đã tham gia
            if (pred.models_used) {
                for (let model of pred.models_used) {
                    if (this.models[model]) {
                        this.models[model].total++;
                        if (pred.dung) this.models[model].correct++;
                        const acc = this.models[model].correct / this.models[model].total;
                        this.models[model].weight = 0.5 + acc;
                    }
                }
            }
            // Decay toàn bộ
            for (let m in this.models) {
                this.models[m].weight *= this.decay;
                if (this.models[m].weight < 0.2) this.models[m].weight = 0.2;
                if (this.models[m].weight > 3.0) this.models[m].weight = 3.0;
            }
        }
        // Dọn dẹp predictions cũ
        if (this.predictions.length > this.maxPredictions) {
            this.predictions = this.predictions.slice(-this.maxPredictions);
        }
    }

    // --- Các mô hình con ---
    predictByPattern() {
        const resultsString = this.history.map(h => h.result).join('');
        if (resultsString.length < 2) return null;
        let bestPred = null, bestConf = 0;
        for (let len = Math.min(6, resultsString.length - 1); len >= 2; len--) {
            const suffix = resultsString.slice(-len);
            const nextChars = [];
            for (let i = 0; i <= resultsString.length - len - 1; i++) {
                if (resultsString.substr(i, len) === suffix) {
                    const nextIdx = i + len;
                    if (nextIdx < resultsString.length) nextChars.push(resultsString[nextIdx]);
                }
            }
            if (nextChars.length > 0) {
                const t = nextChars.filter(c => c === 'T').length;
                const x = nextChars.length - t;
                const conf = Math.max(t, x) / nextChars.length;
                if (conf > bestConf) {
                    bestConf = conf;
                    bestPred = t > x ? 'T' : (x > t ? 'X' : (Math.random() < 0.5 ? 'T' : 'X'));
                }
            }
        }
        return bestPred ? { prediction: bestPred, confidence: bestConf } : null;
    }

    detectBaccaratPatterns() {
        const arr = this.history.map(h => h.result);
        if (arr.length < 3) return null;
        const recent = arr.slice(-10);
        // Bệt
        let count = 1;
        for (let i = recent.length - 2; i >= 0; i--) {
            if (recent[i] === recent[recent.length - 1]) count++;
            else break;
        }
        if (count >= 3) {
            return { type: 'bệt', prediction: recent[recent.length - 1], strength: count };
        }
        // 1-1
        if (recent.length >= 4) {
            let alt = true;
            for (let i = recent.length - 2; i >= recent.length - 4; i--) {
                if (recent[i] === recent[i+1]) { alt = false; break; }
            }
            if (alt) {
                return { type: '1-1', prediction: recent[recent.length - 1] === 'T' ? 'X' : 'T', strength: 3 };
            }
        }
        // Nghiêng
        const last20 = arr.slice(-20);
        const tCount = last20.filter(c => c === 'T').length;
        const xCount = last20.length - tCount;
        if (Math.abs(tCount - xCount) >= 5) {
            return { type: 'nghiêng', prediction: tCount > xCount ? 'T' : 'X', strength: Math.abs(tCount - xCount) };
        }
        return null;
    }

    predictByDistance() {
        const arr = this.history.map(h => h.result);
        if (arr.length < 5) return null;
        const positions = { T: [], X: [] };
        arr.forEach((c, i) => positions[c].push(i));
        if (positions['T'].length < 2 || positions['X'].length < 2) return null;
        const avgDist = pos => pos.reduce((s, v, i, a) => i ? s + v - a[i-1] : 0, 0) / (pos.length - 1);
        const avgT = avgDist(positions['T']);
        const avgX = avgDist(positions['X']);
        const lastIdx = arr.length - 1;
        const nextTDist = lastIdx - positions['T'][positions['T'].length-1];
        const nextXDist = lastIdx - positions['X'][positions['X'].length-1];
        if (nextTDist >= avgT * 0.8) return 'T';
        if (nextXDist >= avgX * 0.8) return 'X';
        return null;
    }

    predictBreakout() {
        const arr = this.history.map(h => h.result);
        if (arr.length < 6) return null;
        const last3 = arr.slice(-3).join('');
        const before = arr.slice(-6, -3).join('');
        if (last3 === before) {
            return last3[0] === 'T' ? 'X' : 'T';
        }
        return null;
    }

    // Dự đoán tổng hợp (ensemble)
    predict() {
        if (this.history.length === 0) {
            return { phien: 1, du_doan: 'N/A', do_tin_cay: 0 };
        }
        const lastPhien = this.history[this.history.length - 1].phien;
        const nextPhien = lastPhien + 1;

        const votes = { T: 0, X: 0 };
        const modelsUsed = [];

        const patternRes = this.predictByPattern();
        if (patternRes) {
            votes[patternRes.prediction] += this.models.pattern.weight * patternRes.confidence;
            modelsUsed.push('pattern');
        }

        const baccarat = this.detectBaccaratPatterns();
        if (baccarat) {
            votes[baccarat.prediction] += this.models.baccarat.weight * (baccarat.strength / 10);
            modelsUsed.push('baccarat');
        }

        const totalT = this.history.filter(h => h.result === 'T').length;
        const totalX = this.history.length - totalT;
        if (totalT !== totalX) {
            const freqPred = totalT > totalX ? 'T' : 'X';
            votes[freqPred] += this.models.frequency.weight * 0.5;
            modelsUsed.push('frequency');
        }

        const distPred = this.predictByDistance();
        if (distPred) {
            votes[distPred] += this.models.distance.weight * 0.6;
            modelsUsed.push('distance');
        }

        const breakout = this.predictBreakout();
        if (breakout) {
            votes[breakout] += this.models.breakout.weight * 0.7;
            modelsUsed.push('breakout');
        }

        let finalPred, confidence;
        if (votes.T > votes.X) {
            finalPred = 'TÀI';
            confidence = votes.T / (votes.T + votes.X);
        } else if (votes.X > votes.T) {
            finalPred = 'XỈU';
            confidence = votes.X / (votes.T + votes.X);
        } else {
            finalPred = totalT >= totalX ? 'TÀI' : 'XỈU';
            confidence = 0.5;
        }

        const predObj = {
            phien: nextPhien,
            du_doan: finalPred,
            do_tin_cay: Math.round(confidence * 100),
            actual: null,
            dung: null,
            models_used: modelsUsed
        };
        this.predictions.push(predObj);
        return predObj;
    }

    getAccuracy() {
        const evaluated = this.predictions.filter(p => p.dung !== null);
        const correct = evaluated.filter(p => p.dung).length;
        return {
            total: evaluated.length,
            correct,
            accuracy: evaluated.length > 0 ? (correct / evaluated.length * 100) : 0
        };
    }

    getStatus() {
        const evaluated = this.predictions.filter(p => p.dung !== null);
        return {
            tong_du_doan: this.predictions.length,
            da_co_ket_qua: evaluated.length,
            dung: evaluated.filter(p => p.dung).length,
            sai: evaluated.filter(p => p.dung === false).length,
            ti_le_dung_hien_tai: this.getAccuracy().accuracy.toFixed(2) + '%',
            models: Object.entries(this.models).map(([name, data]) => ({
                name,
                weight: data.weight.toFixed(3),
                correct: data.correct,
                total: data.total,
                accuracy: data.total > 0 ? (data.correct / data.total * 100).toFixed(2) + '%' : 'N/A'
            })),
            lich_su: this.predictions
                .slice(-50)
                .map(p => ({
                    phien: p.phien,
                    du_doan: p.du_doan,
                    ket_qua_thuc: p.actual || 'chưa có',
                    dung: p.dung,
                    do_tin_cay: p.do_tin_cay,
                    models: p.models_used?.join(', ') || 'ensemble'
                }))
        };
    }

    // Lấy toàn bộ lịch sử dự đoán (có thể giới hạn bằng query ?limit=)
    getPredictionHistory(limit = 100) {
        return this.predictions
            .slice(-limit)
            .map(p => ({
                phien: p.phien,
                du_doan: p.du_doan,
                do_tin_cay: p.do_tin_cay,
                actual: p.actual || null,
                dung: p.dung,
                models_used: p.models_used
            }));
    }

    // Lấy toàn bộ lịch sử kết quả thực (dùng cho chart)
    getResultHistory(limit = 200) {
        return this.history.slice(-limit).map(h => ({
            phien: h.phien,
            result: h.result === 'T' ? 'TÀI' : 'XỈU'
        }));
    }
}

// Khởi tạo bot
const bot = new Bot68GB(shared);

// Hai bộ dự đoán độc lập cho TXHU và MD5
const predictorTxhu = new AdvancedPatternPredictor();
const predictorMd5 = new AdvancedPatternPredictor();

let lastTxhuPhien = null;
let lastMd5Phien = null;

// Cập nhật dữ liệu từ bot mỗi 2 giây
function updatePredictors() {
    try {
        if (bot.txhu && bot.txhu.last_result && !bot.txhu.last_result.error) {
            const r = bot.txhu.last_result;
            const phien = r['Phiên trước'];
            if (phien && phien !== lastTxhuPhien) {
                const res = r['kết quả'] === 'TÀI' ? 'T' : 'X';
                predictorTxhu.addResult(phien, res);
                lastTxhuPhien = phien;
                predictorTxhu.predict();
            }
        }
        if (bot.md5 && bot.md5.last_result && !bot.md5.last_result.error) {
            const r = bot.md5.last_result;
            const phien = r['Phiên trước'];
            if (phien && phien !== lastMd5Phien) {
                const res = r['kết quả'] === 'TÀI' ? 'T' : 'X';
                predictorMd5.addResult(phien, res);
                lastMd5Phien = phien;
                predictorMd5.predict();
            }
        }
    } catch (e) {
        console.error("Predictor update error:", e.message);
    }
}

// Nạp lịch sử ban đầu nếu bot đã có dữ liệu
if (bot.txhu && bot.txhu.history) {
    predictorTxhu.loadFromResults(bot.txhu.history);
    if (predictorTxhu.history.length > 0) {
        lastTxhuPhien = predictorTxhu.history[predictorTxhu.history.length - 1].phien;
        predictorTxhu.predict();
    }
}
if (bot.md5 && bot.md5.history) {
    predictorMd5.loadFromResults(bot.md5.history);
    if (predictorMd5.history.length > 0) {
        lastMd5Phien = predictorMd5.history[predictorMd5.history.length - 1].phien;
        predictorMd5.predict();
    }
}

setInterval(updatePredictors, 2000);

// ─── HTTP SERVER ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const _cors = (code, body = null, type = 'application/json') => {
        res.writeHead(code, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': type + '; charset=utf-8'
        });
        res.end(body ? (typeof body === 'string' ? body : JSON.stringify(body)) : "");
    };

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());

    // POST /api/token
    if (req.method === 'POST' && path === '/api/token') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const hex = data.token.replace(/b'|'|\\x| /g, "");
                shared.PKT_AUTH = Buffer.from(hex, 'hex');
                fs.writeFileSync(TOKEN_FILE, shared.PKT_AUTH);
                shared.SESSION_READY = true;
                if (bot.ws) bot.ws.close();
                else bot.run(LANDING_URL);
                _cors(200, { status: "ok" });
            } catch (e) { _cors(400, { error: e.message }); }
        });
    }
    // GET dữ liệu live TXHU
    else if (path === '/api/68gb/txhu') {
        _cors(200, bot.txhu.last_result || { error: "No data" });
    }
    // GET lịch sử kết quả thực TXHU
    else if (path === '/api/68gb/history/txhu') {
        _cors(200, bot.txhu.history.slice().reverse());
    }
    // GET dữ liệu live MD5
    else if (path === '/api/68gb/txmd5' || path === '/api/data') {
        _cors(200, bot.md5.last_result || { error: "No data" });
    }
    // GET lịch sử kết quả thực MD5
    else if (path === '/api/68gb/history/txmd5' || path === '/api/history') {
        _cors(200, bot.md5.history.slice().reverse());
    }
    // Dự đoán TXHU (phiên tiếp theo)
    else if (path === '/predict/taixiu') {
        if (predictorTxhu.predictions.length > 0) {
            const latest = predictorTxhu.predictions[predictorTxhu.predictions.length - 1];
            _cors(200, {
                phien_hien_tai: latest.phien,
                du_doan: latest.du_doan,
                do_tin_cay: latest.do_tin_cay,
                models_used: latest.models_used
            });
        } else {
            _cors(200, { error: "Chưa có dữ liệu dự đoán" });
        }
    }
    // Dự đoán MD5 (phiên tiếp theo)
    else if (path === '/predict/md5') {
        if (predictorMd5.predictions.length > 0) {
            const latest = predictorMd5.predictions[predictorMd5.predictions.length - 1];
            _cors(200, {
                phien_hien_tai: latest.phien,
                du_doan: latest.du_doan,
                do_tin_cay: latest.do_tin_cay,
                models_used: latest.models_used
            });
        } else {
            _cors(200, { error: "Chưa có dữ liệu dự đoán" });
        }
    }
    // Trạng thái tổng quan + lịch sử dự đoán gần nhất (50)
    else if (path === '/status') {
        _cors(200, {
            txhu: predictorTxhu.getStatus(),
            md5: predictorMd5.getStatus()
        });
    }
    // 🆕 Lịch sử dự đoán TXHU (tham số ?limit=)
    else if (path === '/history/taixiu/predictions') {
        const limit = parseInt(query.limit) || 200;
        _cors(200, predictorTxhu.getPredictionHistory(limit));
    }
    // 🆕 Lịch sử dự đoán MD5
    else if (path === '/history/md5/predictions') {
        const limit = parseInt(query.limit) || 200;
        _cors(200, predictorMd5.getPredictionHistory(limit));
    }
    // 🆕 Lịch sử kết quả thực TXHU (dạng TÀI/XỈU)
    else if (path === '/history/taixiu/results') {
        const limit = parseInt(query.limit) || 200;
        _cors(200, predictorTxhu.getResultHistory(limit));
    }
    // 🆕 Lịch sử kết quả thực MD5
    else if (path === '/history/md5/results') {
        const limit = parseInt(query.limit) || 200;
        _cors(200, predictorMd5.getResultHistory(limit));
    }
    // Trang chủ (dashboard)
    else if (path === '/' || path === '/index.html') {
        _cors(200, getLandingPage(bot.isAlive()), 'text/html');
    }
    else {
        _cors(404, { error: "Not Found" });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SERVER] Unified API on Port ${PORT}`);
    console.log(`🌐 [WS_URL] Using: ${shared.WS_URL}`);
    console.log(`🧠 [AI] Super Ensemble Predictor với tự học trọng số đã sẵn sàng`);
    if (shared.SESSION_READY) {
        console.log("✅ [INIT] Token sẵn sàng. Khởi động Bot...");
        bot.run(LANDING_URL);
    } else {
        console.log("🆕 [INIT] Chưa có Token. Đang chờ nạp qua API...");
    }
});

// ─── LANDING PAGE ───────────────────────────────────────────────────────
function getLandingPage(botStatus) {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>68GB Bot Dashboard - Super AI</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0a0b10;
            --card: rgba(255, 255, 255, 0.05);
            --accent: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            --text: #f8fafc;
            --secondary: #94a3b8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: var(--bg); 
            color: var(--text); 
            font-family: 'Outfit', sans-serif;
            background-image: radial-gradient(circle at 50% 50%, #1e1b4b 0%, #0a0b10 100%);
            min-height: 100vh;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        header { text-align: center; margin-bottom: 60px; }
        h1 { font-size: 3rem; font-weight: 800; background: var(--accent); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status-badge { display: inline-flex; align-items: center; padding: 6px 16px; border-radius: 999px; background: ${botStatus ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${botStatus ? '#4ade80' : '#f87171'}; font-weight: 600; border: 1px solid ${botStatus ? '#4ade8044' : '#f8717144'}; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 30px; margin-bottom: 50px; }
        .card { background: var(--card); backdrop-filter: blur(12px); border-radius: 24px; padding: 30px; border: 1px solid rgba(255,255,255,0.08); transition: transform 0.3s; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); border-color: rgba(99, 102, 241, 0.3); }
        .card-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 25px; }
        .result-val { font-size: 2.5rem; font-weight: 800; }
        .prediction { background: rgba(99, 102, 241, 0.1); border-radius: 12px; padding: 15px; margin-top: 15px; }
        .confidence { color: #a78bfa; font-size: 0.9rem; }
        .models { font-size: 0.8rem; color: #64748b; margin-top: 5px; }
        .tai { color: #f87171; } .xiu { color: #60a5fa; }
        .controls { display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; margin-top: 30px; }
        .btn { padding: 14px 28px; border-radius: 16px; border: none; font-weight: 600; cursor: pointer; transition: 0.2s; text-decoration: none; font-family: 'Outfit', sans-serif; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); }
        .api-links { text-align: center; margin-top: 60px; }
        .link-chip { display: inline-block; padding: 10px 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; margin: 5px; color: var(--secondary); text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>68GB DASHBOARD AI</h1>
            <div class="status-badge">Bot: ${botStatus ? 'ACTIVE' : 'DISCONNECTED'}</div>
        </header>
        <div class="grid">
            <div class="card">
                <div class="card-title">🎲 TÀI XỈU HŨ <span id="txhu-s"></span></div>
                <div id="txhu-res" class="result-val">...</div>
                <div id="txhu-dice"></div>
                <div class="prediction" id="txhu-predict"></div>
                <div style="margin-top:15px">
                    <a href="/api/68gb/txhu" class="link-chip">Live</a>
                    <a href="/predict/taixiu" class="link-chip">Dự đoán</a>
                    <a href="/api/68gb/history/txhu" class="link-chip">Lịch sử kết quả</a>
                    <a href="/history/taixiu/predictions" class="link-chip">Lịch sử dự đoán</a>
                </div>
            </div>
            <div class="card">
                <div class="card-title">🔐 TÀI XỈU MD5 <span id="md5-s"></span></div>
                <div id="md5-res" class="result-val">...</div>
                <div id="md5-dice"></div>
                <div class="prediction" id="md5-predict"></div>
                <div style="margin-top:15px">
                    <a href="/api/68gb/txmd5" class="link-chip">Live</a>
                    <a href="/predict/md5" class="link-chip">Dự đoán</a>
                    <a href="/api/68gb/history/txmd5" class="link-chip">Lịch sử kết quả</a>
                    <a href="/history/md5/predictions" class="link-chip">Lịch sử dự đoán</a>
                </div>
            </div>
        </div>
        <div class="controls">
            <button class="btn btn-primary" onclick="refetchToken()">🔄 Lấy Lại Token</button>
            <a href="/status" class="btn btn-secondary">📊 Hiệu suất AI</a>
        </div>
        <div class="api-links">
            <h2>Endpoints</h2>
            <a href="/predict/taixiu" class="link-chip">/predict/taixiu</a>
            <a href="/predict/md5" class="link-chip">/predict/md5</a>
            <a href="/status" class="link-chip">/status</a>
            <a href="/history/taixiu/predictions" class="link-chip">/history/taixiu/predictions</a>
            <a href="/history/md5/predictions" class="link-chip">/history/md5/predictions</a>
            <a href="/history/taixiu/results" class="link-chip">/history/taixiu/results</a>
            <a href="/history/md5/results" class="link-chip">/history/md5/results</a>
        </div>
        <footer>Super AI Ensemble &bull; Tự học trọng số &bull; 2026</footer>
    </div>
    <script>
        async function update() {
            try {
                const [txhuRes, txhuPred, md5Res, md5Pred] = await Promise.all([
                    fetch('/api/68gb/txhu').then(r=>r.json()),
                    fetch('/predict/taixiu').then(r=>r.json()),
                    fetch('/api/68gb/txmd5').then(r=>r.json()),
                    fetch('/predict/md5').then(r=>r.json())
                ]);
                // TXHU
                if(!txhuRes.error){
                    document.getElementById('txhu-s').innerText = '#' + txhuRes['Phiên trước'];
                    const el = document.getElementById('txhu-res');
                    el.innerText = txhuRes['kết quả'];
                    el.className = 'result-val ' + (txhuRes['kết quả']==='TÀI'?'tai':'xiu');
                    document.getElementById('txhu-dice').innerText = txhuRes['xúc xắc 1'] + ' - ' + txhuRes['xúc xắc 2'] + ' - ' + txhuRes['xúc xắc 3'];
                }
                if(!txhuPred.error){
                    document.getElementById('txhu-predict').innerHTML = 
                        '<span>🔮 Dự đoán phiên <b>#' + txhuPred.phien_hien_tai + '</b>: <b>' + txhuPred.du_doan + '</b></span><br>' +
                        '<span class="confidence">Độ tin cậy: ' + txhuPred.do_tin_cay + '%</span>' +
                        '<div class="models">Mô hình: ' + (txhuPred.models_used?.join(', ') || 'ensemble') + '</div>';
                }
                // MD5
                if(!md5Res.error){
                    document.getElementById('md5-s').innerText = '#' + md5Res['Phiên trước'];
                    const el = document.getElementById('md5-res');
                    el.innerText = md5Res['kết quả'];
                    el.className = 'result-val ' + (md5Res['kết quả']==='TÀI'?'tai':'xiu');
                    document.getElementById('md5-dice').innerText = md5Res['xúc xắc 1'] + ' - ' + md5Res['xúc xắc 2'] + ' - ' + md5Res['xúc xắc 3'];
                }
                if(!md5Pred.error){
                    document.getElementById('md5-predict').innerHTML = 
                        '<span>🔮 Dự đoán phiên <b>#' + md5Pred.phien_hien_tai + '</b>: <b>' + md5Pred.du_doan + '</b></span><br>' +
                        '<span class="confidence">Độ tin cậy: ' + md5Pred.do_tin_cay + '%</span>' +
                        '<div class="models">Mô hình: ' + (md5Pred.models_used?.join(', ') || 'ensemble') + '</div>';
                }
            } catch(e){console.error(e)}
        }
        setInterval(update, 5000);
        update();
        function refetchToken(){
            if(!confirm('Xác nhận lấy token?')) return;
            fetch('/api/refetch').then(()=>alert('Đã gửi yêu cầu'));
        }
    </script>
</body>
</html>`;
}