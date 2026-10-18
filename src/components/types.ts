export interface ForwarderProfile {
  companyName: string;
  iataCode: string;
  address: string;
  country: string;
  contact: string;
  walletAddress: string;
}

export interface PaymentRecord {
  id: string;
  txHash: string;
  from: string;
  to: string;
  toLabel: string;
  amount: string; // formatted USDC
  reference: string; // e.g. AWB number
  invoiceNumber: string;
  memo: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  explorerUrl?: string;
}
