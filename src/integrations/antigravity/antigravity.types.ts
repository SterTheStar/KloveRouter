export type DeviceFingerprint = {
  userAgent: string; quotaUser: string; deviceId: string; platform: string; apiClient: string;
  ideType: string; platformName: string; sessionToken: string; cliUserAgent: string; cliApiClient: string;
  clientMetadata?: { ideType: string; platform: string; pluginType: string; osVersion?: string; arch?: string; sqmId?: string };
  createdAt?: number;
};

export type GoogleTokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; token_type?: string; scope?: string };
