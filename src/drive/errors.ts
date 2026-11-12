export class DriveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveError';
  }
}

export class DriveConfigError extends DriveError {
  constructor(message = 'Google Drive client ID is not configured') {
    super(message);
    this.name = 'DriveConfigError';
  }
}

export class DriveAuthError extends DriveError {
  constructor(message = 'Google Drive authorization is missing or expired') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class DriveNetworkError extends DriveError {
  constructor(message = 'Google Drive is unreachable') {
    super(message);
    this.name = 'DriveNetworkError';
  }
}
