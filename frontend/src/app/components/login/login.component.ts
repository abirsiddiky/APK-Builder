import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="brand-header">
          <div class="brand-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          <h1>APK Builder</h1>
          <p class="subtitle">Single-user disposable cloud build server</p>
        </div>

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

        @if (countdown() > 0) {
          <div class="alert alert-warning">
            <span>Rate limit active. Please wait {{ countdown() }}s before retrying.</span>
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="login-form">
          <div class="form-group">
            <label for="admin-token">Admin Access Token</label>
            <div class="input-wrapper">
              <input
                id="admin-token"
                [type]="showToken() ? 'text' : 'password'"
                [(ngModel)]="tokenInput"
                name="token"
                placeholder="Paste the generated admin token"
                required
                autocomplete="off"
                [disabled]="isLoading() || countdown() > 0"
                class="code-font"
              />
              <button
                type="button"
                class="toggle-visibility"
                (click)="toggleVisibility()"
                tabindex="-1"
                aria-label="Toggle token visibility"
              >
                @if (showToken()) {
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                } @else {
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                }
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="btn-primary"
            [disabled]="isLoading() || !tokenInput.trim() || countdown() > 0"
          >
            @if (isLoading()) {
              <span class="spinner"></span>
              <span>Authenticating...</span>
            } @else {
              <span>Authenticate & Enter</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            }
          </button>
        </form>

        <div class="info-footer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <p>
            The admin token is printed in the server terminal output on first launch and stored securely in hashed format.
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.08) 0%, rgba(8, 12, 20, 1) 70%);
    }

    .login-card {
      width: 100%;
      max-width: 440px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 36px 32px;
      box-shadow: var(--shadow-lg);
    }

    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      background: var(--accent-primary-light);
      color: var(--accent-primary);
      border-radius: var(--radius-md);
      margin-bottom: 16px;
      border: 1px solid rgba(56, 189, 248, 0.25);
    }

    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
      margin-bottom: 6px;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-wrapper input {
      padding-right: 44px;
      height: 46px;
    }

    .toggle-visibility {
      position: absolute;
      right: 12px;
      color: var(--text-dim);
      padding: 4px;
      border-radius: var(--radius-sm);
    }

    .toggle-visibility:hover {
      color: var(--text-main);
    }

    .btn-primary {
      height: 48px;
      background: var(--accent-primary);
      color: #031422;
      font-weight: 600;
      border-radius: var(--radius-sm);
      justify-content: center;
      width: 100%;
      margin-top: 6px;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--accent-primary-hover);
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35);
    }

    .btn-primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      margin-bottom: 20px;
    }

    .alert-error {
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      color: #fca5a5;
    }

    .alert-warning {
      background: var(--status-amber-bg);
      border: 1px solid var(--status-amber-border);
      color: #fcd34d;
    }

    .info-footer {
      display: flex;
      gap: 10px;
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-dim);
      font-size: 0.78rem;
      line-height: 1.4;
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
  `]
})
export class LoginComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  tokenInput = '';
  showToken = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');
  countdown = signal(0);
  private timer: any = null;

  ngOnInit(): void {
    if (this.api.isAuthenticated()) {
      this.router.navigate(['/']);
    }
  }

  toggleVisibility(): void {
    this.showToken.update(v => !v);
  }

  onSubmit(): void {
    const trimmed = this.tokenInput.trim();
    if (!trimmed) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.api.login(trimmed).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 429) {
          const wait = err.error?.wait_secs || 60;
          this.startCountdown(wait);
          this.errorMessage.set('Too many failed login attempts.');
        } else {
          this.errorMessage.set(err.error?.error || 'Invalid admin token. Please check and try again.');
        }
      }
    });
  }

  private startCountdown(seconds: number): void {
    this.countdown.set(seconds);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.countdown.update(c => {
        if (c <= 1) {
          clearInterval(this.timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }
}

