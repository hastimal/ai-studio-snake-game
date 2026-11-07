/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, Trophy, Volume2, VolumeX, Sparkles, 
  Gamepad2, Settings, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Shield, Zap, AlertTriangle, Skull, Apple as AppleIcon, Bot, CheckCircle2, RefreshCw
} from 'lucide-react';

// --- Types & Constants ---
type GameState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
type Theme = 'CLASSIC' | 'CYBERPUNK' | 'RETRO';

interface Position {
  x: number;
  y: number;
}

interface CoachFeedback {
  rating: string;
  summary: string;
  tips: string[];
  encouragement: string;
  nextChallenge: string;
}

const BOARD_SIZE = 20;

const BASE_SPEEDS: Record<Difficulty, number> = {
  EASY: 350,
  MEDIUM: 270,
  HARD: 200
};

const THEMES: Record<Theme, {
  name: string;
  bg: string;
  boardBg: string;
  grid: string;
  snakeHead: string;
  snakeBody: string;
  appleColor: string;
  poisonColor: string;
  border: string;
  text: string;
}> = {
  CLASSIC: {
    name: 'Classic Green',
    bg: 'bg-zinc-950',
    boardBg: 'bg-emerald-950/80',
    grid: 'border-emerald-900/30',
    snakeHead: '#22c55e',
    snakeBody: '#15803d',
    appleColor: '#ef4444',
    poisonColor: '#a855f7',
    border: 'border-emerald-800',
    text: 'text-emerald-400'
  },
  CYBERPUNK: {
    name: 'Neon Cyberpunk',
    bg: 'bg-slate-950',
    boardBg: 'bg-slate-900/90',
    grid: 'border-cyan-900/40',
    snakeHead: '#06b6d4',
    snakeBody: '#0e7490',
    appleColor: '#ec4899',
    poisonColor: '#8b5cf6',
    border: 'border-cyan-500/40',
    text: 'text-cyan-400'
  },
  RETRO: {
    name: 'Retro Arcade',
    bg: 'bg-neutral-950',
    boardBg: 'bg-amber-950/40',
    grid: 'border-amber-900/30',
    snakeHead: '#eab308',
    snakeBody: '#ca8a04',
    appleColor: '#dc2626',
    poisonColor: '#9333ea',
    border: 'border-amber-700/60',
    text: 'text-amber-400'
  }
};

// --- Web Audio Synthesizer ---
class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playEat() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playPoison() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(80, now + 0.5);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.5);
  }

  playGameOver() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.4);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.4);
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }
}

const soundManager = new SoundManager();

export default function App() {
  // Game states
  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [snake, setSnake] = useState<Position[]>([
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ]);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [nextDirection, setNextDirection] = useState<Direction>('RIGHT');
  const [apple, setApple] = useState<Position>({ x: 5, y: 5 });
  const [poison, setPoison] = useState<Position | null>(null);
  const [gameOverReason, setGameOverReason] = useState<string>('');

  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('apex_snake_highscore');
      return saved ? parseInt(saved, 10) : 0;
    }
    return 0;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  const [theme, setTheme] = useState<Theme>('CLASSIC');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [applesEaten, setApplesEaten] = useState<number>(0);
  const [gameTime, setGameTime] = useState<number>(0);
  const [wallWrap, setWallWrap] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Gemini AI Coach states
  const [coachData, setCoachData] = useState<CoachFeedback | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  // Timers and refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timeElapsedRef = useRef<NodeJS.Timeout | null>(null);
  const poisonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const level = Math.floor(applesEaten / 5) + 1;
  const currentSpeed = Math.max(80, BASE_SPEEDS[difficulty] - (Math.floor(applesEaten / 5) * 10));

  // Sync sound manager
  useEffect(() => {
    soundManager.enabled = soundEnabled;
  }, [soundEnabled]);

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      if (typeof window !== 'undefined') {
        localStorage.setItem('apex_snake_highscore', score.toString());
      }
    }
  }, [score, highScore]);

  // Generate random empty cell
  const getRandomEmptyCell = useCallback((currentSnake: Position[], currentApple: Position, currentPoison: Position | null): Position => {
    let cell: Position;
    while (true) {
      const x = Math.floor(Math.random() * BOARD_SIZE);
      const y = Math.floor(Math.random() * BOARD_SIZE);
      const onSnake = currentSnake.some(s => s.x === x && s.y === y);
      const onApple = currentApple.x === x && currentApple.y === y;
      const onPoison = currentPoison && currentPoison.x === x && currentPoison.y === y;
      if (!onSnake && !onApple && !onPoison) {
        cell = { x, y };
        break;
      }
    }
    return cell;
  }, []);

  // Spawn poison bottle
  const spawnPoison = useCallback(() => {
    setSnake(currentSnake => {
      setApple(currentApple => {
        const newPoison = getRandomEmptyCell(currentSnake, currentApple, null);
        setPoison(newPoison);
        return currentApple;
      });
      return currentSnake;
    });
  }, [getRandomEmptyCell]);

  // Poison 8-second relocation timer
  useEffect(() => {
    if (gameState === 'PLAYING') {
      poisonTimerRef.current = setInterval(() => {
        spawnPoison();
      }, 8000);
    } else {
      if (poisonTimerRef.current) clearInterval(poisonTimerRef.current);
    }
    return () => {
      if (poisonTimerRef.current) clearInterval(poisonTimerRef.current);
    };
  }, [gameState, spawnPoison]);

  // Start / Reset Game
  const startGame = () => {
    soundManager.playClick();
    if (poisonTimerRef.current) clearInterval(poisonTimerRef.current);

    const initialSnake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    setSnake(initialSnake);
    setDirection('RIGHT');
    setNextDirection('RIGHT');

    const firstApple = getRandomEmptyCell(initialSnake, { x: 0, y: 0 }, null);
    setApple(firstApple);

    const firstPoison = getRandomEmptyCell(initialSnake, firstApple, null);
    setPoison(firstPoison);

    setScore(0);
    setApplesEaten(0);
    setGameTime(0);
    setGameOverReason('');
    setCoachData(null);
    setCoachError(null);
    setIsAnalyzing(false);
    setGameState('PLAYING');
  };

  const pauseGame = () => {
    soundManager.playClick();
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
    } else if (gameState === 'PAUSED') {
      setGameState('PLAYING');
    }
  };

  const quitToMenu = () => {
    soundManager.playClick();
    if (poisonTimerRef.current) clearInterval(poisonTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState('TITLE');
  };

  // Game timer tracking
  useEffect(() => {
    if (gameState === 'PLAYING') {
      timeElapsedRef.current = setInterval(() => {
        setGameTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timeElapsedRef.current) clearInterval(timeElapsedRef.current);
    }
    return () => {
      if (timeElapsedRef.current) clearInterval(timeElapsedRef.current);
    };
  }, [gameState]);

  // Main Game Loop
  const gameStep = useCallback(() => {
    setSnake(prevSnake => {
      const head = { ...prevSnake[0] };
      const currentDir = nextDirection;
      setDirection(currentDir);

      switch (currentDir) {
        case 'UP': head.y -= 1; break;
        case 'DOWN': head.y += 1; break;
        case 'LEFT': head.x -= 1; break;
        case 'RIGHT': head.x += 1; break;
      }

      // Wall collision or wrap check
      if (head.x < 0 || head.x >= BOARD_SIZE || head.y < 0 || head.y >= BOARD_SIZE) {
        if (wallWrap) {
          if (head.x < 0) head.x = BOARD_SIZE - 1;
          if (head.x >= BOARD_SIZE) head.x = 0;
          if (head.y < 0) head.y = BOARD_SIZE - 1;
          if (head.y >= BOARD_SIZE) head.y = 0;
        } else {
          soundManager.playGameOver();
          setGameOverReason('WALL COLLISION');
          setGameState('GAME_OVER');
          return prevSnake;
        }
      }

      // Self collision check
      const hitSelf = prevSnake.slice(0, -1).some(segment => segment.x === head.x && segment.y === head.y);
      if (hitSelf) {
        soundManager.playGameOver();
        setGameOverReason('SELF-COLLISION');
        setGameState('GAME_OVER');
        return prevSnake;
      }

      // Poison collision check
      if (poison && head.x === poison.x && head.y === poison.y) {
        soundManager.playPoison();
        setGameOverReason('ATE POISON');
        setGameState('GAME_OVER');
        return prevSnake;
      }

      const newSnake = [head, ...prevSnake];

      // Apple collision check
      if (head.x === apple.x && head.y === apple.y) {
        soundManager.playEat();
        setScore(s => s + 10);
        setApplesEaten(a => a + 1);
        setApple(getRandomEmptyCell(newSnake, { x: -1, y: -1 }, poison));
      } else {
        newSnake.pop();
      }

      return newSnake;
    });
  }, [nextDirection, apple, poison, getRandomEmptyCell, wallWrap]);

  // Interval execution for snake movement
  useEffect(() => {
    if (gameState === 'PLAYING') {
      timerRef.current = setInterval(gameStep, currentSpeed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentSpeed, gameStep]);

  // Keyboard controls with 180-degree turn prevention
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        if (gameState === 'PLAYING' || gameState === 'PAUSED') {
          e.preventDefault();
        }
      }

      if (e.code === 'Space') {
        if (gameState === 'PLAYING' || gameState === 'PAUSED') {
          pauseGame();
        } else if (gameState === 'TITLE' || gameState === 'GAME_OVER') {
          if (gameState === 'GAME_OVER' && coachData) return; // Don't restart if reading coach
          startGame();
        }
        return;
      }

      if (gameState !== 'PLAYING') return;

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          if (direction !== 'DOWN') setNextDirection('UP');
          break;
        case 'ArrowDown':
        case 'KeyS':
          if (direction !== 'UP') setNextDirection('DOWN');
          break;
        case 'ArrowLeft':
        case 'KeyA':
          if (direction !== 'RIGHT') setNextDirection('LEFT');
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (direction !== 'LEFT') setNextDirection('RIGHT');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [direction, gameState, coachData]);

  // Touch directional buttons
  const handleDirectionClick = (newDir: Direction) => {
    if (gameState !== 'PLAYING') return;
    if (
      (newDir === 'UP' && direction !== 'DOWN') ||
      (newDir === 'DOWN' && direction !== 'UP') ||
      (newDir === 'LEFT' && direction !== 'RIGHT') ||
      (newDir === 'RIGHT' && direction !== 'LEFT')
    ) {
      setNextDirection(newDir);
    }
  };

  // Swipe gestures support on board
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || gameState !== 'PLAYING') return;
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const dx = touchEnd.x - touchStartRef.current.x;
    const dy = touchEnd.y - touchStartRef.current.y;
    const minSwipeDist = 25;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > minSwipeDist) {
        if (dx > 0 && direction !== 'LEFT') setNextDirection('RIGHT');
        else if (dx < 0 && direction !== 'RIGHT') setNextDirection('LEFT');
      }
    } else {
      if (Math.abs(dy) > minSwipeDist) {
        if (dy > 0 && direction !== 'UP') setNextDirection('DOWN');
        else if (dy < 0 && direction !== 'DOWN') setNextDirection('UP');
      }
    }
    touchStartRef.current = null;
  };

  // Analyze My Game with Gemini AI Coach
  const analyzeGame = async () => {
    soundManager.playClick();
    setIsAnalyzing(true);
    setCoachError(null);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score,
          applesEaten,
          difficulty,
          level,
          gameTime,
          gameOverReason,
          theme
        })
      });

      if (!res.ok) {
        throw new Error('Server returned an error analysis.');
      }

      const data = await res.json();
      setCoachData(data);
    } catch (err: any) {
      console.warn('AI Coach network/API fallback engaged:', err);
      // Fallback intelligent coaching response
      setCoachData({
        rating: score > 50 ? 'Great' : 'Good',
        summary: `You scored ${score} points and ate ${applesEaten} apples in ${gameTime}s on ${difficulty} difficulty!`,
        tips: [
          'Watch out for poison bottles that relocate every 8 seconds.',
          'Keep your snake moving along the perimeter when it gets very long.'
        ],
        encouragement: 'Slithering legend in the making! Keep up the great focus.',
        nextChallenge: `Try to collect ${applesEaten + 5} apples without hitting obstacles.`
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const currentTheme = THEMES[theme] || THEMES.CLASSIC;

  const getHeadRotation = (dir: Direction) => {
    switch (dir) {
      case 'UP': return -90;
      case 'DOWN': return 90;
      case 'LEFT': return 180;
      case 'RIGHT': return 0;
    }
  };

  return (
    <div className={`min-h-screen ${currentTheme.bg} text-white flex flex-col items-center justify-between font-sans select-none transition-colors duration-500 overflow-x-hidden`}>
      
      {/* Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Apex Snake Arcade</h1>
            <p className="text-xs text-zinc-400">Classic Arcade Edition + AI Coach</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-zinc-300 hover:text-white"
            title={soundEnabled ? "Mute Sound" : "Enable Sound"}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-red-400" />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-zinc-300 hover:text-white"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center p-4 md:p-6 gap-3">

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5 text-emerald-400" /> Game Settings & Themes
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="text-zinc-400 hover:text-white text-sm px-2 py-1 rounded bg-zinc-800"
                >
                  ✕
                </button>
              </div>

              {/* Theme selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Visual Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(THEMES) as Theme[]).map((tKey) => (
                    <button
                      key={tKey}
                      onClick={() => setTheme(tKey)}
                      className={`p-3 rounded-xl border text-center text-xs font-medium transition-all ${
                        theme === tKey 
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300 shadow-md' 
                          : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {THEMES[tKey].name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Difficulty Speed</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => setDifficulty(diff)}
                      className={`py-2 px-1 rounded-lg border text-xs font-semibold uppercase transition-all ${
                        difficulty === diff 
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' 
                          : 'border-zinc-800 bg-zinc-800/50 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wall wrap mode */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <div>
                  <div className="text-sm font-medium">Wall Wrapping Mode</div>
                  <div className="text-xs text-zinc-400">Pass through walls</div>
                </div>
                <button
                  onClick={() => setWallWrap(!wallWrap)}
                  className={`w-12 h-6 rounded-full transition-colors relative p-1 ${wallWrap ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${wallWrap ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-zinc-950 transition-colors shadow-lg shadow-emerald-500/20"
              >
                Save & Continue
              </button>
            </div>
          </div>
        )}

        {/* Title Menu */}
        {gameState === 'TITLE' && (
          <div className="flex flex-col items-center justify-center text-center p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md max-w-lg w-full space-y-5 shadow-2xl">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 animate-pulse">
              <Sparkles className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold tracking-tight">Apex Snake Arcade</h2>
              <p className="text-sm text-zinc-400 max-w-sm mx-auto">
                Play classic snake with apples, poison hazards, and get post-game coaching from Gemini AI!
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-4 text-xs text-zinc-400 py-2 border-y border-zinc-800 w-full">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Best Score: <strong className="text-white font-mono">{highScore}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Speed: <strong className="text-white uppercase">{difficulty}</strong></span>
              </div>
            </div>

            <div className="flex items-center justify-between bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 w-full">
              <div className="text-left">
                <div className="text-xs font-medium text-zinc-200">Wall Wrapping</div>
                <div className="text-[11px] text-zinc-400">{wallWrap ? 'Enabled (Pass through walls)' : 'Disabled (Hit wall = Game Over)'}</div>
              </div>
              <button
                onClick={() => setWallWrap(!wallWrap)}
                className={`w-11 h-6 rounded-full transition-colors relative p-1 ${wallWrap ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${wallWrap ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 text-xs text-zinc-300 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 w-full">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                <span>Apple = +10 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-purple-500 inline-block shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                <span>Poison = Game Over</span>
              </div>
            </div>

            <button
              onClick={startGame}
              className="w-full py-4 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-lg shadow-xl shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" /> Start Game
            </button>
          </div>
        )}

        {/* Active Playing / Paused / Game Over HUD & Board */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'GAME_OVER') && (
          <div className="flex flex-col items-center w-full max-w-lg gap-3">
            
            {/* Top Score Bar */}
            <div className="w-full grid grid-cols-4 gap-2 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 backdrop-blur-sm shadow-lg text-center">
              <div>
                <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Score</div>
                <div className="text-xl font-black font-mono text-white">{score}</div>
              </div>
              <div className="border-l border-zinc-800">
                <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Apples</div>
                <div className="text-lg font-bold font-mono text-emerald-400">{applesEaten}</div>
              </div>
              <div className="border-l border-zinc-800">
                <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Level</div>
                <div className="text-lg font-bold font-mono text-cyan-400">{level}</div>
              </div>
              <div className="border-l border-zinc-800 flex items-center justify-around">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-wider">Time</div>
                  <div className="text-sm font-bold font-mono text-zinc-300">{Math.floor(gameTime / 60)}:{String(gameTime % 60).padStart(2, '0')}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={pauseGame}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    title={gameState === 'PAUSED' ? "Resume" : "Pause"}
                  >
                    {gameState === 'PAUSED' ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={quitToMenu}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    title="Quit"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Game Board */}
            <div 
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className={`relative w-full aspect-square max-w-[440px] ${currentTheme.boardBg} ${currentTheme.border} border-2 rounded-2xl shadow-2xl overflow-hidden game-grid flex items-center justify-center`}
            >
              
              <div 
                className="w-full h-full grid"
                style={{
                  gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`
                }}
              >
                {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, index) => {
                  const x = index % BOARD_SIZE;
                  const y = Math.floor(index / BOARD_SIZE);

                  const headIndex = snake.findIndex(seg => seg.x === x && seg.y === y);
                  const isHead = headIndex === 0;
                  const isBody = headIndex > 0;
                  const isTail = headIndex === snake.length - 1 && snake.length > 1;
                  const isApple = apple.x === x && apple.y === y;
                  const isPoison = poison && poison.x === x && poison.y === y;

                  return (
                    <div
                      key={index}
                      className={`w-full h-full border ${currentTheme.grid} flex items-center justify-center relative`}
                    >
                      {isHead && (
                        <div 
                          className="w-full h-full flex items-center justify-center transition-transform duration-75"
                          style={{ transform: `rotate(${getHeadRotation(direction)}deg)` }}
                        >
                          <svg viewBox="0 0 100 100" className="w-[98%] h-[98%] drop-shadow-lg">
                            <ellipse cx="50" cy="50" rx="46" ry="42" fill={currentTheme.snakeHead} />
                            <circle cx="68" cy="28" r="12" fill="#ffffff" />
                            <circle cx="72" cy="28" r="5" fill="#09090b" />
                            <circle cx="68" cy="72" r="12" fill="#ffffff" />
                            <circle cx="72" cy="72" r="5" fill="#09090b" />
                            <circle cx="86" cy="42" r="3.5" fill="#18181b" opacity="0.6" />
                            <circle cx="86" cy="58" r="3.5" fill="#18181b" opacity="0.6" />
                            <path d="M 90 50 L 105 50 M 105 50 L 112 40 M 105 50 L 112 60" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}

                      {isBody && !isTail && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg viewBox="0 0 100 100" className="w-[96%] h-[96%]">
                            <rect x="6" y="6" width="88" height="88" rx="28" fill={currentTheme.snakeBody} />
                            <circle cx="50" cy="50" r="20" fill={currentTheme.snakeHead} opacity="0.3" />
                          </svg>
                        </div>
                      )}

                      {isTail && (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]">
                            <ellipse cx="50" cy="50" rx="40" ry="32" fill={currentTheme.snakeBody} />
                          </svg>
                        </div>
                      )}

                      {isApple && (
                        <div className="w-full h-full flex items-center justify-center animate-bounce">
                          <svg viewBox="0 0 100 100" className="w-[95%] h-[95%] drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]">
                            <circle cx="50" cy="56" r="38" fill={currentTheme.appleColor} />
                            <ellipse cx="36" cy="40" rx="10" ry="14" fill="#ffffff" opacity="0.45" transform="rotate(-20 36 40)" />
                            <path d="M 50 20 Q 52 8 62 6" stroke="#78350f" strokeWidth="6" strokeLinecap="round" fill="none" />
                            <path d="M 54 14 Q 72 10 68 28 Q 58 26 54 14" fill="#22c55e" />
                          </svg>
                        </div>
                      )}

                      {isPoison && (
                        <div className="w-full h-full flex items-center justify-center animate-pulse">
                          <svg viewBox="0 0 100 100" className="w-[98%] h-[98%] drop-shadow-[0_0_15px_rgba(168,85,247,0.95)]">
                            <rect x="40" y="10" width="20" height="14" rx="4" fill="#71717a" />
                            <rect x="44" y="24" width="12" height="12" fill={currentTheme.poisonColor} />
                            <path d="M 28 36 Q 16 48 22 74 Q 28 88 72 88 Q 78 78 72 50 Q 68 36 72 36 Z" fill={currentTheme.poisonColor} opacity="0.95" />
                            <path d="M 34 52 Q 28 70 40 80" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.6" />
                            <circle cx="50" cy="58" r="13" fill="#ffffff" />
                            <circle cx="45" cy="56" r="3" fill="#09090b" />
                            <circle cx="55" cy="56" r="3" fill="#09090b" />
                            <polygon points="50,61 47,67 53,67" fill="#09090b" />
                            <rect x="47" y="68" width="6" height="4" fill="#ffffff" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Paused Overlay */}
              {gameState === 'PAUSED' && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center gap-4">
                  <div className="text-2xl font-bold tracking-tight">Game Paused</div>
                  <button
                    onClick={pauseGame}
                    className="py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
                  >
                    <Play className="w-5 h-5 fill-current" /> Resume Game
                  </button>
                </div>
              )}

              {/* Game Over & Gemini AI Coach Overlay */}
              {gameState === 'GAME_OVER' && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-lg flex flex-col items-center justify-start p-4 overflow-y-auto space-y-4 animate-in fade-in zoom-in duration-200">
                  <div className="flex items-center gap-2 pt-2">
                    <Skull className="w-6 h-6 text-red-400 animate-bounce" />
                    <h3 className="text-lg font-extrabold text-red-400">GAME OVER — {gameOverReason}</h3>
                  </div>

                  {/* Basic Stats Card */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 w-full max-w-sm grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase text-zinc-400">Score</div>
                      <div className="text-base font-bold font-mono text-white">{score}</div>
                    </div>
                    <div className="border-x border-zinc-800">
                      <div className="text-[10px] uppercase text-zinc-400">Apples</div>
                      <div className="text-base font-bold font-mono text-emerald-400">{applesEaten}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-zinc-400">Time</div>
                      <div className="text-base font-bold font-mono text-cyan-400">{gameTime}s</div>
                    </div>
                  </div>

                  {/* Gemini AI Game Coach Section */}
                  {!coachData && !isAnalyzing && (
                    <div className="w-full max-w-sm bg-gradient-to-br from-indigo-950/80 to-purple-950/80 border border-indigo-500/40 rounded-2xl p-4 text-center space-y-3 shadow-xl">
                      <div className="flex items-center justify-center gap-2 text-indigo-300 font-semibold text-sm">
                        <Bot className="w-5 h-5" /> Gemini AI Game Coach
                      </div>
                      <p className="text-xs text-indigo-200/80">
                        Get personalized feedback, tailored tips, and a custom challenge based on your match statistics.
                      </p>
                      <button
                        onClick={analyzeGame}
                        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" /> Analyze My Game
                      </button>
                      {coachError && <p className="text-xs text-red-400">{coachError}</p>}
                    </div>
                  )}

                  {isAnalyzing && (
                    <div className="w-full max-w-sm bg-indigo-950/50 border border-indigo-500/30 rounded-2xl p-6 flex flex-col items-center justify-center space-y-3">
                      <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                      <p className="text-xs text-indigo-200">Gemini AI Coach is analyzing your gameplay...</p>
                    </div>
                  )}

                  {coachData && (
                    <div className="w-full max-w-sm bg-indigo-950/90 border border-indigo-500/50 rounded-2xl p-4 text-left space-y-3 shadow-2xl text-xs">
                      <div className="flex items-center justify-between border-b border-indigo-800/60 pb-2">
                        <div className="flex items-center gap-1.5 text-indigo-300 font-bold">
                          <Bot className="w-4 h-4" /> Gemini AI Coach Report
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 font-semibold">
                          {coachData.rating}
                        </span>
                      </div>

                      <p className="text-indigo-100 font-medium">{coachData.summary}</p>

                      <div className="space-y-1">
                        <div className="font-semibold text-indigo-300">💡 Coach Tips:</div>
                        <ul className="list-disc list-inside space-y-0.5 text-indigo-200/90">
                          {coachData.tips.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-indigo-900/50 p-2.5 rounded-xl border border-indigo-700/40 text-indigo-200">
                        <span className="font-semibold text-amber-300">🎉 Encouragement:</span> {coachData.encouragement}
                      </div>

                      <div className="bg-purple-950/60 p-2.5 rounded-xl border border-purple-700/40 text-purple-200">
                        <span className="font-semibold text-cyan-300">🎯 Next Challenge:</span> {coachData.nextChallenge}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 w-full max-w-sm pt-2">
                    <button
                      onClick={startGame}
                      className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" /> Play Again
                    </button>
                    <button
                      onClick={quitToMenu}
                      className="py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold transition-colors text-xs"
                    >
                      Menu
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Legend */}
            <div className="w-full flex items-center justify-around bg-zinc-900/60 border border-zinc-800 rounded-xl py-2 px-4 text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                <span>Apple = +10 pts</span>
              </div>
              <div className="w-px h-3 bg-zinc-800" />
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                <span>Poison = Game Over</span>
              </div>
            </div>

            {/* Mobile Touch D-Pad */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
              <div />
              <button
                onClick={() => handleDirectionClick('UP')}
                className="aspect-square rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 flex items-center justify-center text-zinc-200 transition-colors shadow-md"
                aria-label="Move Up"
              >
                <ArrowUp className="w-6 h-6" />
              </button>
              <div />

              <button
                onClick={() => handleDirectionClick('LEFT')}
                className="aspect-square rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 flex items-center justify-center text-zinc-200 transition-colors shadow-md"
                aria-label="Move Left"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => handleDirectionClick('DOWN')}
                className="aspect-square rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 flex items-center justify-center text-zinc-200 transition-colors shadow-md"
                aria-label="Move Down"
              >
                <ArrowDown className="w-6 h-6" />
              </button>
              <button
                onClick={() => handleDirectionClick('RIGHT')}
                className="aspect-square rounded-2xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 active:bg-zinc-700 flex items-center justify-center text-zinc-200 transition-colors shadow-md"
                aria-label="Move Right"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto py-3 text-center text-xs text-zinc-500 border-t border-white/5">
        <p>Apex Snake Arcade · Powered by React, TypeScript & Gemini AI</p>
      </footer>

    </div>
  );
}
