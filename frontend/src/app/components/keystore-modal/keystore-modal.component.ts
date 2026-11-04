import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { KeystoreDetails, KeystoreGenerateRequest } from '../../models/types';

export interface SelectedKeystore {
  id: string;
  alias: string;
  storePassword: string;
  keyPassword: string;
  source: 'uploaded' | 'generated';
  name: string;
}

@Component({
  selector: 'app-keystore-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h2>Release Signing Keystore</h2>
          </div>
          <button class="btn-close" (click)="close.emit()" aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Mode Tabs -->
        <div class="tab-bar">
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'generate'"
            (click)="activeTab.set('generate')"
          >
            Generate New Keystore
          </button>
          <button
            type="button"
            class="tab-btn"
            [class.active]="activeTab() === 'upload'"
            (click)="activeTab.set('upload')"
          >
            Upload Existing (.jks/.keystore)
          </button>
        </div>

        <div class="modal-body">
          @if (errorMessage()) {
            <div class="alert alert-error">
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <!-- TAB 1: GENERATE NEW KEYSTORE -->
          @if (activeTab() === 'generate') {
            @if (!generatedDetails()) {
              <form (ngSubmit)="onGenerate()" class="modal-form">
                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="gen-alias">Key Alias *</label>
                    <input
                      id="gen-alias"
                      type="text"
                      [(ngModel)]="genForm.alias"
                      name="alias"
                      placeholder="e.g. releasekey"
                      required
                      class="code-font"
                    />
                  </div>
                  <div class="form-group flex-1">
                    <label for="gen-validity">Validity (Years)</label>
                    <input
                      id="gen-validity"
                      type="number"
                      [(ngModel)]="genForm.validity_years"
                      name="validity_years"
                      min="1"
                      max="100"
                    />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="gen-storepass">Keystore Password *</label>
                    <input
                      id="gen-storepass"
                      type="password"
                      [(ngModel)]="genForm.store_password"
                      name="store_password"
                      placeholder="Min 6 characters"
                      required
                      class="code-font"
                    />
                  </div>
                  <div class="form-group flex-1">
                    <label for="gen-keypass">Key Password (Optional)</label>
                    <input
                      id="gen-keypass"
                      type="password"
                      [(ngModel)]="genForm.key_password"
                      name="key_password"
                      placeholder="Defaults to store password"
                      class="code-font"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label for="gen-cn">Common Name (Developer Name) *</label>
                  <input
                    id="gen-cn"
                    type="text"
                    [(ngModel)]="genForm.common_name"
                    name="common_name"
                    placeholder="e.g. John Doe or Mobile Lead"
                    required
                  />
                </div>

                <div class="form-row">
                  <div class="form-group flex-1">
                    <label for="gen-org">Organization</label>
                    <input
                      id="gen-org"
                      type="text"
                      [(ngModel)]="genForm.organization"
                      name="organization"
                      placeholder="e.g. Acme Studio"
                    />
                  </div>
                  <div class="form-group flex-1">
                    <label for="gen-country">Country Code (2 Letters)</label>
                    <input
                      id="gen-country"
                      type="text"
                      maxlength="2"
                      [(ngModel)]="genForm.country"
                      name="country"
                      placeholder="e.g. US, GB, BD"
                      class="uppercase-input code-font"
                    />
                  </div>
                </div>

                <div class="modal-footer">
                  <button type="button" class="btn-secondary" (click)="close.emit()">Cancel</button>
                  <button type="submit" class="btn-primary" [disabled]="isSubmitting() || !genForm.alias || !genForm.store_password || !genForm.common_name">
                    @if (isSubmitting()) {
                      <span>Generating RSA 2048 Key...</span>
                    } @else {
                      <span>Generate Keystore</span>
                    }
                  </button>
                </div>
              </form>
            } @else {
              <!-- Post-Generation View with Downloads & Warning -->
              <div class="generated-view">
                <div class="success-banner">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <div>
                    <h3>Keystore Successfully Created!</h3>
                    <p>Key Alias: <strong>{{ generatedDetails()?.alias }}</strong></p>
                  </div>
                </div>

                <!-- Big Crucial Warning -->
                <div class="warning-box">
                  <div class="warning-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                      <line x1="12" y1="9" x2="12" y2="13"></line>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </div>
                  <div class="warning-text">
                    <h4>CRITICAL BACKUP WARNING</h4>
                    <p>
                      If you lose this keystore file or forget the passwords, you will <strong>never</strong> be able to update your app on Google Play Store. Download both files now and store them in a secure backup location!
                    </p>
                  </div>
                </div>

                <!-- Download Buttons -->
                <div class="download-actions">
                  <a [href]="api.getDownloadKeystoreUrl(generatedDetails()!.id)" download class="btn-download">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Download Keystore (.keystore)</span>
                  </a>

                  <a [href]="api.getDownloadKeystoreInfoUrl(generatedDetails()!.id)" download="info.txt" class="btn-download-secondary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>Download info.txt (Credentials)</span>
                  </a>
                </div>

                <div class="modal-footer">
                  <button type="button" class="btn-secondary" (click)="generatedDetails.set(null)">Back to Form</button>
                  <button type="button" class="btn-primary" (click)="useGeneratedKeystore()">
                    Use This Keystore for Build
                  </button>
                </div>
              </div>
            }
          }

          <!-- TAB 2: UPLOAD EXISTING KEYSTORE -->
          @if (activeTab() === 'upload') {
            <form (ngSubmit)="onUpload()" class="modal-form">
              <div class="file-dropzone" [class.has-file]="selectedFile">
                <input
                  type="file"
                  id="keystore-file"
                  (change)="onFileSelected($event)"
                  accept=".jks,.keystore"
                  required
                />
                <label for="keystore-file" class="dropzone-label">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  @if (selectedFile) {
                    <span class="file-name">{{ selectedFile.name }}</span>
                    <span class="file-size">({{ (selectedFile.size / 1024).toFixed(1) }} KB)</span>
                  } @else {
                    <span>Click or drag your <strong>.jks</strong> or <strong>.keystore</strong> file here</span>
                  }
                </label>
              </div>

              <div class="form-group">
                <label for="up-alias">Key Alias *</label>
                <input
                  id="up-alias"
                  type="text"
                  [(ngModel)]="uploadForm.alias"
                  name="alias"
                  placeholder="The key alias inside the keystore"
                  required
                  class="code-font"
                />
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="up-storepass">Keystore Password *</label>
                  <input
                    id="up-storepass"
                    type="password"
                    [(ngModel)]="uploadForm.storePassword"
                    name="storePassword"
                    placeholder="Keystore password"
                    required
                    class="code-font"
                  />
                </div>
                <div class="form-group flex-1">
                  <label for="up-keypass">Key Password (Optional)</label>
                  <input
                    id="up-keypass"
                    type="password"
                    [(ngModel)]="uploadForm.keyPassword"
                    name="keyPassword"
                    placeholder="Defaults to keystore password"
                    class="code-font"
                  />
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-secondary" (click)="close.emit()">Cancel</button>
                <button
                  type="submit"
                  class="btn-primary"
                  [disabled]="isSubmitting() || !selectedFile || !uploadForm.alias || !uploadForm.storePassword"
                >
                  @if (isSubmitting()) {
                    <span>Uploading Keystore...</span>
                  } @else {
                    <span>Save & Select Keystore</span>
                  }
                </button>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .modal-dialog {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 580px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }

    .modal-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--accent-primary);
    }

    .header-title h2 {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .btn-close {
      color: var(--text-muted);
      padding: 4px;
      border-radius: var(--radius-sm);
    }

    .btn-close:hover {
      color: var(--text-main);
      background: var(--bg-surface-elevated);
    }

    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--bg-app);
    }

    .tab-btn {
      flex: 1;
      padding: 12px 16px;
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
    }

    .tab-btn.active {
      color: var(--accent-primary);
      border-bottom-color: var(--accent-primary);
      background: var(--bg-surface);
      font-weight: 600;
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
    }

    .modal-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .flex-1 {
      flex: 1;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .uppercase-input {
      text-transform: uppercase;
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }

    .btn-primary {
      padding: 10px 18px;
      background: var(--accent-primary);
      color: #031422;
      font-weight: 600;
      border-radius: var(--radius-sm);
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--accent-primary-hover);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      padding: 10px 16px;
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }

    .btn-secondary:hover {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
    }

    /* File Dropzone */
    .file-dropzone {
      position: relative;
      border: 2px dashed var(--border-muted);
      border-radius: var(--radius-md);
      padding: 24px;
      text-align: center;
      background: var(--bg-surface-elevated);
      cursor: pointer;
      transition: border-color 0.15s ease;
    }

    .file-dropzone:hover, .file-dropzone.has-file {
      border-color: var(--accent-primary);
    }

    .file-dropzone input[type="file"] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .dropzone-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    .dropzone-label svg {
      color: var(--accent-primary);
    }

    .file-name {
      font-weight: 600;
      color: var(--text-main);
    }

    .file-size {
      font-size: 0.78rem;
      color: var(--text-dim);
    }

    /* Post-Generation View */
    .generated-view {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .success-banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      background: var(--status-emerald-bg);
      border: 1px solid var(--status-emerald-border);
      border-radius: var(--radius-md);
      color: #6ee7b7;
    }

    .success-banner h3 {
      font-size: 1rem;
      color: #a7f3d0;
      margin-bottom: 2px;
    }

    .warning-box {
      display: flex;
      gap: 14px;
      padding: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: var(--radius-md);
    }

    .warning-icon {
      color: #ef4444;
      flex-shrink: 0;
    }

    .warning-text h4 {
      font-size: 0.88rem;
      color: #fca5a5;
      font-weight: 700;
      margin-bottom: 4px;
      letter-spacing: 0.02em;
    }

    .warning-text p {
      font-size: 0.82rem;
      color: #fecaca;
      line-height: 1.45;
    }

    .download-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .btn-download, .btn-download-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: var(--radius-sm);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.15s ease;
    }

    .btn-download {
      background: #10b981;
      color: #022c22;
    }

    .btn-download:hover {
      background: #059669;
    }

    .btn-download-secondary {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      border: 1px solid var(--border-muted);
    }

    .btn-download-secondary:hover {
      border-color: var(--text-muted);
    }

    .alert {
      padding: 12px 14px;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }

    .alert-error {
      background: var(--status-rose-bg);
      border: 1px solid var(--status-rose-border);
      color: #fca5a5;
    }

    @media (max-width: 500px) {
      .form-row {
        flex-direction: column;
        gap: 16px;
      }
    }
  `]
})
export class KeystoreModalComponent {
  readonly api = inject(ApiService);

  @Output() keystoreSelected = new EventEmitter<SelectedKeystore>();
  @Output() close = new EventEmitter<void>();

  activeTab = signal<'generate' | 'upload'>('generate');
  isSubmitting = signal(false);
  errorMessage = signal('');
  generatedDetails = signal<KeystoreDetails | null>(null);

  genForm: KeystoreGenerateRequest = {
    alias: 'releasekey',
    store_password: '',
    key_password: '',
    common_name: '',
    organization: '',
    country: 'US',
    validity_years: 25
  };

  uploadForm = {
    alias: '',
    storePassword: '',
    keyPassword: ''
  };

  selectedFile: File | null = null;

  onBackdropClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.selectedFile = target.files[0];
    }
  }

  onGenerate(): void {
    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.generateKeystore(this.genForm).subscribe({
      next: (details) => {
        this.isSubmitting.set(false);
        this.generatedDetails.set(details);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to generate keystore');
      }
    });
  }

  useGeneratedKeystore(): void {
    const details = this.generatedDetails();
    if (!details) return;

    this.keystoreSelected.emit({
      id: details.id,
      alias: details.alias,
      storePassword: this.genForm.store_password,
      keyPassword: this.genForm.key_password || this.genForm.store_password,
      source: 'generated',
      name: `Generated (${details.alias})`
    });
    this.close.emit();
  }

  onUpload(): void {
    if (!this.selectedFile) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.api.uploadKeystore(this.selectedFile).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        this.keystoreSelected.emit({
          id: res.id,
          alias: this.uploadForm.alias,
          storePassword: this.uploadForm.storePassword,
          keyPassword: this.uploadForm.keyPassword || this.uploadForm.storePassword,
          source: 'uploaded',
          name: res.filename
        });
        this.close.emit();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.error || 'Failed to upload keystore');
      }
    });
  }
}

