const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// マップ設定
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const MAP_SIZE = 2000;
const TASK_LOCATIONS = [{x: 200, y: 200}, {x: 1800, y: 200}, {x: 200, y: 1800}, {x: 1000, y: 1000}];

// 状態
let myId = null;
let players = {};
let bodies = [];
let gameState = "lobby";
let me = {};
let camera = { x: 0, y: 0 };

// 入力
const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// --- Socket Events ---
socket.on('connect', () => myId = socket.id);

socket.on('stateUpdate', (data) => {
    players = data.players;
    bodies = data.bodies;
    gameState = data.gameState;
    me = players[myId];

    // ロビー画面制御
    document.getElementById('lobbyScreen').style.display = (gameState === 'lobby') ? 'flex' : 'none';
    if (me && me.isHost && gameState === 'lobby') {
        document.getElementById('startBtn').style.display = 'block';
    }

    // ゲームオーバー制御
    document.getElementById('gameOverScreen').style.display = (gameState === 'gameover') ? 'flex' : 'none';
    
    // 会議画面制御
    const meetingEl = document.getElementById('meetingScreen');
    if (gameState === 'meeting') {
        meetingEl.style.display = 'flex';
        updateVoteUI();
    } else {
        meetingEl.style.display = 'none';
        hasVoted = false; // フラグリセット
    }

    // 役職表示
    if (me) {
        const roleEl = document.getElementById('roleDisplay');
        roleEl.innerText = me.role;
        roleEl.style.color = (me.role === 'Impostor') ? 'red' : '#aaf';
        
        // ImpostorだけKillボタン表示
        document.getElementById('killBtn').style.display = (me.role === 'Impostor') ? 'block' : 'none';
    }

    // タスクバー
    const progress = data.taskProgress;
    if (progress.total > 0) {
        const pct = (progress.completed / progress.total) * 100;
        document.getElementById('taskBarFill').style.width = pct + "%";
    }
});

socket.on('gameStarted', () => {
    console.log("Game Started!");
});

socket.on('gameOver', (msg) => {
    document.getElementById('winnerText').innerText = msg;
});

socket.on('meetingEnded', (data) => {
    document.getElementById('meetingResult').innerText = data.result;
});

// --- UI Actions ---
document.getElementById('startBtn').onclick = () => socket.emit('startGame');
document.getElementById('killBtn').onclick = () => { if(killTarget) socket.emit('kill', killTarget); };
document.getElementById('reportBtn').onclick = () => { if(canReport) socket.emit('report'); };
document.getElementById('useBtn').onclick = () => { if(canUse) document.getElementById('taskModal').style.display = 'flex'; };

document.getElementById('fixTaskBtn').onclick = () => {
    socket.emit('completeTask');
    closeTask();
};
window.closeTask = () => document.getElementById('taskModal').style.display = 'none';

document.getElementById('skipBtn').onclick = () => {
    socket.emit('vote', null);
    hasVoted = true;
};

// --- Game Loop ---
let killTarget = null;
let canReport = false;
let canUse = false;
let hasVoted = false;

function update() {
    // 移動 (Playing中かつ生存時)
    if (me && me.isAlive && gameState === 'playing') {
        let speed = 5;
        let moved = false;
        if (keys['w'] || keys['ArrowUp']) { me.y -= speed; moved = true; }
        if (keys['s'] || keys['ArrowDown']) { me.y += speed; moved = true; }
        if (keys['a'] || keys['ArrowLeft']) { me.x -= speed; moved = true; }
        if (keys['d'] || keys['ArrowRight']) { me.x += speed; moved = true; }
        
        // 壁判定
        me.x = Math.max(0, Math.min(MAP_SIZE, me.x));
        me.y = Math.max(0, Math.min(MAP_SIZE, me.y));

        if (moved) socket.emit('move', { x: me.x, y: me.y });
    }
}

function draw() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!me) return;

    // カメラ位置計算（自分中心）
    camera.x = me.x - canvas.width / 2;
    camera.y = me.y - canvas.height / 2;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // 1. グリッドとマップ境界
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);
    
    // 2. タスク場所
    ctx.fillStyle = 'yellow';
    TASK_LOCATIONS.forEach(t => {
        ctx.fillRect(t.x, t.y, 40, 40);
    });

    // 3. 死体
    bodies.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(b.x + 20, b.y + 30, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white'; // 骨
        ctx.fillRect(b.x + 18, b.y + 20, 4, 10);
    });

    // 4. プレイヤー
    killTarget = null;
    canReport = false;
    canUse = false;

    Object.values(players).forEach(p => {
        if (!p.isAlive) return;

        // 描画
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 40, 40);
        
        // 名前
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(p.id.substring(0,4), p.x, p.y - 10);

        // 判定ロジック (自分以外)
        if (p.id !== myId) {
            const dist = Math.hypot(p.x - me.x, p.y - me.y);
            // Kill判定 (自分がインポスター)
            if (me.role === 'Impostor' && me.isAlive && dist < 100 && p.role !== 'Impostor') {
                killTarget = p.id;
            }
        }
    });

    // Report判定
    bodies.forEach(b => {
        if (Math.hypot(b.x - me.x, b.y - me.y) < 100) canReport = true;
    });

    // Use判定
    TASK_LOCATIONS.forEach(t => {
        if (Math.hypot(t.x - me.x, t.y - me.y) < 100) canUse = true;
    });

    // 視界制限 (Fog of War)
    if (me.isAlive) {
        // Canvasの合成モードを使って穴を開ける
        ctx.restore(); // 一旦カメラリセット
        ctx.save();
        
        // 全体を黒く
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // くり抜く
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(canvas.width/2 + 20, canvas.height/2 + 20, 200, 0, Math.PI*2);
        ctx.fill();
        
        ctx.restore(); // 合成モード解除
        ctx.save(); // 再度カメラ適用用（もし後で描くものがあれば）
        ctx.translate(-camera.x, -camera.y);
    } else {
        // 死亡時は全体が見えるが暗い
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.restore();

    // UIボタンのアクティブ化
    document.getElementById('killBtn').className = (killTarget && !hasVoted) ? 'btn active' : 'btn';
    document.getElementById('reportBtn').className = canReport ? 'btn active' : 'btn';
    document.getElementById('useBtn').className = canUse ? 'btn active' : 'btn';
}

function updateVoteUI() {
    const container = document.getElementById('voteContainer');
    container.innerHTML = '';
    
    Object.values(players).forEach(p => {
        const div = document.createElement('div');
        div.className = 'vote-item';
        div.innerHTML = `<span>${p.id.substring(0,4)} ${p.isAlive ? '' : '(DEAD)'}</span>`;
        
        if (me.isAlive && !hasVoted && p.isAlive) {
            const btn = document.createElement('button');
            btn.innerText = 'VOTE';
            btn.onclick = () => {
                socket.emit('vote', p.id);
                hasVoted = true;
            };
            div.appendChild(btn);
        }
        container.appendChild(div);
    });
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();