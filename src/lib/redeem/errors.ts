export class RedeemCodeLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedeemCodeLookupError';
  }
}

export class RedeemSubmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedeemSubmitError';
  }
}

export class RedeemRequestLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedeemRequestLookupError';
  }
}
