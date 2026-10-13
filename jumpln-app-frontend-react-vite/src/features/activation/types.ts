export interface ActivationKeyVerifyResult {
  valid: boolean;
  email: string;
  name: string;
}

export interface ActivateAccountRequest {
  key: string;
  password: string;
}
