export interface LoginRequest {
  username: string; // Email
  password: string;
}

export interface UserDetails {
  id: number;
  email: string;
  name: string | null;
  authorities: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: UserDetails;
}

export interface ResetPasswordInitRequest {
  email: string;
}

export interface ResetPasswordFinishRequest {
  resetKey: string;
  newPassword: string;
}

export interface ResetKeyVerifyResult {
  valid: boolean;
  email: string;
  name: string | null;
}


