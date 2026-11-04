import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { BuildStatus } from '../../models/types';
import { TerminalComponent } from '../terminal/terminal.component';

@Component({
  selector: 'app-build',
  standalone: true,
  imports: [CommonModule, TerminalComponent],
  template: `
    <div class="build-page-container">
      <div class="build-header">
        <div class="header-left">
          <button class="btn-back" (click)="goHome()" title="Back to Build Setup">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Setup</span>
          </button>

          <div class="build-meta">
            <h1>Android Build Pipeline</h1>
            @if (api.currentBuild(); as b) {
              <div class="repo-subtitle code-font">
                <span>{{ b.repo_url }}</span>
                @if (b.branch) {
                  <span class="branch-tag">&#64;{{ b.branch }}</span>
                }
              </div>
            }
          </div>
        </div>

        <!-- Status Chip & Elapsed Time -->
        <div class="header-right">
          @if (api.currentBuild(); as b) {
            <div class="status-chip" [ngClass]="'status-' + b.status">
              @if (b.status === 'cloning' || b.status === 'building' || b.status === 'signing') {
                <span class="status-dot pulse-anim"></span>
              } @else if (b.status === 'done') {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              } @else if (b.status === 'failed') {
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              }
              <span class="status-name">{{ getStatusLabel(b.status) }}</span>
            </div>

            <div class="timer-chip code-font">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span>{{ formattedElapsed() }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Detail Pills -->
      @if (api.currentBuild(); as b) {
        <div class="meta-pills">
          <div class="pill">
            <span class="pill-label">Type:</span>
            <span class="pill-val capitalize">{{ b.build_type }}</span>
          </div>

          @if (b.project_type && b.project_type !== 'unknown') {
            <div class="pill">
              <span class="pill-label">Target:</span>
              <span class="pill-val">{{ b.project_type === 'flutter' ? 'Flutter' : 'Android Gradle' }}</span>
            </div>
          }

          @if (b.apk_size > 0) {
            <div class="pill highlight">
              <span class="pill-label">Artifact:</span>
              <span class="pill-val">{{ b.apk_filename }} ({{ (b.apk_size / (1024 * 1024)).toFixed(2) }} MB)</span>
            </div>
          }
        </div>

        @if (b.error) {
          <div class="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div class="error-text">
              <strong>Build Encountered an Error:</strong>
              <p>{{ b.error }}</p>
            </div>
          </div>
        }
      }

      <!-- Terminal Output Window (xterm.js) -->
      <app-terminal></app-terminal>

      <!-- Bottom Pipeline Action Controls -->
      <div class="actions-panel">
        <div class="actions-left">
          @if (isBuilding()) {
            <button class="btn-cancel" (click)="onCancel()" [disabled]="isCancelling()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
              <span>{{ isCancelling() ? 'Cancelling...' : 'Cancel Build' }}</span>
            </button>
          }

          <button class="btn-cleanup" (click)="onCleanup()" [disabled]="isBuilding()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Wipe Temp Artifacts</span>
          </button>
        </div>

        <div class="actions-right">
          @if (api.currentBuild()?.has_apk) {
            <a [href]="api.getDownloadApkUrl()" download class="btn-download-apk">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download APK ({{ (api.currentBuild()!.apk_size / (1024 * 1024)).toFixed(1) }} MB)</span>
            </a>
          }

          <button class="btn-new-build" (click)="goHome()">
            <span>New Build</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .build-page-container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .build-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .btn-back {
      padding: 8px 12px;
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
    }

    .btn-back:hover {
      color: var(--text-main);
      border-color: var(--border-muted);
    }

    .build-meta h1 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
    }

    .repo-subtitle {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }

    .branch-tag {
      color: var(--accent-primary);
      font-weight: 600;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-cloning {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #7dd3fc;
    }
    .status-cloning .status-dot { background: #38bdf8; }

    .status-building {
      background: var(--status-amber-bg);
      border: 1px solid var(--status-amber-border);
      color: #fcd34d;
    }
    .status-building .status-dot { background: #f59e0b; }

    .status-signing {
      background: var(--status-purple-bg);
      border: 1px solid var(--status-purple-border);
      color: #d8b4fe;
    }
    .status-signing .status-dot { background: #a855f7; }

    .status-done {
      background: var(--status-emerald-bg);
      border: 1px solid var(--status-emerald-border);
      color: #6ee7b7;
    }

    .status-failed {
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      color: #fca5a5;
    }

    .status-cancelled {
      background: rgba(100, 116, 139, 0.15);
      border: 1px solid rgba(100, 116, 139, 0.35);
      color: #94a3b8;
    }

    .timer-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .meta-pills {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
    }

    .pill.highlight {
      background: var(--status-emerald-bg);
      border-color: var(--status-emerald-border);
      color: #a7f3d0;
    }

    .pill-label {
      color: var(--text-dim);
    }

    .pill-val {
      font-weight: 600;
      color: var(--text-main);
    }

    .error-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      border-radius: var(--radius-md);
      color: #fca5a5;
      font-size: 0.85rem;
    }

    .error-banner svg {
      flex-shrink: 0;
      color: #ef4444;
      margin-top: 2px;
    }

    .error-text strong {
      display: block;
      color: #fecaca;
      margin-bottom: 2px;
    }

    .actions-panel {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .actions-left, .actions-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn-cancel {
      padding: 10px 16px;
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      color: #f87171;
      border-radius: var(--radius-sm);
    }

    .btn-cancel:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.25);
    }

    .btn-cleanup {
      padding: 10px 14px;
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-dim);
      border-radius: var(--radius-sm);
    }

    .btn-cleanup:hover:not(:disabled) {
      color: var(--text-main);
      border-color: var(--border-muted);
    }

    .btn-download-apk {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #10b981;
      color: #022c22;
      font-weight: 700;
      border-radius: var(--radius-sm);
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
      transition: background 0.15s ease;
    }

    .btn-download-apk:hover {
      background: #059669;
    }

    .btn-new-build {
      padding: 10px 16px;
      background: var(--accent-primary);
      color: #031422;
      font-weight: 600;
      border-radius: var(--radius-sm);
    }

    .btn-new-build:hover {
      background: var(--accent-primary-hover);
    }

    @media (max-width: 600px) {
      .actions-panel {
        flex-direction: column;
        align-items: stretch;
      }
      .actions-left, .actions-right {
        width: 100%;
        justify-content: stretch;
      }
      .actions-left button, .actions-right a, .actions-right button {
        flex: 1;
        justify-content: center;
      }
    }
  `]
})
export class BuildComponent implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  private router = inject(Router);

  isCancelling = signal(false);
  formattedElapsed = signal('00:00');
  private pollInterval: any = null;
  private timerInterval: any = null;
  private secondsCount = 0;

  ngOnInit(): void {
    this.refreshStatus();

    // Poll status every 3 seconds to catch status transitions
    this.pollInterval = setInterval(() => {
      this.refreshStatus();
    }, 3000);

    // Local tick timer
    this.timerInterval = setInterval(() => {
      if (this.isBuilding()) {
        this.secondsCount++;
        this.updateFormattedTime();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private refreshStatus(): void {
    this.api.getBuildStatus().subscribe({
      next: (status) => {
        if (status.duration_seconds >= 0) {
          this.secondsCount = status.duration_seconds;
          this.updateFormattedTime();
        }
      }
    });
  }

  private updateFormattedTime(): void {
    const hrs = Math.floor(this.secondsCount / 3600);
    const rem = this.secondsCount % 3600;
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    const mStr = mins < 10 ? `0${mins}` : `${mins}`;
    const sStr = secs < 10 ? `0${secs}` : `${secs}`;
    if (hrs > 0) {
      const hStr = hrs < 10 ? `0${hrs}` : `${hrs}`;
      this.formattedElapsed.set(`${hStr}:${mStr}:${sStr}`);
    } else {
      this.formattedElapsed.set(`${mStr}:${sStr}`);
    }
  }

  isBuilding(): boolean {
    const s = this.api.currentBuild()?.status;
    return s === 'cloning' || s === 'building' || s === 'signing';
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'cloning': return 'Cloning Repo';
      case 'building': return 'Compiling Code';
      case 'signing': return 'Signing APK';
      case 'done': return 'Completed';
      case 'failed': return 'Failed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  onCancel(): void {
    this.isCancelling.set(true);
    this.api.cancelBuild().subscribe({
      next: () => {
        this.isCancelling.set(false);
      },
      error: (err) => {
        this.isCancelling.set(false);
        console.error('Failed to cancel build', err);
      }
    });
  }

  onCleanup(): void {
    this.api.cleanupBuild().subscribe({
      next: () => {
        this.api.refreshSystemStatus();
      },
      error: (err) => {
        console.error('Cleanup failed', err);
      }
    });
  }
}
