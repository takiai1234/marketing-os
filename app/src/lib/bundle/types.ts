export interface BundleTeam {
  id: string;
  name: string;
  avatarUrl: string | null;
  organizationId: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BundleChannel {
  id: string;
  name?: string | null;
  username?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
}

export interface BundleSocialAccount {
  id: string;
  type: string;
  teamId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  externalId: string | null;
  userUsername: string | null;
  userDisplayName: string | null;
  userId: string | null;
  channels: BundleChannel[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type BundleErrorCode =
  | 'AUTH'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export class BundleError extends Error {
  public readonly code: BundleErrorCode;
  public readonly httpStatus?: number;
  public readonly rawBody?: unknown;

  constructor(
    code: BundleErrorCode,
    message: string,
    httpStatus?: number,
    rawBody?: unknown
  ) {
    super(message);
    this.name = 'BundleError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.rawBody = rawBody;
  }
}
