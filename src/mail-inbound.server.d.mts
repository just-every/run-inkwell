export interface InboundAttachment { filename:string; contentType:string; content:Uint8Array; contentId:string|null }
export interface InboundMessage { provider:string; from:string; to:string[]; subject:string; messageId:string|null; inReplyTo:string|null; text:string|null; html:string|null; attachments:InboundAttachment[] }
export function normalizeInbound(input:{provider:'resend';signedEmailId:string;email:Record<string,unknown>;fetchAttachment:unknown},limits:{maxRawBytes:number;maxBodyBytes:number;maxAttachments:number;maxAttachmentBytes:number;maxTotalAttachmentBytes:number}):Promise<InboundMessage>
export function createResendAttachmentFetcher(config:{apiKey:string;maxAttachmentBytes:number}):unknown
export function verifyWebhook(input:{provider:'resend';rawBody:Uint8Array;headers:Headers;key:string;now:number;toleranceSeconds?:number}):Promise<boolean>
