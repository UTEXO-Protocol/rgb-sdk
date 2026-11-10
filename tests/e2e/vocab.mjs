export const TRANSFER_STATUSES = [
  'WaitingCounterparty',
  'WaitingSafeHeight',
  'WaitingConfirmations',
  'Settled',
  'Failed',
  'Initiated',
];
export const TRANSFER_KINDS = [
  'Issuance',
  'ReceiveBlind',
  'ReceiveWitness',
  'Send',
  'Inflation',
  'Burn',
];
export const TRANSFER_FIELDS = {
  idx: { type: 'number' },
  batchTransferIdx: { type: 'number' },
  createdAt: { type: 'number', min: 1 },
  updatedAt: { type: 'number', min: 1 },
  status: { oneOf: TRANSFER_STATUSES },
  kind: { oneOf: TRANSFER_KINDS },
};
