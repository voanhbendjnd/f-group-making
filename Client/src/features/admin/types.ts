export interface CreateAdminRequest {
  name: string;
  email: string;
  password?: string;
  sendActivationEmail?: boolean;
}

export interface AdminUserResponse {
  id: number;
  name: string;
  email: string;
  activated: boolean;
  activationKey?: string;
  authorities: string[];
}
