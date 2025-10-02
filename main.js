/* main.js — single JS file powering game.html (and referenced by other pages)
   Complete horror maze game with health system and improved stalker AI */

// Game constants
const cellSize = 40;
const cols = 24;
const rows = 16;
const W = cols * cellSize;
const H = rows * cellSize;

// Game state
let gameState = 'playing';
let gameMode = 'single'; // 'single' or 'twoPlayer'

// Audio context and sounds
let audioContext;
let sounds = {};

// Initialize audio
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        createSounds();
    } catch (e) {
        console.log('Audio not supported');
    }
}

// Create sound effects
function createSounds() {
    // Relic collection sound
    sounds.relic = createTone(800, 0.1, 'sine');
    
    // Teleport item collection sound
    sounds.teleportItem = createTone(1200, 0.15, 'square');
    
    // Monster teleport item collection sound
    sounds.monsterTeleportItem = createTone(600, 0.2, 'sawtooth');
    
    // Button click sound
    sounds.button = createTone(400, 0.1, 'triangle');
    
    // Health loss sound
    sounds.healthLoss = createTone(200, 0.3, 'sawtooth');
    
    // Win sound
    sounds.win = createTone(523, 0.5, 'sine');
    
    // Game over sound
    sounds.gameOver = createTone(150, 1.0, 'sawtooth');
}

// Create a tone
function createTone(frequency, duration, type = 'sine') {
    return function() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    };
}

// Play sound effect
function playSound(soundName) {
    if (sounds[soundName]) {
        sounds[soundName]();
    }
}
let player = {x: 0, y: 0, r: 8, speed: 1.6, health: 3, maxHealth: 3, invulnerable: false, invulnTime: 0, teleportItems: 0};
let stalker = {x: 0, y: 0, r: 14, speed: 1.6, aware: false, lastHeard: 0, lastSeen: 0, targetX: 0, targetY: 0, state: 'patrol', teleportItems: 0};
let relics = [];
let teleportItems = [];
let monsterTeleportItems = [];
let maze = [];
let keys = {};
let keys2 = {}; // Second player keys
let mouse = {x: 0, y: 0};
let statusEl;

// Initialize game
function init() {
    // Initialize audio
    initAudio();
    
    maze = carveMaze();
    const startCell = {x: 1, y: 1};
    const ppx = cellToPx(startCell.x, startCell.y);
    player = {x: ppx.x, y: ppx.y, r: 8, speed: 1.6, health: 3, maxHealth: 3, invulnerable: false, invulnTime: 0};
    
    const stalkerPos = findValidSpawnPosition();
    stalker = {
        x: stalkerPos.x, 
        y: stalkerPos.y, 
        r: 14, 
        speed: 1.6, 
        aware: false, 
        lastHeard: 0, 
        lastSeen: 0,
        targetX: stalkerPos.x,
        targetY: stalkerPos.y,
        state: 'patrol',
        patrolPoints: generatePatrolPoints(),
        patrolIndex: 0,
        spotPlayerTime: 0,
        glowIntensity: 0
    };
    
relics = placeRelics(5);
    teleportItems = placeTeleportItems(3); // Spawn 3 teleport items
    monsterTeleportItems = placeMonsterTeleportItems(4); // Spawn 4 monster teleport items
    player.teleportItems = 0; // Reset teleport items
    stalker.teleportItems = 0; // Reset monster teleport items
gameState = 'playing';
updateHUD();
}

// Maze generation
function carveMaze() {
    const maze = Array(rows).fill().map(() => Array(cols).fill(true));
    const stack = [{x: 1, y: 1}];
    maze[1][1] = false;
    
    const directions = [[0, -2], [2, 0], [0, 2], [-2, 0]];
    
    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = directions
            .map(([dx, dy]) => ({x: current.x + dx, y: current.y + dy}))
            .filter(n => n.x > 0 && n.x < cols-1 && n.y > 0 && n.y < rows-1 && maze[n.y][n.x]);
        
        if (neighbors.length === 0) {
            stack.pop();
            continue;
        }
        
        const next = neighbors[Math.floor(Math.random() * neighbors.length)];
        const wall = {x: current.x + (next.x - current.x) / 2, y: current.y + (next.y - current.y) / 2};
        
        maze[next.y][next.x] = false;
        maze[wall.y][wall.x] = false;
        stack.push(next);
    }
    
    return maze;
}

// Utility functions
function cellToPx(x, y) {
    return {x: x * cellSize + cellSize/2, y: y * cellSize + cellSize/2};
}

function placeRelics(count) {
    const relicPositions = [];
    const attempts = 200;
    const minDistance = 4; // Minimum distance between relics
    
    for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < attempts && !placed; attempt++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            if (!maze[y][x] && !relicPositions.some(r => r.x === x && r.y === y)) {
                // Check minimum distance from other relics
                const tooClose = relicPositions.some(r => 
                    Math.abs(r.x - x) < minDistance && Math.abs(r.y - y) < minDistance
                );
                
                if (!tooClose) {
                    relicPositions.push({x, y, found: false});
                    placed = true;
                }
            }
        }
    }
    
    return relicPositions;
}

function placeTeleportItems(count) {
    const teleportPositions = [];
    const attempts = 200;
    const minDistance = 3; // Minimum distance between items
    
    for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < attempts && !placed; attempt++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            // Check if position is not a wall and not occupied by relics or other teleport items
            if (!maze[y][x] && 
                !relics.some(r => r.x === x && r.y === y) &&
                !teleportPositions.some(t => t.x === x && t.y === y)) {
                
                // Check minimum distance from other teleport items
                const tooClose = teleportPositions.some(t => 
                    Math.abs(t.x - x) < minDistance && Math.abs(t.y - y) < minDistance
                );
                
                if (!tooClose) {
                    teleportPositions.push({x, y, found: false});
                    placed = true;
                }
            }
        }
    }
    
    return teleportPositions;
}

function placeMonsterTeleportItems(count) {
    const monsterTeleportPositions = [];
    const attempts = 200;
    const minDistance = 3; // Minimum distance between items
    
    for (let i = 0; i < count; i++) {
        let placed = false;
        for (let attempt = 0; attempt < attempts && !placed; attempt++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            // Check if position is not a wall and not occupied by other items
            if (!maze[y][x] && 
                !relics.some(r => r.x === x && r.y === y) &&
                !teleportItems.some(t => t.x === x && t.y === y) &&
                !monsterTeleportPositions.some(mt => mt.x === x && mt.y === y)) {
                
                // Check minimum distance from other monster teleport items
                const tooClose = monsterTeleportPositions.some(mt => 
                    Math.abs(mt.x - x) < minDistance && Math.abs(mt.y - y) < minDistance
                );
                
                if (!tooClose) {
                    monsterTeleportPositions.push({x, y, found: false});
                    placed = true;
                }
            }
        }
    }
    
    return monsterTeleportPositions;
}

function findValidSpawnPosition() {
    const attempts = 100;
    
    for (let attempt = 0; attempt < attempts; attempt++) {
        const x = Math.floor(Math.random() * (cols - 2)) + 1;
        const y = Math.floor(Math.random() * (rows - 2)) + 1;
        
        // Check if position is not a wall and not too close to player
        if (!maze[y][x]) {
            const pos = cellToPx(x, y);
            const playerPos = cellToPx(1, 1); // Player starts at (1,1)
            const distance = Math.hypot(pos.x - playerPos.x, pos.y - playerPos.y);
            
            // Make sure monster spawns at least 100 units away from player
            if (distance > 100) {
                return {x: pos.x, y: pos.y, cellX: x, cellY: y};
            }
        }
    }
    
    // Fallback: spawn at a corner if no valid position found
    return cellToPx(cols-2, rows-2);
}

function generatePatrolPoints() {
    const patrolPoints = [];
    const attempts = 30;
    const maxPoints = 100;
    const minDistance = 40; // Reduced distance for more points
    
    // Generate up to 100 patrol points throughout the maze
    for (let i = 0; i < maxPoints; i++) {
        for (let attempt = 0; attempt < attempts; attempt++) {
            const x = Math.floor(Math.random() * (cols - 2)) + 1;
            const y = Math.floor(Math.random() * (rows - 2)) + 1;
            
            // Check if position is not a wall and not too close to other patrol points
            if (!maze[y][x]) {
                const pos = cellToPx(x, y);
                let tooClose = false;
                
                // Check distance from other patrol points
                for (let pp of patrolPoints) {
                    if (Math.hypot(pos.x - pp.x, pos.y - pp.y) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    patrolPoints.push(pos);
                    break;
                }
            }
        }
    }
    
    // If we couldn't generate enough points, add some fallback points
    if (patrolPoints.length < 10) {
        patrolPoints.push(cellToPx(2, 2));
        patrolPoints.push(cellToPx(cols-2, 2));
        patrolPoints.push(cellToPx(2, rows-2));
        patrolPoints.push(cellToPx(cols-2, rows-2));
        patrolPoints.push(cellToPx(Math.floor(cols/2), 2));
        patrolPoints.push(cellToPx(Math.floor(cols/2), rows-2));
        patrolPoints.push(cellToPx(2, Math.floor(rows/2)));
        patrolPoints.push(cellToPx(cols-2, Math.floor(rows/2)));
        patrolPoints.push(cellToPx(Math.floor(cols/2), Math.floor(rows/2)));
    }
    
    return patrolPoints;
}

function updateHUD() {
    if (!statusEl) return;
    
    const found = relics.filter(r => r.found).length;
    const healthDisplay = '❤️'.repeat(player.health) + '♡'.repeat(player.maxHealth - player.health);
    const teleportDisplay = '⚡'.repeat(player.teleportItems);
    const monsterTeleportDisplay = '🔥'.repeat(stalker.teleportItems);
    
    if (gameMode === 'twoPlayer') {
        statusEl.innerHTML = `Relics: ${found} / ${relics.length} | Health: ${healthDisplay} | P1 Teleports: ${teleportDisplay} | P2 Teleports: ${monsterTeleportDisplay} | Mode: 2-Player | P1: WASD+E | P2: IJKL+U`;
    } else {
        statusEl.innerHTML = `Relics: ${found} / ${relics.length} | Health: ${healthDisplay} | Teleports: ${teleportDisplay} | Monster Teleports: ${monsterTeleportDisplay} | Mode: Single Player | WASD + Mouse | Press E to teleport monster`;
    }
}

function playerCell() {
    return {x: Math.floor(player.x / cellSize), y: Math.floor(player.y / cellSize)};
}

function lineClear(ax, ay, bx, by) {
    const steps = Math.ceil(Math.hypot(bx-ax, by-ay) / 6);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const sx = ax + (bx-ax) * t;
        const sy = ay + (by-ay) * t;
        const cx = Math.floor(sx / cellSize);
        const cy = Math.floor(sy / cellSize);
        
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
        if (maze[cy][cx]) return false;
}
return true;
}

// Stalker AI states
function updateStalker(dt) {
    const distToPlayer = Math.hypot(stalker.x - player.x, stalker.y - player.y);
    
    if (gameMode === 'twoPlayer') {
        // Two-player mode: Player 2 controls the monster directly
        updatePlayerControlledStalker(dt);
    } else {
        // Single-player mode: Enhanced AI controls the monster
        const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        const angleToStalker = Math.atan2(stalker.y - player.y, stalker.x - player.x);
        const angleDiff = Math.abs(((angleToStalker - angle) + Math.PI) % (2 * Math.PI) - Math.PI);
        const inLight = angleDiff <= Math.PI * 0.36 && distToPlayer <= 180 && lineClear(player.x, player.y, stalker.x, stalker.y);
        
        const timeSinceHeard = performance.now() - stalker.lastHeard;
        const timeSinceSeen = performance.now() - stalker.lastSeen;
        
        // Update stalker awareness
        if (inLight) {
            if (!stalker.aware) {
                // Monster just spotted player - add visual effect
                stalker.spotPlayerTime = performance.now();
            }
            stalker.aware = true;
            stalker.lastSeen = performance.now();
            stalker.state = 'chase';
            stalker.targetX = player.x;
            stalker.targetY = player.y;
        } else if (timeSinceHeard < 2000) { // 2 seconds of awareness after hearing
            stalker.aware = true;
            if (stalker.state === 'patrol') {
                stalker.state = 'investigate';
                stalker.targetX = player.x;
                stalker.targetY = player.y;
            }
        } else if (timeSinceSeen > 3000) { // 3 seconds after losing sight
            stalker.aware = false;
            stalker.state = 'patrol';
        }
        
        // Use the enhanced AI movement system
        updateAIControlledStalker(dt);
    }
    
    // Update patrol index when reaching patrol points (single-player mode)
    if (gameMode === 'single' && stalker.state === 'patrol') {
        const patrolPoint = stalker.patrolPoints[stalker.patrolIndex];
        if (Math.hypot(stalker.x - patrolPoint.x, stalker.y - patrolPoint.y) < 20) {
            stalker.patrolIndex = (stalker.patrolIndex + 1) % stalker.patrolPoints.length;
        }
    }
    
    // Update glow intensity for visual effects
    if (stalker.aware) {
        stalker.glowIntensity = Math.min(1, stalker.glowIntensity + dt * 2);
    } else {
        stalker.glowIntensity = Math.max(0, stalker.glowIntensity - dt * 1);
    }
    
    // Check if stalker caught the player
    if (distToPlayer < (stalker.r + player.r) && !player.invulnerable) {
        player.health--;
        playSound('healthLoss');
        player.invulnerable = true;
        player.invulnTime = performance.now();
        updateHUD();
        
        if (player.health <= 0) {
            gameState = 'gameOver';
            playSound('gameOver');
            showGameOver();
        }
    }
}

function isWallCollision(x, y, radius = 0) {
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    
    // Check bounds
    if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows) return true;
    
    // Check if in a wall cell
    if (maze[cellY][cellX]) return true;
    
    // Check adjacent cells for radius collision
    if (radius > 0) {
        const checkRadius = Math.ceil(radius / cellSize);
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
            for (let dx = -checkRadius; dx <= checkRadius; dx++) {
                const checkX = cellX + dx;
                const checkY = cellY + dy;
                
                if (checkX >= 0 && checkY >= 0 && checkX < cols && checkY < rows) {
                    if (maze[checkY][checkX]) {
                        // Check if the radius would overlap with this wall cell
                        const wallLeft = checkX * cellSize;
                        const wallRight = wallLeft + cellSize;
                        const wallTop = checkY * cellSize;
                        const wallBottom = wallTop + cellSize;
                        
                        const closestX = Math.max(wallLeft, Math.min(x, wallRight));
                        const closestY = Math.max(wallTop, Math.min(y, wallBottom));
                        const distToWall = Math.hypot(x - closestX, y - closestY);
                        
                        if (distToWall < radius) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    
    return false;
}

// AI-controlled stalker for single-player mode
function updateAIControlledStalker(dt) {
    // AI monster can use teleport items strategically
    if (stalker.teleportItems > 0) {
        const distToPlayer = Math.hypot(stalker.x - player.x, stalker.y - player.y);
        
        // Use teleport if:
        // 1. Far from player (>150 units) AND
        // 2. Player is moving (making noise) AND
        // 3. Random chance (0.2% per frame)
        if (distToPlayer > 150 && stalker.lastHeard > 0 && Math.random() < 0.002) {
            teleportMonsterToPlayer();
        }
        // Or if stuck in a corner for too long
        else if (distToPlayer > 200 && Math.random() < 0.001) {
            teleportMonsterToPlayer();
        }
    }
    
    // AI monster movement - more random and exploratory
    const time = performance.now() * 0.001;
    
    // Add some randomness to movement
    const randomX = (Math.random() - 0.5) * 0.5;
    const randomY = (Math.random() - 0.5) * 0.5;
    
    // Calculate movement towards current target with some randomness
    const dx = stalker.targetX - stalker.x + randomX * 20;
    const dy = stalker.targetY - stalker.y + randomY * 20;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 0) {
        const moveX = (dx / dist) * stalker.speed * dt * 40;
        const moveY = (dy / dist) * stalker.speed * dt * 40;
        
        // Try moving in X direction first
        const newX = stalker.x + moveX;
        if (!isWallCollision(newX, stalker.y, stalker.r)) {
            stalker.x = newX;
        }
        
        // Try moving in Y direction
        const newY = stalker.y + moveY;
        if (!isWallCollision(stalker.x, newY, stalker.r)) {
            stalker.y = newY;
        }
        
        // If stuck, try random direction
        if (stalker.x === stalker.x && stalker.y === stalker.y) {
            const randomDir = Math.random() * Math.PI * 2;
            const randomMoveX = Math.cos(randomDir) * stalker.speed * dt * 20;
            const randomMoveY = Math.sin(randomDir) * stalker.speed * dt * 20;
            
            if (!isWallCollision(stalker.x + randomMoveX, stalker.y, stalker.r)) {
                stalker.x += randomMoveX;
            }
            if (!isWallCollision(stalker.x, stalker.y + randomMoveY, stalker.r)) {
                stalker.y += randomMoveY;
            }
        }
    }
    
    // Ensure monster stays within maze bounds
    stalker.x = Math.max(stalker.r, Math.min(W - stalker.r, stalker.x));
    stalker.y = Math.max(stalker.r, Math.min(H - stalker.r, stalker.y));
    
    // Update target more frequently for more dynamic movement
    if (Math.random() < 0.01) { // 1% chance per frame to change target
        const randomPoint = stalker.patrolPoints[Math.floor(Math.random() * stalker.patrolPoints.length)];
        stalker.targetX = randomPoint.x;
        stalker.targetY = randomPoint.y;
    }
}

// Player-controlled stalker for two-player mode
function updatePlayerControlledStalker(dt) {
    // Player 2 controls the stalker with IJKL keys
    const mv = {x: 0, y: 0};
    if (keys2['i'] || keys2['arrowup']) mv.y -= 1;
    if (keys2['k'] || keys2['arrowdown']) mv.y += 1;
    if (keys2['j'] || keys2['arrowleft']) mv.x -= 1;
    if (keys2['l'] || keys2['arrowright']) mv.x += 1;
    
    const mlen = Math.hypot(mv.x, mv.y);
    if (mlen > 0) {
        mv.x /= mlen;
        mv.y /= mlen;
        
        // Store previous position
        const prevX = stalker.x;
        const prevY = stalker.y;
        
        // Try X movement first
        const newX = stalker.x + mv.x * stalker.speed * dt * 40;
        if (!isWallCollision(newX, stalker.y, stalker.r)) {
            stalker.x = newX;
        }
        
        // Try Y movement
        const newY = stalker.y + mv.y * stalker.speed * dt * 40;
        if (!isWallCollision(stalker.x, newY, stalker.r)) {
            stalker.y = newY;
        }
    }
    
    // Ensure stalker stays within maze bounds
    stalker.x = Math.max(stalker.r, Math.min(W - stalker.r, stalker.x));
    stalker.y = Math.max(stalker.r, Math.min(H - stalker.r, stalker.y));
    
    // In two-player mode, stalker is always "aware" (red)
    stalker.aware = true;
    stalker.state = 'chase';
}

function showGameOver() {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    
    // Draw game over screen with pulsing effect
    const pulse = Math.sin(performance.now() * 0.01) * 0.1 + 0.9;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, W, H);
    
    // Pulsing red background
    ctx.fillStyle = `rgba(255, 0, 0, ${0.1 * pulse})`;
    ctx.fillRect(0, 0, W, H);
    
    // Game Over text with glow effect
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W/2, H/2 - 80);
    
    // Subtitle
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('The stalker caught you!', W/2, H/2 - 20);
    
    // Instructions
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cccccc';
    ctx.font = '20px Arial';
    ctx.fillText('Press R to restart or click Restart button', W/2, H/2 + 30);
    ctx.fillText('Click Menu to return to main menu', W/2, H/2 + 60);
    
    // Draw a scary face or skull
    ctx.fillStyle = '#ff0000';
    ctx.font = '120px Arial';
    ctx.fillText('💀', W/2, H/2 + 120);
}

function restart() {
    playSound('button');
    init();
    gameState = 'playing';
}

function setGameMode(mode) {
    gameMode = mode;
    playSound('button');
    init();
    gameState = 'playing';
    updateHUD();
}

function teleportMonster() {
    if (player.teleportItems <= 0) return;
    playSound('button');
    
    // Find a random empty position for the monster
    let attempts = 0;
    let newX, newY;
    
    do {
        newX = Math.floor(Math.random() * (cols - 2)) + 1;
        newY = Math.floor(Math.random() * (rows - 2)) + 1;
        attempts++;
    } while ((maze[newY][newX] || 
              Math.hypot(cellToPx(newX, newY).x - player.x, cellToPx(newX, newY).y - player.y) < 100) && 
             attempts < 50);
    
    if (attempts < 50) {
        const newPos = cellToPx(newX, newY);
        stalker.x = newPos.x;
        stalker.y = newPos.y;
        player.teleportItems--;
        updateHUD();
        
        // Add visual effect
        stalker.teleportEffect = performance.now();
    }
}

function teleportMonsterToPlayer() {
    if (stalker.teleportItems <= 0) return;
    playSound('button');
    
    // Find a position near the player (but not too close)
    let attempts = 0;
    let newX, newY;
    const minDistance = 60; // Minimum distance from player
    const maxDistance = 120; // Maximum distance from player
    
    do {
        // Generate position in a circle around the player
        const angle = Math.random() * Math.PI * 2;
        const distance = minDistance + Math.random() * (maxDistance - minDistance);
        const newPos = cellToPx(
            Math.floor((player.x + Math.cos(angle) * distance) / cellSize),
            Math.floor((player.y + Math.sin(angle) * distance) / cellSize)
        );
        newX = newPos.x;
        newY = newPos.y;
        attempts++;
    } while ((maze[Math.floor(newY / cellSize)][Math.floor(newX / cellSize)] || 
              Math.hypot(newX - player.x, newY - player.y) < minDistance) && 
             attempts < 50);
    
    if (attempts < 50) {
        stalker.x = newX;
        stalker.y = newY;
        stalker.teleportItems--;
        updateHUD();
        
        // Add visual effect
        stalker.teleportToPlayerEffect = performance.now();
    }
}

// Main update function
function update(dt) {
if (gameState !== 'playing') return;
    
    // Handle player invulnerability
    if (player.invulnerable && performance.now() - player.invulnTime > 1000) {
        player.invulnerable = false;
    }
    
    // Player movement
    const mv = {x: 0, y: 0};
    if (keys['w'] || keys['arrowup']) mv.y -= 1;
    if (keys['s'] || keys['arrowdown']) mv.y += 1;
    if (keys['a'] || keys['arrowleft']) mv.x -= 1;
    if (keys['d'] || keys['arrowright']) mv.x += 1;
    
    const mlen = Math.hypot(mv.x, mv.y);
    if (mlen > 0) {
        mv.x /= mlen;
        mv.y /= mlen;
        
        // Store previous position
        const prevX = player.x;
        const prevY = player.y;
        
        // Try X movement first
        const newX = player.x + mv.x * player.speed * dt * 40;
        if (!isWallCollision(newX, player.y, player.r)) {
            player.x = newX;
        }
        
        // Try Y movement
        const newY = player.y + mv.y * player.speed * dt * 40;
        if (!isWallCollision(player.x, newY, player.r)) {
            player.y = newY;
        }
    }
    
    // Ensure player stays within maze bounds
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
    player.y = Math.max(player.r, Math.min(H - player.r, player.y));
    
    // Relic collection
const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const cone = Math.PI * 0.36;
    const range = 180;
    
    for (let r of relics) {
        if (r.found) continue;
        const rp = cellToPx(r.x, r.y);
        const d = Math.hypot(rp.x - player.x, rp.y - player.y);
        const a = Math.atan2(rp.y - player.y, rp.x - player.x);
        let delta = Math.abs(((a - angle) + Math.PI) % (2 * Math.PI) - Math.PI);
        const visible = delta <= cone/2 && d <= range && lineClear(player.x, player.y, rp.x, rp.y);
        
        if (visible && d < 28) {
            r.found = true;
            playSound('relic');
            updateHUD();
        }
    }
    
    // Teleport item collection
    for (let t of teleportItems) {
        if (t.found) continue;
        const tp = cellToPx(t.x, t.y);
        const d = Math.hypot(tp.x - player.x, tp.y - player.y);
        const a = Math.atan2(tp.y - player.y, tp.x - player.x);
        let delta = Math.abs(((a - angle) + Math.PI) % (2 * Math.PI) - Math.PI);
        const visible = delta <= cone/2 && d <= range && lineClear(player.x, player.y, tp.x, tp.y);
        
        if (visible && d < 28) {
            t.found = true;
            player.teleportItems++;
            playSound('teleportItem');
            updateHUD();
        }
    }
    
    // Monster teleport item collection
    for (let mt of monsterTeleportItems) {
        if (mt.found) continue;
        const mtp = cellToPx(mt.x, mt.y);
        const d = Math.hypot(mtp.x - stalker.x, mtp.y - stalker.y);
        
        if (d < 30) { // Monster can collect within 30 units
            mt.found = true;
            stalker.teleportItems++;
            playSound('monsterTeleportItem');
            updateHUD();
        }
    }
    
    // Stalker senses and movement
const moved = mlen > 0.01;
    if (moved) {
        stalker.lastHeard = performance.now();
    }
    
    updateStalker(dt);
    
    // Check win condition
    const foundRelics = relics.filter(r => r.found).length;
    if (foundRelics === relics.length) {
        gameState = 'win';
        playSound('win');
        showWinScreen();
    }
}

function showWinScreen() {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    
    // Draw win screen with pulsing effect
    const pulse = Math.sin(performance.now() * 0.01) * 0.1 + 0.9;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, W, H);
    
    // Pulsing green background
    ctx.fillStyle = `rgba(0, 255, 0, ${0.1 * pulse})`;
    ctx.fillRect(0, 0, W, H);
    
    // Win text with glow effect
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('YOU ESCAPED!', W/2, H/2 - 80);
    
    // Subtitle
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('All relics collected!', W/2, H/2 - 20);
    
    // Instructions
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cccccc';
    ctx.font = '20px Arial';
    ctx.fillText('Press R to play again or click Restart button', W/2, H/2 + 30);
    ctx.fillText('Click Menu to return to main menu', W/2, H/2 + 60);
    
    // Draw a trophy or success symbol
    ctx.fillStyle = '#ffd700';
    ctx.font = '120px Arial';
    ctx.fillText('🏆', W/2, H/2 + 120);
}

// Rendering
function render() {
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    
    // Clear screen
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, W, H);
    
    // Draw maze
    ctx.fillStyle = '#333';
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (maze[y][x]) {
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
    }
    
    // Draw flashlight cone
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const cone = Math.PI * 0.36;
    const range = 180;
    
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.arc(player.x, player.y, range, angle - cone/2, angle + cone/2);
    ctx.closePath();
    
    const gradient = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, range);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 0.3)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 200, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 200, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
    
    // Draw relics
    ctx.fillStyle = '#ffaa00';
    for (let r of relics) {
        if (r.found) continue;
        const rp = cellToPx(r.x, r.y);
        const d = Math.hypot(rp.x - player.x, rp.y - player.y);
        const a = Math.atan2(rp.y - player.y, rp.x - player.x);
        let delta = Math.abs(((a - angle) + Math.PI) % (2 * Math.PI) - Math.PI);
        const visible = delta <= cone/2 && d <= range && lineClear(player.x, player.y, rp.x, rp.y);
        
        if (visible) {
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Glow effect
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    // Draw teleport items
    ctx.fillStyle = '#00ffff';
    for (let t of teleportItems) {
        if (t.found) continue;
        const tp = cellToPx(t.x, t.y);
        const d = Math.hypot(tp.x - player.x, tp.y - player.y);
        const a = Math.atan2(tp.y - player.y, tp.x - player.x);
        let delta = Math.abs(((a - angle) + Math.PI) % (2 * Math.PI) - Math.PI);
        const visible = delta <= cone/2 && d <= range && lineClear(player.x, player.y, tp.x, tp.y);
        
        if (visible) {
            // Draw lightning bolt shape
            ctx.save();
            ctx.translate(tp.x, tp.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-3, -8, 6, 4);
            ctx.fillRect(-8, -4, 4, 6);
            ctx.fillRect(-3, 2, 6, 4);
            ctx.fillRect(2, -2, 4, 6);
            ctx.restore();
            
            // Glow effect
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
    
    // Draw monster teleport items (always visible to monster)
    ctx.fillStyle = '#ff6600';
    for (let mt of monsterTeleportItems) {
        if (mt.found) continue;
        const mtp = cellToPx(mt.x, mt.y);
        
        // Draw fire symbol
        ctx.save();
        ctx.translate(mtp.x, mtp.y);
        ctx.fillStyle = '#ff6600';
        // Draw flame shape
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-4, 4);
        ctx.lineTo(-2, 8);
        ctx.lineTo(2, 8);
        ctx.lineTo(4, 4);
        ctx.closePath();
        ctx.fill();
        
        // Draw inner flame
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-2, 2);
        ctx.lineTo(-1, 6);
        ctx.lineTo(1, 6);
        ctx.lineTo(2, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Glow effect
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(mtp.x, mtp.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // Draw stalker with enhanced visuals
    ctx.save();
    
    // Draw stalker shadow/glow effect
    if (stalker.aware) {
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20 + (stalker.glowIntensity * 30);
    } else {
        ctx.shadowColor = '#666';
        ctx.shadowBlur = 10;
    }
    
    // Main stalker body - RED CIRCLE
    if (stalker.aware) {
        ctx.fillStyle = '#ff0000'; // Bright red when chasing
    } else {
        ctx.fillStyle = '#cc0000'; // Darker red when patrolling
    }
    
    ctx.beginPath();
    ctx.arc(stalker.x, stalker.y, stalker.r, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a border to make it more visible
    ctx.strokeStyle = stalker.aware ? '#ffffff' : '#888888';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw eyes when aware
    if (stalker.aware) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(stalker.x - 4, stalker.y - 4, 3, 0, Math.PI * 2);
        ctx.arc(stalker.x + 4, stalker.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(stalker.x - 4, stalker.y - 4, 1, 0, Math.PI * 2);
        ctx.arc(stalker.x + 4, stalker.y - 4, 1, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw detection radius when investigating (single player only)
    if (gameMode === 'single' && (stalker.state === 'investigate' || stalker.state === 'chase')) {
        ctx.strokeStyle = stalker.aware ? '#ff0000' : '#ffaa00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(stalker.x, stalker.y, 100, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw "P2" indicator for two-player mode
    if (gameMode === 'twoPlayer') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('P2', stalker.x, stalker.y - stalker.r - 15);
    }
    
    // Draw AI indicator for single-player mode
    if (gameMode === 'single') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('AI', stalker.x, stalker.y - stalker.r - 15);
        
        // Show teleport items count
        if (stalker.teleportItems > 0) {
            ctx.fillStyle = '#ff6600';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('🔥'.repeat(stalker.teleportItems), stalker.x, stalker.y + stalker.r + 15);
        }
    }
    
    
    // Draw exclamation mark when just spotted player
    if (stalker.spotPlayerTime && performance.now() - stalker.spotPlayerTime < 1000) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('!', stalker.x, stalker.y - stalker.r - 10);
    }
    
    // Draw teleport effect
    if (stalker.teleportEffect && performance.now() - stalker.teleportEffect < 1000) {
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TELEPORTED!', stalker.x, stalker.y - stalker.r - 30);
        
        // Draw lightning bolts around the monster
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x1 = stalker.x + Math.cos(angle) * (stalker.r + 10);
            const y1 = stalker.y + Math.sin(angle) * (stalker.r + 10);
            const x2 = stalker.x + Math.cos(angle) * (stalker.r + 25);
            const y2 = stalker.y + Math.sin(angle) * (stalker.r + 25);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }
    
    // Draw teleport to player effect
    if (stalker.teleportToPlayerEffect && performance.now() - stalker.teleportToPlayerEffect < 1000) {
        ctx.fillStyle = '#ff6600';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TELEPORTED TO PLAYER!', stalker.x, stalker.y - stalker.r - 30);
        
        // Draw fire effects around the monster
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x1 = stalker.x + Math.cos(angle) * (stalker.r + 10);
            const y1 = stalker.y + Math.sin(angle) * (stalker.r + 10);
            const x2 = stalker.x + Math.cos(angle) * (stalker.r + 25);
            const y2 = stalker.y + Math.sin(angle) * (stalker.r + 25);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }
    
    ctx.restore();
    
    // Draw player - GREEN CIRCLE
    ctx.save();
    
    // Add glow effect to player
    ctx.shadowColor = '#00ff00';
    ctx.shadowBlur = 15;
    
    ctx.fillStyle = player.invulnerable ? '#ffaaaa' : '#00ff00';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    
    // Add border to make it more visible
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add a small dot in the center to show direction
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw "P1" indicator for two-player mode
    if (gameMode === 'twoPlayer') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('P1', player.x, player.y - player.r - 15);
    }
    
    ctx.restore();
}

// Game loop
let lastTime = 0;
function gameLoop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
}

// Event listeners
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    
    // Handle second player keys
    if (key === 'i' || key === 'j' || key === 'k' || key === 'l' || key === 'u') {
        keys2[key] = true;
    }
    
    if (key === 'r' && gameState !== 'playing') {
        restart();
    }
    
    // Game mode switching
    if (key === '1') {
        setGameMode('single');
    } else if (key === '2') {
        setGameMode('twoPlayer');
    }
    
    // Teleport monster (player uses E)
    if (key === 'e') {
        teleportMonster();
    }
    
    // Monster teleport to player (two-player mode, monster uses U)
    if (key === 'u' && gameMode === 'twoPlayer') {
        teleportMonsterToPlayer();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    
    // Handle second player keys
    if (key === 'i' || key === 'j' || key === 'k' || key === 'l' || key === 'u') {
        keys2[key] = false;
    }
});

document.addEventListener('mousemove', (e) => {
    const canvas = document.getElementById('c');
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    statusEl = document.getElementById('status');
    init();
    requestAnimationFrame(gameLoop);
});