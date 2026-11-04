import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  AfterViewInit,
  OnDestroy,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="terminal-window" [class.fullscreen]="isFullscreen()">
      <!-- Terminal Header / Titlebar -->
      <div class="terminal-titlebar">
        <div class="window-controls">
          <span class="control-dot dot-red"></span>
          <span class="control-dot dot-yellow"></span>
          <span class="control-dot dot-green"></span>
        </div>

        <div class="titlebar-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <span class="code-font">build&#64;vps: ~/project</span>
        </div>

        <!-- Toolbar Action Buttons -->
        <div class="terminal-toolbar">
          <button
            type="button"
            class="tool-btn"
            (click)="copyLogs()"
            [title]="copied() ? 'Copied to clipboard!' : 'Copy full log'"
          >
            @if (copied()) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span class="tool-label">Copied</span>
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="tool-label">Copy</span>
            }
          </button>

          <button
            type="button"
            class="tool-btn"
            (click)="clearTerminal()"
            title="Clear terminal display"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span class="tool-label">Clear</span>
          </button>

          <button
            type="button"
            class="tool-btn"
            (click)="downloadLogs()"
            title="Download log (.txt)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="tool-label">Download</span>
          </button>

          <button
            type="button"
            class="tool-btn"
            (click)="toggleFullscreen()"
            [title]="isFullscreen() ? 'Exit fullscreen' : 'Fullscreen toggle'"
          >
            @if (isFullscreen()) {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            } @else {
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            }
          </button>
        </div>
      </div>

      <!-- Terminal Body -->
      <div class="terminal-body-wrapper">
        <div #terminalContainer class="xterm-container"></div>

        <!-- Floating Jump to bottom button -->
        @if (isScrolledUp()) {
          <button
            type="button"
            class="jump-bottom-btn"
            (click)="scrollToBottom()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
            <span>Jump to bottom</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .terminal-window {
      background: var(--bg-terminal);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      display: flex;
      flex-direction: column;
      height: 380px;
      resize: vertical;
      overflow: hidden;
      position: relative;
      transition: height 0.15s ease;
      min-height: 260px;
    }

    .terminal-window.fullscreen {
      position: fixed;
      inset: 12px;
      height: calc(100vh - 24px) !important;
      z-index: 1000;
      resize: none;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.85);
    }

    .terminal-titlebar {
      height: 38px;
      background: #0d1322;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      user-select: none;
    }

    .window-controls {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .control-dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
    }

    .dot-red { background: #ef4444; opacity: 0.85; }
    .dot-yellow { background: #f59e0b; opacity: 0.85; }
    .dot-green { background: #10b981; opacity: 0.85; }

    .titlebar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 500;
    }

    .terminal-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tool-btn {
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 0.76rem;
      border: 1px solid transparent;
      gap: 4px;
    }

    .tool-btn:hover {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      border-color: var(--border-subtle);
    }

    .terminal-body-wrapper {
      flex: 1;
      position: relative;
      background: #050811;
      padding: 10px 12px;
      overflow: hidden;
    }

    .xterm-container {
      width: 100%;
      height: 100%;
    }

    .jump-bottom-btn {
      position: absolute;
      bottom: 16px;
      right: 20px;
      background: var(--accent-primary);
      color: #031422;
      font-weight: 600;
      font-size: 0.78rem;
      padding: 6px 12px;
      border-radius: var(--radius-pill);
      box-shadow: var(--shadow-md);
      z-index: 10;
      animation: fadeIn 0.2s ease-out;
    }

    .jump-bottom-btn:hover {
      background: var(--accent-primary-hover);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 600px) {
      .tool-label {
        display: none;
      }
      .titlebar-title span {
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `]
})
export class TerminalComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);

  @ViewChild('terminalContainer') containerRef!: ElementRef<HTMLDivElement>;

  private terminal!: Terminal;
  private fitAddon!: FitAddon;
  private eventSource: EventSource | null = null;
  private resizeObserver: ResizeObserver | null = null;

  isFullscreen = signal(false);
  isScrolledUp = signal(false);
  copied = signal(false);
  rawLogLines: string[] = [];

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initTerminal();
    this.connectSSE();
  }

  ngOnDestroy(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.terminal) {
      this.terminal.dispose();
    }
  }

  private initTerminal(): void {
    this.terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: '#050811',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#38bdf8',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#64748b',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.open(this.containerRef.nativeElement);

    setTimeout(() => {
      this.fitAddon.fit();
    }, 100);

    // Watch resize
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon.fit();
    });
    this.resizeObserver.observe(this.containerRef.nativeElement);

    // Scroll tracking
    this.terminal.onScroll(() => {
      const buffer = this.terminal.buffer.active;
      const isBottom = buffer.viewportY >= buffer.baseY;
      this.isScrolledUp.set(!isBottom);
    });
  }

  private connectSSE(): void {
    const sseUrl = this.api.getLogStreamUrl();
    this.eventSource = new EventSource(sseUrl);

    // Handle initial buffered log history
    this.eventSource.addEventListener('init', (e: MessageEvent) => {
      try {
        const history: string[] = JSON.parse(e.data);
        if (Array.isArray(history)) {
          this.rawLogLines = [...history];
          for (const line of history) {
            this.terminal.writeln(line);
          }
          if (!this.isScrolledUp()) {
            this.terminal.scrollToBottom();
          }
        }
      } catch (err) {
        console.error('Error parsing init logs', err);
      }
    });

    // Handle live log events
    this.eventSource.addEventListener('log', (e: MessageEvent) => {
      try {
        const line: string = JSON.parse(e.data);
        this.rawLogLines.push(line);
        this.terminal.writeln(line);

        if (!this.isScrolledUp()) {
          this.terminal.scrollToBottom();
        }
      } catch (err) {
        console.error('Error parsing log event', err);
      }
    });

    this.eventSource.onerror = (err) => {
      // Reconnect after brief pause
      console.warn('SSE log connection interrupted, auto-reconnecting...', err);
    };
  }

  scrollToBottom(): void {
    this.terminal.scrollToBottom();
    this.isScrolledUp.set(false);
  }

  clearTerminal(): void {
    this.terminal.clear();
    this.isScrolledUp.set(false);
  }

  toggleFullscreen(): void {
    this.isFullscreen.update(v => !v);
    setTimeout(() => {
      this.fitAddon.fit();
    }, 200);
  }

  copyLogs(): void {
    const text = this.rawLogLines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  downloadLogs(): void {
    const text = this.rawLogLines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

