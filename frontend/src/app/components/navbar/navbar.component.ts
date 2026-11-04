import { Component, inject, OnInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="navbar-wrapper">
      <div class="navbar-container">
        <div class="brand" (click)="goHome()">
          <div class="logo-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
          </div>
          <div class="brand-text">
            <span class="title">APK Builder</span>
            <span class="tag">Linux VPS</span>
          </div>
        </div>

        <div class="nav-actions">
          @if (api.systemStatus(); as sys) {
            <div class="uptime-badge" title="Server Uptime (Billing cost hint)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="uptime-label-desktop">Uptime:&nbsp;</span>
              <span class="uptime-val">{{ displayUptime() }}</span>
            </div>
          }

          <button class="btn-logout" (click)="onLogout()" title="Log out from current session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span class="logout-text">Exit</span>
          </button>
        </div>
      </div>

      <!-- Idle Warning Banner -->
      @if (api.systemStatus()?.is_idle_warning) {
        <div class="banner banner-warning">
          <div class="banner-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>
              <strong>VPS Idle Alert:</strong> No activity detected for over 60 minutes. Delete or power off your VPS in your provider dashboard to prevent ongoing hourly billing.
            </span>
          </div>
        </div>
      }

      <!-- Persistent VPS Deletion Reminder Banner (after build completes or APK available) -->
      @if (showBillingBanner()) {
        <div class="banner banner-info">
          <div class="banner-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>
              <strong>Cost Reminder:</strong> Finished downloading your APK? Delete your VPS from your provider panel now, otherwise hourly billing continues.
            </span>
          </div>
          <button class="banner-close" (click)="dismissBillingBanner()" aria-label="Dismiss banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      }
    </header>
  `,
  styles: [`
    .navbar-wrapper {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
    }

    .navbar-container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .logo-box {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      background: var(--accent-primary-light);
      color: var(--accent-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(56, 189, 248, 0.25);
      flex-shrink: 0;
    }

    .brand-text {
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-main);
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .tag {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: var(--radius-pill);
      background: var(--bg-surface-elevated);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      white-space: nowrap;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .uptime-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      font-size: 0.8rem;
      color: var(--accent-primary);
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .uptime-label-desktop {
      display: inline;
    }

    .btn-logout {
      height: 34px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      font-size: 0.85rem;
      flex-shrink: 0;
    }

    .btn-logout:hover {
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.4);
      background: var(--status-rose-bg);
    }

    .banner {
      padding: 10px 20px;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .banner-warning {
      background: #451a03;
      border-top: 1px solid #78350f;
      border-bottom: 1px solid #78350f;
      color: #fde68a;
    }

    .banner-info {
      background: #082f49;
      border-top: 1px solid #075985;
      border-bottom: 1px solid #075985;
      color: #bae6fd;
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 1100px;
      margin: 0 auto;
      flex: 1;
    }

    .banner-close {
      color: inherit;
      opacity: 0.8;
      padding: 4px;
    }

    .banner-close:hover {
      opacity: 1;
    }

    @media (max-width: 600px) {
      .navbar-container {
        padding: 10px 14px;
        gap: 8px;
      }
      .brand {
        gap: 8px;
      }
      .logo-box {
        width: 32px;
        height: 32px;
      }
      .logo-box svg {
        width: 17px;
        height: 17px;
      }
      .title {
        font-size: 0.95rem;
      }
      .tag {
        display: none;
      }
      .nav-actions {
        gap: 6px;
      }
      .uptime-badge {
        font-size: 0.76rem;
        padding: 5px 9px;
        gap: 5px;
      }
      .uptime-badge svg {
        width: 13px;
        height: 13px;
      }
      .uptime-label-desktop {
        display: none;
      }
      .logout-text {
        display: none;
      }
      .btn-logout {
        width: 32px;
        height: 32px;
        padding: 0;
      }
    }
  `]
})
export class NavbarComponent implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  private router = inject(Router);

  showBillingBanner = signal(false);
  displayUptime = signal<string>('1 min');
  private statusInterval: any = null;
  private tickerInterval: any = null;
  private baseUptimeSeconds = 0;
  private receivedAt = 0;

  constructor() {
    effect(() => {
      const sys = this.api.systemStatus();
      if (sys && sys.uptime_seconds >= 0) {
        this.baseUptimeSeconds = sys.uptime_seconds;
        this.receivedAt = Date.now();
        this.displayUptime.set(this.formatUptime(sys.uptime_seconds));
      }
    });
  }

  ngOnInit(): void {
    // Immediate initial fetch
    this.api.refreshSystemStatus();
    this.checkBuildCompletion();

    // Poll system status every 15 seconds
    this.statusInterval = setInterval(() => {
      this.api.refreshSystemStatus();
      this.checkBuildCompletion();
    }, 15000);

    // Local 1-second ticker smoothly increments uptime in UI
    this.tickerInterval = setInterval(() => {
      if (this.receivedAt > 0) {
        const elapsed = Math.floor((Date.now() - this.receivedAt) / 1000);
        this.displayUptime.set(this.formatUptime(this.baseUptimeSeconds + elapsed));
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.statusInterval) clearInterval(this.statusInterval);
    if (this.tickerInterval) clearInterval(this.tickerInterval);
  }

  private formatUptime(totalSecs: number): string {
    const totalMins = Math.floor(totalSecs / 60);
    if (totalMins < 1) {
      return '1 min';
    }
    const days = Math.floor(totalMins / (24 * 60));
    const remMins = totalMins % (24 * 60);
    const hours = Math.floor(remMins / 60);
    const mins = remMins % 60;

    if (days > 0) {
      return mins > 0 ? `${days}d ${hours}h ${mins}m` : `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
    }
    return `${mins} min`;
  }

  checkBuildCompletion(): void {
    const build = this.api.currentBuild();
    if (build && (build.status === 'done' || build.has_apk)) {
      this.showBillingBanner.set(true);
    }
  }

  dismissBillingBanner(): void {
    this.showBillingBanner.set(false);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  onLogout(): void {
    this.api.logout();
  }
}

