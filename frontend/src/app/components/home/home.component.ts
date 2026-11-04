import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { BuildRequest } from '../../models/types';
import { KeystoreModalComponent, SelectedKeystore } from '../keystore-modal/keystore-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, KeystoreModalComponent],
  template: `
    <div class="home-container">
      <div class="setup-card">
        <div class="card-header">
          <div class="header-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span>Cloud Android Builder</span>
          </div>
          <h1>Create New Build</h1>
          <p class="description">
            Build clean, unsigned debug or signed production Android APKs directly on your single-user Linux VPS.
          </p>
        </div>

        @if (api.currentBuild(); as active) {
          @if (active.status === 'cloning' || active.status === 'building' || active.status === 'signing') {
            <div class="active-build-banner">
              <div class="banner-left">
                <span class="active-dot pulse-anim"></span>
                <div>
                  <strong>A build is currently in progress</strong>
                  <p class="code-font">{{ active.repo_url }}</p>
                </div>
              </div>
              <button class="btn-view-live" (click)="goToBuild()">
                <span>View Live Logs</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </div>
          }
        }

        @if (errorMessage()) {
          <div class="alert alert-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="build-form">
          <!-- Git Repo URL -->
          <div class="form-group">
            <label for="repo-url">
              <span>Git Repository URL (HTTPS) *</span>
            </label>
            <div class="input-icon-wrapper">
              <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              <input
                id="repo-url"
                type="url"
                [(ngModel)]="form.repo_url"
                name="repo_url"
                placeholder="https://github.com/owner/repository.git"
                required
                class="code-font"
              />
            </div>
            <span class="field-hint">Supports public or private GitHub, GitLab, and standard Git HTTPS repositories.</span>
          </div>

          <div class="form-row">
            <!-- Branch -->
            <div class="form-group flex-1">
              <label for="repo-branch">Branch / Tag (Optional)</label>
              <div class="input-icon-wrapper">
                <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="6" y1="3" x2="6" y2="15"></line>
                  <circle cx="18" cy="6" r="3"></circle>
                  <circle cx="6" cy="18" r="3"></circle>
                  <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                <input
                  id="repo-branch"
                  type="text"
                  [(ngModel)]="form.branch"
                  name="branch"
                  placeholder="Default branch (main / master)"
                  class="code-font"
                />
              </div>
            </div>

            <!-- GitHub Token -->
            <div class="form-group flex-1">
              <label for="repo-token">
                <span>Personal Access Token</span>
                <span class="badge-subtle">Private Repos</span>
              </label>
              <div class="input-icon-wrapper">
                <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input
                  id="repo-token"
                  [type]="showToken() ? 'text' : 'password'"
                  [(ngModel)]="form.git_token"
                  name="git_token"
                  placeholder="ghp_... (never logged or saved)"
                  class="code-font"
                />
                <button
                  type="button"
                  class="token-toggle"
                  (click)="showToken.set(!showToken())"
                  tabindex="-1"
                >
                  @if (showToken()) {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  } @else {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="3" r="3"></circle>
                    </svg>
                  }
                </button>
              </div>
            </div>
          </div>

          <!-- Build Type Segmented Toggle -->
          <div class="form-group">
            <label>Build Target & Signing Mode</label>
            <div class="segmented-control">
              <button
                type="button"
                class="segment-option"
                [class.selected]="form.build_type === 'debug'"
                (click)="setBuildType('debug')"
              >
                <div class="segment-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                  </svg>
                  <span>Debug APK</span>
                </div>
                <span class="segment-desc">Signed with default Android debug key</span>
              </button>

              <button
                type="button"
                class="segment-option"
                [class.selected]="form.build_type === 'release'"
                (click)="setBuildType('release')"
              >
                <div class="segment-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <span>Signed Release APK</span>
                </div>
                <span class="segment-desc">Production-ready with custom RSA keystore</span>
              </button>
            </div>
          </div>

          <!-- Keystore Selector (When Release is Active) -->
          @if (form.build_type === 'release') {
            <div class="keystore-box">
              <div class="keystore-status">
                @if (selectedKeystore()) {
                  <div class="ks-ready">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <div>
                      <strong>Keystore Ready</strong>
                      <p>Key Alias: <code>{{ selectedKeystore()!.alias }}</code> ({{ selectedKeystore()!.source }})</p>
                    </div>
                  </div>
                } @else {
                  <div class="ks-missing">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <div>
                      <strong>Release Keystore Required</strong>
                      <p>Generate a new RSA 2048 keystore or upload an existing .jks / .keystore</p>
                    </div>
                  </div>
                }
              </div>

              <button
                type="button"
                class="btn-config-keystore"
                (click)="isKeystoreModalOpen.set(true)"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>{{ selectedKeystore() ? 'Change Keystore' : 'Configure Keystore' }}</span>
              </button>
            </div>
          }

          <!-- Submit Button -->
          <button
            type="submit"
            class="btn-launch"
            [disabled]="isStarting() || !form.repo_url.trim() || (form.build_type === 'release' && !selectedKeystore())"
          >
            @if (isStarting()) {
              <span class="spinner"></span>
              <span>Launching Build Pipeline...</span>
            } @else {
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Start Build</span>
            }
          </button>
        </form>

        <!-- Project compatibility hints -->
        <div class="tech-hints">
          <div class="hint-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span><strong>Android Gradle:</strong> Auto-detects <code>./gradlew</code> in root or <code>android/</code></span>
          </div>
          <div class="hint-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span><strong>Flutter:</strong> Auto-detects <code>pubspec.yaml</code> and compiles via Flutter CLI</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Keystore Modal -->
    @if (isKeystoreModalOpen()) {
      <app-keystore-modal
        (keystoreSelected)="onKeystoreSelected($event)"
        (close)="isKeystoreModalOpen.set(false)"
      ></app-keystore-modal>
    }
  `,
  styles: [`
    .home-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 36px 20px 64px;
    }

    .setup-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 36px;
      box-shadow: var(--shadow-lg);
    }

    .card-header {
      margin-bottom: 28px;
    }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--accent-primary-light);
      color: var(--accent-primary);
      border-radius: var(--radius-pill);
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 12px;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }

    .description {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .active-build-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: var(--radius-md);
      padding: 14px 18px;
      margin-bottom: 24px;
    }

    .banner-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .active-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--accent-primary);
    }

    .banner-left strong {
      color: #bae6fd;
      font-size: 0.88rem;
    }

    .banner-left p {
      color: var(--text-muted);
      font-size: 0.78rem;
    }

    .btn-view-live {
      padding: 8px 14px;
      background: var(--accent-primary);
      color: #031422;
      border-radius: var(--radius-sm);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .btn-view-live:hover {
      background: var(--accent-primary-hover);
    }

    .build-form {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .flex-1 {
      flex: 1;
    }

    label {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .badge-subtle {
      font-size: 0.72rem;
      color: var(--text-dim);
      font-weight: 400;
    }

    .field-hint {
      font-size: 0.78rem;
      color: var(--text-dim);
    }

    .input-icon-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      color: var(--text-dim);
      pointer-events: none;
    }

    .input-icon-wrapper input {
      padding-left: 42px;
      height: 44px;
    }

    .token-toggle {
      position: absolute;
      right: 12px;
      color: var(--text-dim);
      padding: 4px;
    }

    .token-toggle:hover {
      color: var(--text-main);
    }

    /* Segmented Control */
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .segment-option {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      text-align: left;
      transition: all 0.15s ease;
    }

    .segment-option:hover {
      border-color: var(--border-muted);
    }

    .segment-option.selected {
      border-color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.06);
    }

    .segment-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--text-main);
    }

    .segment-option.selected .segment-title {
      color: var(--accent-primary);
    }

    .segment-desc {
      font-size: 0.76rem;
      color: var(--text-muted);
    }

    /* Keystore Box */
    .keystore-box {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      animation: fadeIn 0.15s ease;
    }

    .keystore-status {
      flex: 1;
    }

    .ks-ready, .ks-missing {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .ks-ready svg { color: #10b981; }
    .ks-ready strong { color: #6ee7b7; font-size: 0.88rem; }
    .ks-ready p { font-size: 0.8rem; color: var(--text-muted); }

    .ks-missing svg { color: #f59e0b; }
    .ks-missing strong { color: #fcd34d; font-size: 0.88rem; }
    .ks-missing p { font-size: 0.8rem; color: var(--text-muted); }

    .btn-config-keystore {
      padding: 8px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-sm);
      color: var(--text-main);
      font-size: 0.82rem;
      font-weight: 600;
    }

    .btn-config-keystore:hover {
      border-color: var(--accent-primary);
      color: var(--accent-primary);
    }

    .btn-launch {
      height: 50px;
      background: var(--accent-primary);
      color: #031422;
      font-weight: 700;
      font-size: 1rem;
      border-radius: var(--radius-sm);
      margin-top: 8px;
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.25);
    }

    .btn-launch:hover:not(:disabled) {
      background: var(--accent-primary-hover);
      box-shadow: 0 6px 20px rgba(56, 189, 248, 0.35);
    }

    .btn-launch:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .tech-hints {
      display: flex;
      align-items: center;
      justify-content: space-around;
      gap: 16px;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--border-subtle);
    }

    .hint-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .hint-item svg {
      color: var(--status-emerald);
      flex-shrink: 0;
    }

    .hint-item code {
      background: var(--bg-surface-elevated);
      padding: 2px 5px;
      border-radius: 4px;
      color: var(--accent-primary);
    }

    .alert-error {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      margin-bottom: 20px;
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      color: #fca5a5;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(0, 0, 0, 0.2);
      border-top-color: #031422;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 600px) {
      .setup-card {
        padding: 24px 18px;
      }
      .form-row {
        flex-direction: column;
      }
      .segmented-control {
        grid-template-columns: 1fr;
      }
      .tech-hints {
        flex-direction: column;
        align-items: flex-start;
      }
      .keystore-box {
        flex-direction: column;
        align-items: stretch;
      }
      .btn-config-keystore {
        justify-content: center;
      }
    }
  `]
})
export class HomeComponent implements OnInit {
  readonly api = inject(ApiService);
  private router = inject(Router);

  isStarting = signal(false);
  errorMessage = signal('');
  showToken = signal(false);
  isKeystoreModalOpen = signal(false);
  selectedKeystore = signal<SelectedKeystore | null>(null);

  form: BuildRequest = {
    repo_url: '',
    branch: '',
    git_token: '',
    build_type: 'debug'
  };

  ngOnInit(): void {
    this.api.refreshSystemStatus();
  }

  setBuildType(type: 'debug' | 'release'): void {
    this.form.build_type = type;
    if (type === 'release' && !this.selectedKeystore()) {
      this.isKeystoreModalOpen.set(true);
    }
  }

  onKeystoreSelected(ks: SelectedKeystore): void {
    this.selectedKeystore.set(ks);
  }

  goToBuild(): void {
    this.router.navigate(['/build']);
  }

  onSubmit(): void {
    const trimmedUrl = this.form.repo_url.trim();
    if (!trimmedUrl) {
      this.errorMessage.set('Repository URL is required');
      return;
    }

    if (!trimmedUrl.startsWith('https://')) {
      this.errorMessage.set('Repository URL must begin with https://');
      return;
    }

    if (this.form.build_type === 'release') {
      const ks = this.selectedKeystore();
      if (!ks) {
        this.errorMessage.set('Please select or generate a keystore for release builds');
        return;
      }
      this.form.keystore_id = ks.id;
      this.form.keystore_alias = ks.alias;
      this.form.store_password = ks.storePassword;
      this.form.key_password = ks.keyPassword;
    }

    this.isStarting.set(true);
    this.errorMessage.set('');

    this.api.startBuild(this.form).subscribe({
      next: () => {
        this.isStarting.set(false);
        this.router.navigate(['/build']);
      },
      error: (err) => {
        this.isStarting.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to start build');
      }
    });
  }
}

