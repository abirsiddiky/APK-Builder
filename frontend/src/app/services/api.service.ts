import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { SystemStatus, BuildStatus, BuildRequest, KeystoreDetails, KeystoreGenerateRequest } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly TOKEN_KEY = 'apk_builder_admin_token';

  // Signals
  readonly token = signal<string>(sessionStorage.getItem(this.TOKEN_KEY) || '');
  readonly isAuthenticated = computed(() => this.token().length > 0);
  readonly currentBuild = signal<BuildStatus | null>(null);
  readonly systemStatus = signal<SystemStatus | null>(null);

  constructor(private http: HttpClient, private router: Router) {
    if (this.token()) {
      this.refreshSystemStatus();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token()}`
    });
  }

  login(token: string): Observable<{ success: boolean; token: string; message: string }> {
    return this.http.post<{ success: boolean; token: string; message: string }>('/api/auth/login', { token }).pipe(
      tap(res => {
        if (res.success && res.token) {
          sessionStorage.setItem(this.TOKEN_KEY, res.token);
          this.token.set(res.token);
          this.refreshSystemStatus();
        }
      })
    );
  }

  logout(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    this.token.set('');
    this.currentBuild.set(null);
    this.systemStatus.set(null);
    this.router.navigate(['/login']);
  }

  checkAuth(): Observable<{ authenticated: boolean }> {
    return this.http.get<{ authenticated: boolean }>('/api/auth/check', {
      headers: this.getAuthHeaders()
    });
  }

  getSystemStatus(): Observable<SystemStatus> {
    return this.http.get<SystemStatus>('/api/system/status', {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(status => {
        this.systemStatus.set(status);
        if (status.build) {
          this.currentBuild.set(status.build);
        }
      })
    );
  }

  refreshSystemStatus(): void {
    if (!this.token()) return;
    this.getSystemStatus().subscribe({
      error: (err) => {
        if (err.status === 401) {
          this.logout();
        }
      }
    });
  }

  generateKeystore(data: KeystoreGenerateRequest): Observable<KeystoreDetails> {
    return this.http.post<KeystoreDetails>('/api/keystore/generate', data, {
      headers: this.getAuthHeaders()
    });
  }

  uploadKeystore(file: File): Observable<{ id: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('keystore', file, file.name);
    return this.http.post<{ id: string; filename: string; message: string }>('/api/keystore/upload', formData, {
      headers: this.getAuthHeaders()
    });
  }

  startBuild(req: BuildRequest): Observable<{ message: string; status: BuildStatus }> {
    return this.http.post<{ message: string; status: BuildStatus }>('/api/build/start', req, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(res => {
        this.currentBuild.set(res.status);
      })
    );
  }

  getBuildStatus(): Observable<BuildStatus> {
    return this.http.get<BuildStatus>('/api/build/status', {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(status => {
        this.currentBuild.set(status);
      })
    );
  }

  cancelBuild(): Observable<{ message: string; status: BuildStatus }> {
    return this.http.post<{ message: string; status: BuildStatus }>('/api/build/cancel', {}, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(res => {
        this.currentBuild.set(res.status);
      })
    );
  }

  cleanupBuild(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/build/cleanup', {}, {
      headers: this.getAuthHeaders()
    });
  }

  getDownloadApkUrl(): string {
    return `/api/build/download?token=${encodeURIComponent(this.token())}`;
  }

  getDownloadKeystoreUrl(id: string): string {
    return `/api/keystore/download/${encodeURIComponent(id)}?token=${encodeURIComponent(this.token())}`;
  }

  getDownloadKeystoreInfoUrl(id: string): string {
    return `/api/keystore/info/${encodeURIComponent(id)}?token=${encodeURIComponent(this.token())}`;
  }

  getLogStreamUrl(): string {
    return `/api/build/logs?token=${encodeURIComponent(this.token())}`;
  }
}

