export type InboundMessage = Readonly<{ messageId: string; from: string; text: string; receivedAt: Date }>;
export type Reply = 'confirm' | 'cancel';
