export interface SystemStatus {
  server_start_time: string;
  uptime_seconds: number;
  uptime_formatted: string;
  process_uptime_seconds?: number;
  last_activity: string;
  idle_seconds: number;
  idle_minutes: number;
  idle_limit_mins: number;
  is_idle_warning: boolean;
  build: BuildStatus;
}

export type BuildState = 'idle' | 'cloning' | 'building' | 'signing' | 'done' | 'failed' | 'cancelled';

export interface BuildStatus {
  id: string;
  status: BuildState;
  repo_url: string;
  branch: string;
  build_type: 'debug' | 'release' | string;
  project_type: 'android-gradle' | 'flutter' | 'unknown' | string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  apk_filename: string;
  apk_size: number;
  has_apk: boolean;
  error: string;
}

export interface BuildRequest {
  repo_url: string;
  branch?: string;
  git_token?: string;
  build_type: 'debug' | 'release';
  keystore_id?: string;
  keystore_alias?: string;
  store_password?: string;
  key_password?: string;
}

export interface KeystoreDetails {
  id: string;
  alias: string;
  download_url: string;
  info_url: string;
  message: string;
  warning: string;
}

export interface KeystoreGenerateRequest {
  alias: string;
  store_password: string;
  key_password?: string;
  common_name: string;
  organization?: string;
  country?: string;
  validity_years?: number;
}

