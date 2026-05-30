import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Store } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css';

const STORE_FILE = 'credentials.json';

interface SavedCredentials {
  username: string;
  password: string;
  remember: boolean;
  gamePath: string;
}

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'settings'>('login');
  const [gamePath, setGamePath] = useState('');
  const [pathStatus, setPathStatus] = useState<'found' | 'notfound' | ''>('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAll();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (gameRunning) {
      pollRef.current = setInterval(async () => {
        try {
          const running = await invoke<boolean>('check_game_running');
          if (!running) {
            setGameRunning(false);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          setGameRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [gameRunning]);

  const loadAll = async () => {
    try {
      const store = await Store.load(STORE_FILE);
      const saved = await store.get<SavedCredentials>('credentials');
      if (saved) {
        setUsername(saved.username || '');
        setPassword(saved.password || '');
        setRemember(saved.remember ?? true);
        setGamePath(saved.gamePath || '');
      }
    } catch { /* first run */ }
    setStoreLoaded(true);
  };

  const saveAll = async (updates: Partial<SavedCredentials>) => {
    try {
      const store = await Store.load(STORE_FILE);
      const existing = await store.get<SavedCredentials>('credentials');
      const merged = { ...existing, ...updates };
      await store.set('credentials', merged);
      await store.save();
    } catch { /* silent */ }
  };

  const saveCredentials = async () => {
    const data: Partial<SavedCredentials> = remember
      ? { username, password, remember }
      : { username: '', password: '', remember: false };
    await saveAll(data);
  };

  const handleSubmit = useCallback(async () => {
    setStatus(null);
    if (!username.trim() || !password.trim()) {
      setStatus({ type: 'error', msg: 'Preencha usuario e senha.' });
      return;
    }
    setLoading(true);
    try {
      await saveCredentials();
      const result = await invoke<string>('launch_game', {
        username: username.trim(),
        password,
        customPath: gamePath || null,
      });
      setLoading(false);
      setGameRunning(true);
      setStatus({ type: 'success', msg: result });
    } catch (err) {
      setLoading(false);
      setStatus({ type: 'error', msg: String(err) });
    }
  }, [username, password, remember, gamePath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !gameRunning && !loading) handleSubmit();
  };

  const pickGamePath = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Executavel', extensions: ['exe'] }],
    });
    if (selected) {
      const path = typeof selected === 'string' ? selected : selected;
      setGamePath(path as string);
      await saveAll({ gamePath: path as string });
      setPathStatus('');
    }
  };

  useEffect(() => {
    if (gamePath && activeTab === 'settings') {
      invoke<string>('launch_game', {
        username: '__check__',
        password: '__check__',
        customPath: gamePath,
      }).then(() => {
        // won't actually launch, just checking path
      }).catch((err) => {
        if (String(err).includes('Usuario')) {
          setPathStatus('found');
        } else if (String(err).includes('nao encontrado')) {
          setPathStatus('notfound');
        }
      });
    }
  }, [gamePath, activeTab]);

  if (!storeLoaded) {
    return (
      <div className="app">
        <div className="login-panel" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Title Bar - draggable */}
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar__label" data-tauri-drag-region>WarChaos Direct</span>
        <div className="titlebar__actions">
          <button
            className="titlebar__btn"
            onClick={() => getCurrentWindow().minimize()}
            title="Minimizar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={async () => { await getCurrentWindow().close(); }}
            title="Fechar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="panels">
        {/* Left Panel - Branding */}
        <div className="brand-panel">
          <div className="brand-panel__top">
            <div className="brand-panel__logo">
              <img src="/logo.svg" alt="WarChaos" />
            </div>
            <div className="brand-panel__title">WAR<br/>CHAOS</div>
            <div className="brand-panel__subtitle">Direct</div>
            <div className="brand-panel__divider" />

            {/* Tab navigation */}
            <nav className="brand-panel__nav">
              <button
                className={`brand-panel__nav-btn ${activeTab === 'login' ? 'brand-panel__nav-btn--active' : ''}`}
                onClick={() => setActiveTab('login')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Jogar
              </button>
              <button
                className={`brand-panel__nav-btn ${activeTab === 'settings' ? 'brand-panel__nav-btn--active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Config
              </button>
            </nav>
          </div>

          <span className="brand-panel__version">v1.0.0</span>
        </div>

        {/* Right Panel */}
        <div className="login-panel">
          {activeTab === 'login' ? (
            <div className="login-card">
              <h1 className="login-card__heading">Entrar</h1>
              <p className="login-card__description">
                Digite suas credenciais para iniciar o jogo.
              </p>

              <div className="form-group">
                <label className="form-group__label">Usuario</label>
                <div className="form-group__input-wrapper">
                  <input
                    className="form-group__input"
                    type="text"
                    placeholder="Seu usuario..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    spellCheck={false}
                    disabled={gameRunning}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-group__label">Senha</label>
                <div className="form-group__input-wrapper">
                  <input
                    className="form-group__input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Sua senha..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    disabled={gameRunning}
                  />
                  <button
                    className="form-group__input-icon"
                    onClick={() => setShowPass(!showPass)}
                    tabIndex={-1}
                    title={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="remember-row">
                <input
                  type="checkbox"
                  className="remember-row__checkbox"
                  id="remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <label className="remember-row__label" htmlFor="remember">
                  Lembrar credenciais
                </label>
              </div>

              <button
                className={`submit-btn ${loading ? 'submit-btn--loading' : ''} ${gameRunning ? 'submit-btn--playing' : ''}`}
                onClick={handleSubmit}
                disabled={loading || gameRunning}
              >
                {loading ? (
                  <span className="submit-btn__spinner">
                    <span className="spinner" />
                  </span>
                ) : gameRunning ? (
                  'JOGANDO...'
                ) : (
                  'JOGAR'
                )}
              </button>

              {status && (
                <div className={`status ${status.type === 'error' ? 'status--error' : 'status--success'}`}>
                  {status.msg}
                </div>
              )}
            </div>
          ) : (
            <div className="login-card">
              <h1 className="login-card__heading">Configuracoes</h1>
              <p className="login-card__description">
                Escolha o caminho do Game.exe manualmente.
              </p>

              <div className="form-group">
                <label className="form-group__label">Caminho do Game.exe</label>
                <div className="settings-path-row">
                  <input
                    className="form-group__input settings-path-input"
                    type="text"
                    placeholder="C:\Program Files\WarChaos\Bin64Release\Game.exe"
                    value={gamePath}
                    onChange={(e) => {
                      setGamePath(e.target.value);
                      saveAll({ gamePath: e.target.value });
                    }}
                    spellCheck={false}
                  />
                  <button className="settings-browse-btn" onClick={pickGamePath}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </div>
                {pathStatus === 'found' && (
                  <span className="settings-path-status settings-path-status--ok">Arquivo encontrado</span>
                )}
                {pathStatus === 'notfound' && (
                  <span className="settings-path-status settings-path-status--err">Arquivo nao encontrado</span>
                )}
                {!pathStatus && gamePath && (
                  <span className="settings-path-status">Salvo</span>
                )}
              </div>

              <p className="settings-hint">
                Se nao definir um caminho, o launcher procurara automaticamente em:<br />
                • Pasta do launcher<br />
                • C:\Program Files\WarChaos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
